// Database su file JSON (data/database.json). Nessuna dipendenza nativa da compilare.
// I campi nuovi vengono aggiunti automaticamente alle configurazioni esistenti (fillDefaults).
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const FILE = path.join(DATA_DIR, 'database.json');

const DEFAULT_WELCOME =
  'Ciao {user}, benvenuto nella città di **LiteRP**!\n\n📜 Leggi il **regolamento** prima di entrare in città\n🎫 Hai bisogno di aiuto? Apri un **ticket**\n🎮 Buon roleplay!';
const OLD_WELCOME =
  'Benvenuto {user} nella città di **LiteRP**! 🏙️\n\n📜 Leggi il regolamento prima di entrare in città.\n🎫 Hai bisogno di aiuto? Apri un ticket.\n\nOra siamo **{count}** membri!';

function defaultGuild() {
  return {
    staffRoles: [],
    // ID dei canali gestiti dal bot
    channels: {
      infoCategory: null,
      statsCategory: null,
      logCategory: null,
      welcome: null,
      goodbye: null,
      ticketPanel: null,
      ticketLogs: null,
      modLogs: null,
      modActions: null,
      serverLogs: null,
      fivemLogs: null,
      fivemBans: null,
      serverStatus: null,
    },
    // categoria Discord per ogni tipo di ticket (key -> id categoria)
    categories: {},
    // ruoli che gestiscono ogni tipo di ticket (key -> [roleId])
    ticketRoles: {},
    ticketCounters: {},
    ticketSettings: {
      maxOpen: 3, // ticket aperti contemporaneamente per utente (tutte le categorie)
      autoCloseHours: 0, // 0 = disattivato
      pingStaff: true,
      rating: true,
      blacklist: [], // [{ id, reason, by, date }]
    },
    ticketStats: {
      opened: 0,
      closed: 0,
      ratingSum: 0,
      ratingCount: 0,
      staff: {}, // id -> { closed, claimed, ratingSum, ratingCount }
    },
    panelMessageId: null,
    panelBannerId: null, // immagine "CENTRO ASSISTENZA" sopra il pannello
    statusMessageId: null,
    autoroles: [],
    autorolesBots: [],
    welcome: {
      enabled: true,
      message: DEFAULT_WELCOME,
      card: true, // immagine "BENVENUTO <nome> dentro LiteRP" con foto profilo
      background: null, // URL sfondo dell'immagine (null = sfondo LiteRP predefinito)
      title: 'BENVENUTO',
      subtitle: 'dentro {server}',
      color: null,
      dm: false,
      dmMessage: 'Ciao **{username}**, benvenuto su **{server}**! 🎉\nLeggi il regolamento e, se hai bisogno, apri un ticket. Buon RP!',
    },
    goodbye: {
      enabled: true,
      message: '**{username}** ha lasciato il server. Ora siamo **{count}** membri.',
    },
    logs: {
      messages: true,
      members: true,
      voice: true,
    },
    automod: {
      enabled: true,
      antiInvite: true,
      antiLink: false,
      antiSpam: true,
      antiDuplicate: true,
      antiMention: true,
      antiCaps: false,
      antiRaid: true,
      badWords: { enabled: true, list: [], exemptStaff: false }, // le parole vietate valgono anche per lo staff
      whitelistDomains: ['tenor.com', 'giphy.com', 'youtube.com', 'youtu.be', 'twitch.tv', 'cfx.re', 'medal.tv', 'streamable.com'],
      ignoredChannels: [],
      ignoredRoles: [],
      maxMentions: 5,
      spamMessages: 5,
      spamSeconds: 5,
      warnThreshold: 3,
      timeoutMinutes: 10,
      raidJoins: 8,
      raidSeconds: 15,
      minAccountAgeDays: 0, // 0 = disattivato
      accountAgeAction: 'log', // 'log' | 'kick'
    },
    moderation: {
      caseCounter: 0,
      warnCounter: 0,
      timeoutAt: 3, // avvisi per timeout automatico (0 = off)
      timeoutMinutes: 60,
      kickAt: 0,
      banAt: 0,
      warnExpireDays: 0, // 0 = gli avvisi non scadono
    },
    // Server stats: canali contatore. counters: [{ id, type, kind: 'voice'|'text', channelId, emoji, label, roleId?, lastName, appliedName }]
    stats: { categoryName: '📈 | Server Stats', counters: [], seq: 0 },
    scheduled: [], // [{ id, channelId, text, title, mentionId, interval, once, nextRun, createdBy }]
    scheduledCounter: 0,
    fivem: {
      ip: null,
      connect: null,
      name: 'LiteRP',
      showBanAuthor: true,
      dmBan: true,
      statusAlerts: true,
      botPresence: false,
      peak: { today: { value: 0, date: null }, allTime: { value: 0, date: null } },
    },
  };
}

