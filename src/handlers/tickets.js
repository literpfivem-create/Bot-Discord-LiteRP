const {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, ContainerBuilder, EmbedBuilder, MessageFlags,
  LabelBuilder, ModalBuilder, PermissionFlagsBits: P, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, SnowflakeUtil,
  StringSelectMenuBuilder, TextDisplayBuilder, TextInputBuilder, TextInputStyle, ThumbnailBuilder, UserSelectMenuBuilder,
} = require('discord.js');
const { renderTicketBanner } = require('../utils/welcomeCard');
const db = require('../utils/db');
const CATEGORIES = require('../config/ticketCategories');
const { COLORS, FOOTER, errorEmbed, successEmbed, sendLog } = require('../utils/embeds');
const { canManageTicket, isAdmin, ticketRolesOf } = require('../utils/permissions');
const serverStats = require('./serverStats');
const { createTranscript } = require('../utils/transcript');
const { formatDuration, unix, withTimeout } = require('../utils/time');

const EPH = MessageFlags.Ephemeral;
const USER_PERMS = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks];
const STAFF_ALLOW = { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true, ManageMessages: true };
const INACTIVITY_GRACE = 60 * 60 * 1000; // dopo l'avviso di inattività, chiusura dopo 1 ora
const PRIORITIES = {
  bassa: { emoji: '🟢', label: 'Bassa' },
  media: { emoji: '🟡', label: 'Media' },
  alta: { emoji: '🟠', label: 'Alta' },
  urgente: { emoji: '🔴', label: 'Urgente' },
};
const closing = new Set();

const getCategory = (key) => CATEGORIES.find((c) => c.key === key);
const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
const validRoles = (guild, ids = []) => ids.filter((id) => guild.roles.cache.has(id));
const catLabel = (key) => {
  const c = getCategory(key);
  return c ? `${c.emoji} ${c.label}` : key;
};

function staffStats(gcfg, userId) {
  return (gcfg.ticketStats.staff[userId] ??= { closed: 0, claimed: 0, ratingSum: 0, ratingCount: 0 });
}

// ---------------------------------------------------------------- categorie Discord

function categoryOverwrites(guild, gcfg, key) {
  return [
    { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
    { id: guild.client.user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageChannels] },
    ...validRoles(guild, ticketRolesOf(gcfg, key)).map((id) => ({ id, allow: [P.ViewChannel, P.ReadMessageHistory] })),
  ];
}

/** Restituisce la categoria Discord del tipo di ticket: usa quella salvata, ne cerca una esistente con lo stesso nome o la crea. */
async function ensureTicketCategory(guild, gcfg, cat) {
  let channel = guild.channels.cache.get(gcfg.categories[cat.key]);
  if (channel?.type !== ChannelType.GuildCategory) {
    const target = normalize(cat.label);
    channel = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && normalize(c.name) === target);
  }
  if (!channel) {
    channel = await guild.channels.create({
      name: `${cat.emoji} | ${cat.label}`,
      type: ChannelType.GuildCategory,
      permissionOverwrites: categoryOverwrites(guild, gcfg, cat.key),
      reason: 'Setup ticket LiteRP',
    });
  }
  if (gcfg.categories[cat.key] !== channel.id) {
    gcfg.categories[cat.key] = channel.id;
    db.save();
  }
  return channel;
}

// ---------------------------------------------------------------- pannello

// Il pannello è formato da due messaggi: il banner "CENTRO ASSISTENZA" (immagine) e la scheda con il menu.
// La scheda usa i componenti V2 di Discord (testo, separatori, logo) ed è separata dal banner così
// il menu si può reimpostare dopo ogni scelta senza ricaricare l'immagine.

function panelMenu() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_open')
    .setPlaceholder('📩 Seleziona il motivo del ticket')
    .addOptions(CATEGORIES.map((c) => ({ label: c.label, value: c.key, description: c.description.slice(0, 100), emoji: c.emoji })));
  return new ActionRowBuilder().addComponents(menu);
}

const text = (content) => new TextDisplayBuilder().setContent(content);
const separator = (big = false) => new SeparatorBuilder().setDivider(true).setSpacing(big ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);

