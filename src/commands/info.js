const { ChannelType, MessageFlags, SlashCommandBuilder, version: djsVersion } = require('discord.js');
const db = require('../utils/db');
const { COLORS, baseEmbed } = require('../utils/embeds');
const { isStaff } = require('../utils/permissions');
const { activeWarns } = require('../utils/moderation');
const { formatDuration, unix } = require('../utils/time');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Informazioni su utenti, server e bot')
    .addSubcommand((s) => s.setName('utente').setDescription('Informazioni su un utente')
      .addUserOption((o) => o.setName('utente').setDescription('Utente (default: tu)')))
    .addSubcommand((s) => s.setName('server').setDescription('Informazioni sul server Discord'))
    .addSubcommand((s) => s.setName('bot').setDescription('Stato del bot')),

  async execute(interaction) {
    const { guild, options, client } = interaction;
    const sub = options.getSubcommand();
    const gcfg = db.getGuild(guild.id);

    if (sub === 'utente') {
      const user = options.getUser('utente') ?? interaction.user;
      const member = await guild.members.fetch(user.id).catch(() => null);
      const embed = baseEmbed(member?.displayColor || COLORS.primary)
        .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
        .setThumbnail(user.displayAvatarURL({ size: 512 }))
        .addFields(
          { name: '🆔 ID', value: `\`${user.id}\``, inline: true },
          { name: '📅 Account creato', value: `<t:${unix(user.createdTimestamp)}:D>\n<t:${unix(user.createdTimestamp)}:R>`, inline: true },
        );
      if (member) {
        const roles = member.roles.cache.filter((r) => r.id !== guild.id).sort((a, b) => b.position - a.position).map((r) => `${r}`);
        embed.addFields(
          { name: '📥 Entrato nel server', value: `<t:${unix(member.joinedTimestamp)}:D>\n<t:${unix(member.joinedTimestamp)}:R>`, inline: true },
          { name: `🎭 Ruoli (${roles.length})`, value: (roles.slice(0, 20).join(' ') + (roles.length > 20 ? ' …' : '')) || '*nessuno*' },
        );
        if (member.isCommunicationDisabled()) {
          embed.addFields({ name: '🔇 In timeout', value: `fino a <t:${unix(member.communicationDisabledUntilTimestamp)}:f>` });
        }
      } else {
        embed.addFields({ name: '📥 Server', value: 'Non è nel server' });
      }
      // Dati riservati allo staff
      if (isStaff(interaction.member, gcfg)) {
        const warns = activeWarns(guild.id, user.id).length;
        const open = db.findTickets((t) => t.guildId === guild.id && t.ownerId === user.id);
        const blacklisted = gcfg.ticketSettings.blacklist.some((b) => b.id === user.id);
        embed.addFields({
          name: '🛡️ Staff',
          value: `Avvisi attivi: **${warns}**\nTicket aperti: ${open.map((t) => `<#${t.channelId}>`).join(' ') || '**0**'}${blacklisted ? '\n🚫 In blacklist ticket' : ''}`,
        });
      }
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (sub === 'server') {
      const channels = guild.channels.cache;
      const owner = await guild.fetchOwner().catch(() => null);
      const embed = baseEmbed(COLORS.primary)
        .setTitle(guild.name)
        .setThumbnail(guild.iconURL({ size: 512 }))
        .addFields(
          { name: '👑 Proprietario', value: owner ? `${owner.user}` : '—', inline: true },
          { name: '📅 Creato', value: `<t:${unix(guild.createdTimestamp)}:D>`, inline: true },
          { name: '👥 Membri', value: `**${guild.memberCount}**`, inline: true },
          {
            name: '💬 Canali',
            value: `${channels.filter((c) => c.type === ChannelType.GuildText).size} testuali • ${channels.filter((c) => c.type === ChannelType.GuildVoice).size} vocali • ${channels.filter((c) => c.type === ChannelType.GuildCategory).size} categorie`,
          },
          { name: '🎭 Ruoli', value: `${guild.roles.cache.size - 1}`, inline: true },
          { name: '🚀 Boost', value: `Livello ${guild.premiumTier} • ${guild.premiumSubscriptionCount ?? 0} boost`, inline: true },
          { name: '🎫 Ticket aperti', value: `${db.findTickets((t) => t.guildId === guild.id).length}`, inline: true },
        );
      if (guild.bannerURL()) embed.setImage(guild.bannerURL({ size: 1024 }));
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === 'bot') {
      const mem = process.memoryUsage().rss / 1024 / 1024;
      const embed = baseEmbed(COLORS.primary)
        .setTitle(`🤖 ${client.user.username}`)
        .setThumbnail(client.user.displayAvatarURL())
        .addFields(
          { name: '⏱️ Online da', value: formatDuration(process.uptime() * 1000), inline: true },
          { name: '📶 Ping', value: `${client.ws.ping} ms`, inline: true },
          { name: '💾 Memoria', value: `${mem.toFixed(0)} MB`, inline: true },
          { name: '🧩 Versioni', value: `Node ${process.version} • discord.js ${djsVersion}`, inline: true },
          { name: '🌐 Server', value: `${client.guilds.cache.size}`, inline: true },
        );
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  },
};
