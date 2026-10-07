const { EmbedBuilder } = require('discord.js');

const COLORS = {
  primary: 0x00a8ff,
  success: 0x57f287,
  danger: 0xed4245,
  warning: 0xfee75c,
  info: 0x3498db,
  dark: 0x2b2d31,
};

const FOOTER = { text: 'LiteRP • Bot ufficiale' };

const baseEmbed = (color = COLORS.primary) => new EmbedBuilder().setColor(color).setFooter(FOOTER).setTimestamp();
const errorEmbed = (text) => new EmbedBuilder().setColor(COLORS.danger).setDescription(`❌ ${text}`);
const successEmbed = (text) => new EmbedBuilder().setColor(COLORS.success).setDescription(`✅ ${text}`);

/** Invia un messaggio in un canale di log (se configurato). Non lancia mai errori. */
async function sendLog(guild, channelId, payload) {
  if (!channelId) return null;
  const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel?.isTextBased()) {
    console.error(`[Log] Il canale log ${channelId} non esiste più o non è testuale: reimpostalo con /impostazioni.`);
    return null;
  }
  return channel.send(payload).catch((err) => {
    console.error(`[Log] Impossibile inviare in #${channel.name}:`, err.message);
    return null;
  });
}

/** Converte "#ff0000" / "ff0000" in numero. Restituisce null se non valido. */
function parseColor(input) {
  if (!input) return null;
  const hex = input.trim().replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(hex) ? parseInt(hex, 16) : null;
}

const isUrl = (s) => /^https?:\/\/\S+$/i.test(s || '');

module.exports = { COLORS, FOOTER, baseEmbed, errorEmbed, successEmbed, sendLog, parseColor, isUrl };
