// Dati dei giocatori FiveM per il profilo del sito, collegati all'ID Discord:
//  - personaggi (ESX): nome, data di nascita, lavoro, soldi... inviati dalla risorsa literp_discord (POST /api/characters)
//  - ore giocate e ultimo accesso: contati dalle statistiche inviate ogni 30s (/api/stats, lista player con Discord)
//  - sanzioni in game (ban, avvertimenti, kick di txAdmin) registrate da fivem.js
// Il profilo è visibile solo al diretto interessato (dopo l'accesso al sito); l'autore delle sanzioni non viene salvato.
const api = require('../api/server');
const db = require('../utils/db');

const MAX_CHARACTERS = 10;
const MAX_SANCTIONS = 30;
const MAX_TICK = 120 * 1000; // tra due statistiche si contano al massimo 2 minuti (server fermo = niente ore regalate)
const ONLINE_TTL = 90 * 1000; // online se compariva nell'ultima statistica ricevuta entro 90s
const SERVER_TTL = 5 * 60 * 1000; // il server FiveM è "collegato" se ha inviato dati negli ultimi 5 minuti

const lastTick = new Map(); // discordId -> ultima statistica in cui era online
let lastStatsAt = 0;

const validId = (id) => (/^\d{15,21}$/.test(String(id || '')) ? String(id) : null);
const str = (v, max = 60) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) || null : null);
const num = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);

function entry(id) {
  const players = db.getFivemPlayers();
  return (players[id] ??= { characters: {}, lastCharacter: null, playtime: 0, firstSeen: Date.now(), lastSeen: null, sanctions: [] });
}

// ---------------------------------------------------------------- ore giocate

/** Chiamata da fivem.js a ogni /api/stats: list = [{ id, name, discord }] dei giocatori online. */
function onStats(list) {
  const now = Date.now();
  lastStatsAt = now;
  if (!Array.isArray(list)) return;
  const online = new Set();
  for (const p of list) {
    const id = validId(p?.discord);
    if (!id) continue;
    online.add(id);
    const e = entry(id);
    const prev = lastTick.get(id);
    if (prev) e.playtime += Math.round(Math.min(now - prev, MAX_TICK) / 1000);
    e.lastSeen = now;
    lastTick.set(id, now);
  }
  for (const id of lastTick.keys()) if (!online.has(id)) lastTick.delete(id);
  if (online.size) db.save();
}

const isOnline = (id) => lastTick.has(id) && Date.now() - lastTick.get(id) < ONLINE_TTL;
const serverActive = () => Date.now() - lastStatsAt < SERVER_TTL;

// ---------------------------------------------------------------- personaggi

/** Personaggio ripulito (solo i campi mostrati sul profilo), oppure null se non valido. */
function cleanCharacter(c) {
  const citizenid = str(c?.citizenid, 20);
  if (!citizenid) return null;
  const group = (g) => (g && str(g.label) ? { label: str(g.label), grade: str(g.grade) } : null);
  return {
    citizenid,
    firstname: str(c.firstname, 40),
    lastname: str(c.lastname, 40),
    birthdate: str(c.birthdate, 20),
    gender: ['f', '1'].includes(String(c.gender).toLowerCase()) ? 'F' : 'M', // ESX: 'm'/'f' (Qbox: 0/1)
    nationality: str(c.nationality, 40),
    phone: str(c.phone, 20),
    job: group(c.job) && { ...group(c.job), onduty: Boolean(c.job.onduty) },
    gang: group(c.gang),
    money: { cash: num(c.money?.cash), bank: num(c.money?.bank) },
    updatedAt: Date.now(),
  };
}

function saveCharacter(discordId, character) {
  const e = entry(discordId);
  e.characters[character.citizenid] = character;
  e.lastCharacter = character.citizenid;
  const ids = Object.keys(e.characters);
  if (ids.length > MAX_CHARACTERS) {
    ids.sort((a, b) => e.characters[a].updatedAt - e.characters[b].updatedAt)
      .slice(0, ids.length - MAX_CHARACTERS)
      .forEach((id) => delete e.characters[id]);
  }
}

// ---------------------------------------------------------------- sanzioni

/** Registra una sanzione in game: type 'ban' | 'warn' | 'kick'. */
function recordSanction(discord, { type, id, reason, expiration }) {
  const discordId = validId(discord);
  if (!discordId) return;
  const e = entry(discordId);
  const exp = Number(expiration);
  e.sanctions.unshift({
    type,
    id: str(id, 100),
    reason: str(reason, 300),
    at: Date.now(),
    expiration: exp > 0 ? Math.floor(exp) : null, // unix in secondi, null = permanente (ban) o non applicabile
    revoked: false,
  });
  e.sanctions.length = Math.min(e.sanctions.length, MAX_SANCTIONS);
  db.save();
}

/** Segna come revocata la sanzione con questo ID (ban o warn annullato da txAdmin). */
function revokeSanction(discord, actionId) {
  const e = db.getFivemPlayers()[validId(discord)];
  const s = actionId && e?.sanctions.find((x) => x.id === String(actionId));
  if (!s) return;
  s.revoked = true;
  db.save();
}

const banActive = (s) => s.type === 'ban' && !s.revoked && (!s.expiration || s.expiration * 1000 > Date.now());

// ---------------------------------------------------------------- profilo

/** Dati FiveM per il profilo del sito, oppure null se questo Discord non è mai entrato in città. */
function profile(discordId) {
  const e = db.getFivemPlayers()[discordId];
  if (!e) return null;
  const characters = Object.values(e.characters).sort((a, b) =>
    (b.citizenid === e.lastCharacter) - (a.citizenid === e.lastCharacter) || b.updatedAt - a.updatedAt);
  return {
    online: isOnline(discordId),
    playtime: e.playtime, // secondi
    firstSeen: e.firstSeen,
    lastSeen: e.lastSeen,
    characters,
    activeBan: e.sanctions.find(banActive) ?? null,
    sanctions: e.sanctions.slice(0, 10),
    warns: e.sanctions.filter((s) => s.type === 'warn' && !s.revoked).length,
  };
}

function start() {
  // La risorsa invia i personaggi caricati: all'ingresso in città, ogni pochi minuti e all'uscita.
  api.route('POST', '/api/characters', 'API_SECRET', ({ body }) => {
    const players = Array.isArray(body?.players) ? body.players.slice(0, 2048) : [];
    let saved = 0;
    for (const p of players) {
      const discordId = validId(p?.discord);
      const character = cleanCharacter(p?.character);
      if (!discordId || !character) continue;
      saveCharacter(discordId, character);
      saved++;
    }
    if (saved) db.save();
    return { saved };
  });
}

module.exports = { start, onStats, recordSanction, revokeSanction, profile, serverActive };
