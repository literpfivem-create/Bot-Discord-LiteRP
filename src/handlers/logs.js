// Log del server: messaggi eliminati/modificati, ingressi/uscite, ruoli, nickname, timeout, ban Discord, vocali.
const { EmbedBuilder } = require('discord.js');
const db = require('../utils/db');
const { COLORS, sendLog } = require('../utils/embeds');
const { formatDuration, unix } = require('../utils/time');

const YOUNG_ACCOUNT_DAYS = 7;

/** Config del server se i log di quel tipo sono attivi, altrimenti null. */
function cfg(guild, type) {
  const gcfg = db.peekGuild(guild.id);
  if (!gcfg || !gcfg.channels.serverLogs) return null;
  if (type && !gcfg.logs[type]) return null;
  return gcfg;
}

function isLogChannel(gcfg, channelId) {
  const c = gcfg.channels;
  return [c.serverLogs, c.ticketLogs, c.modLogs, c.modActions, c.fivemLogs].includes(channelId);
}

const send = (guild, gcfg, embed) => sendLog(guild, gcfg.channels.serverLogs, { embeds: [embed], allowedMentions: { parse: [] } });
const clip = (text, max = 1024) => (text && text.length > max ? `${text.slice(0, max - 1)}…` : text);

// ---------------------------------------------------------------- messaggi

async function onMessageDelete(message) {
  if (!message.guild || message.author?.bot) return;
  const gcfg = cfg(message.guild, 'messages');
  if (!gcfg || isLogChannel(gcfg, message.channelId)) return;

  const embed = new EmbedBuilder().setColor(COLORS.danger).setTitle('🗑️ Messaggio eliminato').setTimestamp();
  if (message.author) embed.setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() });
  embed.addFields(
    { name: 'Autore', value: message.author ? `${message.author} (\`${message.author.id}\`)` : '*sconosciuto*', inline: true },
    { name: 'Canale', value: `<#${message.channelId}>`, inline: true },
    { name: 'Contenuto', value: clip(message.content) || (message.partial ? '*non disponibile (messaggio non in memoria)*' : '*nessun testo*') },
  );
  const files = [...(message.attachments?.values() ?? [])].map((a) => a.name);
  if (files.length) embed.addFields({ name: 'Allegati', value: clip(files.join(', ')) });
  await send(message.guild, gcfg, embed);
}

async function onMessageBulkDelete(messages, channel) {
  const gcfg = cfg(channel.guild, 'messages');
  if (!gcfg || isLogChannel(gcfg, channel.id)) return;
  await send(channel.guild, gcfg, new EmbedBuilder().setColor(COLORS.danger).setDescription(`🧽 **${messages.size}** messaggi eliminati in blocco in ${channel}`).setTimestamp());
}

async function onMessageUpdate(oldMessage, newMessage) {
  if (!newMessage.guild) return;
  if (newMessage.partial) newMessage = await newMessage.fetch().catch(() => null);
  if (!newMessage || newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content || oldMessage.partial && !oldMessage.content && !newMessage.editedTimestamp) return;
  const gcfg = cfg(newMessage.guild, 'messages');
  if (!gcfg || isLogChannel(gcfg, newMessage.channelId)) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.warning)
    .setTitle('✏️ Messaggio modificato')
    .setAuthor({ name: newMessage.author.tag, iconURL: newMessage.author.displayAvatarURL() })
    .setDescription(`[Vai al messaggio](${newMessage.url}) in <#${newMessage.channelId}>`)
    .addFields(
      { name: 'Prima', value: clip(oldMessage.content) || '*non disponibile*' },
      { name: 'Dopo', value: clip(newMessage.content) || '*vuoto*' },
    )
    .setFooter({ text: `ID utente: ${newMessage.author.id}` })
    .setTimestamp();
  await send(newMessage.guild, gcfg, embed);
}

// ---------------------------------------------------------------- membri

async function onMemberJoin(member) {
  const gcfg = cfg(member.guild, 'members');
  if (!gcfg) return;
  const ageDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
  const embed = new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle('📥 Membro entrato')
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: 'Utente', value: `${member} (\`${member.id}\`)`, inline: true },
      { name: 'Account creato', value: `<t:${unix(member.user.createdTimestamp)}:R>`, inline: true },
      { name: 'Membri', value: `${member.guild.memberCount}`, inline: true },
    )
    .setTimestamp();
  if (ageDays < YOUNG_ACCOUNT_DAYS) embed.addFields({ name: '⚠️ Attenzione', value: `Account creato da meno di ${YOUNG_ACCOUNT_DAYS} giorni` });
  if (member.user.bot) embed.addFields({ name: '🤖 Bot', value: 'È stato aggiunto un bot' });
  await send(member.guild, gcfg, embed);
}

