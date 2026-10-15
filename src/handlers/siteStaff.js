// Pagina Staff del sito (GET /site/staff): i gruppi scelti con /sito staff, con nome, colore e membri presi da Discord.
// Chi riceve o perde un ruolo compare/sparisce da solo: il bot avvisa il sito (tag "staff") quando qualcosa cambia.
const db = require('../utils/db');
const site = require('./site');

const DEFAULT_COLOR = '#8b9cf7'; // ruolo senza colore su Discord
// Ruoli mai mostrati sul sito accanto allo staff: troppo generici ("・Cittadino di LiteRP", "・Staff di Lite®")
// o solo separatori della lista ruoli (es. "━━━━━━", senza lettere)
const HIDDEN_ROLE = /cittadino|staff\s*di\s*lite/i;
const isHidden = (role) => HIDDEN_ROLE.test(role.name) || !/\p{L}/u.test(role.name);
const SHOWN_ROLES = 2; // ruoli mostrati nelle schede della pagina Direzione

/** Gruppi staff configurati: [{ roleId, name, description }] nell'ordine della pagina. Live: modificali e chiama save(). */
const groups = () => db.getSite().staff;

/** Nome mostrato sul sito: quello scelto con /sito staff, altrimenti il nome del ruolo Discord. */
const groupName = (group, role) => group.name || role.name;

/**
 * Gruppi con i loro membri. Ognuno compare solo nel primo gruppo della lista in cui si trova
 * (l'ordine di /sito staff ordine è la gerarchia). I gruppi senza membri non vengono mostrati.
 */
function staffGroups(guild) {
  const seen = new Set();
  const result = [];
  for (const group of groups()) {
    const role = guild.roles.cache.get(group.roleId);
    if (!role) continue; // ruolo eliminato su Discord
    const members = role.members
      .filter((m) => !m.user.bot && !seen.has(m.id))
      .map((m) => ({ id: m.id, name: m.displayName, avatar: m.displayAvatarURL({ size: 256, extension: 'webp' }), roles: topRoles(m) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'it'));
    members.forEach((m) => seen.add(m.id));
    if (!members.length) continue;
    result.push({
      id: role.id,
      name: groupName(group, role),
      color: role.color ? role.hexColor : DEFAULT_COLOR,
      description: group.description,
      members,
    });
  }
  return result;
}

/** Ruoli di un membro da mostrare sul sito, dal più alto: senza @everyone, ruoli dei bot e ruoli generici. */
function visibleRoles(member) {
  return [...member.roles.cache.values()]
    .filter((r) => r.id !== member.guild?.id && r.name !== '@everyone' && !r.managed && !isHidden(r))
    .sort((a, b) => b.position - a.position);
}

/** I ruoli più alti di un membro per il sito: [{ name, color }]. */
const topRoles = (member, count = SHOWN_ROLES) =>
  visibleRoles(member).slice(0, count).map((r) => ({ name: r.name, color: r.color ? r.hexColor : DEFAULT_COLOR }));

/** Membro del server da ID Discord o nome utente (es. "yaxi"), oppure null. */
function findMember(guild, key) {
  if (/^\d{17,20}$/.test(key)) return guild.members.cache.get(key) ?? null;
  const name = key.toLowerCase();
  const all = [...guild.members.cache.values()].filter((m) => !m.user.bot);
  return all.find((m) => m.user.username?.toLowerCase() === name)
    ?? all.find((m) => m.displayName?.toLowerCase() === name)
    ?? null;
}

/** ID dei ruoli staff mostrati sul sito. */
const roleIds = () => new Set(groups().map((g) => g.roleId));

/** Primo gruppo del sito di un membro (per lo staff in servizio), oppure null. */
function groupOf(member) {
  for (const group of groups()) {
    const role = member.roles.cache.get(group.roleId);
    if (role) return { role, name: groupName(group, role), index: groups().indexOf(group) };
  }
  return null;
}

const isSiteGuild = (guild) => site.siteGuild()?.id === guild?.id;
const hasStaffRole = (member) => member?.roles?.cache?.some((r) => roleIds().has(r.id)) ?? false;

/** Avvisa il sito se è cambiato qualcosa che la pagina Staff mostra. */
function changed() {
  site.notify('staff', 'live');
}

// ---------------------------------------------------------------- eventi Discord

function onMemberUpdate(oldM, newM) {
  if (!isSiteGuild(newM.guild) || !groups().length) return;
  // senza la versione precedente in memoria non si sa cosa è cambiato: si avvisa solo se ora è staff
  if (oldM.partial) return hasStaffRole(newM) && changed();
  const ids = roleIds();
  const rolesChanged = !oldM.roles.cache.filter((r) => ids.has(r.id)).equals(newM.roles.cache.filter((r) => ids.has(r.id)));
  const profileChanged = hasStaffRole(newM) && (oldM.displayName !== newM.displayName || oldM.displayAvatarURL() !== newM.displayAvatarURL());
  if (rolesChanged || profileChanged) changed();
}

function onMemberLeave(member) {
  if (isSiteGuild(member.guild) && (member.partial || hasStaffRole(member))) changed();
}

function onRoleUpdate(oldR, newR) {
  if (isSiteGuild(newR.guild) && roleIds().has(newR.id) && (oldR.name !== newR.name || oldR.color !== newR.color)) changed();
}

function onRoleDelete(role) {
  if (!roleIds().has(role.id)) return;
  db.getSite().staff = groups().filter((g) => g.roleId !== role.id);
  db.save();
  if (isSiteGuild(role.guild)) changed();
}

function start() {
  site.siteRoute('/site/staff', () => {
    const guild = site.siteGuild();
    return { groups: guild ? staffGroups(guild) : [], updatedAt: new Date().toISOString() };
  });

  // Ruoli più alti di alcuni membri (per lo staff scritto nel codice del sito): ?users=yaxi,macand o ID Discord
  site.siteRoute('/site/staff/roles', ({ query }) => {
    const guild = site.siteGuild();
    const keys = [...new Set(String(query.get('users') || '').split(',').map((k) => k.trim()).filter(Boolean))].slice(0, 50);
    const users = {};
    for (const key of keys) {
      const member = guild && findMember(guild, key);
      users[key] = member ? topRoles(member) : null;
    }
    return { users, updatedAt: new Date().toISOString() };
  });
}

module.exports = { start, groups, staffGroups, groupOf, visibleRoles, topRoles, changed, onMemberUpdate, onMemberLeave, onRoleUpdate, onRoleDelete };
