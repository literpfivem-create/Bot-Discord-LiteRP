// /serverstats — canali vocali non accessibili in una categoria dedicata: contatori in tempo reale e testi liberi (IP, sito...).
const { ChannelType, MessageFlags, PermissionFlagsBits: P, SlashCommandBuilder } = require('discord.js');
const db = require('../utils/db');
const stats = require('../handlers/serverStats');
const { COLORS, baseEmbed, errorEmbed, successEmbed } = require('../utils/embeds');

const EPH = MessageFlags.Ephemeral;
const MAX_COUNTERS = 20;
const COUNTER_CHANNELS = [ChannelType.GuildVoice];

const fail = (interaction, text) => interaction.reply({ embeds: [errorEmbed(text)], flags: EPH });
const ok = (interaction, text) => interaction.reply({ embeds: [successEmbed(text)], flags: EPH });

const typeChoices = Object.entries(stats.TYPES).filter(([value]) => value !== 'testo').map(([value, t]) => ({ name: t.description, value }));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverstats')
    .setDescription('Canali contatore (membri, ruoli, ticket, player...) e canali con testo libero (IP, sito...)')
    .setDefaultMemberPermissions(P.ManageGuild)
    .addSubcommand((s) => s.setName('aggiungi').setDescription('Crea un canale contatore')
      .addStringOption((o) => o.setName('tipo').setDescription('Cosa contare').setRequired(true).addChoices(...typeChoices))
      .addStringOption((o) => o.setName('nome').setDescription('Nome mostrato, es. Cittadini (default: dipende dal tipo)').setMaxLength(60))
      .addStringOption((o) => o.setName('emoji').setDescription('Emoji all\'inizio, es. 👥').setMaxLength(32))
      .addRoleOption((o) => o.setName('ruolo').setDescription('Ruolo da contare (solo per il tipo "Membri con un ruolo")')))
    .addSubcommand((s) => s.setName('testo').setDescription('Crea un canale con un testo scelto da te (IP del server, sito web...)')
      .addStringOption((o) => o.setName('testo').setDescription('Cosa scrivere, es. IP: 123.45.67.89 oppure www.literp.it').setRequired(true).setMaxLength(90))
      .addStringOption((o) => o.setName('emoji').setDescription('Emoji all\'inizio, es. 🌐 (default 📌)').setMaxLength(32)))
    .addSubcommand((s) => s.setName('modifica').setDescription('Cambia nome/testo o emoji di un canale')
      .addChannelOption((o) => o.setName('canale').setDescription('Canale da modificare').setRequired(true).addChannelTypes(...COUNTER_CHANNELS))
      .addStringOption((o) => o.setName('nome').setDescription('Nuovo nome (o nuovo testo per i canali con testo libero)').setMaxLength(90))
      .addStringOption((o) => o.setName('emoji').setDescription('Nuova emoji').setMaxLength(32)))
    .addSubcommand((s) => s.setName('rimuovi').setDescription('Elimina un contatore e il suo canale')
      .addChannelOption((o) => o.setName('canale').setDescription('Canale del contatore').setRequired(true).addChannelTypes(...COUNTER_CHANNELS)))
    .addSubcommand((s) => s.setName('lista').setDescription('Mostra i contatori e i loro valori'))
    .addSubcommand((s) => s.setName('aggiorna').setDescription('Forza subito l\'aggiornamento di tutti i contatori'))
    .addSubcommand((s) => s.setName('ripara').setDescription('Ricrea i canali eliminati e rimette tutto nella categoria'))
    .addSubcommand((s) => s.setName('reset').setDescription('Elimina TUTTI i contatori e la categoria')
      .addBooleanOption((o) => o.setName('conferma').setDescription('Metti true per confermare').setRequired(true)))
    .addSubcommandGroup((g) => g.setName('categoria').setDescription('Personalizza la categoria dei contatori')
      .addSubcommand((s) => s.setName('nome').setDescription('Cambia il nome della categoria')
        .addStringOption((o) => o.setName('nome').setDescription('Nuovo nome, es. 📊 | LiteRP Stats').setRequired(true).setMaxLength(100)))
      .addSubcommand((s) => s.setName('posizione').setDescription('Sposta la categoria in cima o in fondo')
        .addStringOption((o) => o.setName('posizione').setDescription('Dove metterla').setRequired(true).addChoices(
          { name: 'In cima', value: 'top' }, { name: 'In fondo', value: 'bottom' })))),

  async execute(interaction) {
    const { guild, options } = interaction;
    const gcfg = db.getGuild(guild.id);
    const sub = options.getSubcommand();

    if (options.getSubcommandGroup() === 'categoria') return category(interaction, gcfg, sub);

    switch (sub) {
      case 'aggiungi': return add(interaction, gcfg);
      case 'testo': return addText(interaction, gcfg);
      case 'modifica': return edit(interaction, gcfg);
      case 'rimuovi': return remove(interaction, gcfg);
      case 'lista': return list(interaction, gcfg);
      case 'aggiorna':
        await interaction.deferReply({ flags: EPH });
        await guild.members.fetch().catch(() => {});
        await stats.refreshGuild(guild);
        return interaction.editReply({ embeds: [successEmbed('Contatori aggiornati. Se un canale non cambia subito è per il limite di Discord (2 rinomine ogni 10 minuti): si aggiorna da solo appena possibile.')] });
      case 'ripara': return repair(interaction, gcfg);
      case 'reset': return reset(interaction, gcfg);
    }
  },
};

