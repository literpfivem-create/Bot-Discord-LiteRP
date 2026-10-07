const { MessageFlags } = require('discord.js');
const tickets = require('./tickets');
const ticketSetup = require('./ticketSetup');
const messaggio = require('../commands/messaggio');
const ruoli = require('../commands/ruoli');
const { errorEmbed } = require('../utils/embeds');

async function handleInteraction(client, interaction) {
  try {
    // Valutazione ticket: arriva dai DM, quindi prima del controllo inGuild
    if (interaction.isButton() && interaction.customId.startsWith('rate:')) return await tickets.handleRating(interaction);
    if (!interaction.inGuild()) return;

    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (command) await command.execute(interaction, client);
      return;
    }

    const id = interaction.customId;
    if (!id) return;
    if (id.startsWith('ticket_')) return await tickets.handleComponent(interaction);
    if (id.startsWith('tcfg:')) return await ticketSetup.handle(interaction);
    if (id.startsWith('msg_embed:')) return await messaggio.handleModal(interaction);
    if (id.startsWith('selfrole:')) return await ruoli.handleButton(interaction);
  } catch (err) {
    console.error(`[Interazione] Errore (${interaction.commandName ?? interaction.customId}):`, err);
    if (!interaction.isRepliable()) return;
    const payload = { embeds: [errorEmbed('Si è verificato un errore imprevisto. Riprova o contatta un amministratore.')], flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
}

module.exports = { handleInteraction };