function fillDefaults(target, defaults) {
  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in target)) {
      target[key] = value;
    } else if (
      value && typeof value === 'object' && !Array.isArray(value) &&
      target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
    ) {
      fillDefaults(target[key], value);
    }
  }
  return target;
}

let state = { guilds: {}, tickets: {}, warns: {} };
try {
  if (fs.existsSync(FILE)) state = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch (err) {
  console.error('[DB] Impossibile leggere il database, ne creo uno nuovo (backup salvato):', err.message);
  try { fs.copyFileSync(FILE, `${FILE}.corrotto-${Date.now()}`); } catch { /* ignore */ }
  state = { guilds: {}, tickets: {}, warns: {} };
}
state.guilds ??= {};
state.tickets ??= {};
state.warns ??= {};

let timer = null;

function saveNow() {
  if (timer) { clearTimeout(timer); timer = null; }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const json = JSON.stringify(state, null, 2);
  const tmp = `${FILE}.tmp`;
  try {
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, FILE);
  } catch {
    // Su Windows l'antivirus a volte blocca il rename: scrittura diretta
    fs.writeFileSync(FILE, json);
  }
}

function save() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try { saveNow(); } catch (err) { console.error('[DB] Errore salvataggio:', err); }
  }, 300);
}

/** Config del server (la crea se non esiste). L'oggetto è "live": modificalo e chiama save(). */
function getGuild(guildId) {
  if (!state.guilds[guildId]) state.guilds[guildId] = defaultGuild();
  return migrate(fillDefaults(state.guilds[guildId], defaultGuild()));
}

/** Aggiorna le configurazioni create con le versioni precedenti del bot. */
function migrate(g) {
  if (g.welcome.message === OLD_WELCOME) g.welcome.message = DEFAULT_WELCOME;
  // emoji 🏙️ tolta dopo "benvenuto nella città di LiteRP!" (anche dai testi già salvati)
  if (g.welcome.message.includes('**LiteRP**! 🏙️')) g.welcome.message = g.welcome.message.replace('**LiteRP**! 🏙️', '**LiteRP**!');
  if ('image' in g.welcome) {
    // la vecchia immagine dell'embed diventa lo sfondo dell'immagine di benvenuto
    if (g.welcome.image && !g.welcome.background) g.welcome.background = g.welcome.image;
    delete g.welcome.image;
  }
  delete g.ticketSettings.panel; // il pannello non è più personalizzabile: ha un design fisso
  migrateStats(g);
  delete g.setupDone; // /setup è stato rimosso: ogni funzione si attiva impostandone il canale
  return g;
}

/** Vecchi contatori (player/staff in channels, roleCounters) -> g.stats.counters. */
function migrateStats(g) {
  const add = (counter) => g.stats.counters.push({ id: ++g.stats.seq, lastName: null, appliedName: null, ...counter });
  if (g.channels.statsPlayers) add({ type: 'player', kind: 'voice', channelId: g.channels.statsPlayers, emoji: '👥', label: 'Player' });
  if (g.channels.statsStaff) add({ type: 'staff', kind: 'voice', channelId: g.channels.statsStaff, emoji: '🛡️', label: 'Staff online' });
  for (const c of g.roleCounters ?? []) add({ type: 'ruolo', kind: 'voice', channelId: c.channelId, emoji: c.emoji, label: c.label, roleId: c.roleId });
  delete g.channels.statsPlayers;
  delete g.channels.statsStaff;
  delete g.roleCounters;
  delete g.roleCounterSeq;
}

/** Come getGuild ma restituisce null se il server non è mai stato configurato. */
function peekGuild(guildId) {
  return state.guilds[guildId] ? getGuild(guildId) : null;
}

// ---- Ticket ----
function getTicket(channelId) {
  return state.tickets[channelId] || null;
}
function setTicket(channelId, data) {
  state.tickets[channelId] = data;
  save();
}
function deleteTicket(channelId) {
  if (state.tickets[channelId]) {
    delete state.tickets[channelId];
    save();
  }
}
function findTickets(filter) {
  return Object.values(state.tickets).filter(filter);
}

// ---- Avvisi (warn) ----
/** Mappa userId -> [warn] del server. Live: modificala e chiama save(). */
function getWarns(guildId) {
  return (state.warns[guildId] ??= {});
}

module.exports = {
  getGuild, peekGuild, save, saveNow,
  getTicket, setTicket, deleteTicket, findTickets,
  getWarns,
};
