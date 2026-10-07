// Pagina News del sito: ogni messaggio dei canali scelti con /sito news diventa una notizia
// (titolo, testo, immagini, data). Modifiche ed eliminazioni su Discord si vedono anche sul sito.
// Rotte: GET /site/news (notizie + eventi, senza testo completo) e GET /site/news/:id (una notizia).
const api = require('../api/server');
const db = require('../utils/db');
const media = require('../utils/media');
const site = require('./site');
const siteEvents = require('./siteEvents');
const { resolveMentions, plain, excerpt, splitTitle } = require('../utils/discordText');

const IMPORT_LIMIT = 50; // messaggi recuperati quando si aggiunge un canale o si riavvia il bot
const MAX_PER_CHANNEL = 100; // notizie tenute per canale (le più vecchie vengono tolte)
const MAX_IMAGES = 4;
const BODY_MAX = 6000;

let client = null;

const channels = () => db.getSite().newsChannels;
const posts = () => db.getNews().posts;
const channelConfig = (channelId) => channels().find((c) => c.channelId === channelId) ?? null;

// ---------------------------------------------------------------- dal messaggio alla notizia

/** Immagini del messaggio: allegati e immagini degli embed (al massimo MAX_IMAGES). */
function imageUrls(message, embeds) {
  const urls = [
    ...message.attachments.filter((a) => a.contentType?.startsWith('image/')).map((a) => a.url),
    ...embeds.map((e) => e.image?.url).filter(Boolean),
  ];
  return [...new Set(urls)].slice(0, MAX_IMAGES);
}

/** Converte un messaggio in notizia (senza immagini). null se il messaggio è vuoto o di sistema. */
function parse(message) {
  if (message.system) return null;
  const { guild } = message;
  const embeds = message.embeds.filter((e) => !e.data.type || e.data.type === 'rich');
  const embedText = embeds.flatMap((e) => [
    e.author?.name && !e.title ? `**${e.author.name}**` : '',
    e.description ?? '',
    ...e.fields.map((f) => `**${f.name}**\n${f.value}`),
  ]);
  const text = resolveMentions([message.content, ...embedText].filter(Boolean).join('\n\n'), guild);
  const embedTitle = embeds.find((e) => e.title)?.title;
  const { title, body } = embedTitle ? { title: plain(resolveMentions(embedTitle, guild)), body: text } : splitTitle(text);
  const urls = imageUrls(message, embeds);
  if (!title && !body && !urls.length) return null;

  return {
    id: message.id,
    channelId: message.channelId,
    title,
    body: body.slice(0, BODY_MAX),
    excerpt: excerpt(body || ''),
    imageUrls: urls,
    createdAt: message.createdTimestamp,
    editedAt: message.editedTimestamp ?? null,
    url: message.url,
  };
}

/** Scarica le immagini sul Volume (i link Discord scadono). Quelle che non si scaricano vengono saltate. */
async function saveImages(urls) {
  const files = [];
  for (const url of urls) {
    try {
      files.push(await media.saveFromUrl(url));
    } catch (e) {
      console.error('[Sito] Immagine news non salvata:', e.message);
    }
  }
  return [...new Set(files)];
}

/** Salva o aggiorna la notizia di un messaggio. true se è cambiato qualcosa. */
async function store(message) {
  const old = posts()[message.id];
  const parsed = parse(message);
  if (!parsed) return remove(message.id);

  const sameImages = old && old.imageUrls?.length === parsed.imageUrls.length && old.imageUrls.every((u, i) => sameAttachment(u, parsed.imageUrls[i]));
  const images = sameImages ? old.images : await saveImages(parsed.imageUrls);
  const { imageUrls, ...post } = parsed;
  posts()[message.id] = { ...post, images, imageUrls: imageUrls.map(stripQuery) };
  if (old && !sameImages) media.removeUnused(old.images);
  prune(message.channelId);
  db.save();
  return true;
}

// I link degli allegati cambiano firma (?ex=...) ogni volta: si confrontano senza la parte dopo "?"
const stripQuery = (url) => String(url).split('?')[0];
const sameAttachment = (a, b) => stripQuery(a) === stripQuery(b);

