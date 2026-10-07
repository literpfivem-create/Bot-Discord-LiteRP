// Eventi programmati di Discord per la pagina News: quelli in arrivo (con conto alla rovescia sul sito)
// e quelli passati, che restano come storico anche dopo che Discord li toglie.
const { GuildScheduledEventEntityType: EntityType, GuildScheduledEventStatus: Status } = require('discord.js');
const db = require('../utils/db');
const media = require('../utils/media');
const site = require('./site');
const { resolveMentions, excerpt } = require('../utils/discordText');

const MAX_PAST = 50;
const COUNT_DELAY = 5000; // raggruppa i "Mi interessa" ravvicinati in un solo aggiornamento

const STATUS = { [Status.Scheduled]: 'scheduled', [Status.Active]: 'active', [Status.Completed]: 'completed', [Status.Canceled]: 'canceled' };

const countTimers = new Map();

const events = () => db.getNews().events;
const isSiteGuild = (guild) => site.siteGuild()?.id === guild?.id;

function location(event) {
  if (event.entityType === EntityType.External) return event.entityMetadata?.location || null;
  return event.channel ? `Canale vocale ${event.channel.name}` : 'Canale vocale su Discord';
}

/** Salva o aggiorna un evento. Gli eventi annullati vengono tolti. */
async function store(event, interested) {
  const status = STATUS[event.status] ?? 'scheduled';
  if (status === 'canceled') return remove(event.id);

  const old = events()[event.id];
  let image = old?.imageHash === event.image ? old.image : null;
  if (event.image && !image) {
    image = await media.saveFromUrl(event.coverImageURL({ size: 1024 })).catch((e) => {
      console.error('[Sito] Copertina evento non salvata:', e.message);
      return null;
    });
  }
  const description = resolveMentions(event.description ?? '', event.guild);
  events()[event.id] = {
    id: event.id,
    name: event.name,
    description,
    excerpt: excerpt(description),
    image,
    imageHash: image ? event.image : null,
    start: event.scheduledStartTimestamp,
    end: event.scheduledEndTimestamp ?? null,
    status,
    location: location(event),
    interested: interested ?? event.userCount ?? old?.interested ?? null,
    url: event.url,
  };
  if (old?.image && old.image !== image) media.removeUnused([old.image]);
  prunePast();
  db.save();
  return true;
}

function remove(id) {
  const old = events()[id];
  if (!old) return false;
  delete events()[id];
  media.removeUnused([old.image]);
  db.save();
  return true;
}

/** Un evento sparito da Discord: se era già iniziato resta nello storico, altrimenti è stato annullato. */
function vanished(id) {
  const old = events()[id];
  if (!old || old.status === 'completed') return false;
  if (Date.now() < old.start) return remove(id);
  old.status = 'completed';
  db.save();
  return true;
}

function prunePast() {
  const past = Object.values(events()).filter((e) => e.status === 'completed').sort((a, b) => b.start - a.start);
  for (const old of past.slice(MAX_PAST)) remove(old.id);
}

/** Allinea gli eventi salvati con quelli del server Discord (all'avvio e con /sito collega). */
async function sync() {
  const guild = site.siteGuild();
  if (!guild) return;
  const fresh = await guild.scheduledEvents.fetch({ withUserCount: true });
  for (const event of fresh.values()) await store(event, event.userCount);
  for (const e of Object.values(events())) if (!fresh.has(e.id)) vanished(e.id);
  site.notify('events');
}

// ---------------------------------------------------------------- eventi Discord

/** Evento creato o modificato (anche iniziato o finito). */
async function onChange(event) {
  if (!isSiteGuild(event.guild)) return;
  await store(event);
  site.notify('events');
}

function onDelete(event) {
  if (isSiteGuild(event.guild) && vanished(event.id)) site.notify('events');
}

/** "Mi interessa" aggiunto o tolto: rilegge il numero di interessati poco dopo. */
function onInterest(event) {
  if (!isSiteGuild(event.guild) || !events()[event.id]) return;
  clearTimeout(countTimers.get(event.id));
  countTimers.set(event.id, setTimeout(async () => {
    countTimers.delete(event.id);
    const fresh = await event.guild.scheduledEvents.fetch({ guildScheduledEvent: event.id, withUserCount: true, force: true }).catch(() => null);
    if (!fresh) return;
    await store(fresh, fresh.userCount);
    site.notify('events');
  }, COUNT_DELAY));
}

// ---------------------------------------------------------------- dati per il sito

const publicEvent = ({ imageHash, ...e }) => e;

/** { upcoming: in arrivo e in corso (dal più vicino), past: passati (dal più recente) } */
function list() {
  const all = Object.values(events());
  return {
    upcoming: all.filter((e) => e.status !== 'completed').sort((a, b) => a.start - b.start).map(publicEvent),
    past: all.filter((e) => e.status === 'completed').sort((a, b) => b.start - a.start).map(publicEvent),
  };
}

function start() {
  sync().catch((e) => console.error('[Sito] Sincronizzazione eventi:', e.message));
}

module.exports = { start, sync, list, onChange, onDelete, onInterest };