async function onMemberLeave(member) {
  const gcfg = cfg(member.guild, 'members');
  if (!gcfg) return;
  const roles = member.roles?.cache?.filter((r) => r.id !== member.guild.id).map((r) => `${r}`) ?? [];
  const embed = new EmbedBuilder()
    .setColor(COLORS.danger)
    .setTitle('📤 Membro uscito')
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
    .addFields(
      { name: 'Utente', value: `${member.user} (\`${member.id}\`)`, inline: true },
      { name: 'Entrato', value: member.joinedTimestamp ? `<t:${unix(member.joinedTimestamp)}:R>` : '*sconosciuto*', inline: true },
      { name: 'Ruoli', value: clip(roles.join(', ')) || '*nessuno*' },
    )
    .setTimestamp();
  await send(member.guild, gcfg, embed);
}

async function onMemberUpdate(oldMember, newMember) {
  if (oldMember.partial) return; // senza lo stato precedente non possiamo calcolare le differenze
  const gcfg = cfg(newMember.guild, 'members');
  if (!gcfg) return;
  const base = () =>
    new EmbedBuilder()
      .setAuthor({ name: newMember.user.tag, iconURL: newMember.user.displayAvatarURL() })
      .setFooter({ text: `ID utente: ${newMember.id}` })
      .setTimestamp();

  if (oldMember.nickname !== newMember.nickname) {
    await send(newMember.guild, gcfg, base().setColor(COLORS.info).setTitle('🏷️ Nickname modificato').addFields(
      { name: 'Utente', value: `${newMember}` },
      { name: 'Prima', value: oldMember.nickname || '*nessuno*', inline: true },
      { name: 'Dopo', value: newMember.nickname || '*nessuno*', inline: true },
    ));
  }

  const added = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
  const removed = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id));
  if (added.size || removed.size) {
    const embed = base().setColor(COLORS.info).setTitle('🎭 Ruoli modificati').addFields({ name: 'Utente', value: `${newMember}` });
    if (added.size) embed.addFields({ name: '➕ Aggiunti', value: clip(added.map((r) => `${r}`).join(', ')) });
    if (removed.size) embed.addFields({ name: '➖ Rimossi', value: clip(removed.map((r) => `${r}`).join(', ')) });
    await send(newMember.guild, gcfg, embed);
  }

  const oldTimeout = oldMember.communicationDisabledUntilTimestamp ?? 0;
  const newTimeout = newMember.communicationDisabledUntilTimestamp ?? 0;
  if (oldTimeout !== newTimeout) {
    if (newTimeout > Date.now()) {
      await send(newMember.guild, gcfg, base().setColor(0xe67e22).setTitle('🔇 Timeout applicato').addFields(
        { name: 'Utente', value: `${newMember}`, inline: true },
        { name: 'Fino a', value: `<t:${unix(newTimeout)}:f> (${formatDuration(newTimeout - Date.now())})`, inline: true },
      ));
    } else if (oldTimeout > Date.now()) {
      await send(newMember.guild, gcfg, base().setColor(COLORS.success).setTitle('🔊 Timeout rimosso').addFields({ name: 'Utente', value: `${newMember}` }));
    }
  }
}

async function onBanAdd(ban) {
  const gcfg = cfg(ban.guild, 'members');
  if (!gcfg) return;
  const full = ban.partial ? await ban.fetch().catch(() => ban) : ban;
  await send(ban.guild, gcfg, new EmbedBuilder()
    .setColor(COLORS.danger)
    .setTitle('🔨 Utente bannato dal Discord')
    .setAuthor({ name: ban.user.tag, iconURL: ban.user.displayAvatarURL() })
    .addFields(
      { name: 'Utente', value: `${ban.user} (\`${ban.user.id}\`)` },
      { name: 'Motivo', value: clip(full.reason) || 'Nessun motivo specificato' },
    )
    .setTimestamp());
}

async function onBanRemove(ban) {
  const gcfg = cfg(ban.guild, 'members');
  if (!gcfg) return;
  await send(ban.guild, gcfg, new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle('🔓 Ban Discord revocato')
    .setAuthor({ name: ban.user.tag, iconURL: ban.user.displayAvatarURL() })
    .addFields({ name: 'Utente', value: `${ban.user} (\`${ban.user.id}\`)` })
    .setTimestamp());
}

// ---------------------------------------------------------------- vocali

async function onVoiceUpdate(oldState, newState) {
  if (oldState.channelId === newState.channelId) return; // mute/deafen ignorati
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;
  const gcfg = cfg(newState.guild, 'voice');
  if (!gcfg) return;

  let text;
  let color;
  if (!oldState.channelId) {
    text = `🔊 ${member} è entrato in <#${newState.channelId}>`;
    color = COLORS.success;
  } else if (!newState.channelId) {
    text = `🔇 ${member} è uscito da <#${oldState.channelId}>`;
    color = COLORS.danger;
  } else {
    text = `🔀 ${member} si è spostato da <#${oldState.channelId}> a <#${newState.channelId}>`;
    color = COLORS.info;
  }
  await send(newState.guild, gcfg, new EmbedBuilder().setColor(color).setDescription(text).setTimestamp());
}

module.exports = {
  onMessageDelete, onMessageBulkDelete, onMessageUpdate,
  onMemberJoin, onMemberLeave, onMemberUpdate, onBanAdd, onBanRemove, onVoiceUpdate,
};
