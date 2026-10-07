// /sito — collegamento tra il bot e il sito LiteRP: stato, server collegato, prova degli avvisi.
const { EmbedBuilder, MessageFlags, PermissionFlagsBits: P, SlashCommandBuilder } = require('discord.js');
const api = require('../api/server');
const db = require('../utils/db');
const site = require('../handlers/site');
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
    .addSubcommand((s) => s.setName('prova').setDescription('Invia un avviso di prova al sito per controllare il collegamento')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'collega') {
      db.getSite().guildId = interaction.guild.id;
      db.save();
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
          : errorEmbed(`Il sito non ha accettato l'avviso: \`${result.error}\`\nControlla che \`REVALIDATE_SECRET\` sia uguale sul bot e su Vercel.`)],
      });
    }

    return interaction.reply({ embeds: [overview(interaction.guild)], flags: EPH });
  },
};

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
      { name: '💾 Dati', value: `\`${db.DATA_DIR}\`${dataOk ? '' : '\n⚠️ non persistenti'}`, inline: true },
      { name: '📥 Il sito legge dal bot', value: `${check(siteSecret)} Chiave \`SITE_API_SECRET\` • Porta **${api.port()}**\nUltima richiesta del sito: ${when(lastRequest)}` },
      { name: '📤 Il bot avvisa il sito', value: `${check(notifyReady)} ${site.siteUrl() ? `\`${site.siteUrl()}\`` : '`SITE_URL` non impostato'}\n${notifyLine}` },
    )
    .setFooter({ text: 'Prova il collegamento con /sito prova' });
}
