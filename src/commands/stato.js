const { SlashCommandBuilder } = require('discord.js');
const db = require('../utils/db');
const fivem = require('../handlers/fivem');

module.exports = {
  data: new SlashCommandBuilder().setName('stato').setDescription('Mostra lo stato del server FiveM (player e staff online)'),

  async execute(interaction) {
    await interaction.deferReply();
    const gcfg = db.getGuild(interaction.guild.id);
    const stats = await fivem.getStats(gcfg);
    await interaction.editReply(fivem.buildStatus(gcfg, stats));
  },
};
