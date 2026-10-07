// /ruoli — ruoli automatici per i nuovi membri e pannelli self-service con pulsanti (notifiche, interessi...)
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ComponentType, EmbedBuilder, MessageFlags, PermissionFlagsBits: P, SlashCommandBuilder,
} = require('discord.js');
const db = require('../utils/db');
const { giveAutoroles } = require('../handlers/welcome');
const { COLORS, baseEmbed, errorEmbed, successEmbed, parseColor } = require('../utils/embeds');

const EPH = MessageFlags.Ephemeral;
const DANGEROUS = [P.Administrator, P.ManageGuild, P.ManageRoles, P.ManageChannels, P.BanMembers, P.KickMembers, P.ModerateMembers, P.ManageMessages, P.MentionEveryone];
const fail = (interaction, text) => interaction.reply({ embeds: [errorEmbed(text)], flags: EPH });

/** Pulsanti selfrole già presenti nel messaggio. */
function existingButtons(message) {
  return message.components
    .flatMap((row) => row.components ?? [])
    .filter((c) => c.type === ComponentType.Button && c.customId?.startsWith('selfrole:'))
    .map((c) => ButtonBuilder.from(c));
}

function toRows(buttons) {
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  return rows;
}

async function fetchPanel(interaction) {
  const channel = interaction.options.getChannel('canale') ?? interaction.channel;
  const message = await channel.messages.fetch(interaction.options.getString('id_messaggio', true)).catch(() => null);
  if (!message || message.author.id !== interaction.client.user.id) return null;
  return message;
}

const AUTOROLE_DANGEROUS = [P.Administrator, P.ManageGuild, P.ManageRoles, P.BanMembers, P.KickMembers];

