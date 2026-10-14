// /candidature — candidature per i lavori (LSPD, LSSD, EMS, U.S. Marshal, FIB) direttamente su Discord:
// pannello con il pulsante "Candidati ora", canale dove arrivano, ruolo per chi viene accettato, recruiter, apertura e chiusura.
const { ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits: P, SlashCommandBuilder } = require('discord.js');
const db = require('../utils/db');
const candidature = require('../handlers/candidature');
const { JOBS, getJob } = require('../config/candidature');
const { COLORS, errorEmbed, successEmbed } = require('../utils/embeds');

const EPH = MessageFlags.Ephemeral;
const ALL = 'tutti';
const jobChoices = JOBS.map((j) => ({ name: `${j.emoji} ${j.name}`, value: j.key }));
const jobOption = (all) => (o) => o.setName('lavoro').setDescription('Lavoro').setRequired(true)
  .addChoices(...jobChoices, ...(all ? [{ name: '📋 Tutti i lavori', value: ALL }] : []));

module.exports = {
  data: new SlashCommandBuilder()
    .setName('candidature')
    .setDescription('Candidature per i lavori (LSPD, LSSD, EMS, U.S. Marshal, FIB) con il pulsante "Candidati ora"')
    .setDefaultMemberPermissions(P.ManageGuild)
    .addSubcommand((s) => s.setName('pannello').setDescription('Invia il messaggio con il pulsante "Candidati ora"')
      .addStringOption(jobOption(false))
      .addChannelOption((o) => o.setName('canale').setDescription('Canale del pannello (vuoto = questo canale)').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((s) => s.setName('canale').setDescription('Canale dove arrivano le candidature, con i pulsanti Accetta / Rifiuta')
      .addStringOption(jobOption(true))
      .addChannelOption((o) => o.setName('canale').setDescription('Canale (meglio uno visibile solo a staff e recruiter)').setRequired(true).addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((s) => s.setName('ruolo').setDescription('Ruolo dato a chi viene accettato')
      .addStringOption(jobOption(false))
      .addRoleOption((o) => o.setName('ruolo').setDescription('Ruolo, es. @LSPD').setRequired(true)))
    .addSubcommand((s) => s.setName('recruiter').setDescription('Ruolo che può accettare o rifiutare le candidature, oltre allo staff')
      .addStringOption(jobOption(true))
      .addRoleOption((o) => o.setName('ruolo').setDescription('Ruolo dei recruiter (vuoto = solo lo staff)')))
    .addSubcommand((s) => s.setName('apri').setDescription('Apre le candidature: il pulsante "Candidati ora" torna attivo')
      .addStringOption(jobOption(true)))
    .addSubcommand((s) => s.setName('chiudi').setDescription('Chiude le candidature: il pulsante diventa "Candidature chiuse"')
      .addStringOption(jobOption(true)))
    .addSubcommand((s) => s.setName('stato').setDescription('Impostazioni dei lavori e candidature in attesa')),

  async execute(interaction) {
    const reply = (...embeds) => interaction.reply({ embeds, flags: EPH });
    const { guild, options } = interaction;
    const sub = options.getSubcommand();
    if (sub === 'stato') return reply(statusEmbed(guild));

    const choice = options.getString('lavoro', true);
    const jobs = choice === ALL ? JOBS : [getJob(choice)].filter(Boolean);
    if (!jobs.length) return reply(errorEmbed('Lavoro non valido.'));
    const [job] = jobs;
    const label = choice === ALL ? 'di tutti i lavori' : `**${job.name}**`;
    const settings = db.getGuild(guild.id).candidature.jobs;
    // il pulsante dei pannelli cambia con le impostazioni (attivo / "Candidature chiuse")
    const refresh = () => {
      for (const j of jobs) candidature.refreshPanels(guild, j.key).catch((e) => console.error('[Candidature] Pannelli:', e.message));
    };

    if (sub === 'pannello') {
      const channel = options.getChannel('canale') ?? interaction.channel;
      if (!channel?.isTextBased() || !channel.permissionsFor(guild.members.me)?.has([P.ViewChannel, P.SendMessages])) {
        return reply(errorEmbed(`Il bot non può scrivere in ${channel ?? 'questo canale'}: dagli i permessi **Visualizza canale** e **Invia messaggi**.`));
      }
      await interaction.deferReply({ flags: EPH });
      const message = await candidature.postPanel(channel, job.key);
      const tips = [];
      if (!candidature.reviewChannel(guild, job.key)) tips.push('⚠️ Manca il canale dove arrivano le candidature: finché non lo imposti con `/candidature canale` il pulsante resta disattivato.');
      else if (!settings[job.key].open) tips.push('🔒 Le candidature sono chiuse: aprile con `/candidature apri`.');
      if (!settings[job.key].roleId) tips.push('💡 Scegli il ruolo per chi viene accettato con `/candidature ruolo`.');
      return interaction.editReply({ embeds: [successEmbed(`Pannello **${job.name}** inviato in ${channel}: ${message.url}${tips.length ? `\n\n${tips.join('\n')}` : ''}`)] });
    }

    if (sub === 'canale') {
      const channel = options.getChannel('canale', true);
      if (!channel.permissionsFor(guild.members.me)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks, P.ReadMessageHistory])) {
        return reply(errorEmbed(`Il bot non può usare ${channel}: dagli i permessi **Visualizza canale**, **Invia messaggi**, **Incorpora link** e **Leggi la cronologia dei messaggi**.`));
      }
      for (const j of jobs) settings[j.key].channelId = channel.id;
      db.save();
      refresh();
      return reply(successEmbed(`Le candidature ${label} arriveranno in ${channel}.`), statusEmbed(guild));
    }

    if (sub === 'ruolo') {
      const role = guild.roles.cache.get(options.getRole('ruolo', true).id);
      if (!role || role.id === guild.id || role.managed) return reply(errorEmbed('Scegli un ruolo normale (non @everyone né il ruolo di un bot).'));
      if (role.permissions.has(P.Administrator)) return reply(errorEmbed('Per sicurezza non posso dare in automatico un ruolo con il permesso **Amministratore**.'));
      if (!role.editable) return reply(errorEmbed(`Il bot non può assegnare ${role}: sposta il ruolo del bot sopra a questo ruolo nelle impostazioni del server.`));
      settings[job.key].roleId = role.id;
      db.save();
      return reply(successEmbed(`Chi viene accettato in **${job.name}** riceverà ${role}.`), statusEmbed(guild));
    }

    if (sub === 'recruiter') {
      const picked = options.getRole('ruolo');
      const role = picked && guild.roles.cache.get(picked.id);
      if (picked && (!role || role.id === guild.id || role.managed)) return reply(errorEmbed('Scegli un ruolo normale (non @everyone né il ruolo di un bot).'));
      for (const j of jobs) settings[j.key].recruiterRoleId = role?.id ?? null;
      db.save();
      const text = role
        ? `Chi ha ${role} può accettare o rifiutare le candidature ${label}, oltre allo staff.`
        : `Le candidature ${label} possono valutarle solo lo staff e chi può gestire i ruoli.`;
      return reply(successEmbed(text), statusEmbed(guild));
    }

    // apri / chiudi
    const open = sub === 'apri';
    for (const j of jobs) settings[j.key].open = open;
    db.save();
    refresh();
    const missing = open ? jobs.filter((j) => !candidature.reviewChannel(guild, j.key)).map((j) => j.name) : [];
    const text = open
      ? `Candidature ${label} **aperte**.${missing.length ? `\n⚠️ Manca il canale per **${missing.join(', ')}**: finché non lo imposti con \`/candidature canale\` il pulsante resta disattivato.` : ''}`
      : `Candidature ${label} **chiuse**: il pulsante diventa "Candidature chiuse". Quelle già arrivate puoi ancora valutarle.`;
    return reply(successEmbed(text), statusEmbed(guild));
  },
};

function statusEmbed(guild) {
  const { jobs, applications } = db.getGuild(guild.id).candidature;
  const apps = Object.values(applications);
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('📝 Candidature lavori')
    .setDescription('Pannello con `/candidature pannello`. Le candidature arrivano nel canale del lavoro con **Accetta** / **Rifiuta**.');

  for (const job of JOBS) {
    const s = jobs[job.key];
    const channel = candidature.reviewChannel(guild, job.key);
    const role = s.roleId && guild.roles.cache.get(s.roleId);
    const recruiter = s.recruiterRoleId && guild.roles.cache.get(s.recruiterRoleId);
    const count = (status) => apps.filter((a) => a.job === job.key && a.status === status).length;
    const state = !channel ? '⚪ Da configurare' : s.open ? '🟢 Aperte' : '🔴 Chiuse';
    embed.addFields({
      name: `${job.emoji} ${job.name} — ${state}`,
      value: `📥 ${channel ?? '*nessun canale* · `/candidature canale`'}\n` +
        `🎭 ${role ?? '*nessun ruolo* · `/candidature ruolo`'} · 👥 Recruiter: ${recruiter ?? 'solo staff'}\n` +
        `⏳ ${count('pending')} in attesa · ✅ ${count('accepted')} accettate · ❌ ${count('rejected')} rifiutate`,
    });
  }

  // dalla più vecchia, finché c'è spazio (un campo ha al massimo 1024 caratteri)
  const pending = apps.filter((a) => a.status === 'pending' && a.messageId);
  let list = '';
  for (const [i, a] of pending.entries()) {
    const job = getJob(a.job);
    const link = `https://discord.com/channels/${guild.id}/${a.channelId}/${a.messageId}`;
    const line = `• ${job?.emoji ?? ''} **${job?.name ?? a.job} #${a.number}** <@${a.userId}> <t:${Math.floor(a.createdAt / 1000)}:R> · [apri](${link})`;
    if (list.length + line.length > 980) {
      list += `\n…e altre ${pending.length - i}`;
      break;
    }
    list += `${list ? '\n' : ''}${line}`;
  }
  embed.addFields({ name: '⏳ In attesa', value: list || '*nessuna*' });
  return embed;
}