function buildPanel(guild, gcfg) {
  const name = gcfg.fivem.name || guild.name;
  const icon = guild.iconURL({ extension: 'png', size: 256 });
  const intro =
    `## 🎫 Assistenza ${name}\n` +
    'Hai bisogno di aiuto o devi parlare con lo staff?\n' +
    'Apri un ticket: si aprirà un **canale privato** visibile solo a te e allo staff.';

  const container = new ContainerBuilder().setAccentColor(COLORS.primary);
  if (icon) {
    container.addSectionComponents(
      new SectionBuilder().addTextDisplayComponents(text(intro)).setThumbnailAccessory(new ThumbnailBuilder().setURL(icon)),
    );
  } else {
    container.addTextDisplayComponents(text(intro));
  }
  container
    .addSeparatorComponents(separator(true))
    .addTextDisplayComponents(text(
      '### 📋 Come funziona\n' +
        '**`1`** Scegli il motivo dal menu qui sotto\n' +
        '**`2`** Compila il breve modulo\n' +
        '**`3`** Attendi lo staff nel tuo canale privato',
    ))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(
      '### 📌 Prima di aprire un ticket\n' +
        '> Scegli il motivo giusto: ti seguirà la persona più adatta\n' +
        '> Spiega bene la situazione e allega prove (screen, clip)\n' +
        '> Non menzionare lo staff: rispondiamo in ordine di arrivo',
    ))
    .addSeparatorComponents(separator(true))
    .addActionRowComponents(panelMenu())
    .addTextDisplayComponents(text('-# ⚠️ Aprire ticket senza motivo o abusarne può comportare sanzioni'));

  return { flags: MessageFlags.IsComponentsV2, components: [container], allowedMentions: { parse: [] } };
}

const isV2 = (message) => message.flags.has(MessageFlags.IsComponentsV2);

/** Elimina il pannello attuale (banner + scheda), ovunque si trovi. */
async function deletePanel(guild, gcfg) {
  const channel = guild.channels.cache.get(gcfg.channels.ticketPanel);
  if (channel?.isTextBased()) {
    for (const id of [gcfg.panelBannerId, gcfg.panelMessageId]) if (id) await channel.messages.delete(id).catch(() => {});
  }
  gcfg.panelMessageId = null;
  gcfg.panelBannerId = null;
}

/** Invia il pannello nel canale indicato, oppure aggiorna quello esistente se è già lì. */
async function upsertPanel(channel, gcfg) {
  const { guild } = channel;
  if (gcfg.panelMessageId && gcfg.channels.ticketPanel === channel.id) {
    const existing = await channel.messages.fetch(gcfg.panelMessageId).catch(() => null);
    if (existing && isV2(existing)) return existing.edit(buildPanel(guild, gcfg));
  }
  await deletePanel(guild, gcfg);

  const png = await renderTicketBanner(guild, { name: gcfg.fivem.name, accent: COLORS.primary }).catch((err) => {
    console.error('[Ticket] Errore creazione banner:', err.message);
    return null;
  });
  if (png) {
    const banner = await channel.send({ files: [new AttachmentBuilder(png, { name: 'assistenza.png' })] });
    gcfg.panelBannerId = banner.id;
  }
  const msg = await channel.send(buildPanel(guild, gcfg));
  gcfg.panelMessageId = msg.id;
  gcfg.channels.ticketPanel = channel.id;
  db.save();
  return msg;
}

/** All'avvio: aggiorna i pannelli esistenti e converte quelli vecchi (embed) nel nuovo formato. */
async function refreshPanels(client) {
  for (const guild of client.guilds.cache.values()) {
    const gcfg = db.peekGuild(guild.id);
    const channel = gcfg && guild.channels.cache.get(gcfg.channels.ticketPanel);
    if (!channel?.isTextBased() || !gcfg.panelMessageId) continue;
    const existing = await channel.messages.fetch(gcfg.panelMessageId).catch(() => null);
    if (!existing) continue; // eliminato a mano: non lo reinviamo
    await (isV2(existing) ? existing.edit(buildPanel(guild, gcfg)) : upsertPanel(channel, gcfg))
      .catch((err) => console.error('[Ticket] Aggiornamento pannello fallito:', err.message));
  }
}

function ticketButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Chiudi').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('ticket_claim').setLabel('Prendi in carico').setEmoji('🙋').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ticket_add').setLabel('Aggiungi').setEmoji('➕').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_remove').setLabel('Rimuovi').setEmoji('➖').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticket_transcript').setLabel('Transcript').setEmoji('📄').setStyle(ButtonStyle.Secondary),
  );
}

