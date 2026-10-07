// Server stats: canali vocali in una categoria dedicata, con un numero che si aggiorna da solo o con un testo scelto da te.
//   contatore: "<emoji> | <nome>: <numero>"      testo libero: "<emoji>・<testo>" (es. IP del server)
// Sono tutti canali vocali visibili ma non utilizzabili da nessuno.
// Discord permette solo 2 rinomine ogni 10 minuti per canale: le prime variazioni sono immediate, poi
// l'aggiornamento viene rimandato appena il limite lo consente.
const { ChannelType, PermissionFlagsBits: P } = require('discord.js');
const db = require('../utils/db');

const WINDOW = 10 * 60 * 1000;
const MAX_RENAMES = 2;
const SWEEP_EVERY = 5 * 60 * 1000;

/** Tipi di contatore disponibili, con nome ed emoji predefiniti. */
const TYPES = {
  ruolo: { label: null, emoji: '🎭', description: 'Membri con un ruolo' },
  membri: { label: 'Membri', emoji: '👥', description: 'Membri del server (bot esclusi)' },
  bot: { label: 'Bot', emoji: '🤖', description: 'Bot nel server' },
  boost: { label: 'Boost', emoji: '🚀', description: 'Boost del server' },
  testo: { label: null, emoji: '📌', description: 'Testo libero' },
  ticket: { label: 'Ticket aperti', emoji: '🎫', description: 'Ticket aperti ora' },
  player: { label: 'Player', emoji: '🎮', description: 'Giocatori online su FiveM' },
  staff: { label: 'Staff online', emoji: '🛡️', description: 'Staff online su FiveM' },
};

const renames = new Map(); // channelId -> [timestamp, ...]
const timers = new Map(); // channelId -> timeout
const lastFivem = new Map(); // guildId -> ultime statistiche FiveM

const counterName = (c, value) => (c.type === 'testo' ? `${c.emoji}・${c.label}` : `${c.emoji} | ${c.label}: ${value}`).slice(0, 100);

/** Valore attuale del contatore (stringa), oppure null se non disponibile. */
function valueOf(guild, counter) {
  switch (counter.type) {
    case 'ruolo': {
      const role = guild.roles.cache.get(counter.roleId);
      return role ? String(role.members.size) : null;
    }
    case 'testo': return '';
    case 'membri': return String(guild.members.cache.filter((m) => !m.user.bot).size);
    case 'bot': return String(guild.members.cache.filter((m) => m.user.bot).size);
    case 'boost': return String(guild.premiumSubscriptionCount ?? 0);
    case 'ticket': return String(db.findTickets((t) => t.guildId === guild.id).length);
    case 'player': {
      const s = lastFivem.get(guild.id);
      if (!s) return null;
      return s.online ? `${s.players}/${s.maxPlayers || '?'}` : 'Offline';
    }
    case 'staff': {
      const s = lastFivem.get(guild.id);
      if (!s) return null;
      if (!s.online) return '0';
      return Array.isArray(s.staff) ? String(s.staff.length) : 'N/D';
    }
    default: return null;
  }
}

// ---------------------------------------------------------------- creazione canali

/** Categoria dei contatori (la crea se manca). */
async function ensureCategory(guild, gcfg) {
  let category = guild.channels.cache.get(gcfg.channels.statsCategory);
  if (!category) {
    category = await guild.channels.create({ name: gcfg.stats.categoryName, type: ChannelType.GuildCategory, position: 0, reason: 'Server stats LiteRP' });
    gcfg.channels.statsCategory = category.id;
    db.save();
  }
  return category;
}

/** Visibili ma non utilizzabili da nessuno: solo il bot può gestirli. */
function permissionsFor(guild) {
  return [
    { id: guild.id, allow: [P.ViewChannel], deny: [P.Connect] },
    { id: guild.client.user.id, allow: [P.ViewChannel, P.Connect, P.ManageChannels] },
  ];
}

/** Crea (o ricrea) il canale di un contatore e lo salva nel contatore. */
async function createChannel(guild, gcfg, counter) {
  const category = await ensureCategory(guild, gcfg);
  const name = counterName(counter, valueOf(guild, counter) ?? '--');
  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildVoice,
    parent: category.id,
    permissionOverwrites: permissionsFor(guild),
    reason: 'Server stats LiteRP',
  });
  counter.channelId = channel.id;
  counter.lastName = name;
  counter.appliedName = channel.name;
  db.save();
  return channel;
}

// ---------------------------------------------------------------- aggiornamento

function waitTime(channelId) {
  const now = Date.now();
  const recent = (renames.get(channelId) || []).filter((t) => now - t < WINDOW);
  renames.set(channelId, recent);
  return recent.length < MAX_RENAMES ? 0 : recent[0] + WINDOW - now + 1000;
}

async function updateCounter(guild, counter) {
  const channel = guild.channels.cache.get(counter.channelId);
  if (!channel) return; // eliminato a mano: si ripristina con /serverstats ripara
  const value = valueOf(guild, counter);
  if (value === null) return;
  const name = counterName(counter, value);
  // Discord può modificare il nome (minuscole, trattini nei testuali): si confronta con quello applicato l'ultima volta
  if (counter.lastName === name && channel.name === counter.appliedName) return;

  const wait = waitTime(channel.id);
  if (wait > 0) {
    if (!timers.has(channel.id)) {
      timers.set(channel.id, setTimeout(() => {
        timers.delete(channel.id);
        refreshGuild(guild).catch((e) => console.error('[Stats]', e.message));
      }, wait));
    }
    return;
  }
  renames.get(channel.id).push(Date.now());
  try {
    const renamed = await channel.setName(name, 'Server stats LiteRP');
    counter.lastName = name;
    counter.appliedName = renamed.name;
    db.save();
  } catch (e) {
    console.error(`[Stats] Rinomina di "${counter.label}" fallita:`, e.message);
  }
}

/** Aggiorna tutti i contatori del server. `stats` = ultime statistiche FiveM (passate da fivem.js ogni minuto). */
async function refreshGuild(guild, stats) {
  if (stats) lastFivem.set(guild.id, stats);
  const gcfg = db.peekGuild(guild.id);
  if (!gcfg?.stats.counters.length) return;
  for (const counter of [...gcfg.stats.counters]) await updateCounter(guild, counter);
}

/** Da chiamare quando può cambiare un conteggio (membri, ruoli, ticket...). */
function onChange(guild) {
  refreshGuild(guild).catch((e) => console.error('[Stats]', e.message));
}

function onMemberUpdate(oldM, newM) {
  const same = !oldM.partial && oldM.roles.cache.size === newM.roles.cache.size && oldM.roles.cache.every((_, id) => newM.roles.cache.has(id));
  if (!same) onChange(newM.guild);
}

async function start(client) {
  // Serve la cache completa dei membri per contare correttamente ruoli, membri e bot
  for (const guild of client.guilds.cache.values()) {
    await guild.members.fetch().catch((e) => console.error(`[Stats] Caricamento membri di "${guild.name}" fallito:`, e.message));
    onChange(guild);
  }
  setInterval(() => client.guilds.cache.forEach(onChange), SWEEP_EVERY);
}

module.exports = { TYPES, start, onChange, onMemberUpdate, refreshGuild, counterName, valueOf, ensureCategory, createChannel };