const findByChannel = (gcfg, channelId) => gcfg.stats.counters.find((c) => c.channelId === channelId);

async function add(interaction, gcfg) {
  const { guild, options } = interaction;
  const type = options.getString('tipo', true);
  const kind = 'voice';
  const role = options.getRole('ruolo');
  const def = stats.TYPES[type];

  if (type === 'ruolo' && !role) return fail(interaction, 'Per questo tipo devi indicare il **ruolo** da contare.');
  if (type !== 'ruolo' && role) return fail(interaction, 'Il ruolo serve solo per il tipo "Membri con un ruolo".');
  if (gcfg.stats.counters.length >= MAX_COUNTERS) return fail(interaction, `Puoi avere al massimo ${MAX_COUNTERS} contatori.`);
  if (gcfg.stats.counters.some((c) => c.type === type && c.kind === kind && c.roleId === (role?.id ?? undefined))) {
    return fail(interaction, 'Esiste già un contatore identico.');
  }
  if (!guild.members.me.permissions.has(P.ManageChannels)) return fail(interaction, 'Al bot serve il permesso **Gestisci canali**.');

  await interaction.deferReply({ flags: EPH });
  await guild.members.fetch().catch(() => {});
  const counter = {
    id: ++gcfg.stats.seq,
    type,
    kind,
    channelId: null,
    emoji: options.getString('emoji')?.trim() || def.emoji,
    label: options.getString('nome')?.trim() || def.label || role.name,
    ...(role && { roleId: role.id }),
    lastName: null,
    appliedName: null,
  };
  let channel;
  try {
    channel = await stats.createChannel(guild, gcfg, counter);
  } catch (err) {
    gcfg.stats.seq--;
    return interaction.editReply({ embeds: [errorEmbed(`Impossibile creare il canale: ${err.message}`)] });
  }
  gcfg.stats.counters.push(counter);
  db.save();
  return interaction.editReply({ embeds: [successEmbed(`Contatore creato: ${channel}. Si aggiorna in tempo reale.`)] });
}

async function addText(interaction, gcfg) {
  const { guild, options } = interaction;
  if (gcfg.stats.counters.length >= MAX_COUNTERS) return fail(interaction, `Puoi avere al massimo ${MAX_COUNTERS} canali tra contatori e testi.`);
  if (!guild.members.me.permissions.has(P.ManageChannels)) return fail(interaction, 'Al bot serve il permesso **Gestisci canali**.');

  await interaction.deferReply({ flags: EPH });
  const counter = {
    id: ++gcfg.stats.seq,
    type: 'testo',
    kind: 'voice',
    channelId: null,
    emoji: options.getString('emoji')?.trim() || stats.TYPES.testo.emoji,
    label: options.getString('testo', true).trim(),
    lastName: null,
    appliedName: null,
  };
  let channel;
  try {
    channel = await stats.createChannel(guild, gcfg, counter);
  } catch (err) {
    gcfg.stats.seq--;
    return interaction.editReply({ embeds: [errorEmbed(`Impossibile creare il canale: ${err.message}`)] });
  }
  gcfg.stats.counters.push(counter);
  db.save();
  return interaction.editReply({ embeds: [successEmbed(`Canale creato: ${channel}. Per cambiare il testo usa /serverstats modifica.`)] });
}

async function edit(interaction, gcfg) {
  const { options } = interaction;
  const counter = findByChannel(gcfg, options.getChannel('canale', true).id);
  if (!counter) return fail(interaction, 'Questo canale non è un contatore di server stats.');
  const label = options.getString('nome')?.trim();
  const emoji = options.getString('emoji')?.trim();
  if (!label && !emoji) return fail(interaction, 'Indica almeno un nuovo **nome** o una nuova **emoji**.');
  if (label) counter.label = label;
  if (emoji) counter.emoji = emoji;
  db.save();
  await interaction.deferReply({ flags: EPH });
  await stats.refreshGuild(interaction.guild);
  return interaction.editReply({ embeds: [successEmbed(`Contatore aggiornato: <#${counter.channelId}>. Il canale si rinomina entro pochi istanti (limite di Discord: 2 rinomine ogni 10 minuti).`)] });
}

async function remove(interaction, gcfg) {
  const channel = interaction.options.getChannel('canale', true);
  const counter = findByChannel(gcfg, channel.id);
  if (!counter) return fail(interaction, 'Questo canale non è un contatore di server stats.');
  await interaction.guild.channels.cache.get(counter.channelId)?.delete('Contatore server stats rimosso').catch(() => {});
  gcfg.stats.counters = gcfg.stats.counters.filter((c) => c.id !== counter.id);
  db.save();
  return ok(interaction, `Contatore **${counter.label}** rimosso.`);
}

