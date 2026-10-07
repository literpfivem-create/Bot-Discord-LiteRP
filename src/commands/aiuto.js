const { MessageFlags, PermissionFlagsBits: P, SlashCommandBuilder } = require('discord.js');
const db = require('../utils/db');
const { COLORS, baseEmbed } = require('../utils/embeds');
const { isStaff } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder().setName('aiuto').setDescription('Elenco dei comandi del bot LiteRP'),

  async execute(interaction) {
    const gcfg = db.getGuild(interaction.guild.id);
    const perms = interaction.memberPermissions;
    const staff = isStaff(interaction.member, gcfg);

    const embed = baseEmbed(COLORS.primary)
      .setAuthor({ name: `${interaction.guild.name} • Comandi`, iconURL: interaction.guild.iconURL() ?? undefined })
      .addFields(
        { name: '👥 Per tutti', value: '`/stato` stato del server FiveM\n`/giocatori` chi è in città\n`/info utente|server|bot`\n`/ticket chiudi` chiude il tuo ticket' },
      );

    if (staff) {
      embed.addFields({
        name: '🎫 Ticket (staff)',
        value: '`/ticket reclama|aggiungi|rimuovi|rinomina|priorita|sposta`\n`/ticket lista|statistiche`\n`/ticket blacklist aggiungi|rimuovi|lista`',
      });
    }
    if (perms.has(P.ModerateMembers)) {
      embed.addFields({ name: '⚖️ Moderazione', value: '`/mod warn|avvisi|rimuovi-avviso`\n`/mod timeout|rimuovi-timeout|kick|ban|unban`' });
    }
    if (perms.has(P.ManageMessages)) {
      embed.addFields(
        { name: '💬 Canali', value: '`/canale pulisci|slowmode|blocca|sblocca`' },
        { name: '✉️ Messaggi', value: '`/messaggio testo|embed|annuncio|dm|modifica`\n`/messaggio programmato aggiungi|lista|rimuovi|prova`' },
      );
    }
    if (perms.has(P.ManageRoles)) {
      embed.addFields({ name: '🎭 Ruoli', value: '`/ruoli automatici aggiungi|rimuovi|lista|sincronizza`\n`/ruoli pannello crea|aggiungi|rimuovi`' });
    }
    if (perms.has(P.ManageGuild)) {
      embed.addFields(
        {
          name: '⚙️ Impostazioni',
          value:
            '`/impostazioni panoramica` — cosa è configurato e cosa manca\n' +
            '`/ticket configura` — pannello ticket, categorie, ruoli, log e opzioni\n' +
            '`/impostazioni staff` · `ticket` · `benvenuto` · `addio`\n' +
            '`/impostazioni log` · `fivem` · `sanzioni`',
        },
        { name: '📊 Server stats', value: '`/serverstats aggiungi|testo|modifica|rimuovi|lista`\n`/serverstats aggiorna|ripara|reset`\n`/serverstats categoria nome|posizione`' },
        { name: '🛡️ AutoMod', value: '`/automod stato|test|attiva|modulo|parola|dominio|ignora-canale|ignora-ruolo|impostazioni`' },
        { name: '🌐 Sito', value: '`/sito stato|collega|prova`\n`/sito obiettivo imposta|rimuovi`\n`/sito staff aggiungi|rimuovi|ordine|lista`\n`/sito news aggiungi|rimuovi|lista`' },
      );
    }
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
