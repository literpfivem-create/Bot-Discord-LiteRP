const { MessageFlags, SlashCommandBuilder } = require('discord.js');
const db = require('../utils/db');
const tickets = require('../handlers/tickets');
const ticketSetup = require('../handlers/ticketSetup');
const { COLORS, baseEmbed, errorEmbed, successEmbed } = require('../utils/embeds');
const { isStaff } = require('../utils/permissions');
const { unix } = require('../utils/time');

const EPH = MessageFlags.Ephemeral;
const categoryChoices = tickets.CATEGORIES.map((c) => ({ name: `${c.emoji} ${c.label}`, value: c.key }));
const priorityChoices = [
  ...Object.entries(tickets.PRIORITIES).map(([value, p]) => ({ name: `${p.emoji} ${p.label}`, value })),
  { name: 'Nessuna (rimuovi)', value: 'nessuna' },
];
const avg = (sum, count) => (count ? (sum / count).toFixed(1) : '—');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Gestione dei ticket (chiusura, presa in carico, utenti, priorità)')
    .addSubcommand((s) => s.setName('chiudi').setDescription('Chiude il ticket corrente')
      .addStringOption((o) => o.setName('motivo').setDescription('Motivo della chiusura').setMaxLength(500)))
    .addSubcommand((s) => s.setName('reclama').setDescription('Prendi in carico (o rilascia) il ticket corrente'))
    .addSubcommand((s) => s.setName('aggiungi').setDescription('Aggiunge un utente al ticket')
      .addUserOption((o) => o.setName('utente').setDescription('Utente da aggiungere').setRequired(true)))
    .addSubcommand((s) => s.setName('rimuovi').setDescription('Rimuove un utente dal ticket')
      .addUserOption((o) => o.setName('utente').setDescription('Utente da rimuovere').setRequired(true)))
    .addSubcommand((s) => s.setName('rinomina').setDescription('Rinomina il ticket corrente')
      .addStringOption((o) => o.setName('nome').setDescription('Nuovo nome del canale').setRequired(true).setMaxLength(90)))
    .addSubcommand((s) => s.setName('priorita').setDescription('Imposta la priorità del ticket')
      .addStringOption((o) => o.setName('livello').setDescription('Priorità').setRequired(true).addChoices(...priorityChoices)))
    .addSubcommand((s) => s.setName('sposta').setDescription('Sposta il ticket in un’altra categoria')
      .addStringOption((o) => o.setName('categoria').setDescription('Nuova categoria').setRequired(true).addChoices(...categoryChoices)))
    .addSubcommand((s) => s.setName('lista').setDescription('Elenco dei ticket aperti')
      .addStringOption((o) => o.setName('categoria').setDescription('Filtra per categoria').addChoices(...categoryChoices)))
    .addSubcommand((s) => s.setName('statistiche').setDescription('Statistiche ticket e classifica staff')
      .addUserOption((o) => o.setName('staff').setDescription('Statistiche di un singolo membro dello staff')))
    .addSubcommandGroup((g) => g.setName('blacklist').setDescription('Utenti a cui è vietato aprire ticket')
      .addSubcommand((s) => s.setName('aggiungi').setDescription('Impedisce a un utente di aprire ticket')
        .addUserOption((o) => o.setName('utente').setDescription('Utente').setRequired(true))
        .addStringOption((o) => o.setName('motivo').setDescription('Motivo').setMaxLength(300)))
      .addSubcommand((s) => s.setName('rimuovi').setDescription('Consente di nuovo a un utente di aprire ticket')
        .addUserOption((o) => o.setName('utente').setDescription('Utente').setRequired(true)))
      .addSubcommand((s) => s.setName('lista').setDescription('Utenti in blacklist')))
    .addSubcommand((s) => s.setName('configura').setDescription('Crea il pannello e configura i ticket: categorie, ruoli, log, opzioni (admin)')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const opts = interaction.options;
    const { guild } = interaction;
    const gcfg = db.getGuild(guild.id);
    const group = opts.getSubcommandGroup(false);

    // "/ticket blacklist aggiungi|rimuovi" ha gli stessi nomi dei sottocomandi del ticket: prima si controlla il gruppo
    if (!group) switch (sub) {
      case 'chiudi':
        return tickets.closeTicket(interaction, opts.getString('motivo'));
      case 'reclama':
        return tickets.claimTicket(interaction);
      case 'aggiungi':
        return tickets.addUsers(interaction, [opts.getUser('utente', true)]);
      case 'rimuovi':
        return tickets.removeUsers(interaction, [opts.getUser('utente', true)]);
      case 'rinomina':
        return tickets.renameTicket(interaction, opts.getString('nome', true));
      case 'priorita':
        return tickets.setPriority(interaction, opts.getString('livello', true));
      case 'sposta':
        return tickets.moveTicket(interaction, opts.getString('categoria', true));
    }

    if (sub === 'configura') return ticketSetup.open(interaction);

    // Da qui in poi: solo staff
    if (!isStaff(interaction.member, gcfg)) {
      return interaction.reply({ embeds: [errorEmbed('Solo lo staff può usare questo comando.')], flags: EPH });
    }

    if (sub === 'lista') {
      const filter = opts.getString('categoria');
      const list = db
        .findTickets((t) => t.guildId === guild.id && (!filter || t.category === filter) && guild.channels.cache.has(t.channelId))
        .sort((a, b) => a.createdAt - b.createdAt);
      const lines = list.map((t) => {
        const p = t.priority ? tickets.PRIORITIES[t.priority].emoji : '▫️';
        return `${p} <#${t.channelId}> • <@${t.ownerId}> • ${t.claimedBy ? `🙋 <@${t.claimedBy}>` : '⏳ libero'} • <t:${unix(t.createdAt)}:R>`;
      });
      let description = lines.join('\n') || 'Nessun ticket aperto. 🎉';
      if (description.length > 4000) description = `${description.slice(0, 3950)}\n… e altri`;
      return interaction.reply({
        embeds: [baseEmbed(COLORS.primary).setTitle(`🎫 Ticket aperti (${list.length})${filter ? ` • ${tickets.catLabel(filter)}` : ''}`).setDescription(description)],
        flags: EPH,
      });
    }

    if (sub === 'statistiche') {
      const st = gcfg.ticketStats;
      const target = opts.getUser('staff');
      if (target) {
        const s = st.staff[target.id] || { closed: 0, claimed: 0, ratingSum: 0, ratingCount: 0 };
        return interaction.reply({
          embeds: [
            baseEmbed(COLORS.primary)
              .setAuthor({ name: target.tag, iconURL: target.displayAvatarURL() })
              .setTitle('📊 Statistiche ticket')
              .addFields(
                { name: 'Ticket chiusi', value: `**${s.closed}**`, inline: true },
                { name: 'Presi in carico', value: `**${s.claimed}**`, inline: true },
                { name: 'Valutazione media', value: `⭐ **${avg(s.ratingSum, s.ratingCount)}** (${s.ratingCount} voti)`, inline: true },
              ),
          ],
          flags: EPH,
        });
      }
      const open = db.findTickets((t) => t.guildId === guild.id).length;
      const ranking = Object.entries(st.staff)
        .sort(([, a], [, b]) => b.closed + b.claimed - (a.closed + a.claimed))
        .slice(0, 10)
        .map(([id, s], i) => `**${i + 1}.** <@${id}> — ${s.closed} chiusi • ${s.claimed} presi • ⭐ ${avg(s.ratingSum, s.ratingCount)}`);
      return interaction.reply({
        embeds: [
          baseEmbed(COLORS.primary)
            .setTitle('📊 Statistiche ticket LiteRP')
            .addFields(
              { name: 'Aperti ora', value: `**${open}**`, inline: true },
              { name: 'Totale aperti', value: `**${st.opened}**`, inline: true },
              { name: 'Totale chiusi', value: `**${st.closed}**`, inline: true },
              { name: 'Valutazione media', value: `⭐ **${avg(st.ratingSum, st.ratingCount)}** su ${st.ratingCount} voti` },
              { name: '🏆 Classifica staff', value: ranking.join('\n') || 'Ancora nessun dato.' },
            ),
        ],
        flags: EPH,
      });
    }

    if (group === 'blacklist') {
      const bl = gcfg.ticketSettings.blacklist;
      if (sub === 'lista') {
        const lines = bl.map((b) => `• <@${b.id}> — ${b.reason || 'nessun motivo'} (da <@${b.by}>, <t:${unix(b.date)}:d>)`);
        return interaction.reply({ embeds: [baseEmbed(COLORS.dark).setTitle('🚫 Blacklist ticket').setDescription(lines.join('\n').slice(0, 4000) || 'Nessun utente in blacklist.')], flags: EPH });
      }
      const user = opts.getUser('utente', true);
      if (sub === 'aggiungi') {
        if (!bl.some((b) => b.id === user.id)) bl.push({ id: user.id, reason: opts.getString('motivo'), by: interaction.user.id, date: Date.now() });
        db.save();
        return interaction.reply({ embeds: [successEmbed(`${user} non potrà più aprire ticket.`)], flags: EPH });
      }
      gcfg.ticketSettings.blacklist = bl.filter((b) => b.id !== user.id);
      db.save();
      return interaction.reply({ embeds: [successEmbed(`${user} può di nuovo aprire ticket.`)], flags: EPH });
    }
  },
};

