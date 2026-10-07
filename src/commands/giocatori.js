const { SlashCommandBuilder } = require('discord.js');
const db = require('../utils/db');
const fivem = require('../handlers/fivem');
const { COLORS, baseEmbed, errorEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder().setName('giocatori').setDescription('Elenco dei giocatori online sul server FiveM'),

  async execute(interaction) {
    await interaction.deferReply();
    const gcfg = db.getGuild(interaction.guild.id);
    const stats = await fivem.getStats(gcfg);
    if (!stats.online) return interaction.editReply({ embeds: [errorEmbed('Il server FiveM è offline.')] });
    if (!Array.isArray(stats.list)) {
      return interaction.editReply({ embeds: [errorEmbed(`Ci sono **${stats.players}/${stats.maxPlayers}** giocatori online, ma l’elenco dei nomi richiede la risorsa \`literp_discord\` sul server.`)] });
    }

    const staffIds = new Set((stats.staff || []).map((s) => Number(s.id)));
    const lines = [...stats.list]
      .sort((a, b) => Number(a.id) - Number(b.id))
      .map((p) => `\`[${String(p.id).padStart(3, ' ')}]\` ${staffIds.has(Number(p.id)) ? '🛡️ ' : ''}${String(p.name).replace(/[*_`~|>]/g, '')}`);
    let description = lines.join('\n') || 'Nessun giocatore online.';
    if (description.length > 4000) description = `${description.slice(0, 3950)}\n…`;

    await interaction.editReply({
      embeds: [
        baseEmbed(COLORS.success)
          .setTitle(`👥 Giocatori online • ${stats.players}/${stats.maxPlayers || '?'}`)
          .setDescription(description)
          .setFooter({ text: '🛡️ = staff' }),
      ],
    });
  },
};