function list(interaction, gcfg) {
  const { guild } = interaction;
  const lines = gcfg.stats.counters.map((c) => {
    const exists = guild.channels.cache.has(c.channelId);
    const where = exists ? `<#${c.channelId}>` : '⚠️ **canale eliminato**';
    if (c.type === 'testo') return `${where} · testo libero → ${c.label}`;
    const value = stats.valueOf(guild, c) ?? '--';
    const what = c.type === 'ruolo' ? `ruolo ${guild.roles.cache.get(c.roleId) ?? '⚠️ eliminato'}` : stats.TYPES[c.type]?.description.toLowerCase();
    return `${where} · ${what} → **${value}**`;
  });
  const category = guild.channels.cache.get(gcfg.channels.statsCategory);
  const embed = baseEmbed(COLORS.primary)
    .setTitle('📊 Server stats')
    .setDescription(
      `Categoria: ${category ? `**${category.name}**` : `*non creata* (nome: **${gcfg.stats.categoryName}**)`}\n\n` +
      (lines.join('\n') || 'Nessun contatore. Creane uno con `/serverstats aggiungi`.'),
    );
  if (gcfg.stats.counters.some((c) => !guild.channels.cache.has(c.channelId))) embed.setFooter({ text: 'Usa /serverstats ripara per ricreare i canali eliminati' });
  return interaction.reply({ embeds: [embed], flags: EPH });
}

async function repair(interaction, gcfg) {
  const { guild } = interaction;
  if (!gcfg.stats.counters.length) return fail(interaction, 'Non ci sono contatori da riparare.');
  if (!guild.members.me.permissions.has(P.ManageChannels)) return fail(interaction, 'Al bot serve il permesso **Gestisci canali**.');
  await interaction.deferReply({ flags: EPH });
  const cat = await stats.ensureCategory(guild, gcfg);
  let recreated = 0;
  let moved = 0;
  for (const counter of gcfg.stats.counters) {
    const channel = guild.channels.cache.get(counter.channelId);
    if (!channel) {
      await stats.createChannel(guild, gcfg, counter).then(() => recreated++).catch((e) => console.error('[Stats] Ripristino fallito:', e.message));
    } else if (channel.parentId !== cat.id) {
      await channel.setParent(cat.id, { lockPermissions: false }).then(() => moved++).catch(() => {});
    }
  }
  db.save();
  await stats.refreshGuild(guild);
  return interaction.editReply({ embeds: [successEmbed(`Fatto: **${recreated}** canali ricreati, **${moved}** spostati nella categoria.`)] });
}

async function reset(interaction, gcfg) {
  const { guild, options } = interaction;
  if (!options.getBoolean('conferma', true)) return fail(interaction, 'Operazione annullata: devi mettere `conferma:true`.');
  await interaction.deferReply({ flags: EPH });
  for (const c of gcfg.stats.counters) await guild.channels.cache.get(c.channelId)?.delete('Reset server stats').catch(() => {});
  await guild.channels.cache.get(gcfg.channels.statsCategory)?.delete('Reset server stats').catch(() => {});
  const count = gcfg.stats.counters.length;
  gcfg.stats.counters = [];
  gcfg.channels.statsCategory = null;
  db.save();
  return interaction.editReply({ embeds: [successEmbed(`Server stats azzerate: **${count}** contatori e categoria eliminati.`)] });
}

async function category(interaction, gcfg, sub) {
  const { guild, options } = interaction;
  await interaction.deferReply({ flags: EPH });
  const cat = guild.channels.cache.get(gcfg.channels.statsCategory);

  if (sub === 'nome') {
    gcfg.stats.categoryName = options.getString('nome', true).trim();
    db.save();
    if (!cat) return interaction.editReply({ embeds: [successEmbed(`Nome salvato: **${gcfg.stats.categoryName}**. Verrà usato quando crei il primo contatore.`)] });
    try {
      await cat.setName(gcfg.stats.categoryName, 'Server stats LiteRP');
    } catch (err) {
      return interaction.editReply({ embeds: [errorEmbed(`Impossibile rinominare la categoria: ${err.message}`)] });
    }
    return interaction.editReply({ embeds: [successEmbed(`Categoria rinominata in **${cat.name}**.`)] });
  }

  if (!cat) return interaction.editReply({ embeds: [errorEmbed('La categoria non esiste ancora: crea prima un contatore con `/serverstats aggiungi`.')] });
  const top = options.getString('posizione', true) === 'top';
  try {
    await cat.setPosition(top ? 0 : guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).size - 1);
  } catch (err) {
    return interaction.editReply({ embeds: [errorEmbed(`Impossibile spostare la categoria: ${err.message}`)] });
  }
  return interaction.editReply({ embeds: [successEmbed(`Categoria spostata ${top ? 'in cima' : 'in fondo'}.`)] });
}
