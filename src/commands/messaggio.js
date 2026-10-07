const {
  ChannelType, EmbedBuilder, LabelBuilder, MessageFlags, ModalBuilder, PermissionFlagsBits: P,
  SlashCommandBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const db = require('../utils/db');
const { buildMessage } = require('../handlers/scheduler');
const { COLORS, baseEmbed, errorEmbed, successEmbed, parseColor, isUrl } = require('../utils/embeds');
const { parseDuration, formatDuration, unix } = require('../utils/time');

const EPH = MessageFlags.Ephemeral;
const pending = new Map(); // id sessione -> opzioni del comando /messaggio embed
const MIN_REPEAT = 10 * 60 * 1000;
const MAX_SCHEDULED = 25;

function canSend(channel, guild) {
  return channel.permissionsFor(guild.members.me)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks]);
}

function mentionContent(mention, guild) {
  if (!mention) return { content: undefined, allowedMentions: { parse: [] } };
  if (mention.id === guild.id) return { content: '@everyone', allowedMentions: { parse: ['everyone'] } };
  if (guild.roles.cache.has(mention.id)) return { content: `<@&${mention.id}>`, allowedMentions: { roles: [mention.id] } };
  return { content: `<@${mention.id}>`, allowedMentions: { users: [mention.id] } };
}

