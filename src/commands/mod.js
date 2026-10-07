// /mod — moderazione degli utenti: avvertimenti, timeout, espulsioni e ban
const { EmbedBuilder, MessageFlags, PermissionFlagsBits: P, SlashCommandBuilder } = require('discord.js');
const db = require('../utils/db');
const { COLORS, baseEmbed, errorEmbed, successEmbed } = require('../utils/embeds');
const { logAction, notifyUser, hierarchyError, activeWarns, addWarn, removeWarn, clearWarns } = require('../utils/moderation');
const { parseDuration, formatDuration, unix } = require('../utils/time');

const EPH = MessageFlags.Ephemeral;
const MAX_TIMEOUT = 28 * 86_400_000;
const fail = (interaction, text) => interaction.reply({ embeds: [errorEmbed(text)], flags: EPH });
const fetchMember = (guild, user) => guild.members.fetch(user.id).catch(() => null);
const dmNote = (sent) => (sent ? '' : '\n-# DM chiusi: l’utente non è stato avvisato in privato.');

/** Permesso Discord richiesto da ogni sottocomando (oltre a "Metti in timeout i membri" per vedere /mod). */
const REQUIRED = { kick: P.KickMembers, ban: P.BanMembers, unban: P.BanMembers };

/** Sanzione automatica in base al numero di avvisi attivi (configurabile con /impostazioni sanzioni). */
async function escalate(guild, gcfg, member, count) {
  const m = gcfg.moderation;
  const bot = guild.client.user;
  const reason = `Sanzione automatica: ${count} avvertimenti attivi`;
  if (m.banAt && count >= m.banAt && member.bannable) {
    await notifyUser(member.user, guild, 'ban', { reason });
    await member.ban({ reason });
    await logAction(guild, { action: 'ban', target: member.user, moderator: bot, reason });
    return `🔨 **Ban automatico** (${count} avvisi)`;
  }
  if (m.kickAt && count >= m.kickAt && member.kickable) {
    await notifyUser(member.user, guild, 'kick', { reason });
    await member.kick(reason);
    await logAction(guild, { action: 'kick', target: member.user, moderator: bot, reason });
    return `👢 **Espulsione automatica** (${count} avvisi)`;
  }
  if (m.timeoutAt && count >= m.timeoutAt && member.moderatable) {
    const ms = m.timeoutMinutes * 60_000;
    await member.timeout(ms, reason);
    await notifyUser(member.user, guild, 'timeout', { reason, duration: ms });
    await logAction(guild, { action: 'timeout', target: member.user, moderator: bot, reason, duration: ms });
    return `🔇 **Timeout automatico** di ${formatDuration(ms)} (${count} avvisi)`;
  }
  return null;
}

const userOpt = (o) => o.setName('utente').setDescription('Utente').setRequired(true);
const reasonOpt = (required) => (o) => o.setName('motivo').setDescription('Motivo').setRequired(required).setMaxLength(500);

