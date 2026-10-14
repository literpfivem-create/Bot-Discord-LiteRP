// Ripristino delle impostazioni di un server da un backup (database.json di prima, es. quello del bot sul PC).
// Si recupera solo quello che manca: quello che è stato impostato dopo il backup non viene toccato.
//  - canali, categorie e messaggi: quelli del backup, se ora mancano (o sono stati eliminati) e su Discord esistono ancora
//  - ruoli e liste (staff, autorole, parole vietate...): uniti a quelli attuali
//  - contatori di /serverstats: tornano quelli del backup il cui canale esiste ancora
//  - numerazione di ticket e casi, statistiche ticket e record player: si tiene il valore più alto
//  - le altre impostazioni (testi, attivo/disattivo, limiti): quelle del backup, se ora sono ancora al valore predefinito.
//    Benvenuto, addio e ticket restano come sono se il loro canale è già stato impostato dopo il backup.
// I messaggi programmati non vengono ripristinati: quelli scaduti partirebbero tutti subito.

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const CHANNEL_LABELS = {
  welcome: 'Benvenuto',
  goodbye: 'Addio',
  ticketPanel: 'Pannello ticket',
  ticketLogs: 'Log ticket',
  modActions: 'Log moderazione',
  modLogs: 'Log automod',
  serverLogs: 'Log server',
  fivemLogs: 'Log FiveM',
  fivemBans: 'Ban FiveM',
  serverStatus: 'Stato server',
  statsCategory: 'Categoria server stats',
  infoCategory: 'Categoria info',
  logCategory: 'Categoria log',
};

/** Sezioni lasciate come sono se il loro canale è stato impostato dopo il backup. */
const SECTION_CHANNEL = { welcome: 'welcome', goodbye: 'goodbye', ticketSettings: 'ticketPanel' };
/** Sezioni con impostazioni semplici, con i campi gestiti a parte. */
const SETTINGS = {
  welcome: [], goodbye: [], logs: [], automod: [], ticketSettings: [],
  moderation: ['caseCounter', 'warnCounter'], fivem: ['peak'], stats: ['seq'],
};

/** Valori semplici: quello del backup se ora c'è ancora il predefinito. Restituisce quanti ne ha cambiati. */
function restoreSettings(cur, bak, def, skip = []) {
  let changed = 0;
  for (const [key, d] of Object.entries(def)) {
    if (skip.includes(key) || !(key in bak)) continue;
    const b = bak[key];
    if (isObj(d)) {
      if (isObj(cur[key]) && isObj(b)) changed += restoreSettings(cur[key], b, d);
      continue;
    }
    if (Array.isArray(d) || !same(cur[key], d) || same(b, d)) continue;
    const typeOk = d === null ? ['string', 'number'].includes(typeof b) : typeof b === typeof d;
    if (!typeOk || String(b).length > 2000) continue;
    cur[key] = b;
    changed++;
  }
  return changed;
}

/** Aggiunge a `list` gli elementi di `items` che mancano. Restituisce quanti ne ha aggiunti. */
function addMissing(list, items, valid = () => true, key = (v) => v) {
  let added = 0;
  for (const item of Array.isArray(items) ? items : []) {
    if (typeof item !== 'string' || !valid(item) || list.some((v) => key(v) === key(item))) continue;
    list.push(item);
    added++;
  }
  return added;
}

const higher = (a, b) => (Number.isFinite(b) && !(Number.isFinite(a) && a >= b) ? b : a);

/**
 * Unisce il backup `bak` alla configurazione attuale `gcfg` (modificata sul posto).
 * `defaults` = configurazione predefinita (db.defaultGuild()). Restituisce le righe del riepilogo (vuoto = niente da fare).
 */