// ---------------------------------------------------------------- apertura

/** Ticket aperti di un utente (pulisce quelli il cui canale non esiste più). */
function openTicketsOf(guild, userId) {
  const result = [];
  for (const t of db.findTickets((t) => t.guildId === guild.id && t.ownerId === userId)) {
    if (guild.channels.cache.has(t.channelId)) result.push(t);
    else db.deleteTicket(t.channelId);
  }
  return result;
}

/** Controlla se l'utente può aprire un ticket nella categoria. Restituisce un messaggio di errore o null. */
function openError(guild, gcfg, userId, key) {
  const banned = gcfg.ticketSettings.blacklist.find((b) => b.id === userId);
  if (banned) return `Non puoi aprire ticket.\n**Motivo:** ${banned.reason || 'Non specificato'}`;
  const open = openTicketsOf(guild, userId);
  const same = open.find((t) => t.category === key);
  if (same) return `Hai già un ticket aperto in questa categoria: <#${same.channelId}>`;
  if (open.length >= gcfg.ticketSettings.maxOpen) {
    return `Hai già **${open.length}** ticket aperti (massimo ${gcfg.ticketSettings.maxOpen}): ${open.map((t) => `<#${t.channelId}>`).join(', ')}`;
  }
  return null;
}

async function openSelect(interaction) {
  const key = interaction.values[0];
  const cat = getCategory(key);
  const gcfg = db.getGuild(interaction.guild.id);

  // Resetta il menu così l'utente può riselezionare la stessa opzione
  const resetMenu = () =>
    (isV2(interaction.message)
      ? interaction.message.edit(buildPanel(interaction.guild, gcfg))
      : interaction.message.edit({ components: [panelMenu()] }) // pannello vecchio (embed)
    ).catch(() => {});

  const error = !cat ? 'Categoria non valida.' : openError(interaction.guild, gcfg, interaction.user.id, key);
  if (error) {
    resetMenu();
    return interaction.reply({ embeds: [errorEmbed(error)], flags: EPH });
  }

  const modal = new ModalBuilder().setCustomId(`ticket_modal:${key}`).setTitle(cat.label.slice(0, 45));
  for (const q of cat.questions) {
    const input = new TextInputBuilder()
      .setCustomId(q.id)
      .setStyle(q.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(q.required !== false)
      .setMaxLength(q.style === 'paragraph' ? 1000 : 150);
    if (q.placeholder) input.setPlaceholder(q.placeholder);
    modal.addLabelComponents(new LabelBuilder().setLabel(q.label).setTextInputComponent(input));
  }
  await interaction.showModal(modal);
  resetMenu();
}

async function createTicket(interaction) {
  const key = interaction.customId.split(':')[1];
  const cat = getCategory(key);
  const { guild, user } = interaction;
  const gcfg = db.getGuild(guild.id);
  if (!cat) return;

  await interaction.deferReply({ flags: EPH });

  const error = openError(guild, gcfg, user.id, key);
  if (error) return interaction.editReply({ embeds: [errorEmbed(error)] });

  const answers = cat.questions.map((q) => ({
    label: q.label,
    value: interaction.fields.getTextInputValue(q.id)?.trim() || '—',
  }));

  gcfg.ticketCounters[key] = (gcfg.ticketCounters[key] || 0) + 1;
  gcfg.ticketStats.opened++;
  const number = gcfg.ticketCounters[key];
  db.save();

  const roles = validRoles(guild, ticketRolesOf(gcfg, key));
  const name = `${key}-${String(number).padStart(4, '0')}`;
  const options = {
    name,
    type: ChannelType.GuildText,
    topic: `${cat.emoji} ${cat.label} • Aperto da ${user.tag} (${user.id})`,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
      { id: guild.client.user.id, allow: [...USER_PERMS, P.ManageChannels, P.ManageMessages] },
      { id: user.id, allow: USER_PERMS },
      ...roles.map((id) => ({ id, allow: [...USER_PERMS, P.ManageMessages] })),
    ],
    reason: `Ticket ${cat.label} aperto da ${user.tag}`,
  };

  let channel;
  try {
    const parent = await ensureTicketCategory(guild, gcfg, cat);
    channel = await guild.channels.create({ ...options, parent: parent.id });
  } catch (err) {
    // Es. categoria piena (max 50 canali): crea il ticket fuori categoria
    console.error('[Ticket] Creazione in categoria fallita, riprovo senza categoria:', err.message);
    channel = await guild.channels.create(options).catch((e) => {
      console.error('[Ticket] Creazione canale fallita:', e);
      return null;
    });
  }
  if (!channel) return interaction.editReply({ embeds: [errorEmbed('Impossibile creare il ticket. Controlla i permessi del bot.')] });

  db.setTicket(channel.id, {
    guildId: guild.id,
    channelId: channel.id,
    ownerId: user.id,
    category: key,
    number,
    baseName: name,
    priority: null,
    claimedBy: null,
    createdAt: Date.now(),
    answers,
  });

  serverStats.onChange(guild);

  const embed = new EmbedBuilder()
    .setColor(cat.color)
    .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
    .setTitle(`${cat.emoji} ${cat.label} • #${String(number).padStart(4, '0')}`)
    .setDescription(
      `Ciao ${user}, grazie per aver contattato lo staff di **LiteRP**!\n` +
        'Un membro dello staff ti risponderà il prima possibile. Nel frattempo aggiungi qui tutte le informazioni utili (screen, clip, dettagli).',
    )
    .addFields(answers.map((a) => ({ name: a.label, value: a.value.slice(0, 1024) })))
    .setFooter(FOOTER)
    .setTimestamp();

  const pingRoles = gcfg.ticketSettings.pingStaff ? roles : [];
  await channel.send({
    content: [`${user}`, ...pingRoles.map((id) => `<@&${id}>`)].join(' '),
    embeds: [embed],
    components: [ticketButtons()],
    allowedMentions: { users: [user.id], roles: pingRoles },
  });

  await interaction.editReply({ embeds: [successEmbed(`Ticket creato con successo: ${channel}`)] });

  await sendLog(guild, gcfg.channels.ticketLogs, {
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('📩 Ticket aperto')
        .addFields(
          { name: 'Ticket', value: `${channel} (\`${channel.name}\`)`, inline: true },
          { name: 'Categoria', value: catLabel(key), inline: true },
          { name: 'Aperto da', value: `${user} (\`${user.id}\`)`, inline: true },
        )
        .setTimestamp(),
    ],
  });
}

