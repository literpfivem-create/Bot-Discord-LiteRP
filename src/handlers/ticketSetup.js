// /ticket configura — pannello di controllo interattivo (solo admin) per tutto il sistema ticket:
// canale del pannello, log, categoria Discord e ruoli di ogni tipo di ticket, limiti e opzioni.
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, EmbedBuilder, LabelBuilder,
  MessageFlags, ModalBuilder, PermissionFlagsBits: P, RoleSelectMenuBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const db = require('../utils/db');
const tickets = require('./tickets');
const { COLORS, errorEmbed } = require('../utils/embeds');
const { ticketRolesOf } = require('../utils/permissions');

const EPH = MessageFlags.Ephemeral;
const roleList = (ids) => (ids?.length ? ids.map((id) => `<@&${id}>`).join(' ') : '*nessuno*');
const onOff = (v) => (v ? '✅' : '❌');
const row = (...components) => new ActionRowBuilder().addComponents(...components);

// ---------------------------------------------------------------- viste

function mainView(guild, gcfg) {
  const ts = gcfg.ticketSettings;
  const c = gcfg.channels;
  const panel = guild.channels.cache.get(c.ticketPanel);
  const logs = guild.channels.cache.get(c.ticketLogs);

  const types = tickets.CATEGORIES.map((cat) => {
    const category = guild.channels.cache.get(gcfg.categories[cat.key]);
    const own = gcfg.ticketRoles[cat.key]?.length;
    return `${cat.emoji} **${cat.label.replace(/^Ticket /, '')}** · 📁 ${category ? category.name : '*automatica*'} · ${own ? roleList(gcfg.ticketRoles[cat.key]) : '*staff*'}`;
  });

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setAuthor({ name: `${guild.name} • Configurazione ticket`, iconURL: guild.iconURL() ?? undefined })
    .setDescription('Usa i menu e i pulsanti qui sotto: **ogni modifica viene salvata subito**.')
    .addFields(
      { name: '📩 Pannello', value: panel && gcfg.panelMessageId ? `${panel}` : '❌ Non inviato\n-# Scegli il canale qui sotto', inline: true },
      { name: '📜 Log ticket', value: logs ? `${logs}` : '❌ Non impostato', inline: true },
      { name: '🛡️ Staff', value: roleList(gcfg.staffRoles.filter((id) => guild.roles.cache.has(id))), inline: true },
      {
        name: '⚙️ Opzioni',
        value:
          `Max **${ts.maxOpen}** ticket aperti per utente • Chiusura inattivi: **${ts.autoCloseHours ? `dopo ${ts.autoCloseHours}h` : 'disattivata'}**\n` +
          `Ping staff all’apertura ${onOff(ts.pingStaff)} • Valutazione dopo la chiusura ${onOff(ts.rating)}`,
      },
      { name: '🗂️ Tipi di ticket · categoria · chi li gestisce', value: types.join('\n').slice(0, 1024) },
    );

  const panelSelect = new ChannelSelectMenuBuilder()
    .setCustomId('tcfg:panel')
    .setPlaceholder('📩 Canale del pannello (lo invia o lo sposta)')
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
  if (panel) panelSelect.setDefaultChannels(panel.id);

  const logSelect = new ChannelSelectMenuBuilder()
    .setCustomId('tcfg:logs')
    .setPlaceholder('📜 Canale dei log ticket (transcript, valutazioni)')
    .setChannelTypes(ChannelType.GuildText);
  if (logs) logSelect.setDefaultChannels(logs.id);

  const typeSelect = new StringSelectMenuBuilder()
    .setCustomId('tcfg:type')
    .setPlaceholder('🗂️ Configura un tipo di ticket (categoria e ruoli)')
    .addOptions(tickets.CATEGORIES.map((cat) => ({ label: cat.label, value: cat.key, emoji: cat.emoji, description: 'Categoria Discord e ruoli che lo gestiscono' })));

  const buttons = row(
    new ButtonBuilder().setCustomId('tcfg:ping').setEmoji('🔔').setLabel(`Ping staff: ${ts.pingStaff ? 'sì' : 'no'}`)
      .setStyle(ts.pingStaff ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tcfg:rating').setEmoji('⭐').setLabel(`Valutazione: ${ts.rating ? 'sì' : 'no'}`)
      .setStyle(ts.rating ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('tcfg:limits').setEmoji('⏰').setLabel('Limiti e inattività').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('tcfg:refresh').setEmoji('🔄').setLabel('Aggiorna pannello').setStyle(ButtonStyle.Secondary)
      .setDisabled(!panel || !gcfg.panelMessageId),
  );

  return { embeds: [embed], components: [row(panelSelect), row(logSelect), row(typeSelect), buttons] };
}

function typeView(guild, gcfg, key) {
  const cat = tickets.getCategory(key);
  const category = guild.channels.cache.get(gcfg.categories[key]);
  const own = (gcfg.ticketRoles[key] || []).filter((id) => guild.roles.cache.has(id));
  const open = db.findTickets((t) => t.guildId === guild.id && t.category === key).length;

  const embed = new EmbedBuilder()
    .setColor(cat.color)
    .setTitle(`${cat.emoji} ${cat.label}`)
    .setDescription(`${cat.description}\n-# Le modifiche valgono per i nuovi ticket.`)
    .addFields(
      { name: '📁 Categoria Discord', value: category ? `**${category.name}**` : 'Nessuna: verrà creata in automatico al primo ticket', inline: true },
      { name: '👥 Gestito da', value: own.length ? roleList(own) : `${roleList(gcfg.staffRoles)}\n-# ruoli staff (predefinito)`, inline: true },
      { name: '🎫 Ticket', value: `Aperti ora: **${open}** • Totali: **${gcfg.ticketCounters[key] || 0}**`, inline: true },
    );

  const catSelect = new ChannelSelectMenuBuilder()
    .setCustomId(`tcfg:cat:${key}`)
    .setPlaceholder('📁 Categoria Discord in cui aprire questi ticket')
    .setChannelTypes(ChannelType.GuildCategory);
  if (category) catSelect.setDefaultChannels(category.id);

  const roleSelect = new RoleSelectMenuBuilder()
    .setCustomId(`tcfg:roles:${key}`)
    .setPlaceholder('👥 Ruoli che gestiscono questi ticket (vuoto = staff)')
    .setMinValues(0)
    .setMaxValues(10);
  if (own.length) roleSelect.setDefaultRoles(...own);

  const buttons = row(
    new ButtonBuilder().setCustomId('tcfg:back').setEmoji('⬅️').setLabel('Indietro').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`tcfg:newcat:${key}`).setEmoji('📁').setLabel('Crea categoria automaticamente')
      .setStyle(ButtonStyle.Primary).setDisabled(Boolean(category)),
    new ButtonBuilder().setCustomId(`tcfg:staff:${key}`).setEmoji('🛡️').setLabel('Usa i ruoli staff')
      .setStyle(ButtonStyle.Secondary).setDisabled(!own.length),
  );

  return { embeds: [embed], components: [row(catSelect), row(roleSelect), buttons] };
}

// ---------------------------------------------------------------- azioni

/** Aggiorna i permessi della categoria Discord quando cambiano i ruoli che gestiscono un tipo di ticket. */
async function syncCategoryRoles(guild, gcfg, key, before) {
  const category = guild.channels.cache.get(gcfg.categories[key]);
  if (!category) return;
  const after = ticketRolesOf(gcfg, key);
  for (const id of before) if (!after.includes(id)) await category.permissionOverwrites.delete(id).catch(() => {});
  for (const id of after) await category.permissionOverwrites.edit(id, { ViewChannel: true, ReadMessageHistory: true }).catch(() => {});
}

function limitsModal(gcfg) {
  const ts = gcfg.ticketSettings;
  const input = (id, value, placeholder) =>
    new TextInputBuilder().setCustomId(id).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3).setValue(String(value)).setPlaceholder(placeholder);
  return new ModalBuilder()
    .setCustomId('tcfg:limits_modal')
    .setTitle('Limiti e inattività')
    .addLabelComponents(
      new LabelBuilder().setLabel('Ticket aperti per utente (1-9)').setTextInputComponent(input('max', ts.maxOpen, 'Es. 3')),
      new LabelBuilder()
        .setLabel('Chiudi i ticket inattivi dopo ore (0 = mai)')
        .setDescription('Il bot avvisa e chiude il ticket 1 ora dopo se nessuno risponde')
        .setTextInputComponent(input('hours', ts.autoCloseHours, 'Es. 48')),
    );
}

