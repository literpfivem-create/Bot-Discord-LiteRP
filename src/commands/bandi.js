// /bandi — candidature staff dalla pagina "Bandi Staff" del sito: canale, ruolo per chi viene accettato, apertura e chiusura.
const { ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits: P, SlashCommandBuilder } = require('discord.js');
const db = require('../utils/db');
const site = require('../handlers/site');
const bandi = require('../handlers/bandi');
const { COLORS, errorEmbed, successEmbed } = require('../utils/embeds');

const EPH = MessageFlags.Ephemeral;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bandi')
    .setDescription('Candidature staff inviate dal sito (pagina Bandi Staff)')
    .setDefaultMemberPermissions(P.ManageGuild)
    .addSubcommand((s) => s.setName('canale').setDescription('Canale dove arrivano le candidature, con i pulsanti Accetta / Rifiuta')
      .addChannelOption((o) => o.setName('canale').setDescription('Canale (meglio uno visibile solo allo staff)').setRequired(true).addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((s) => s.setName('ruolo').setDescription('Ruolo dato a chi viene accettato')
      .addRoleOption((o) => o.setName('ruolo').setDescription('Ruolo, es. @Staff in prova').setRequired(true)))
    .addSubcommand((s) => s.setName('apri').setDescription('Apre i bandi: dal sito si possono inviare candidature'))
    .addSubcommand((s) => s.setName('chiudi').setDescription('Chiude i bandi: il sito mostra "Bandi chiusi"'))
    .addSubcommand((s) => s.setName('stato').setDescription('Impostazioni dei bandi e candidature in attesa')),

  async execute(interaction) {
    const reply = (embed) => interaction.reply({ embeds: [embed], flags: EPH });
    const { guild, options } = interaction;
    const linked = site.siteGuild();
    if (!linked) return reply(errorEmbed('Prima scegli il server da mostrare sul sito con `/sito collega`.'));
    if (linked.id !== guild.id) return reply(errorEmbed(`Il sito mostra **${linked.name}**: usa questo comando lì, oppure \`/sito collega\` qui.`));

    const settings = db.getBandi();
    const sub = options.getSubcommand();

    if (sub === 'canale') {
      const channel = options.getChannel('canale', true);
      const perms = channel.permissionsFor(guild.members.me);
      if (!perms?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks])) {
        return reply(errorEmbed(`Il bot non può scrivere in ${channel}: dagli i permessi **Visualizza canale**, **Invia messaggi** e **Incorpora link**.`));
      }
      settings.channelId = channel.id;
      db.save();
      return interaction.reply({ embeds: [successEmbed(`Le candidature arriveranno in ${channel}.`), statusEmbed(guild)], flags: EPH });
    }

    if (sub === 'ruolo') {
      const role = guild.roles.cache.get(options.getRole('ruolo', true).id);
      if (!role || role.id === guild.id || role.managed) return reply(errorEmbed('Scegli un ruolo normale (non @everyone né il ruolo di un bot).'));
      if (role.permissions.has(P.Administrator)) return reply(errorEmbed('Per sicurezza non posso dare in automatico un ruolo con il permesso **Amministratore**.'));
      if (!role.editable) return reply(errorEmbed(`Il bot non può assegnare ${role}: sposta il ruolo del bot sopra a questo ruolo nelle impostazioni del server.`));
      settings.roleId = role.id;
      db.save();
      return interaction.reply({ embeds: [successEmbed(`Chi viene accettato riceverà ${role}.`), statusEmbed(guild)], flags: EPH });
    }

    if (sub === 'apri' || sub === 'chiudi') {
      settings.open = sub === 'apri';
      db.save();
      const text = settings.open
        ? `Bandi **aperti**.${bandi.bandiChannel(guild) ? '' : '\n⚠️ Manca il canale: finché non lo imposti con `/bandi canale` il sito li mostra chiusi.'}`
        : 'Bandi **chiusi**: il sito non accetta più candidature. Quelle già arrivate puoi ancora valutarle.';
      return interaction.reply({ embeds: [successEmbed(text), statusEmbed(guild)], flags: EPH });
    }

    return reply(statusEmbed(guild));
  },
};

function statusEmbed(guild) {
  const settings = db.getBandi();
  const channel = bandi.bandiChannel(guild);
  const role = settings.roleId && guild.roles.cache.get(settings.roleId);
  const apps = Object.entries(settings.applications);
  const pending = apps.filter(([, a]) => a.status === 'pending');
  const count = (status) => apps.filter(([, a]) => a.status === status).length;
  const open = settings.open && channel;

  const pendingList = pending.slice(-10).map(([n, a]) => {
    const link = a.messageId ? ` · [apri](https://discord.com/channels/${guild.id}/${a.channelId}/${a.messageId})` : '';
    return `• **#${n}** <@${a.userId}> <t:${Math.floor(a.createdAt / 1000)}:R>${link}`;
  });

  return new EmbedBuilder()
    .setColor(open ? COLORS.success : COLORS.warning)
    .setTitle('📋 Bandi staff')
    .setDescription(open ? '🟢 **Aperti**: il sito accetta candidature.' : `🔴 **Chiusi** sul sito${settings.open ? ' (manca il canale)' : ''}.`)
    .addFields(
      { name: '📥 Canale', value: channel ? `${channel}` : '*non impostato* · `/bandi canale`', inline: true },
      { name: '🎭 Ruolo se accettato', value: role ? `${role}` : '*nessuno* · `/bandi ruolo`', inline: true },
      { name: '📊 Totale', value: `⏳ ${pending.length} in attesa\n✅ ${count('accepted')} accettate\n❌ ${count('rejected')} rifiutate`, inline: true },
      { name: '⏳ In attesa', value: pendingList.join('\n') || '*nessuna*' },
    );
}