// ---------------------------------------------------------------- azioni sul ticket

/** Controlla che il canale sia un ticket e che l'utente abbia i permessi. Risponde con errore se no. */
async function guard(interaction, { staffOnly = true } = {}) {
  const ticket = db.getTicket(interaction.channelId);
  if (!ticket) {
    await interaction.reply({ embeds: [errorEmbed('Questo canale non è un ticket.')], flags: EPH });
    return null;
  }
  const gcfg = db.getGuild(interaction.guild.id);
  const allowed = canManageTicket(interaction.member, gcfg, ticket.category) || (!staffOnly && ticket.ownerId === interaction.user.id);
  if (!allowed) {
    await interaction.reply({ embeds: [errorEmbed('Non hai il permesso di eseguire questa azione su questo ticket.')], flags: EPH });
    return null;
  }
  return { ticket, gcfg };
}

function ticketLog(guild, gcfg, color, text) {
  return sendLog(guild, gcfg.channels.ticketLogs, {
    embeds: [new EmbedBuilder().setColor(color).setDescription(text).setTimestamp()],
    allowedMentions: { parse: [] },
  });
}

async function askClose(interaction) {
  if (!(await guard(interaction, { staffOnly: false }))) return;
  const modal = new ModalBuilder()
    .setCustomId('ticket_close_modal')
    .setTitle('Chiudi ticket')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Motivo della chiusura (facoltativo)')
        .setTextInputComponent(
          new TextInputBuilder().setCustomId('motivo').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500),
        ),
    );
  await interaction.showModal(modal);
}

