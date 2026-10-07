// Funzioni condivise dai comandi di moderazione: casi, log, DM, avvisi, gerarchia ruoli.
const { EmbedBuilder } = require('discord.js');
const db = require('./db');
const { COLORS, FOOTER, sendLog } = require('./embeds');
const { formatDuration } = require('./time');

const ACTIONS = {
  warn: { label: 'Avvertimento', emoji: '⚠️', color: COLORS.warning },
  unwarn: { label: 'Avvertimento rimosso', emoji: '🧹', color: COLORS.success },
  timeout: { label: 'Timeout', emoji: '🔇', color: 0xe67e22 },
  untimeout: { label: 'Timeout rimosso', emoji: '🔊', color: COLORS.success },
  kick: { label: 'Espulsione', emoji: '👢', color: 0xe74c3c },
  ban: { label: 'Ban', emoji: '🔨', color: COLORS.danger },
  unban: { label: 'Ban revocato', emoji: '🔓', color: COLORS.success },
  clear: { label: 'Messaggi eliminati', emoji: '🧽', color: COLORS.info },
  lock: { label: 'Canale bloccato', emoji: '🔒', color: COLORS.warning },
  unlock: { label: 'Canale sbloccato', emoji: '🔓', color: COLORS.success },
  slowmode: { label: 'Slowmode', emoji: '🐢', color: COLORS.info },
};

/** Registra un'azione nel canale log-moderazione. Restituisce il numero del caso. */
async function logAction(guild, { action, target, moderator, reason, duration, extra = [] }) {
  const gcfg = db.getGuild(guild.id);
  const a = ACTIONS[action];
  const caseId = ++gcfg.moderation.caseCounter;
  db.save();

  const embed = new EmbedBuilder()
    .setColor(a.color)
    .setTitle(`${a.emoji} ${a.label} • Caso #${caseId}`)
    .setTimestamp();
  if (target) {
    embed.addFields({ name: 'Utente', value: `${target} (\`${target.id}\`)`, inline: true });
    if (target.displayAvatarURL) embed.setThumbnail(target.displayAvatarURL());
  }
  embed.addFields({ name: 'Moderatore', value: `${moderator}`, inline: true });
  if (duration) embed.addFields({ name: 'Durata', value: formatDuration(duration), inline: true });
  embed.addFields({ name: 'Motivo', value: reason || 'Nessun motivo specificato' }, ...extra);

  await sendLog(guild, gcfg.channels.modActions || gcfg.channels.modLogs, { embeds: [embed], allowedMentions: { parse: [] } });
  return caseId;
}

/** Avvisa l'utente in DM. Restituisce true se il DM è stato consegnato. */
async function notifyUser(user, guild, action, { reason, duration, extra } = {}) {
  const a = ACTIONS[action];
  const embed = new EmbedBuilder()
    .setColor(a.color)
    .setTitle(`${a.emoji} ${a.label} su ${guild.name}`)
    .addFields({ name: 'Motivo', value: reason || 'Nessun motivo specificato' })
    .setFooter(FOOTER)
    .setTimestamp();
  if (duration) embed.addFields({ name: 'Durata', value: formatDuration(duration) });
  if (extra) embed.setDescription(extra);
  return user.send({ embeds: [embed] }).then(() => true).catch(() => false);
}

/** Controlla se `moderator` può agire su `target` (membri). Restituisce un messaggio di errore o null. */
function hierarchyError(moderator, target) {
  if (!target) return null;
  const guild = target.guild;
  if (target.id === moderator.id) return 'Non puoi usare questo comando su te stesso.';
  if (target.id === guild.ownerId) return 'Non puoi agire sul proprietario del server.';
  if (target.id === guild.client.user.id) return 'Non puoi usare questo comando sul bot.';
  if (moderator.id !== guild.ownerId && target.roles.highest.position >= moderator.roles.highest.position) {
    return 'Non puoi agire su un utente con un ruolo uguale o superiore al tuo.';
  }
  return null;
}

// ---- Avvisi ----

function activeWarns(guildId, userId) {
  const gcfg = db.getGuild(guildId);
  const list = db.getWarns(guildId)[userId] || [];
  const days = gcfg.moderation.warnExpireDays;
  if (!days) return list;
  return list.filter((w) => Date.now() - w.date < days * 86_400_000);
}

function addWarn(guildId, userId, { reason, modId }) {
  const gcfg = db.getGuild(guildId);
  const store = db.getWarns(guildId);
  const warn = { id: ++gcfg.moderation.warnCounter, reason, modId, date: Date.now() };
  (store[userId] ??= []).push(warn);
  db.save();
  return warn;
}

function removeWarn(guildId, userId, warnId) {
  const store = db.getWarns(guildId);
  const list = store[userId] || [];
  const index = list.findIndex((w) => w.id === warnId);
  if (index === -1) return null;
  const [removed] = list.splice(index, 1);
  if (!list.length) delete store[userId];
  db.save();
  return removed;
}

function clearWarns(guildId, userId) {
  const store = db.getWarns(guildId);
  const count = store[userId]?.length || 0;
  delete store[userId];
  db.save();
  return count;
}

module.exports = { ACTIONS, logAction, notifyUser, hierarchyError, activeWarns, addWarn, removeWarn, clearWarns };
