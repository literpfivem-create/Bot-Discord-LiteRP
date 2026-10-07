// /sito — collegamento tra il bot e il sito LiteRP: stato, server collegato, prova degli avvisi, obiettivo community.
const { ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits: P, SlashCommandBuilder } = require('discord.js');
const api = require('../api/server');
const db = require('../utils/db');
const site = require('../handlers/site');
const siteLive = require('../handlers/siteLive');
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
    .addSubcommandGroup((g) => g.setName('obiettivo').setDescription('Barra "Siamo a 870 / 1000 membri" sul sito')
      .addSubcommand((s) => s.setName('imposta').setDescription('Imposta il traguardo dei membri Discord')
        .addIntegerOption((o) => o.setName('traguardo').setDescription('Numero da raggiungere, es. 1000').setRequired(true).setMinValue(1).setMaxValue(10_000_000))
        .addStringOption((o) => o.setName('testo').setDescription('Cosa si conta, es. membri (default: membri)').setMaxLength(30))
        .addChannelOption((o) => o.setName('canale').setDescription('Dove annunciare il traguardo raggiunto (vuoto = nessun annuncio)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
      .addSubcommand((s) => s.setName('rimuovi').setDescription('Toglie la barra dell’obiettivo dal sito'))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (interaction.options.getSubcommandGroup() === 'obiettivo') return goal(interaction, sub);

    if (sub === 'collega') {
      db.getSite().guildId = interaction.guild.id;
      db.save();
      siteLive.loadMembers(interaction.guild);
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
      { name: '💾 Dati', value: `\`${db.DATA_DIR}\`${dataOk ? '' : '\n⚠️ non persistenti'}`, inline: true },
      { name: '📥 Il sito legge dal bot', value: `${check(siteSecret)} Chiave \`SITE_API_SECRET\` • Porta **${api.port()}**\nUltima richiesta del sito: ${when(lastRequest)}` },
      { name: '📤 Il bot avvisa il sito', value: `${check(notifyReady)} ${site.siteUrl() ? `\`${site.siteUrl()}\`` : '`SITE_URL` non impostato'}\n${notifyLine}` },
    )
    .setFooter({ text: 'Prova il collegamento con /sito prova' });
}
