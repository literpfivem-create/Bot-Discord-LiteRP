// Messaggi programmati (singoli o ricorrenti), configurati con /messaggio programmato
const { EmbedBuilder } = require('discord.js');
const db = require('../utils/db');
const { COLORS } = require('../utils/embeds');

function buildMessage(guild, s) {
  const text = s.text.replaceAll('\\n', '\n');
  let content;
  let allowedMentions = { parse: [] };
  if (s.mentionId) {
    if (s.mentionId === guild.id) {
      content = '@everyone';
      allowedMentions = { parse: ['everyone'] };
    } else {
      content = `<@&${s.mentionId}>`;
      allowedMentions = { roles: [s.mentionId] };
    }
  }
  if (s.title) {
    const embed = new EmbedBuilder().setColor(COLORS.primary).setTitle(s.title).setDescription(text).setTimestamp();
    return { content, embeds: [embed], allowedMentions };
  }
  return { content: content ? `${content}\n${text}` : text, allowedMentions };
}

async function tick(client) {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    const gcfg = db.peekGuild(guild.id);
    if (!gcfg?.scheduled?.length) continue;
    let changed = false;
    for (const s of [...gcfg.scheduled]) {
      if (s.nextRun > now) continue;
      const channel = guild.channels.cache.get(s.channelId);
      if (channel?.isTextBased()) {
        await channel.send(buildMessage(guild, s)).catch((e) => console.error(`[Programmati] #${s.id}:`, e.message));
      }
      if (s.once || !channel) {
        gcfg.scheduled = gcfg.scheduled.filter((x) => x.id !== s.id);
      } else {
        while (s.nextRun <= now) s.nextRun += s.interval;
      }
      changed = true;
    }
    if (changed) db.save();
  }
}

function start(client) {
  setInterval(() => tick(client).catch((e) => console.error('[Programmati]', e)), 30 * 1000);
}

module.exports = { start, buildMessage };
