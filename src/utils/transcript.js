// Genera un transcript in testo semplice (.txt) di un canale ticket.
const CATEGORIES = require('../config/ticketCategories');

const SEPARATOR = '═'.repeat(60);

const formatDate = (date) =>
  new Date(date).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'short', timeStyle: 'medium' });

async function fetchAllMessages(channel, max = 5000) {
  const all = [];
  let before;
  while (all.length < max) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;
    all.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  return all.reverse();
}

/** Sostituisce le menzioni grezze (<@id>, <@&id>, <#id>) con nomi leggibili. */
function formatContent(text, guild) {
  return String(text ?? '')
    .replace(/<@!?(\d+)>/g, (_, id) => `@${guild.members.cache.get(id)?.displayName ?? guild.client.users.cache.get(id)?.username ?? id}`)
    .replace(/<@&(\d+)>/g, (_, id) => `@${guild.roles.cache.get(id)?.name ?? id}`)
    .replace(/<#(\d+)>/g, (_, id) => `#${guild.channels.cache.get(id)?.name ?? id}`)
    .replace(/<t:(\d+)(?::\w)?>/g, (_, ts) => formatDate(Number(ts) * 1000));
}

const indent = (text, prefix) => text.split('\n').map((l) => prefix + l).join('\n');

function renderEmbed(embed, guild) {
  const lines = [];
  if (embed.author?.name) lines.push(embed.author.name);
  if (embed.title) lines.push(`[${formatContent(embed.title, guild)}]`);
  if (embed.description) lines.push(formatContent(embed.description, guild));
  for (const f of embed.fields || []) lines.push(`${formatContent(f.name, guild)}: ${formatContent(f.value, guild)}`);
  if (embed.image?.url) lines.push(`Immagine: ${embed.image.url}`);
  if (embed.footer?.text) lines.push(`— ${embed.footer.text}`);
  return indent(lines.join('\n') || '(embed vuoto)', '  │ ');
}

function renderMessage(msg, guild) {
  const author = msg.member?.displayName ?? msg.author.username;
  const parts = [`[${formatDate(msg.createdTimestamp)}] ${author} (${msg.author.username})${msg.author.bot ? ' [BOT]' : ''}:`];
  if (msg.content) parts.push(indent(formatContent(msg.content, guild), '  '));
  for (const e of msg.embeds) parts.push(renderEmbed(e, guild));
  for (const a of msg.attachments.values()) parts.push(`  📎 ${a.name}: ${a.url}`);
  if (parts.length === 1) parts.push('  (messaggio senza testo)');
  return parts.join('\n');
}

/**
 * @returns {Promise<{ buffer: Buffer, count: number }>}
 */
async function createTranscript(channel, ticket) {
  const guild = channel.guild;
  const messages = await fetchAllMessages(channel);
  const cat = CATEGORIES.find((c) => c.key === ticket?.category);
  const owner = ticket ? (guild.client.users.cache.get(ticket.ownerId)?.username ?? ticket.ownerId) : '—';

  const header = [
    SEPARATOR,
    `TRANSCRIPT TICKET • ${guild.name} • #${channel.name}`,
    SEPARATOR,
    `Categoria:      ${cat ? `${cat.emoji} ${cat.label}` : '—'}`,
    `Aperto da:      ${owner}${ticket ? ` (${ticket.ownerId})` : ''}`,
    `Aperto il:      ${ticket ? formatDate(ticket.createdAt) : '—'}`,
    `Generato il:    ${formatDate(Date.now())}`,
    `Messaggi:       ${messages.length}`,
    SEPARATOR,
  ].join('\n');

  const text = `${header}\n\n${messages.map((m) => renderMessage(m, guild)).join('\n\n')}\n`;

  return { buffer: Buffer.from(text, 'utf8'), count: messages.length };
}

module.exports = { createTranscript };