function ratingButtons(guildId, staffId) {
  return new ActionRowBuilder().addComponents(
    [1, 2, 3, 4, 5].map((n) =>
      new ButtonBuilder()
        .setCustomId(`rate:${guildId}:${staffId || 0}:${n}`)
        .setLabel(`${n}`)
        .setEmoji('⭐')
        .setStyle(n >= 4 ? ButtonStyle.Success : n === 3 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
  );
}

/**
 * Chiusura effettiva: transcript, log, DM all'autore (con valutazione), statistiche, eliminazione canale.
 * @param {import('discord.js').User} closer
 */
async function performClose(channel, ticket, closer, reason) {
  const guild = channel.guild;
  const gcfg = db.getGuild(guild.id);
  const closerMember = guild.members.cache.get(closer.id);
  const closedByStaff = closer.id !== ticket.ownerId && closer.id !== guild.client.user.id && closerMember && canManageTicket(closerMember, gcfg, ticket.category);

  gcfg.ticketStats.closed++;
  if (closedByStaff) staffStats(gcfg, closer.id).closed++;
  db.save();

  const cat = getCategory(ticket.category);
  const reasonText = reason?.trim() || 'Nessun motivo specificato';
  try {
    const { buffer, count } = await createTranscript(channel, ticket);
    const fileName = `transcript-${channel.name}.txt`;

    await sendLog(guild, gcfg.channels.ticketLogs, {
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.danger)
          .setTitle('🔒 Ticket chiuso')
          .addFields(
            { name: 'Ticket', value: `\`${channel.name}\``, inline: true },
            { name: 'Categoria', value: catLabel(ticket.category), inline: true },
            { name: 'Messaggi', value: String(count), inline: true },
            { name: 'Aperto da', value: `<@${ticket.ownerId}>`, inline: true },
            { name: 'Chiuso da', value: `${closer}`, inline: true },
            { name: 'Preso in carico da', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Nessuno', inline: true },
            { name: 'Aperto il', value: `<t:${unix(ticket.createdAt)}:f>`, inline: true },
            { name: 'Durata', value: formatDuration(Date.now() - ticket.createdAt), inline: true },
            { name: 'Priorità', value: ticket.priority ? `${PRIORITIES[ticket.priority].emoji} ${PRIORITIES[ticket.priority].label}` : '—', inline: true },
            { name: 'Motivo', value: reasonText },
          )
          .setTimestamp(),
      ],
      files: [new AttachmentBuilder(buffer, { name: fileName })],
      allowedMentions: { parse: [] },
    });

    const owner = await guild.client.users.fetch(ticket.ownerId).catch(() => null);
    if (owner) {
      const staffId = ticket.claimedBy || (closedByStaff ? closer.id : null);
      const dm = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`🔒 Il tuo ticket su ${guild.name} è stato chiuso`)
        .addFields(
          { name: 'Ticket', value: `\`${channel.name}\``, inline: true },
          { name: 'Categoria', value: `${cat?.emoji ?? ''} ${cat?.label ?? ticket.category}`, inline: true },
          { name: 'Chiuso da', value: closer.tag ?? closer.username, inline: true },
          { name: 'Motivo', value: reasonText },
        )
        .setDescription(
          'In allegato trovi il transcript completo della conversazione.' +
            (gcfg.ticketSettings.rating ? '\n\n**Come valuti l’assistenza ricevuta?** Clicca una stella qui sotto ⭐' : ''),
        )
        .setFooter(FOOTER)
        .setTimestamp();
      await owner
        .send({
          embeds: [dm],
          files: [new AttachmentBuilder(buffer, { name: fileName })],
          components: gcfg.ticketSettings.rating ? [ratingButtons(guild.id, staffId)] : [],
        })
        .catch(() => {}); // DM chiusi
    }
  } catch (err) {
    console.error('[Ticket] Errore durante il transcript:', err);
  }

  db.deleteTicket(channel.id);
  serverStats.onChange(guild);
  setTimeout(() => {
    channel
      .delete(`Ticket chiuso da ${closer.tag ?? closer.username}`)
      .catch((err) => console.error('[Ticket] Impossibile eliminare il canale:', err.message))
      .finally(() => closing.delete(channel.id));
  }, 5000);
}

async function closeTicket(interaction, reason) {
  const res = await guard(interaction, { staffOnly: false });
  if (!res) return;
  const { channel, user } = interaction;

  if (closing.has(channel.id)) {
    return interaction.reply({ embeds: [errorEmbed('Il ticket è già in chiusura.')], flags: EPH });
  }
  closing.add(channel.id);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.warning)
        .setDescription(`🔒 Ticket chiuso da ${user}.\nSalvataggio del transcript in corso, il canale verrà eliminato tra pochi secondi...`),
    ],
  });
  await performClose(channel, res.ticket, user, reason);
}