async function open(interaction) {
  if (!interaction.memberPermissions.has(P.ManageGuild)) {
    return interaction.reply({ embeds: [errorEmbed('Ti serve il permesso **Gestisci server** per configurare i ticket.')], flags: EPH });
  }
  const gcfg = db.getGuild(interaction.guild.id);
  return interaction.reply({ ...mainView(interaction.guild, gcfg), flags: EPH });
}

async function handle(interaction) {
  const { guild } = interaction;
  if (!interaction.memberPermissions.has(P.ManageGuild)) {
    return interaction.reply({ embeds: [errorEmbed('Ti serve il permesso **Gestisci server**.')], flags: EPH });
  }
  const gcfg = db.getGuild(guild.id);
  const ts = gcfg.ticketSettings;
  const [, action, key] = interaction.customId.split(':');
  const fail = (text) => interaction.reply({ embeds: [errorEmbed(text)], flags: EPH });
  const save = (view) => {
    db.save();
    return interaction.update(view);
  };

  switch (action) {
    case 'panel': {
      const channel = interaction.channels.first();
      if (!channel?.permissionsFor(guild.members.me)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles])) {
        return fail(`Il bot non può scrivere in ${channel}. Controlla i permessi del canale.`);
      }
      await interaction.deferUpdate();
      try {
        await tickets.upsertPanel(channel, gcfg);
      } catch (err) {
        await interaction.followUp({ embeds: [errorEmbed(`Impossibile inviare il pannello: ${err.message}`)], flags: EPH });
      }
      db.save();
      return interaction.editReply(mainView(guild, gcfg));
    }
    case 'refresh': {
      const channel = guild.channels.cache.get(gcfg.channels.ticketPanel);
      if (!channel) return fail('Il canale del pannello non esiste più: scegline uno nuovo.');
      await interaction.deferUpdate();
      await tickets.upsertPanel(channel, gcfg).catch((err) => interaction.followUp({ embeds: [errorEmbed(err.message)], flags: EPH }));
      return interaction.editReply(mainView(guild, gcfg));
    }
    case 'logs': {
      const channel = interaction.channels.first();
      if (!channel?.permissionsFor(guild.members.me)?.has([P.ViewChannel, P.SendMessages, P.AttachFiles])) {
        return fail(`Il bot non può scrivere in ${channel}.`);
      }
      gcfg.channels.ticketLogs = channel.id;
      return save(mainView(guild, gcfg));
    }
    case 'ping':
      ts.pingStaff = !ts.pingStaff;
      return save(mainView(guild, gcfg));
    case 'rating':
      ts.rating = !ts.rating;
      return save(mainView(guild, gcfg));
    case 'limits':
      return interaction.showModal(limitsModal(gcfg));
    case 'limits_modal': {
      const max = Number(interaction.fields.getTextInputValue('max').trim());
      const hours = Number(interaction.fields.getTextInputValue('hours').trim());
      if (!Number.isInteger(max) || max < 1 || max > 9) return fail('Il numero di ticket aperti deve essere tra 1 e 9.');
      if (!Number.isInteger(hours) || hours < 0 || hours > 720) return fail('Le ore di inattività devono essere tra 0 e 720.');
      ts.maxOpen = max;
      ts.autoCloseHours = hours;
      return save(mainView(guild, gcfg));
    }
    case 'type':
      return interaction.update(typeView(guild, gcfg, interaction.values[0]));
    case 'back':
      return interaction.update(mainView(guild, gcfg));
    case 'cat': {
      gcfg.categories[key] = interaction.channels.first().id;
      return save(typeView(guild, gcfg, key));
    }
    case 'roles': {
      const before = ticketRolesOf(gcfg, key);
      gcfg.ticketRoles[key] = [...interaction.roles.keys()].filter((id) => id !== guild.id);
      await interaction.deferUpdate();
      await syncCategoryRoles(guild, gcfg, key, before);
      db.save();
      return interaction.editReply(typeView(guild, gcfg, key));
    }
    case 'staff': {
      const before = ticketRolesOf(gcfg, key);
      gcfg.ticketRoles[key] = [];
      await interaction.deferUpdate();
      await syncCategoryRoles(guild, gcfg, key, before);
      db.save();
      return interaction.editReply(typeView(guild, gcfg, key));
    }
    case 'newcat': {
      await interaction.deferUpdate();
      await tickets.ensureTicketCategory(guild, gcfg, tickets.getCategory(key))
        .catch((err) => interaction.followUp({ embeds: [errorEmbed(`Impossibile creare la categoria: ${err.message}`)], flags: EPH }));
      return interaction.editReply(typeView(guild, gcfg, key));
    }
  }
}

module.exports = { open, handle };