/** Toglie una notizia. true se esisteva. */
function remove(id) {
  const old = posts()[id];
  if (!old) return false;
  delete posts()[id];
  media.removeUnused(old.images);
  db.save();
  return true;
}

/** Tiene solo le MAX_PER_CHANNEL notizie più recenti del canale. */
function prune(channelId) {
  const list = Object.values(posts()).filter((p) => p.channelId === channelId).sort((a, b) => b.createdAt - a.createdAt);
  for (const old of list.slice(MAX_PER_CHANNEL)) remove(old.id);
}

/** Toglie tutte le notizie di un canale (canale rimosso da /sito news). */
function removeChannelPosts(channelId) {
  let removed = 0;
  for (const p of Object.values(posts())) if (p.channelId === channelId && remove(p.id)) removed++;
  if (removed) site.notify('news');
  return removed;
}

/**
 * Allinea le notizie di un canale con gli ultimi messaggi su Discord: aggiunge quelli nuovi,
 * aggiorna i modificati e toglie quelli eliminati mentre il bot era spento. Restituisce il numero di notizie del canale.
 */
async function syncChannel(channel) {
  const messages = await channel.messages.fetch({ limit: IMPORT_LIMIT });
  let changed = false;
  for (const message of [...messages.values()].reverse()) {
    const old = posts()[message.id];
    if (old && old.editedAt === (message.editedTimestamp ?? null)) continue;
    if (await store(message)) changed = true;
  }
  // eliminati da Discord: tutto ciò che è più recente del messaggio più vecchio letto (o tutto, se il canale ha meno messaggi)
  const oldest = messages.size < IMPORT_LIMIT ? 0 : Math.min(...messages.map((m) => m.createdTimestamp));
  for (const p of Object.values(posts())) {
    if (p.channelId === channel.id && p.createdAt >= oldest && !messages.has(p.id) && remove(p.id)) changed = true;
  }
  if (changed) site.notify('news');
  return Object.values(posts()).filter((p) => p.channelId === channel.id).length;
}

async function syncAll() {
  for (const { channelId } of channels()) {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) continue;
    await syncChannel(channel).catch((e) => console.error(`[Sito] News da #${channel.name} non lette:`, e.message));
  }
}

// ---------------------------------------------------------------- eventi Discord

async function onMessage(message) {
  if (!channelConfig(message.channelId)) return;
  if (await store(message)) site.notify('news');
}

async function onMessageUpdate(_old, message) {
  if (!channelConfig(message.channelId)) return;
  const full = message.partial ? await message.fetch().catch(() => null) : message;
  if (full && (await store(full))) site.notify('news');
}

function onMessageDelete(message) {
  if (channelConfig(message.channelId) && remove(message.id)) site.notify('news');
}

function onBulkDelete(messages) {
  let changed = false;
  for (const id of messages.keys()) if (remove(id)) changed = true;
  if (changed) site.notify('news');
}

// ---------------------------------------------------------------- rotte per il sito

function listItem(p) {
  const { body, imageUrls, channelId, ...item } = p;
  return { ...item, kind: channelConfig(channelId)?.kind ?? 'annuncio', image: p.images[0] ?? null };
}

function start(discordClient) {
  client = discordClient;
  site.siteRoute('/site/news', () => ({
    posts: Object.values(posts())
      .filter((p) => channelConfig(p.channelId))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(listItem),
    events: siteEvents.list(),
    updatedAt: new Date().toISOString(),
  }));
  site.siteRoute('/site/news/:id', ({ params }) => {
    const p = posts()[params.id];
    if (!p || !channelConfig(p.channelId)) throw new api.HttpError(404, 'notizia non trovata');
    return { ...listItem(p), body: p.body };
  });
  syncAll().catch((e) => console.error('[Sito] Sincronizzazione news:', e.message));
}

module.exports = {
  start, syncChannel, removeChannelPosts, channels, channelConfig,
  onMessage, onMessageUpdate, onMessageDelete, onBulkDelete,
  count: (channelId) => Object.values(posts()).filter((p) => p.channelId === channelId).length,
};