async function claimTicket(interaction) {
  const res = await guard(interaction);
  if (!res) return;
  const { ticket, gcfg } = res;
  const { user, member } = interaction;
  let text;

  if (ticket.claimedBy === user.id) {
    ticket.claimedBy = null;
    text = `🙋 ${user} ha rilasciato il ticket.`;
  } else if (ticket.claimedBy && !isAdmin(member)) {
    return interaction.reply({ embeds: [errorEmbed(`Questo ticket è già stato preso in carico da <@${ticket.claimedBy}>.`)], flags: EPH });
  } else {
    ticket.claimedBy = user.id;
    ticket.claimedHistory ??= [];
    if (!ticket.claimedHistory.includes(user.id)) {
      ticket.claimedHistory.push(user.id);
      staffStats(gcfg, user.id).claimed++;
      db.save();
    }
    text = `🙋 Il ticket è stato preso in carico da ${user}.`;
  }
  db.setTicket(ticket.channelId, ticket);

  await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.info).setDescription(text)] });
  await ticketLog(interaction.guild, gcfg, COLORS.info, `${text}\nTicket: ${interaction.channel} (\`${interaction.channel.name}\`)`);
}

async function promptUserSelect(interaction, mode) {
  if (!(await guard(interaction))) return;
  const menu = new UserSelectMenuBuilder()
    .setCustomId(`ticket_${mode}_select`)
    .setPlaceholder(mode === 'add' ? 'Seleziona gli utenti da aggiungere' : 'Seleziona gli utenti da rimuovere')
    .setMinValues(1)
    .setMaxValues(5);
  await interaction.reply({ components: [new ActionRowBuilder().addComponents(menu)], flags: EPH });
}

/** Risponde in modo corretto sia ai comandi slash sia al menu utenti (che è un messaggio effimero). */
async function respondAction(interaction, embed) {
  if (interaction.isUserSelectMenu()) {
    await interaction.update({ embeds: [successEmbed('Fatto!')], components: [] });
    await interaction.channel.send({ embeds: [embed] });
  } else {
    await interaction.reply({ embeds: [embed] });
  }
}

async function addUsers(interaction, users) {
  const res = await guard(interaction);
  if (!res) return;
  const done = [];
  for (const u of users) {
    await interaction.channel.permissionOverwrites.edit(u.id, {
      ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true,
    });
    done.push(`${u}`);
  }
  await respondAction(interaction, new EmbedBuilder().setColor(COLORS.success).setDescription(`➕ ${done.join(', ')} aggiunto/i al ticket da ${interaction.user}.`));
  await ticketLog(interaction.guild, res.gcfg, COLORS.success, `➕ ${interaction.user} ha aggiunto ${done.join(', ')} al ticket \`${interaction.channel.name}\``);
}

async function removeUsers(interaction, users) {
  const res = await guard(interaction);
  if (!res) return;
  const done = [];
  for (const u of users) {
    if (u.id === res.ticket.ownerId || u.id === interaction.client.user.id) continue;
    await interaction.channel.permissionOverwrites.delete(u.id).catch(() => {});
    done.push(`${u}`);
  }
  if (!done.length) {
    const payload = { embeds: [errorEmbed("Non puoi rimuovere l'autore del ticket o il bot.")], components: [] };
    return interaction.isUserSelectMenu() ? interaction.update(payload) : interaction.reply({ ...payload, flags: EPH });
  }
  await respondAction(interaction, new EmbedBuilder().setColor(COLORS.danger).setDescription(`➖ ${done.join(', ')} rimosso/i dal ticket da ${interaction.user}.`));
  await ticketLog(interaction.guild, res.gcfg, COLORS.danger, `➖ ${interaction.user} ha rimosso ${done.join(', ')} dal ticket \`${interaction.channel.name}\``);
}

async function sendTranscript(interaction) {
  const res = await guard(interaction);
  if (!res) return;
  await interaction.deferReply({ flags: EPH });
  const { buffer, count } = await createTranscript(interaction.channel, res.ticket);
  await interaction.editReply({
    content: `📄 Transcript generato (${count} messaggi).`,
    files: [new AttachmentBuilder(buffer, { name: `transcript-${interaction.channel.name}.txt` })],
  });
}

/** Rinomina rispettando il limite Discord (2 cambi nome ogni 10 minuti). */
async function safeRename(channel, name) {
  const done = await withTimeout(channel.setName(name), 8000);
  return done
    ? null
    : '⏳ Discord limita i cambi di nome (2 ogni 10 minuti): il nuovo nome verrà applicato appena possibile.';
}