/** /messaggio programmato aggiungi|lista|rimuovi|prova */
async function scheduled(interaction, sub) {
  const fail = (text) => interaction.reply({ embeds: [errorEmbed(text)], flags: EPH });
  const { guild, options } = interaction;
  const gcfg = db.getGuild(guild.id);

  if (sub === 'aggiungi') {
    if (gcfg.scheduled.length >= MAX_SCHEDULED) return fail(`Puoi avere al massimo ${MAX_SCHEDULED} messaggi programmati.`);
    const once = options.getBoolean('una_volta') ?? false;
    const interval = parseDuration(options.getString('intervallo', true));
    if (!interval) return fail('Intervallo non valido. Esempi: `30m`, `2h`, `1g`, `1h30m`.');
    if (!once && interval < MIN_REPEAT) return fail('Per i messaggi ricorrenti l’intervallo minimo è 10 minuti.');
    const firstRaw = options.getString('primo_invio');
    const first = firstRaw ? parseDuration(firstRaw) : null;
    if (firstRaw && !first) return fail('Valore di `primo_invio` non valido.');

    const channel = options.getChannel('canale', true);
    if (!channel.permissionsFor(guild.members.me)?.has([P.SendMessages, P.EmbedLinks])) return fail(`Il bot non può scrivere in ${channel}.`);

    const item = {
      id: ++gcfg.scheduledCounter,
      channelId: channel.id,
      text: options.getString('testo', true),
      title: options.getString('titolo'),
      mentionId: options.getRole('menzione')?.id ?? null,
      interval,
      once,
      nextRun: Date.now() + (once ? interval : first ?? 60_000),
      createdBy: interaction.user.id,
    };
    gcfg.scheduled.push(item);
    db.save();
    return interaction.reply({
      embeds: [successEmbed(
        `Messaggio programmato **#${item.id}** in ${channel}\n` +
          (once ? `Invio unico <t:${unix(item.nextRun)}:R>` : `Ogni **${formatDuration(interval)}**, primo invio <t:${unix(item.nextRun)}:R>`),
      )],
      flags: EPH,
    });
  }

  if (sub === 'lista') {
    const lines = gcfg.scheduled.map((s) =>
      `**#${s.id}** • <#${s.channelId}> • ${s.once ? 'una volta' : `ogni ${formatDuration(s.interval)}`} • prossimo <t:${unix(s.nextRun)}:R>\n└ ${(s.title ? `**${s.title}** — ` : '') + s.text.slice(0, 80)}${s.text.length > 80 ? '…' : ''}`);
    return interaction.reply({
      embeds: [baseEmbed(COLORS.primary).setTitle(`⏰ Messaggi programmati (${gcfg.scheduled.length})`).setDescription(lines.join('\n').slice(0, 4000) || 'Nessun messaggio programmato.')],
      flags: EPH,
    });
  }

  const id = options.getInteger('id', true);
  const item = gcfg.scheduled.find((s) => s.id === id);
  if (!item) return fail(`Messaggio programmato #${id} non trovato.`);

  if (sub === 'rimuovi') {
    gcfg.scheduled = gcfg.scheduled.filter((s) => s.id !== id);
    db.save();
    return interaction.reply({ embeds: [successEmbed(`Messaggio programmato #${id} eliminato.`)], flags: EPH });
  }

  if (sub === 'prova') {
    const channel = guild.channels.cache.get(item.channelId);
    if (!channel) return fail('Il canale di questo messaggio non esiste più.');
    await channel.send(buildMessage(guild, item));
    return interaction.reply({ embeds: [successEmbed(`Messaggio #${id} inviato in ${channel}.`)], flags: EPH });
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('messaggio')
    .setDescription('Invia un messaggio tramite il bot')
    .setDefaultMemberPermissions(P.ManageMessages)
    .addSubcommand((s) =>
      s.setName('testo').setDescription('Invia un messaggio di testo semplice')
        .addStringOption((o) => o.setName('testo').setDescription('Testo (usa \\n per andare a capo)').setRequired(true).setMaxLength(2000))
        .addChannelOption((o) => o.setName('canale').setDescription('Canale (default: attuale)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        .addMentionableOption((o) => o.setName('menzione').setDescription('Ruolo/utente da menzionare (anche @everyone)')))
    .addSubcommand((s) =>
      s.setName('embed').setDescription('Invia un embed (titolo, descrizione e footer in un modulo)')
        .addChannelOption((o) => o.setName('canale').setDescription('Canale (default: attuale)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        .addStringOption((o) => o.setName('colore').setDescription('Colore esadecimale, es. #00a8ff'))
        .addStringOption((o) => o.setName('immagine').setDescription('URL immagine grande'))
        .addStringOption((o) => o.setName('miniatura').setDescription('URL immagine piccola (in alto a destra)'))
        .addMentionableOption((o) => o.setName('menzione').setDescription('Ruolo/utente da menzionare (anche @everyone)')))
    .addSubcommand((s) =>
      s.setName('annuncio').setDescription('Pubblica un annuncio ufficiale con lo stile LiteRP')
        .addChannelOption((o) => o.setName('canale').setDescription('Canale (default: attuale)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        .addMentionableOption((o) => o.setName('menzione').setDescription('Ruolo da menzionare (anche @everyone)'))
        .addStringOption((o) => o.setName('immagine').setDescription('URL immagine/banner')))
    .addSubcommand((s) =>
      s.setName('dm').setDescription('Invia un messaggio privato a un utente a nome dello staff')
        .addUserOption((o) => o.setName('utente').setDescription('Destinatario').setRequired(true))
        .addStringOption((o) => o.setName('testo').setDescription('Testo (usa \\n per andare a capo)').setRequired(true).setMaxLength(2000)))
    .addSubcommand((s) =>
      s.setName('modifica').setDescription('Modifica un embed inviato dal bot')
        .addStringOption((o) => o.setName('id_messaggio').setDescription('ID del messaggio da modificare').setRequired(true))
        .addChannelOption((o) => o.setName('canale').setDescription('Canale del messaggio (default: attuale)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommandGroup((g) => g.setName('programmato').setDescription('Messaggi automatici programmati o ricorrenti')
      .addSubcommand((s) => s.setName('aggiungi').setDescription('Programma un nuovo messaggio')
        .addChannelOption((o) => o.setName('canale').setDescription('Canale').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        .addStringOption((o) => o.setName('testo').setDescription('Testo (usa \\n per andare a capo)').setRequired(true).setMaxLength(2000))
        .addStringOption((o) => o.setName('intervallo').setDescription('Ogni quanto ripetere (es. 30m, 2h, 1g) o tra quanto inviarlo se "una_volta"').setRequired(true))
        .addBooleanOption((o) => o.setName('una_volta').setDescription('Invia una sola volta invece di ripetere'))
        .addStringOption((o) => o.setName('titolo').setDescription('Se impostato, il messaggio viene inviato come embed').setMaxLength(256))
        .addRoleOption((o) => o.setName('menzione').setDescription('Ruolo da menzionare (anche @everyone)'))
        .addStringOption((o) => o.setName('primo_invio').setDescription('Tra quanto fare il primo invio (default: al prossimo minuto)')))
      .addSubcommand((s) => s.setName('lista').setDescription('Elenco dei messaggi programmati'))
      .addSubcommand((s) => s.setName('rimuovi').setDescription('Elimina un messaggio programmato')
        .addIntegerOption((o) => o.setName('id').setDescription('ID').setRequired(true)))
      .addSubcommand((s) => s.setName('prova').setDescription('Invia subito un messaggio programmato')
        .addIntegerOption((o) => o.setName('id').setDescription('ID').setRequired(true)))),

  async execute(interaction) {
    const { guild, options } = interaction;
    const sub = options.getSubcommand();

    if (options.getSubcommandGroup(false) === 'programmato') {
      if (!interaction.memberPermissions.has(P.ManageGuild)) {
        return interaction.reply({ embeds: [errorEmbed('Ti serve il permesso **Gestisci server** per i messaggi programmati.')], flags: EPH });
      }
      return scheduled(interaction, sub);
    }

    if (sub === 'dm') {
      const user = options.getUser('utente', true);
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setAuthor({ name: `Messaggio dallo staff di ${guild.name}`, iconURL: guild.iconURL() ?? undefined })
        .setDescription(options.getString('testo', true).replaceAll('\\n', '\n'))
        .setFooter({ text: `Inviato da ${interaction.user.username}` })
        .setTimestamp();
      const ok = await user.send({ embeds: [embed] }).then(() => true).catch(() => false);
      return interaction.reply({
        embeds: [ok ? successEmbed(`Messaggio inviato in privato a ${user}.`) : errorEmbed(`${user} ha i messaggi privati chiusi.`)],
        flags: EPH,
      });
    }

    const channel = options.getChannel('canale') ?? interaction.channel;
    if (!canSend(channel, guild)) {
      return interaction.reply({ embeds: [errorEmbed(`Il bot non ha i permessi per scrivere in ${channel}.`)], flags: EPH });
    }

    if (sub === 'testo') {
      const text = options.getString('testo', true).replaceAll('\\n', '\n');
      const mention = mentionContent(options.getMentionable('menzione'), guild);
      await channel.send({ content: mention.content ? `${mention.content}\n${text}` : text, allowedMentions: mention.allowedMentions });
      return interaction.reply({ embeds: [successEmbed(`Messaggio inviato in ${channel}.`)], flags: EPH });
    }

    let existing = null;
    if (sub === 'modifica') {
      existing = await channel.messages.fetch(options.getString('id_messaggio', true)).catch(() => null);
      if (!existing || existing.author.id !== interaction.client.user.id || !existing.embeds.length) {
        return interaction.reply({ embeds: [errorEmbed(`Embed non trovato in ${channel} (deve essere un embed inviato dal bot).`)], flags: EPH });
      }
    } else {
      const color = options.getString('colore');
      for (const url of [options.getString('immagine'), options.getString('miniatura')]) {
        if (url && !isUrl(url)) return interaction.reply({ embeds: [errorEmbed('Gli URL delle immagini devono iniziare con http:// o https://')], flags: EPH });
      }
      if (color && parseColor(color) === null) return interaction.reply({ embeds: [errorEmbed('Colore non valido. Usa il formato #RRGGBB.')], flags: EPH });
    }

    const sessionId = interaction.id;
    pending.set(sessionId, {
      channelId: channel.id,
      messageId: existing?.id ?? null,
      color: parseColor(options.getString('colore')),
      image: options.getString('immagine'),
      thumbnail: options.getString('miniatura'),
      mention: options.getMentionable('menzione'),
      announce: sub === 'annuncio',
    });
    setTimeout(() => pending.delete(sessionId), 15 * 60 * 1000);

    const old = existing?.embeds[0];
    const field = (id, label, style, max, required, value) => {
      const input = new TextInputBuilder().setCustomId(id).setStyle(style).setMaxLength(max).setRequired(required);
      if (value) input.setValue(value.slice(0, max));
      return new LabelBuilder().setLabel(label).setTextInputComponent(input);
    };

    const modal = new ModalBuilder()
      .setCustomId(`msg_embed:${sessionId}`)
      .setTitle(existing ? 'Modifica embed' : sub === 'annuncio' ? 'Nuovo annuncio' : 'Crea embed')
      .addLabelComponents(
        field('titolo', 'Titolo', TextInputStyle.Short, 256, sub === 'annuncio', old?.title ?? (sub === 'annuncio' ? '📢 ' : null)),
        field('descrizione', sub === 'annuncio' ? 'Testo dell’annuncio' : 'Descrizione', TextInputStyle.Paragraph, 4000, true, old?.description),
      );
    if (sub !== 'annuncio') modal.addLabelComponents(field('footer', 'Footer', TextInputStyle.Short, 2048, false, old?.footer?.text));
    await interaction.showModal(modal);
  },

  async handleModal(interaction) {
    const sessionId = interaction.customId.split(':')[1];
    const data = pending.get(sessionId);
    if (!data) return interaction.reply({ embeds: [errorEmbed('Sessione scaduta, ripeti il comando.')], flags: EPH });
    pending.delete(sessionId);

    const { guild } = interaction;
    const channel = guild.channels.cache.get(data.channelId);
    if (!channel) return interaction.reply({ embeds: [errorEmbed('Canale non trovato.')], flags: EPH });

    const field = (id) => {
      try { return interaction.fields.getTextInputValue(id)?.trim() || ''; } catch { return ''; } // campo assente nel modulo
    };
    const title = field('titolo');
    const description = field('descrizione');
    const footer = field('footer');

    if (data.messageId) {
      const msg = await channel.messages.fetch(data.messageId).catch(() => null);
      if (!msg) return interaction.reply({ embeds: [errorEmbed('Messaggio non trovato.')], flags: EPH });
      const embed = EmbedBuilder.from(msg.embeds[0]).setTitle(title || null).setDescription(description).setFooter(footer ? { text: footer } : null);
      await msg.edit({ embeds: [embed, ...msg.embeds.slice(1)] });
      return interaction.reply({ embeds: [successEmbed(`Embed modificato: ${msg.url}`)], flags: EPH });
    }

    const embed = new EmbedBuilder().setColor(data.color ?? COLORS.primary).setDescription(description);
    if (title) embed.setTitle(title);
    if (footer) embed.setFooter({ text: footer, iconURL: guild.iconURL() ?? undefined });
    if (data.announce) {
      embed
        .setAuthor({ name: `${guild.name} • Annuncio ufficiale`, iconURL: guild.iconURL() ?? undefined })
        .setFooter({ text: `Annuncio a cura di ${interaction.member.displayName}`, iconURL: interaction.user.displayAvatarURL() })
        .setTimestamp();
    }
    if (data.image) embed.setImage(data.image);
    if (data.thumbnail) embed.setThumbnail(data.thumbnail);

    const mention = mentionContent(data.mention, guild);
    const sent = await channel.send({ content: mention.content, embeds: [embed], allowedMentions: mention.allowedMentions });
    return interaction.reply({ embeds: [successEmbed(`Embed inviato in ${channel} — ID messaggio: \`${sent.id}\``)], flags: EPH });
  },
};
