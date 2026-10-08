// /sito — collegamento tra il bot e il sito LiteRP: stato, server collegato, prova degli avvisi, obiettivo community, pagina Staff, News, whitelist del profilo.
const { ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits: P, SlashCommandBuilder } = require('discord.js');
const api = require('../api/server');
const db = require('../utils/db');
const site = require('../handlers/site');
const siteLive = require('../handlers/siteLive');
const siteStaff = require('../handlers/siteStaff');
const siteNews = require('../handlers/siteNews');
const siteEvents = require('../handlers/siteEvents');
const { COLORS, errorEmbed, successEmbed } = require('../utils/embeds');

const EPH = MessageFlags.Ephemeral;
const check = (v) => (v ? '✅' : '❌');
const when = (ts) => (ts ? `<t:${Math.floor(ts / 1000)}:R>` : '*mai*');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sito')
    .setDescription('Collegamento con il sito LiteRP')
    .setDefaultMemberPermissions(P.ManageGuild)
    .addSubcommand((s) => s.setName('stato').setDescription('Cosa è collegato al sito e cosa manca'))
    .addSubcommand((s) => s.setName('collega').setDescription('Mostra sul sito i dati di questo server Discord'))
    .addSubcommand((s) => s.setName('prova').setDescription('Invia un avviso di prova al sito per controllare il collegamento'))
    .addSubcommand((s) => s.setName('whitelist').setDescription('Ruolo che nel profilo del sito vale come "whitelist"')
      .addRoleOption((o) => o.setName('ruolo').setDescription('Ruolo whitelist (vuoto = nessuno: il profilo non mostra la whitelist)')))
    .addSubcommandGroup((g) => g.setName('obiettivo').setDescription('Barra "Siamo a 870 / 1000 membri" sul sito')
      .addSubcommand((s) => s.setName('imposta').setDescription('Imposta il traguardo dei membri Discord')
        .addIntegerOption((o) => o.setName('traguardo').setDescription('Numero da raggiungere, es. 1000').setRequired(true).setMinValue(1).setMaxValue(10_000_000))
        .addStringOption((o) => o.setName('testo').setDescription('Cosa si conta, es. membri (default: membri)').setMaxLength(30))
        .addChannelOption((o) => o.setName('canale').setDescription('Dove annunciare il traguardo raggiunto (vuoto = nessun annuncio)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
      .addSubcommand((s) => s.setName('rimuovi').setDescription('Toglie la barra dell’obiettivo dal sito')))
    .addSubcommandGroup((g) => g.setName('staff').setDescription('Gruppi mostrati nella pagina Staff del sito')
      .addSubcommand((s) => s.setName('aggiungi').setDescription('Mostra un ruolo come gruppo staff sul sito (o ne cambia testo e nome)')
        .addRoleOption((o) => o.setName('ruolo').setDescription('Ruolo Discord, es. @Owner').setRequired(true))
        .addStringOption((o) => o.setName('descrizione').setDescription('Frase accanto al nome del gruppo, es. Hanno fondato LiteRP').setRequired(true).setMaxLength(160))
        .addStringOption((o) => o.setName('nome').setDescription('Nome sul sito (vuoto = nome del ruolo su Discord)').setMaxLength(40))
        .addIntegerOption((o) => o.setName('posizione').setDescription('1 = primo gruppo in alto (vuoto = in fondo, o resta dov’è)').setMinValue(1).setMaxValue(25)))
      .addSubcommand((s) => s.setName('rimuovi').setDescription('Toglie un gruppo dalla pagina Staff')
        .addRoleOption((o) => o.setName('ruolo').setDescription('Ruolo da togliere').setRequired(true)))
      .addSubcommand((s) => s.setName('ordine').setDescription('Sposta un gruppo nella pagina Staff')
        .addRoleOption((o) => o.setName('ruolo').setDescription('Ruolo da spostare').setRequired(true))
        .addIntegerOption((o) => o.setName('posizione').setDescription('Nuova posizione: 1 = primo gruppo in alto').setRequired(true).setMinValue(1).setMaxValue(25)))
      .addSubcommand((s) => s.setName('lista').setDescription('Gruppi della pagina Staff, in ordine, con i membri')))
    .addSubcommandGroup((g) => g.setName('news').setDescription('Canali i cui messaggi diventano notizie sulla pagina News')
      .addSubcommand((s) => s.setName('aggiungi').setDescription('Ogni messaggio di questo canale diventa una notizia sul sito')
        .addChannelOption((o) => o.setName('canale').setDescription('Canale da cui prendere le notizie').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
        .addStringOption((o) => o.setName('tipo').setDescription('Etichetta delle notizie sul sito (filtro della pagina News)').setRequired(true)
          .addChoices({ name: 'Annunci', value: 'annuncio' }, { name: 'Aggiornamenti', value: 'aggiornamento' })))
      .addSubcommand((s) => s.setName('rimuovi').setDescription('Il canale non viene più mostrato e le sue notizie spariscono dal sito')
        .addChannelOption((o) => o.setName('canale').setDescription('Canale da togliere').setRequired(true).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
      .addSubcommand((s) => s.setName('lista').setDescription('Canali della pagina News ed eventi Discord'))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const group = interaction.options.getSubcommandGroup();
    if (group === 'obiettivo') return goal(interaction, sub);
    if (group === 'staff') return staff(interaction, sub);
    if (group === 'news') return news(interaction, sub);
    if (sub === 'whitelist') return whitelist(interaction);

    if (sub === 'collega') {
      db.getSite().guildId = interaction.guild.id;
      db.save();
      siteLive.loadMembers(interaction.guild);
      siteEvents.sync().catch((e) => console.error('[Sito] Sincronizzazione eventi:', e.message));
      site.notify(...site.TAGS);
      return interaction.reply({ embeds: [successEmbed(`Il sito ora mostra i dati di **${interaction.guild.name}**.`)], flags: EPH });
    }

    if (sub === 'prova') {
      if (!site.siteUrl() || !api.secretOf('REVALIDATE_SECRET')) {
        return interaction.reply({ embeds: [errorEmbed('Imposta prima `SITE_URL` e `REVALIDATE_SECRET` nelle variabili del bot (file `.env` o Railway).')], flags: EPH });
      }
      await interaction.deferReply({ flags: EPH });
      const result = await site.sendRevalidate(['live']);
      return interaction.editReply({
        embeds: [result.ok
          ? successEmbed(`Il sito **${site.siteUrl()}** ha ricevuto l'avviso.`)
          : errorEmbed(`Il sito non ha accettato l'avviso: \`${result.error}\`\n${notifyHint(result.error)}`)],
      });
    }

    return interaction.reply({ embeds: [overview(interaction.guild)], flags: EPH });
  },
};

async function goal(interaction, sub) {
  const settings = db.getSite();
  const reply = (embed) => interaction.reply({ embeds: [embed], flags: EPH });

  if (sub === 'rimuovi') {
    settings.goal = null;
    db.save();
    site.notify('live');
    return reply(successEmbed('Obiettivo rimosso: la barra non compare più sul sito.'));
  }

  const guild = site.siteGuild();
  if (!guild) return reply(errorEmbed('Prima scegli il server da mostrare sul sito con `/sito collega`.'));
  const target = interaction.options.getInteger('traguardo', true);
  const label = interaction.options.getString('testo')?.trim() || 'membri';
  const channel = interaction.options.getChannel('canale');
  const reached = guild.memberCount >= target;
  settings.goal = { target, label, channelId: channel?.id ?? null, reachedAt: reached ? Date.now() : null };
  db.save();
  site.notify('live');

  const now = guild.memberCount.toLocaleString('it-IT');
  return reply(successEmbed(
    reached
      ? `Obiettivo impostato a **${target.toLocaleString('it-IT')} ${label}**, ma siete già **${now}**: sul sito risulta raggiunto.`
      : `Sul sito: **Siamo a ${now} / ${target.toLocaleString('it-IT')} ${label}**.${channel ? `\nAl traguardo lo annuncio in ${channel}.` : ''}`,
  ));
}

async function whitelist(interaction) {
  const reply = (embed) => interaction.reply({ embeds: [embed], flags: EPH });
  const guild = site.siteGuild();
  if (!guild) return reply(errorEmbed('Prima scegli il server da mostrare sul sito con `/sito collega`.'));
  if (guild.id !== interaction.guild.id) return reply(errorEmbed(`Il sito mostra **${guild.name}**: usa questo comando lì, oppure \`/sito collega\` qui.`));

  const role = interaction.options.getRole('ruolo');
  if (role && (role.id === guild.id || role.managed)) return reply(errorEmbed('Scegli un ruolo normale (non @everyone né il ruolo di un bot).'));
  db.getSite().whitelistRoleId = role?.id ?? null;
  db.save();
  return reply(successEmbed(role
    ? `Nel profilo del sito chi ha ${role} risulta **in whitelist**.`
    : 'Nessun ruolo whitelist: il profilo del sito non mostra più la whitelist.'));
}

function whitelistLine(guild) {
  const id = db.getSite().whitelistRoleId;
  const role = id && guild.roles.cache.get(id);
  return role ? `${role}` : '*nessun ruolo* · `/sito whitelist`';
}

const MAX_GROUPS = 25;

async function staff(interaction, sub) {
  const reply = (embed) => interaction.reply({ embeds: [embed], flags: EPH });
  const guild = site.siteGuild();
  if (!guild) return reply(errorEmbed('Prima scegli il server da mostrare sul sito con `/sito collega`.'));
  if (guild.id !== interaction.guild.id) return reply(errorEmbed(`Il sito mostra **${guild.name}**: usa questo comando lì, oppure \`/sito collega\` qui.`));

  const settings = db.getSite();
  const list = settings.staff;
  if (sub === 'lista') return reply(staffListEmbed(guild));

  const role = interaction.options.getRole('ruolo', true);
  const index = list.findIndex((g) => g.roleId === role.id);
  const saved = (text) => {
    db.save();
    siteStaff.changed();
    return interaction.reply({ embeds: [successEmbed(text), staffListEmbed(guild)], flags: EPH });
  };

  if (sub === 'aggiungi') {
    if (role.id === guild.id || role.managed) return reply(errorEmbed('Scegli un ruolo staff normale (non @everyone né il ruolo di un bot).'));
    if (index === -1 && list.length >= MAX_GROUPS) return reply(errorEmbed(`Puoi mostrare al massimo ${MAX_GROUPS} gruppi.`));
    const entry = {
      roleId: role.id,
      name: interaction.options.getString('nome')?.trim() || null,
      description: interaction.options.getString('descrizione', true).trim(),
    };
    if (index !== -1) list.splice(index, 1);
    const position = interaction.options.getInteger('posizione');
    const at = position ? Math.min(position - 1, list.length) : index !== -1 ? index : list.length;
    list.splice(at, 0, entry);
    return saved(index === -1 ? `${role} ora è un gruppo della pagina Staff.` : `Gruppo ${role} aggiornato.`);
  }

  if (index === -1) return reply(errorEmbed(`${role} non è nella pagina Staff. Aggiungilo con \`/sito staff aggiungi\`.`));

  if (sub === 'rimuovi') {
    list.splice(index, 1);
    return saved(list.length ? `${role} non compare più nella pagina Staff.` : `${role} rimosso. Non ci sono più gruppi: il sito torna a mostrare lo staff scritto nel suo codice.`);
  }

  // ordine
  const [entry] = list.splice(index, 1);
  list.splice(Math.min(interaction.options.getInteger('posizione', true) - 1, list.length), 0, entry);
  return saved(`${role} spostato.`);
}

/** Gruppi della pagina Staff con il numero di membri. */
function staffListEmbed(guild) {
  const groups = db.getSite().staff;
  const shown = new Map(siteStaff.staffGroups(guild).map((g) => [g.id, g.members.length]));
  const lines = groups.map((g, i) => {
    const role = guild.roles.cache.get(g.roleId);
    if (!role) return `**${i + 1}.** ~~ruolo eliminato~~`;
    const count = shown.get(role.id) ?? 0;
    const name = g.name ? ` → **${g.name}**` : '';
    return `**${i + 1}.** ${role}${name} · ${count ? `${count} ${count === 1 ? 'membro' : 'membri'}` : '*nessun membro: non compare*'}\n> ${g.description}`;
  });
  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('👥 Pagina Staff del sito')
    .setDescription(lines.length
      ? `${lines.join('\n')}\n\n-# Chi ha più ruoli compare solo nel primo gruppo della lista.`
      : 'Nessun gruppo: il sito mostra lo staff scritto nel suo codice.\nAggiungi i ruoli con `/sito staff aggiungi`, dal più importante.');
}

const MAX_NEWS_CHANNELS = 10;
const KIND_LABEL = { annuncio: 'Annunci', aggiornamento: 'Aggiornamenti' };

async function news(interaction, sub) {
  const reply = (embed) => interaction.reply({ embeds: [embed], flags: EPH });
  const guild = site.siteGuild();
  if (!guild) return reply(errorEmbed('Prima scegli il server da mostrare sul sito con `/sito collega`.'));
  if (guild.id !== interaction.guild.id) return reply(errorEmbed(`Il sito mostra **${guild.name}**: usa questo comando lì, oppure \`/sito collega\` qui.`));
  if (sub === 'lista') return reply(newsListEmbed(guild));

  const list = db.getSite().newsChannels;
  const channel = interaction.options.getChannel('canale', true);
  const index = list.findIndex((c) => c.channelId === channel.id);

  if (sub === 'rimuovi') {
    if (index === -1) return reply(errorEmbed(`${channel} non è tra i canali della pagina News.`));
    list.splice(index, 1);
    db.save();
    const removed = siteNews.removeChannelPosts(channel.id);
    return interaction.reply({ embeds: [successEmbed(`${channel} tolto dalla pagina News (${removed} notizie rimosse dal sito).`), newsListEmbed(guild)], flags: EPH });
  }

  // aggiungi
  const perms = channel.permissionsFor(guild.members.me);
  if (!perms?.has([P.ViewChannel, P.ReadMessageHistory])) {
    return reply(errorEmbed(`Il bot non può leggere ${channel}: dagli i permessi **Visualizza canale** e **Leggi la cronologia dei messaggi**.`));
  }
  if (index === -1 && list.length >= MAX_NEWS_CHANNELS) return reply(errorEmbed(`Puoi usare al massimo ${MAX_NEWS_CHANNELS} canali.`));
  const kind = interaction.options.getString('tipo', true);
  if (index === -1) list.push({ channelId: channel.id, kind });
  else list[index].kind = kind;
  db.save();

  await interaction.deferReply({ flags: EPH });
  const count = await siteNews.syncChannel(channel).catch((e) => {
    console.error('[Sito] Importazione news:', e.message);
    return null;
  });
  site.notify('news');
  const imported = count === null
    ? '\n⚠️ Non sono riuscito a leggere i messaggi già presenti: compariranno solo quelli nuovi.'
    : `\nHo importato gli ultimi messaggi: **${count}** notizie sul sito.`;
  return interaction.editReply({
    embeds: [successEmbed(`${index === -1 ? 'Aggiunto' : 'Aggiornato'} ${channel} come **${KIND_LABEL[kind]}**.${imported}`), newsListEmbed(guild)],
  });
}

function newsListEmbed(guild) {
  const list = db.getSite().newsChannels;
  const lines = list.map((c) => {
    const channel = guild.channels.cache.get(c.channelId);
    return `• ${channel ?? '~~canale eliminato~~'} · **${KIND_LABEL[c.kind]}** · ${siteNews.count(c.channelId)} notizie`;
  });
  const { upcoming, past } = siteEvents.list();
  const next = upcoming[0];
  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('📰 Pagina News del sito')
    .setDescription(lines.length
      ? `${lines.join('\n')}\n\n-# Ogni messaggio di questi canali diventa una notizia; modifiche ed eliminazioni si vedono anche sul sito.`
      : 'Nessun canale: aggiungine uno con `/sito news aggiungi`.')
    .addFields({
      name: '📅 Eventi Discord',
      value: next
        ? `Prossimo: **${next.name}** <t:${Math.floor(next.start / 1000)}:R>\n${upcoming.length} in programma · ${past.length} passati`
        : `Nessun evento in programma (${past.length} passati).\nCreali da Discord: menu del server → **Crea evento**.`,
    });
}

function newsLine() {
  const n = db.getSite().newsChannels.length;
  return n ? `${n} ${n === 1 ? 'canale' : 'canali'} · \`/sito news lista\`` : '*nessun canale* · `/sito news aggiungi`';
}

function staffLine() {
  const n = db.getSite().staff.length;
  return n ? `${n} ${n === 1 ? 'gruppo' : 'gruppi'} · \`/sito staff lista\`` : '*dal codice del sito* · `/sito staff aggiungi`';
}

/** Suggerimento in base all'errore dell'avviso al sito. */
function notifyHint(error) {
  if (error === 'HTTP 401') return 'La chiave è sbagliata: `REVALIDATE_SECRET` deve essere identica sul bot e su Vercel (poi rifai il deploy su Vercel).';
  if (error === 'HTTP 503') return 'Su Vercel manca la variabile `REVALIDATE_SECRET`: aggiungila e rifai il deploy.';
  if (error === 'HTTP 404') return 'Il sito non ha la pagina `/api/revalidate`: controlla che `SITE_URL` sia l\'indirizzo giusto e che l\'ultimo deploy su Vercel sia andato a buon fine.';
  return `Il sito non è raggiungibile: controlla che \`SITE_URL\` sia l'indirizzo completo, es. \`https://literp.vercel.app\`.`;
}

function goalLine() {
  const g = db.getSite().goal;
  if (!g) return '*nessuno* · `/sito obiettivo imposta`';
  return `${g.target.toLocaleString('it-IT')} ${g.label}${g.reachedAt ? ' ✅ raggiunto' : ''}`;
}

function overview(guild) {
  const linked = site.siteGuild();
  const { lastRequest, lastNotify } = site.status;
  const siteSecret = Boolean(api.secretOf('SITE_API_SECRET'));
  const notifyReady = Boolean(site.siteUrl() && api.secretOf('REVALIDATE_SECRET'));
  const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT);
  const dataOk = !onRailway || Boolean(process.env.DATA_DIR);

  const todo = [];
  if (!linked) todo.push('`/sito collega` — scegli il server Discord da mostrare sul sito');
  if (!siteSecret) todo.push('Variabile `SITE_API_SECRET` sul bot (e la stessa come `BOT_API_SECRET` su Vercel)');
  if (!notifyReady) todo.push('Variabili `SITE_URL` e `REVALIDATE_SECRET` sul bot (aggiornamento immediato del sito)');
  if (!site.hasPresences()) todo.push('Presenze: attiva **PRESENCE INTENT** nel Developer Portal e metti `PRESENCE_INTENT=true` sul bot');
  if (!dataOk) todo.push('**Railway senza Volume**: aggiungi un Volume e imposta `DATA_DIR` sul suo percorso, altrimenti i dati si perdono a ogni deploy');

  const notifyLine = lastNotify
    ? `${lastNotify.ok ? '✅' : '❌'} Ultimo avviso ${when(lastNotify.at)} (${lastNotify.tags.join(', ')})${lastNotify.ok ? '' : ` — \`${lastNotify.error}\``}`
    : 'Nessun avviso inviato finora';

  return new EmbedBuilder()
    .setColor(todo.length ? COLORS.warning : COLORS.success)
    .setAuthor({ name: `${guild.name} • Collegamento sito`, iconURL: guild.iconURL() ?? undefined })
    .setDescription(todo.length ? `**Da completare**\n${todo.map((t) => `• ${t}`).join('\n')}` : '✅ **Tutto collegato!**')
    .addFields(
      { name: '🏠 Server mostrato', value: linked ? `**${linked.name}**${linked.id === guild.id ? ' (questo)' : ''}` : '*nessuno*', inline: true },
      { name: '🟢 Presenze', value: site.hasPresences() ? 'Attive' : 'Disattivate', inline: true },
      { name: '🎯 Obiettivo', value: goalLine(), inline: true },
      { name: '👥 Pagina Staff', value: staffLine(), inline: true },
      { name: '📰 Pagina News', value: newsLine(), inline: true },
      { name: '💾 Dati', value: `\`${db.DATA_DIR}\`${dataOk ? '' : '\n⚠️ non persistenti'}`, inline: true },
      { name: '✅ Whitelist (profilo)', value: linked ? whitelistLine(linked) : '*—*', inline: true },
      { name: '📥 Il sito legge dal bot', value: `${check(siteSecret)} Chiave \`SITE_API_SECRET\` • Porta **${api.port()}**\nUltima richiesta del sito: ${when(lastRequest)}` },
      { name: '📤 Il bot avvisa il sito', value: `${check(notifyReady)} ${site.siteUrl() ? `\`${site.siteUrl()}\`` : '`SITE_URL` non impostato'}\n${notifyLine}` },
    )
    .setFooter({ text: 'Prova il collegamento con /sito prova' });
}