async function renameTicket(interaction, name) {
  const res = await guard(interaction);
  if (!res) return;
  await interaction.deferReply();
  const old = interaction.channel.name;
  res.ticket.baseName = name;
  res.ticket.priority = null;
  db.setTicket(res.ticket.channelId, res.ticket);
  const note = await safeRename(interaction.channel, name);
  await interaction.editReply({ embeds: [successEmbed(`Ticket rinominato da \`${old}\` a \`${name}\`.${note ? `\n${note}` : ''}`)] });
  await ticketLog(interaction.guild, res.gcfg, COLORS.info, `✏️ ${interaction.user} ha rinominato il ticket \`${old}\` in \`${name}\``);
}

async function setPriority(interaction, level) {
  const res = await guard(interaction);
  if (!res) return;
  const { ticket, gcfg } = res;
  await interaction.deferReply();
  const base = ticket.baseName || interaction.channel.name;
  const p = PRIORITIES[level];
  ticket.priority = p ? level : null;
  ticket.baseName = base;
  db.setTicket(ticket.channelId, ticket);

  const note = await safeRename(interaction.channel, p ? `${p.emoji}-${base}` : base);
  const text = p ? `${p.emoji} Priorità del ticket impostata su **${p.label}** da ${interaction.user}.` : `Priorità rimossa da ${interaction.user}.`;
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLORS.info).setDescription(`${text}${note ? `\n${note}` : ''}`)] });
  await ticketLog(interaction.guild, gcfg, COLORS.info, `${text}\nTicket: \`${base}\``);
}

async function moveTicket(interaction, newKey) {
  const res = await guard(interaction);
  if (!res) return;
  const { ticket, gcfg } = res;
  const { guild, channel } = interaction;
  if (ticket.category === newKey) return interaction.reply({ embeds: [errorEmbed('Il ticket è già in questa categoria.')], flags: EPH });

  await interaction.deferReply();
  const oldKey = ticket.category;
  const cat = getCategory(newKey);
  const parent = await ensureTicketCategory(guild, gcfg, cat);
  const oldRoles = validRoles(guild, ticketRolesOf(gcfg, oldKey));
  const newRoles = validRoles(guild, ticketRolesOf(gcfg, newKey));

  await channel.setParent(parent.id, { lockPermissions: false }).catch((e) => console.error('[Ticket] setParent:', e.message));
  for (const id of oldRoles) if (!newRoles.includes(id)) await channel.permissionOverwrites.delete(id).catch(() => {});
  for (const id of newRoles) await channel.permissionOverwrites.edit(id, STAFF_ALLOW).catch(() => {});
  await channel.setTopic(`${cat.emoji} ${cat.label} • Aperto da <@${ticket.ownerId}> (${ticket.ownerId})`).catch(() => {});

  ticket.category = newKey;
  ticket.claimedBy = null;
  db.setTicket(ticket.channelId, ticket);

  const text = `📂 Ticket spostato da **${catLabel(oldKey)}** a **${catLabel(newKey)}** da ${interaction.user}.`;
  await interaction.editReply({
    content: newRoles.map((id) => `<@&${id}>`).join(' ') || undefined,
    embeds: [new EmbedBuilder().setColor(COLORS.info).setDescription(text)],
    allowedMentions: { roles: newRoles },
  });
  await ticketLog(guild, gcfg, COLORS.info, `${text}\nTicket: ${channel} (\`${channel.name}\`)`);
}

// ---------------------------------------------------------------- valutazione (DM)