/** /ruoli automatici aggiungi|rimuovi|lista|sincronizza */
async function autoroles(interaction, sub) {
  const { guild, options } = interaction;
  const gcfg = db.getGuild(guild.id);

  if (sub === 'lista') {
    const fmt = (id) => {
      const role = guild.roles.cache.get(id);
      if (!role) return `⚠️ Ruolo eliminato (\`${id}\`)`;
      return `${role.editable ? '✅' : '⚠️'} ${role}${role.editable ? '' : ' — il bot non può assegnarlo (ruolo troppo in alto)'}`;
    };
    return interaction.reply({
      embeds: [
        baseEmbed(COLORS.primary)
          .setTitle('🎭 Autorole')
          .addFields(
            { name: '👤 Utenti', value: gcfg.autoroles.map(fmt).join('\n') || 'Nessuno' },
            { name: '🤖 Bot', value: gcfg.autorolesBots.map(fmt).join('\n') || 'Nessuno' },
          ),
      ],
      flags: EPH,
    });
  }

  if (sub === 'sincronizza') {
    if (!gcfg.autoroles.length) return fail(interaction, 'Nessun autorole configurato.');
    await interaction.deferReply({ flags: EPH });
    const members = await guild.members.fetch();
    let updated = 0;
    for (const member of members.values()) {
      if (member.user.bot) continue;
      if (await giveAutoroles(member, gcfg)) updated++;
    }
    return interaction.editReply({ embeds: [successEmbed(`Sincronizzazione completata: autorole assegnati a **${updated}** membri.`)] });
  }

  const role = guild.roles.cache.get(options.getRole('ruolo', true).id);

  if (sub === 'aggiungi') {
    if (!role || role.id === guild.id || role.managed) return fail(interaction, 'Questo ruolo non può essere usato come autorole.');
    if (!role.editable) return fail(interaction, `Il bot non può assegnare ${role}: sposta il ruolo del bot sopra a questo ruolo nelle impostazioni del server.`);
    if (role.permissions.any(AUTOROLE_DANGEROUS)) return fail(interaction, 'Per sicurezza non puoi impostare come autorole un ruolo con permessi di amministrazione.');
    const list = options.getBoolean('per_bot') ? gcfg.autorolesBots : gcfg.autoroles;
    if (!list.includes(role.id)) list.push(role.id);
    db.save();
    return interaction.reply({ embeds: [successEmbed(`${role} verrà assegnato automaticamente ai nuovi ${options.getBoolean('per_bot') ? 'bot' : 'membri'}.`)], flags: EPH });
  }

  if (sub === 'rimuovi') {
    const id = options.getRole('ruolo', true).id;
    gcfg.autoroles = gcfg.autoroles.filter((r) => r !== id);
    gcfg.autorolesBots = gcfg.autorolesBots.filter((r) => r !== id);
    db.save();
    return interaction.reply({ embeds: [successEmbed(`<@&${id}> rimosso dagli autorole.`)], flags: EPH });
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ruoli')
    .setDescription('Ruoli automatici e pannelli ruoli con pulsanti')
    .setDefaultMemberPermissions(P.ManageRoles)
    .addSubcommandGroup((g) => g.setName('automatici').setDescription('Ruoli assegnati automaticamente a chi entra')
      .addSubcommand((s) => s.setName('aggiungi').setDescription('Aggiunge un ruolo automatico')
        .addRoleOption((o) => o.setName('ruolo').setDescription('Ruolo').setRequired(true))
        .addBooleanOption((o) => o.setName('per_bot').setDescription('Assegnalo ai bot invece che agli utenti')))
      .addSubcommand((s) => s.setName('rimuovi').setDescription('Rimuove un ruolo automatico')
        .addRoleOption((o) => o.setName('ruolo').setDescription('Ruolo').setRequired(true)))
      .addSubcommand((s) => s.setName('lista').setDescription('Mostra i ruoli automatici'))
      .addSubcommand((s) => s.setName('sincronizza').setDescription('Assegna i ruoli automatici ai membri attuali che non li hanno')))
    .addSubcommandGroup((g) => g.setName('pannello').setDescription('Pannelli con pulsanti per prendersi i ruoli da soli')
    .addSubcommand((s) => s.setName('crea').setDescription('Crea un nuovo pannello ruoli')
      .addStringOption((o) => o.setName('titolo').setDescription('Titolo del pannello').setRequired(true).setMaxLength(256))
      .addStringOption((o) => o.setName('descrizione').setDescription('Descrizione (usa \\n per andare a capo)').setMaxLength(2000))
      .addChannelOption((o) => o.setName('canale').setDescription('Canale (default: attuale)').addChannelTypes(ChannelType.GuildText))
      .addStringOption((o) => o.setName('colore').setDescription('Colore esadecimale, es. #00a8ff')))
    .addSubcommand((s) => s.setName('aggiungi').setDescription('Aggiunge un pulsante-ruolo a un pannello')
      .addStringOption((o) => o.setName('id_messaggio').setDescription('ID del pannello').setRequired(true))
      .addRoleOption((o) => o.setName('ruolo').setDescription('Ruolo').setRequired(true))
      .addStringOption((o) => o.setName('etichetta').setDescription('Testo del pulsante (default: nome ruolo)').setMaxLength(80))
      .addStringOption((o) => o.setName('emoji').setDescription('Emoji del pulsante'))
      .addStringOption((o) => o.setName('colore').setDescription('Colore del pulsante').addChoices(
        { name: 'Grigio', value: 'Secondary' }, { name: 'Blu', value: 'Primary' }, { name: 'Verde', value: 'Success' }, { name: 'Rosso', value: 'Danger' }))
      .addChannelOption((o) => o.setName('canale').setDescription('Canale del pannello (default: attuale)').addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((s) => s.setName('rimuovi').setDescription('Rimuove un pulsante-ruolo da un pannello')
      .addStringOption((o) => o.setName('id_messaggio').setDescription('ID del pannello').setRequired(true))
      .addRoleOption((o) => o.setName('ruolo').setDescription('Ruolo').setRequired(true))
      .addChannelOption((o) => o.setName('canale').setDescription('Canale del pannello (default: attuale)').addChannelTypes(ChannelType.GuildText)))),

  async execute(interaction) {
    const { guild, options } = interaction;
    const sub = options.getSubcommand();
    if (options.getSubcommandGroup() === 'automatici') return autoroles(interaction, sub);

    if (sub === 'crea') {
      const channel = options.getChannel('canale') ?? interaction.channel;
      const embed = new EmbedBuilder()
        .setColor(parseColor(options.getString('colore')) ?? COLORS.primary)
        .setTitle(options.getString('titolo', true))
        .setDescription((options.getString('descrizione') || 'Clicca un pulsante per ottenere o rimuovere il ruolo.').replaceAll('\\n', '\n'));
      const msg = await channel.send({ embeds: [embed] });
      return interaction.reply({
        embeds: [successEmbed(`Pannello creato in ${channel}.\nID messaggio: \`${msg.id}\`\nOra aggiungi i ruoli con \`/ruoli pannello aggiungi id_messaggio:${msg.id}\``)],
        flags: EPH,
      });
    }

    const message = await fetchPanel(interaction);
    if (!message) return fail(interaction, 'Pannello non trovato: controlla ID e canale (deve essere un messaggio inviato dal bot).');
    const role = guild.roles.cache.get(options.getRole('ruolo', true).id);
    let buttons = existingButtons(message);

    if (sub === 'aggiungi') {
      if (!role || role.id === guild.id || role.managed) return fail(interaction, 'Questo ruolo non può essere usato.');
      if (!role.editable) return fail(interaction, `Il bot non può assegnare ${role}: sposta il ruolo del bot più in alto.`);
      if (role.permissions.any(DANGEROUS)) return fail(interaction, 'Per sicurezza non puoi rendere self-service un ruolo con permessi di moderazione/amministrazione.');
      if (buttons.some((b) => b.data.custom_id === `selfrole:${role.id}`)) return fail(interaction, 'Questo ruolo è già nel pannello.');
      if (buttons.length >= 25) return fail(interaction, 'Un pannello può avere al massimo 25 pulsanti.');

      const button = new ButtonBuilder()
        .setCustomId(`selfrole:${role.id}`)
        .setLabel(options.getString('etichetta') || role.name.slice(0, 80))
        .setStyle(ButtonStyle[options.getString('colore') || 'Secondary']);
      const emoji = options.getString('emoji');
      if (emoji) button.setEmoji(emoji.trim());
      buttons.push(button);
    } else {
      const before = buttons.length;
      buttons = buttons.filter((b) => b.data.custom_id !== `selfrole:${options.getRole('ruolo', true).id}`);
      if (buttons.length === before) return fail(interaction, 'Questo ruolo non è nel pannello.');
    }

    try {
      await message.edit({ components: toRows(buttons) });
    } catch (err) {
      return fail(interaction, `Impossibile aggiornare il pannello (emoji non valida?): ${err.message}`);
    }
    return interaction.reply({ embeds: [successEmbed(`Pannello aggiornato: ${buttons.length} ruoli.`)], flags: EPH });
  },

  async handleButton(interaction) {
    const roleId = interaction.customId.split(':')[1];
    const role = interaction.guild.roles.cache.get(roleId);
    if (!role) return fail(interaction, 'Questo ruolo non esiste più.');
    if (!role.editable) return fail(interaction, 'Il bot non può gestire questo ruolo. Contatta lo staff.');
    const member = interaction.member;
    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role, 'Ruolo self-service');
      return interaction.reply({ embeds: [successEmbed(`Ruolo ${role} **rimosso**.`)], flags: EPH });
    }
    await member.roles.add(role, 'Ruolo self-service');
    return interaction.reply({ embeds: [successEmbed(`Ruolo ${role} **aggiunto**!`)], flags: EPH });
  },
};
