// /canale — gestione dei canali: pulizia messaggi, modalità lenta, blocco
const { ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits: P, SlashCommandBuilder } = require('discord.js');
const db = require('../utils/db');
const { COLORS, errorEmbed, successEmbed } = require('../utils/embeds');
const { logAction } = require('../utils/moderation');
const { formatDuration } = require('../utils/time');

const EPH = MessageFlags.Ephemeral;
const fail = (interaction, text) => interaction.reply({ embeds: [errorEmbed(text)], flags: EPH });
const channelOpt = (o) => o.setName('canale').setDescription('Canale (default: attuale)').addChannelTypes(ChannelType.GuildText);
const reasonOpt = (o) => o.setName('motivo').setDescription('Motivo').setMaxLength(500);

async function clear(interaction) {
  const { channel, options, guild } = interaction;
  const amount = options.getInteger('quantita', true);
  const user = options.getUser('utente');
  await interaction.deferReply({ flags: EPH });
  const fetched = await channel.messages.fetch({ limit: 100 });
  const targets = [...fetched.filter((m) => !m.pinned && (!user || m.author.id === user.id)).values()].slice(0, amount);
  const deleted = await channel.bulkDelete(targets, true);
  await logAction(guild, {
    action: 'clear', target: user, moderator: interaction.user, reason: null,
    extra: [{ name: 'Canale', value: `${channel}`, inline: true }, { name: 'Eliminati', value: String(deleted.size), inline: true }],
  });
  const skipped = targets.length - deleted.size;
  await interaction.editReply({ embeds: [successEmbed(`Eliminati **${deleted.size}** messaggi${user ? ` di ${user}` : ''}.${skipped ? `\n${skipped} messaggi più vecchi di 14 giorni non possono essere eliminati in blocco.` : ''}`)] });
}

async function slowmode(interaction) {
  const seconds = interaction.options.getInteger('secondi', true);
  const channel = interaction.options.getChannel('canale') ?? interaction.channel;
  await channel.setRateLimitPerUser(seconds);
  await logAction(interaction.guild, {
    action: 'slowmode', moderator: interaction.user, reason: null,
    extra: [{ name: 'Canale', value: `${channel}`, inline: true }, { name: 'Intervallo', value: seconds ? formatDuration(seconds * 1000) : 'disattivato', inline: true }],
  });
  await interaction.reply({ embeds: [successEmbed(seconds ? `🐢 Slowmode di **${formatDuration(seconds * 1000)}** in ${channel}.` : `Slowmode disattivato in ${channel}.`)], flags: EPH });
}

async function setLock(interaction, lock) {
  const { guild, options } = interaction;
  const channel = options.getChannel('canale') ?? interaction.channel;
  const reason = options.getString('motivo');
  const gcfg = db.getGuild(guild.id);
  if (!channel.permissionOverwrites) return fail(interaction, 'Questo comando funziona solo nei canali testuali (non nei thread).');

  if (lock) {
    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false, SendMessagesInThreads: false, CreatePublicThreads: false });
    for (const id of gcfg.staffRoles.filter((r) => guild.roles.cache.has(r))) {
      await channel.permissionOverwrites.edit(id, { SendMessages: true }).catch(() => {});
    }
  } else {
    await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null, SendMessagesInThreads: null, CreatePublicThreads: null });
  }
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(lock ? COLORS.warning : COLORS.success)
        .setDescription(`${lock ? '🔒 **Canale bloccato** dallo staff.' : '🔓 **Canale sbloccato.** Potete tornare a scrivere.'}${reason ? `\n**Motivo:** ${reason}` : ''}`),
    ],
  });
  await logAction(guild, { action: lock ? 'lock' : 'unlock', moderator: interaction.user, reason, extra: [{ name: 'Canale', value: `${channel}` }] });
  await interaction.reply({ embeds: [successEmbed(`${channel} ${lock ? 'bloccato' : 'sbloccato'}.`)], flags: EPH });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('canale')
    .setDescription('Gestione dei canali: pulizia, modalità lenta, blocco')
    .setDefaultMemberPermissions(P.ManageMessages)
    .addSubcommand((s) => s.setName('pulisci').setDescription('Elimina messaggi (max 100, più recenti di 14 giorni)')
      .addIntegerOption((o) => o.setName('quantita').setDescription('Numero di messaggi').setRequired(true).setMinValue(1).setMaxValue(100))
      .addUserOption((o) => o.setName('utente').setDescription('Elimina solo i messaggi di questo utente')))
    .addSubcommand((s) => s.setName('slowmode').setDescription('Imposta la modalità lenta')
      .addIntegerOption((o) => o.setName('secondi').setDescription('Secondi tra un messaggio e l’altro (0 = disattiva)').setRequired(true).setMinValue(0).setMaxValue(21600))
      .addChannelOption(channelOpt))
    .addSubcommand((s) => s.setName('blocca').setDescription('Blocca il canale (può scrivere solo lo staff)')
      .addChannelOption(channelOpt).addStringOption(reasonOpt))
    .addSubcommand((s) => s.setName('sblocca').setDescription('Sblocca il canale')
      .addChannelOption(channelOpt).addStringOption(reasonOpt)),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'pulisci') return clear(interaction);
    if (!interaction.memberPermissions.has(P.ManageChannels)) return fail(interaction, 'Ti serve il permesso **Gestisci canali**.');
    if (sub === 'slowmode') return slowmode(interaction);
    return setLock(interaction, sub === 'blocca');
  },
};