async function handleRating(interaction) {
  const [, guildId, staffId, n] = interaction.customId.split(':');
  const stars = Math.min(5, Math.max(1, Number(n)));
  const gcfg = db.peekGuild(guildId);
  const guild = interaction.client.guilds.cache.get(guildId);

  const original = interaction.message.embeds[0];
  const ticketName = original?.fields?.find((f) => f.name === 'Ticket')?.value ?? '`?`';
  await interaction.update({
    embeds: [
      ...(original ? [EmbedBuilder.from(original)] : []),
      new EmbedBuilder().setColor(COLORS.success).setDescription(`Grazie per la tua valutazione: ${'⭐'.repeat(stars)} (${stars}/5)`),
    ],
    components: [],
  });
  if (!gcfg || !guild) return;

  gcfg.ticketStats.ratingSum += stars;
  gcfg.ticketStats.ratingCount++;
  if (staffId !== '0') {
    const s = staffStats(gcfg, staffId);
    s.ratingSum += stars;
    s.ratingCount++;
  }
  db.save();

  await ticketLog(
    guild,
    gcfg,
    stars >= 4 ? COLORS.success : stars === 3 ? COLORS.warning : COLORS.danger,
    `${'⭐'.repeat(stars)} **Valutazione ${stars}/5** da ${interaction.user} per il ticket ${ticketName}` +
      (staffId !== '0' ? `\nStaff: <@${staffId}>` : ''),
  );
}

// ---------------------------------------------------------------- chiusura per inattività

async function checkInactivity(client) {
  for (const t of db.findTickets(() => true)) {
    const guild = client.guilds.cache.get(t.guildId);
    const gcfg = guild && db.peekGuild(guild.id);
    const hours = gcfg?.ticketSettings.autoCloseHours;
    if (!hours) continue;
    const channel = guild.channels.cache.get(t.channelId);
    if (!channel) {
      db.deleteTicket(t.channelId);
      continue;
    }
    if (closing.has(channel.id)) continue;

    try {
      if (t.warnMessageId) {
        if (channel.lastMessageId !== t.warnMessageId) {
          // qualcuno ha scritto dopo l'avviso
          t.warnMessageId = null;
          t.warnedAt = null;
          db.setTicket(t.channelId, t);
        } else if (Date.now() - t.warnedAt >= INACTIVITY_GRACE) {
          closing.add(channel.id);
          await channel.send({ embeds: [new EmbedBuilder().setColor(COLORS.warning).setDescription('🔒 Ticket chiuso automaticamente per inattività.')] });
          await performClose(channel, t, client.user, `Chiusura automatica per inattività (${hours}h senza risposte)`);
        }
        continue;
      }
      const last = channel.lastMessageId ? SnowflakeUtil.timestampFrom(channel.lastMessageId) : t.createdAt;
      if (Date.now() - last >= hours * 3_600_000) {
        const msg = await channel.send({
          content: `<@${t.ownerId}>`,
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.warning)
              .setDescription(`⏰ Questo ticket è inattivo da più di **${hours} ore**.\nSe nessuno scrive, verrà **chiuso automaticamente <t:${unix(Date.now() + INACTIVITY_GRACE)}:R>**.`),
          ],
          allowedMentions: { users: [t.ownerId] },
        });
        t.warnMessageId = msg.id;
        t.warnedAt = Date.now();
        db.setTicket(t.channelId, t);
      }
    } catch (err) {
      console.error('[Ticket] Controllo inattività:', err.message);
    }
  }
}

function startInactivityChecker(client) {
  setInterval(() => checkInactivity(client), 5 * 60 * 1000);
}

// ---------------------------------------------------------------- router

async function handleComponent(interaction) {
  const id = interaction.customId;
  if (id === 'ticket_open' && interaction.isStringSelectMenu()) return openSelect(interaction);
  if (id.startsWith('ticket_modal:') && interaction.isModalSubmit()) return createTicket(interaction);
  if (id === 'ticket_close') return askClose(interaction);
  if (id === 'ticket_close_modal') return closeTicket(interaction, interaction.fields.getTextInputValue('motivo'));
  if (id === 'ticket_claim') return claimTicket(interaction);
  if (id === 'ticket_transcript') return sendTranscript(interaction);
  if (id === 'ticket_add') return promptUserSelect(interaction, 'add');
  if (id === 'ticket_remove') return promptUserSelect(interaction, 'remove');
  if (id === 'ticket_add_select') return addUsers(interaction, [...interaction.users.values()]);
  if (id === 'ticket_remove_select') return removeUsers(interaction, [...interaction.users.values()]);
}

function onChannelDelete(channel) {
  db.deleteTicket(channel.id);
}

module.exports = {
  CATEGORIES, PRIORITIES, getCategory, catLabel, buildPanel, upsertPanel, ensureTicketCategory, openTicketsOf,
  handleComponent, handleRating, closeTicket, claimTicket, addUsers, removeUsers, renameTicket, setPriority, moveTicket,
  startInactivityChecker, onChannelDelete, deletePanel, refreshPanels,
};