function restoreGuild(guild, gcfg, bak, defaults) {
  const lines = [];
  const hasChannel = (id) => typeof id === 'string' && guild.channels.cache.has(id);
  const hasRole = (id) => typeof id === 'string' && guild.roles.cache.has(id);
  const bakChannels = isObj(bak.channels) ? bak.channels : {};
  // Prima di toccare i canali: quali sezioni sono già state configurate dopo il backup
  const configured = Object.fromEntries(Object.entries(SECTION_CHANNEL).map(([section, key]) => [section, hasChannel(gcfg.channels[key])]));

  // Canali
  const restored = new Set();
  for (const key of Object.keys(gcfg.channels)) {
    const id = bakChannels[key];
    if (hasChannel(gcfg.channels[key]) || !hasChannel(id)) continue;
    gcfg.channels[key] = id;
    restored.add(key);
    lines.push(`📺 ${CHANNEL_LABELS[key] ?? key} → <#${id}>`);
  }
  // Messaggi del pannello ticket e dello stato server: validi solo nello stesso canale del backup
  if (gcfg.channels.ticketPanel && gcfg.channels.ticketPanel === bakChannels.ticketPanel) {
    for (const key of ['panelMessageId', 'panelBannerId']) {
      if ((restored.has('ticketPanel') || !gcfg[key]) && typeof bak[key] === 'string') gcfg[key] = bak[key];
    }
  }
  if (gcfg.channels.serverStatus && gcfg.channels.serverStatus === bakChannels.serverStatus) {
    if ((restored.has('serverStatus') || !gcfg.statusMessageId) && typeof bak.statusMessageId === 'string') gcfg.statusMessageId = bak.statusMessageId;
  }

  // Categorie e ruoli dei ticket
  let ticketCategories = 0;
  for (const [key, id] of Object.entries(isObj(bak.categories) ? bak.categories : {})) {
    if (hasChannel(gcfg.categories[key]) || !hasChannel(id)) continue;
    gcfg.categories[key] = id;
    ticketCategories++;
  }
  if (ticketCategories) lines.push(`🗂️ Categorie dei ticket: **${ticketCategories}**`);
  let ticketRoles = 0;
  for (const [key, ids] of Object.entries(isObj(bak.ticketRoles) ? bak.ticketRoles : {})) {
    if (gcfg.ticketRoles[key]?.length || !Array.isArray(ids)) continue;
    const valid = ids.filter(hasRole);
    if (!valid.length) continue;
    gcfg.ticketRoles[key] = valid;
    ticketRoles++;
  }
  if (ticketRoles) lines.push(`🎫 Ruoli dei ticket: **${ticketRoles}** categorie`);

  // Ruoli
  const roleLines = [
    ['staffRoles', '🛡️ Ruoli staff'],
    ['autoroles', '🎭 Autorole'],
    ['autorolesBots', '🤖 Autorole dei bot'],
  ];
  for (const [key, label] of roleLines) {
    const before = gcfg[key].length;
    if (addMissing(gcfg[key], bak[key], hasRole)) lines.push(`${label}: ${gcfg[key].slice(before).map((id) => `<@&${id}>`).join(', ')}`);
  }

  // Liste dell'automod
  const am = gcfg.automod;
  const bam = isObj(bak.automod) ? bak.automod : {};
  const lower = (v) => v.toLowerCase();
  const words = addMissing(am.badWords.list, bam.badWords?.list, () => true, lower);
  if (words) lines.push(`🤬 Parole vietate: **${words}**`);
  const amLists = addMissing(am.whitelistDomains, bam.whitelistDomains, () => true, lower) +
    addMissing(am.ignoredChannels, bam.ignoredChannels, hasChannel) +
    addMissing(am.ignoredRoles, bam.ignoredRoles, hasRole);
  if (amLists) lines.push(`🛡️ Domini, canali e ruoli esclusi dall'automod: **${amLists}**`);
  const blacklist = gcfg.ticketSettings.blacklist;
  let blocked = 0;
  for (const entry of Array.isArray(bak.ticketSettings?.blacklist) ? bak.ticketSettings.blacklist : []) {
    if (!isObj(entry) || typeof entry.id !== 'string' || blacklist.some((b) => b.id === entry.id)) continue;
    blacklist.push(entry);
    blocked++;
  }
  if (blocked) lines.push(`⛔ Utenti bloccati dai ticket: **${blocked}**`);

  // Contatori di /serverstats
  gcfg.stats.seq = higher(gcfg.stats.seq, bak.stats?.seq);
  const counters = [];
  for (const c of Array.isArray(bak.stats?.counters) ? bak.stats.counters : []) {
    if (!isObj(c) || !hasChannel(c.channelId) || gcfg.stats.counters.some((x) => x.channelId === c.channelId)) continue;
    if (c.type === 'ruolo' && !hasRole(c.roleId)) continue;
    gcfg.stats.counters.push({ ...c, id: ++gcfg.stats.seq });
    counters.push(`<#${c.channelId}>`);
  }
  if (counters.length) lines.push(`📊 Contatori server stats: ${counters.join(', ')}`);

  // Numeri che crescono
  for (const [key, value] of Object.entries(isObj(bak.ticketCounters) ? bak.ticketCounters : {})) {
    gcfg.ticketCounters[key] = higher(gcfg.ticketCounters[key], value);
  }
  for (const key of ['caseCounter', 'warnCounter']) gcfg.moderation[key] = higher(gcfg.moderation[key], bak.moderation?.[key]);
  if (isObj(bak.ticketStats) && Number(bak.ticketStats.opened) > gcfg.ticketStats.opened) gcfg.ticketStats = bak.ticketStats;
  const bakPeak = bak.fivem?.peak?.allTime;
  if (isObj(bakPeak) && Number(bakPeak.value) > gcfg.fivem.peak.allTime.value) gcfg.fivem.peak.allTime = bakPeak;

  // Altre impostazioni
  let settings = 0;
  for (const [section, skip] of Object.entries(SETTINGS)) {
    if (configured[section] || !isObj(bak[section])) continue;
    settings += restoreSettings(gcfg[section], bak[section], defaults[section], skip);
  }
  if (settings) lines.push(`⚙️ Altre impostazioni (testi, attivo/disattivo, limiti): **${settings}**`);

  return lines;
}

module.exports = { restoreGuild };
