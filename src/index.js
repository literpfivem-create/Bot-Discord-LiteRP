require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, Events, GatewayIntentBits, Partials } = require('discord.js');
const db = require('./utils/db');
const { handleInteraction } = require('./handlers/interactions');
const tickets = require('./handlers/tickets');
const welcome = require('./handlers/welcome');
const automod = require('./handlers/automod');
const logs = require('./handlers/logs');
const fivem = require('./handlers/fivem');
const scheduler = require('./handlers/scheduler');
const serverStats = require('./handlers/serverStats');

if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN mancante. Copia .env.example in .env e inserisci il token del bot.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // privilegiato: benvenuto, autorole, log membri
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // privilegiato: automod, log messaggi
    GatewayIntentBits.GuildModeration, // log ban Discord
    GatewayIntentBits.GuildVoiceStates, // log vocali
  ],
  // Permette di ricevere eventi anche per messaggi/membri non in memoria (es. messaggi eliminati vecchi)
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});

// Ogni file in commands/ esporta un comando oppure un array di comandi
client.commands = new Collection();
const commandsDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
  const exported = require(path.join(commandsDir, file));
  for (const command of [exported].flat()) client.commands.set(command.data.name, command);
}

async function registerCommands(guild) {
  await guild.commands.set(client.commands.map((c) => c.data.toJSON()));
  console.log(`   ↳ ${client.commands.size} comandi registrati su "${guild.name}"`);
}

const safe = (label, fn) => (...args) => Promise.resolve(fn(...args)).catch((e) => console.error(`[${label}]`, e));

client.once(Events.ClientReady, async () => {
  console.log(`✅ Connesso come ${client.user.tag} (${client.guilds.cache.size} server)`);
  for (const guild of client.guilds.cache.values()) {
    await registerCommands(guild).catch((e) => console.error(`❌ Registrazione comandi fallita su "${guild.name}":`, e.message));
  }
  fivem.start(client);
  scheduler.start(client);
  serverStats.start(client).catch((e) => console.error('[Stats]', e));
  tickets.startInactivityChecker(client);
  tickets.refreshPanels(client).catch((e) => console.error('[Ticket] Pannelli:', e.message));
});

client.on(Events.GuildCreate, (guild) => registerCommands(guild).catch((e) => console.error(e.message)));
client.on(Events.InteractionCreate, (interaction) => handleInteraction(client, interaction));

client.on(Events.GuildMemberAdd, safe('Ingresso', async (member) => {
  serverStats.onChange(member.guild);
  const removed = await automod.onJoin(member);
  await logs.onMemberJoin(member);
  if (!removed) await welcome.onJoin(member);
}));
client.on(Events.GuildMemberUpdate, safe('Aggiornamento membro', async (oldM, newM) => {
  serverStats.onMemberUpdate(oldM, newM);
  await welcome.onUpdate(oldM, newM);
  await logs.onMemberUpdate(oldM, newM);
}));
client.on(Events.GuildMemberRemove, safe('Uscita', async (member) => {
  serverStats.onChange(member.guild);
  await welcome.onLeave(member);
  await logs.onMemberLeave(member);
}));
client.on(Events.MessageCreate, safe('AutoMod', (message) => automod.onMessage(message)));
client.on(Events.MessageDelete, safe('Log', (message) => logs.onMessageDelete(message)));
client.on(Events.MessageBulkDelete, safe('Log', (messages, channel) => logs.onMessageBulkDelete(messages, channel)));
client.on(Events.MessageUpdate, safe('AutoMod', (oldM, newM) => automod.onEdit(oldM, newM)));
client.on(Events.MessageUpdate, safe('Log', (oldM, newM) => logs.onMessageUpdate(oldM, newM)));
client.on(Events.GuildBanAdd, safe('Log', (ban) => logs.onBanAdd(ban)));
client.on(Events.GuildBanRemove, safe('Log', (ban) => logs.onBanRemove(ban)));
client.on(Events.VoiceStateUpdate, safe('Log', (oldS, newS) => logs.onVoiceUpdate(oldS, newS)));
client.on(Events.ChannelDelete, (channel) => tickets.onChannelDelete(channel));

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    db.saveNow();
    client.destroy();
    process.exit(0);
  });
}

client.login(process.env.DISCORD_TOKEN);