const handlers = {
  async warn(interaction) {
    const { guild, options } = interaction;
    const user = options.getUser('utente', true);
    const reason = options.getString('motivo', true);
    const member = await fetchMember(guild, user);
    if (!member) return fail(interaction, 'L’utente non è nel server.');
    if (user.bot) return fail(interaction, 'Non puoi avvertire un bot.');
    const err = hierarchyError(interaction.member, member);
    if (err) return fail(interaction, err);

    const gcfg = db.getGuild(guild.id);
    const warn = addWarn(guild.id, user.id, { reason, modId: interaction.user.id });
    const count = activeWarns(guild.id, user.id).length;
    const dm = await notifyUser(user, guild, 'warn', { reason, extra: `Hai ora **${count}** avvertimenti attivi.` });
    const caseId = await logAction(guild, {
      action: 'warn', target: user, moderator: interaction.user, reason,
      extra: [{ name: 'Avvisi attivi', value: String(count), inline: true }, { name: 'ID avviso', value: `#${warn.id}`, inline: true }],
    });
    const auto = await escalate(guild, gcfg, member, count).catch((e) => `⚠️ Sanzione automatica fallita: ${e.message}`);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.warning)
          .setDescription(`⚠️ ${user} è stato avvertito • **Caso #${caseId}** • Avvisi attivi: **${count}**\n**Motivo:** ${reason}${auto ? `\n${auto}` : ''}${dmNote(dm)}`),
      ],
    });
  },

  async avvisi(interaction) {
    const user = interaction.options.getUser('utente', true);
    const gcfg = db.getGuild(interaction.guild.id);
    const all = db.getWarns(interaction.guild.id)[user.id] || [];
    const active = new Set(activeWarns(interaction.guild.id, user.id).map((w) => w.id));
    const lines = all
      .slice(-20)
      .reverse()
      .map((w) => `${active.has(w.id) ? '🟠' : '⚪'} **#${w.id}** • <t:${unix(w.date)}:d> • da <@${w.modId}>\n└ ${w.reason}`);
    const m = gcfg.moderation;
    const embed = baseEmbed(COLORS.warning)
      .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
      .setTitle(`⚠️ Avvertimenti: ${active.size} attivi / ${all.length} totali`)
      .setDescription(lines.join('\n').slice(0, 4000) || 'Nessun avvertimento. ✅');
    if (m.warnExpireDays) embed.addFields({ name: 'Scadenza', value: `Gli avvisi scadono dopo ${m.warnExpireDays} giorni (⚪ = scaduto)` });
    await interaction.reply({ embeds: [embed], flags: EPH });
  },

  async 'rimuovi-avviso'(interaction) {
    const { guild, options } = interaction;
    const user = options.getUser('utente', true);
    const id = options.getInteger('id');
    const reason = options.getString('motivo');
    let text;
    if (id) {
      const removed = removeWarn(guild.id, user.id, id);
      if (!removed) return fail(interaction, `Avviso #${id} non trovato per ${user}.`);
      text = `Avviso **#${id}** rimosso da ${user}.`;
    } else {
      const count = clearWarns(guild.id, user.id);
      if (!count) return fail(interaction, `${user} non ha avvertimenti.`);
      text = `Rimossi **tutti** gli avvertimenti (${count}) di ${user}.`;
    }
    await logAction(guild, { action: 'unwarn', target: user, moderator: interaction.user, reason, extra: [{ name: 'Dettaglio', value: text }] });
    await interaction.reply({ embeds: [successEmbed(text)] });
  },

  async timeout(interaction) {
    const { guild, options } = interaction;
    const user = options.getUser('utente', true);
    const ms = parseDuration(options.getString('durata', true));
    const reason = options.getString('motivo');
    if (!ms || ms < 5000 || ms > MAX_TIMEOUT) return fail(interaction, 'Durata non valida. Esempi: `10m`, `1h`, `2g` (massimo 28 giorni).');
    const member = await fetchMember(guild, user);
    if (!member) return fail(interaction, 'L’utente non è nel server.');
    const err = hierarchyError(interaction.member, member);
    if (err) return fail(interaction, err);
    if (!member.moderatable) return fail(interaction, 'Il bot non può mettere in timeout questo utente (ruolo troppo alto).');

    await member.timeout(ms, reason ?? undefined);
    const dm = await notifyUser(user, guild, 'timeout', { reason, duration: ms });
    const caseId = await logAction(guild, { action: 'timeout', target: user, moderator: interaction.user, reason, duration: ms });
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xe67e22).setDescription(`🔇 ${user} è in timeout per **${formatDuration(ms)}** • Caso #${caseId}${reason ? `\n**Motivo:** ${reason}` : ''}${dmNote(dm)}`)] });
  },

  async 'rimuovi-timeout'(interaction) {
    const { guild, options } = interaction;
    const user = options.getUser('utente', true);
    const reason = options.getString('motivo');
    const member = await fetchMember(guild, user);
    if (!member) return fail(interaction, 'L’utente non è nel server.');
    if (!member.isCommunicationDisabled()) return fail(interaction, `${user} non è in timeout.`);
    if (!member.moderatable) return fail(interaction, 'Il bot non può modificare questo utente.');
    await member.timeout(null, reason ?? undefined);
    await notifyUser(user, guild, 'untimeout', { reason });
    const caseId = await logAction(guild, { action: 'untimeout', target: user, moderator: interaction.user, reason });
    await interaction.reply({ embeds: [successEmbed(`🔊 Timeout rimosso a ${user} • Caso #${caseId}`)] });
  },

  async kick(interaction) {
    const { guild, options } = interaction;
    const user = options.getUser('utente', true);
    const reason = options.getString('motivo');
    const member = await fetchMember(guild, user);
    if (!member) return fail(interaction, 'L’utente non è nel server.');
    const err = hierarchyError(interaction.member, member);
    if (err) return fail(interaction, err);
    if (!member.kickable) return fail(interaction, 'Il bot non può espellere questo utente (ruolo troppo alto).');

    const dm = await notifyUser(user, guild, 'kick', { reason });
    await member.kick(reason ?? undefined);
    const caseId = await logAction(guild, { action: 'kick', target: user, moderator: interaction.user, reason });
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setDescription(`👢 **${user.tag}** è stato espulso • Caso #${caseId}${reason ? `\n**Motivo:** ${reason}` : ''}${dmNote(dm)}`)] });
  },

  async ban(interaction) {
    const { guild, options } = interaction;
    const user = options.getUser('utente', true);
    const reason = options.getString('motivo');
    const deleteMessageSeconds = options.getInteger('elimina_messaggi') ?? 0;
    const member = await fetchMember(guild, user);
    if (member) {
      const err = hierarchyError(interaction.member, member);
      if (err) return fail(interaction, err);
      if (!member.bannable) return fail(interaction, 'Il bot non può bannare questo utente (ruolo troppo alto).');
    }
    const dm = member ? await notifyUser(user, guild, 'ban', { reason }) : false;
    await guild.bans.create(user.id, { reason: reason ?? undefined, deleteMessageSeconds });
    const caseId = await logAction(guild, { action: 'ban', target: user, moderator: interaction.user, reason });
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.danger).setDescription(`🔨 **${user.tag}** è stato bannato • Caso #${caseId}${reason ? `\n**Motivo:** ${reason}` : ''}${member ? dmNote(dm) : ''}`)] });
  },

  async unban(interaction) {
    const { guild, options } = interaction;
    const id = options.getString('id', true).trim();
    const reason = options.getString('motivo');
    if (!/^\d{15,21}$/.test(id)) return fail(interaction, 'ID non valido.');
    const ban = await guild.bans.fetch(id).catch(() => null);
    if (!ban) return fail(interaction, 'Questo utente non è bannato.');
    await guild.bans.remove(id, reason ?? undefined);
    const caseId = await logAction(guild, { action: 'unban', target: ban.user, moderator: interaction.user, reason });
    await interaction.reply({ embeds: [successEmbed(`🔓 Ban revocato a **${ban.user.tag}** • Caso #${caseId}`)] });
  },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Moderazione: avvertimenti, timeout, kick e ban')
    .setDefaultMemberPermissions(P.ModerateMembers)
    .addSubcommand((s) => s.setName('warn').setDescription('Avverte un utente (sanzioni automatiche al raggiungimento della soglia)')
      .addUserOption(userOpt).addStringOption(reasonOpt(true)))
    .addSubcommand((s) => s.setName('avvisi').setDescription('Mostra gli avvertimenti di un utente')
      .addUserOption(userOpt))
    .addSubcommand((s) => s.setName('rimuovi-avviso').setDescription('Rimuove un avvertimento (o tutti) da un utente')
      .addUserOption(userOpt)
      .addIntegerOption((o) => o.setName('id').setDescription('ID dell’avviso (vuoto = rimuovi tutti)').setMinValue(1))
      .addStringOption(reasonOpt(false)))
    .addSubcommand((s) => s.setName('timeout').setDescription('Mette in timeout un utente')
      .addUserOption(userOpt)
      .addStringOption((o) => o.setName('durata').setDescription('Es. 10m, 1h, 2g (max 28g)').setRequired(true))
      .addStringOption(reasonOpt(false)))
    .addSubcommand((s) => s.setName('rimuovi-timeout').setDescription('Rimuove il timeout da un utente')
      .addUserOption(userOpt).addStringOption(reasonOpt(false)))
    .addSubcommand((s) => s.setName('kick').setDescription('Espelle un utente dal server Discord')
      .addUserOption(userOpt).addStringOption(reasonOpt(false)))
    .addSubcommand((s) => s.setName('ban').setDescription('Banna un utente dal Discord (anche se non è nel server)')
      .addUserOption(userOpt)
      .addStringOption(reasonOpt(false))
      .addIntegerOption((o) => o.setName('elimina_messaggi').setDescription('Elimina i messaggi recenti dell’utente').addChoices(
        { name: 'No', value: 0 }, { name: 'Ultima ora', value: 3600 }, { name: 'Ultime 24 ore', value: 86400 }, { name: 'Ultimi 7 giorni', value: 604800 })))
    .addSubcommand((s) => s.setName('unban').setDescription('Revoca il ban Discord di un utente')
      .addStringOption((o) => o.setName('id').setDescription('ID Discord dell’utente').setRequired(true))
      .addStringOption(reasonOpt(false))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const needed = REQUIRED[sub];
    if (needed && !interaction.memberPermissions.has(needed)) {
      return fail(interaction, `Ti serve il permesso **${sub === 'kick' ? 'Espelli membri' : 'Banna membri'}** per usare questo comando.`);
    }
    return handlers[sub](interaction);
  },
};
