// Collegamento con il sito LiteRP (Vercel):
//  - rotte GET /site/* che il sito legge dal suo server (chiave SITE_API_SECRET)
//  - notify(...tag): avvisa il sito che un contenuto è cambiato, così la pagina si aggiorna subito
//    (POST {SITE_URL}/api/revalidate con la chiave REVALIDATE_SECRET)
const fs = require('fs');
const { GatewayIntentBits } = require('discord.js');
const api = require('../api/server');
const db = require('../utils/db');
const media = require('../utils/media');

/** Tag di cache del sito: devono essere uguali a BOT_TAGS in lib/bot.ts del sito. */
const TAGS = ['live', 'staff', 'news', 'novita', 'events', 'rules'];
const NOTIFY_DELAY = 2000; // raggruppa più modifiche ravvicinate in un solo avviso

const status = {
  lastRequest: null, // ultima richiesta ricevuta dal sito (timestamp)
  lastNotify: null, // { at, tags, ok, error }
};
const pending = new Set();
let notifyTimer = null;
let client = null;

/** Server Discord mostrato sul sito: quello scelto con /sito collega, oppure l'unico in cui c'è il bot. */
function siteGuild() {
  if (!client) return null;
  const { guildId } = db.getSite();
  if (guildId) return client.guilds.cache.get(guildId) ?? null;
  return client.guilds.cache.size === 1 ? client.guilds.cache.first() : null;
}

const hasPresences = () => Boolean(client?.options.intents.has(GatewayIntentBits.GuildPresences));

/** SITE_URL senza "/" finale; aggiunge https:// se è stato scritto solo il dominio (es. literp.vercel.app). */
function siteUrl() {
  const url = String(process.env.SITE_URL || '').trim().replace(/\/+$/, '');
  return !url || /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

// ---------------------------------------------------------------- avvisi al sito

async function sendRevalidate(tags) {
  const secret = api.secretOf('REVALIDATE_SECRET');
  if (!siteUrl() || !secret) {
    status.lastNotify = { at: Date.now(), tags, ok: false, error: 'SITE_URL o REVALIDATE_SECRET non impostate' };
    return status.lastNotify;
  }
  try {
    const res = await fetch(`${siteUrl()}/api/revalidate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags }),
      signal: AbortSignal.timeout(8000),
    });
    status.lastNotify = { at: Date.now(), tags, ok: res.ok, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    status.lastNotify = { at: Date.now(), tags, ok: false, error: err.message };
  }
  if (!status.lastNotify.ok) console.error('[Sito] Avviso al sito fallito:', status.lastNotify.error);
  return status.lastNotify;
}

/** Segnala al sito che i contenuti con questi tag sono cambiati (es. notify('news')). */
function notify(...tags) {
  if (!siteUrl() || !api.secretOf('REVALIDATE_SECRET')) return;
  for (const tag of tags) {
    if (TAGS.includes(tag)) pending.add(tag);
    else console.error(`[Sito] Tag sconosciuto: ${tag}`);
  }
  if (notifyTimer || !pending.size) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = null;
    const batch = [...pending];
    pending.clear();
    sendRevalidate(batch);
  }, NOTIFY_DELAY);
}

// ---------------------------------------------------------------- rotte per il sito

/** Come api.route, ma solo GET con chiave del sito, e registra l'ultima richiesta ricevuta. */
function siteRoute(pattern, handler) {
  api.route('GET', pattern, 'SITE_API_SECRET', (ctx) => {
    status.lastRequest = Date.now();
    return handler(ctx);
  });
}

function registerApi() {
  siteRoute('/site/health', () => {
    const guild = siteGuild();
    return {
      ok: true,
      ready: client.isReady(),
      bot: client.user?.tag ?? null,
      guild: guild ? { id: guild.id, name: guild.name } : null,
      presences: hasPresences(),
      uptime: Math.round(process.uptime()),
    };
  });

  siteRoute('/site/media/:file', ({ params, res }) => {
    const file = media.find(params.file);
    if (!file) throw new api.HttpError(404, 'immagine non trovata');
    res.writeHead(200, {
      'Content-Type': file.type,
      'Content-Length': file.size,
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    fs.createReadStream(file.path).on('error', () => res.destroy()).pipe(res);
  });
}

function start(discordClient) {
  client = discordClient;
  if (!api.secretOf('SITE_API_SECRET')) console.warn('⚠️  SITE_API_SECRET non impostata nel file .env: il sito non può leggere i dati del bot.');
  registerApi();
}

module.exports = { start, notify, sendRevalidate, siteRoute, siteGuild, hasPresences, siteUrl, status, TAGS };
