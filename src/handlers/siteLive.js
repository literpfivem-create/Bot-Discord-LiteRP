// Dati live per il sito (GET /site/live): membri e online Discord, giocatori in città,
// staff in servizio (online su Discord) e obiettivo community (/sito obiettivo).
const { EmbedBuilder } = require('discord.js');
const db = require('../utils/db');
const fivem = require('./fivem');
const site = require('./site');
const siteStaff = require('./siteStaff');
const { COLORS, FOOTER } = require('../utils/embeds');

const COUNTS_TTL = 60 * 1000;
const ONLINE = new Set(['online', 'idle', 'dnd']);

let client = null;
let counts = { guildId: null, online: null, at: 0 }; // online approssimati (stesso numero dell'invito Discord)

/** Membri online secondo Discord (non serve l'intent presenze). Cache di 1 minuto. */
async function approximateOnline(guild) {
  if (counts.guildId === guild.id && Date.now() - counts.at < COUNTS_TTL) return counts.online;
  const fresh = await client.guilds.fetch({ guild: guild.id, withCounts: true, force: true }).catch(() => null);
  counts = { guildId: guild.id, online: fresh?.approximatePresenceCount ?? null, at: Date.now() };
  return counts.online;
}

/** Stato del server FiveM: "soon" finché il bot non ha modo di leggerlo (server non ancora lanciato). */
function city(guild, gcfg) {
  if (!fivem.hasSource(gcfg)) return { status: 'soon', players: 0, maxPlayers: 0 };
  const stats = fivem.getLatest(guild.id);
  if (!stats?.online) return { status: 'offline', players: 0, maxPlayers: stats?.maxPlayers ?? 0 };
  return { status: 'online', players: stats.players, maxPlayers: stats.maxPlayers };
}

/**
 * Gruppo staff di un membro: i gruppi della pagina Staff (/sito staff) se ci sono,
 * altrimenti i ruoli di /impostazioni staff. rank più basso = più importante.
 */
function staffGroupOf(member, staffRoles) {
  if (siteStaff.groups().length) {
    const group = siteStaff.groupOf(member);
    return group && { role: group.role, name: group.name, rank: group.index };
  }
  const role = member.roles.cache.filter((r) => staffRoles.has(r.id)).sort((a, b) => b.position - a.position).first();
  return role && { role, name: role.name, rank: -role.position };
}

/** Staff online su Discord, ordinato per ruolo. null (riquadro nascosto) se mancano presenze o ruoli staff. */
function staffOnDuty(guild, gcfg) {
  if (!site.hasPresences()) return null;
  const staffRoles = new Set(gcfg?.staffRoles ?? []);
  if (!staffRoles.size && !siteStaff.groups().length) return null;

  const list = [];
  for (const member of guild.members.cache.values()) {
    const status = member.presence?.status;
    if (member.user.bot || !ONLINE.has(status)) continue;
    const group = staffGroupOf(member, staffRoles);
    if (!group) continue;
    list.push({
      id: member.id,
      name: member.displayName,
      avatar: member.displayAvatarURL({ size: 128, extension: 'webp' }),
      role: group.name,
      color: group.role.color ? group.role.hexColor : null,
      rank: group.rank,
      status,
    });
  }
  return list
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'it'))
    .map(({ rank, ...m }) => m);
}

function goalInfo(guild) {
  const goal = db.getSite().goal;
  if (!goal) return null;
  return { target: goal.target, label: goal.label, current: guild.memberCount, reached: Boolean(goal.reachedAt) };
}

/** Controlla l'obiettivo community e lo annuncia quando viene raggiunto. Da chiamare quando cambiano i membri. */
async function checkGoal(guild) {
  const goal = db.getSite().goal;
  if (!goal || goal.reachedAt || site.siteGuild()?.id !== guild.id || guild.memberCount < goal.target) return;
  goal.reachedAt = Date.now();
  db.save();
  site.notify('live');

  const channel = goal.channelId ? guild.channels.cache.get(goal.channelId) : null;
  if (!channel?.isTextBased()) return;
  const embed = new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle('🎉 Obiettivo raggiunto!')
    .setDescription(`Siamo **${goal.target.toLocaleString('it-IT')} ${goal.label}**! Grazie a tutti per far crescere ${guild.name} 💙`)
    .setFooter(FOOTER)
    .setTimestamp();
  await channel.send({ embeds: [embed] }).catch((e) => console.error('[Sito] Annuncio obiettivo fallito:', e.message));
}

/** Scarica tutti i membri (e la loro presenza), così pagina Staff e staff online sono completi fin da subito. */
function loadMembers(guild) {
  if (!guild) return;
  guild.members.fetch({ withPresences: site.hasPresences() })
    .then(() => siteStaff.changed())
    .catch((e) => console.error('[Sito] Caricamento membri fallito:', e.message));
}

function start(discordClient) {
  client = discordClient;
  site.siteRoute('/site/live', async () => {
    const guild = site.siteGuild();
    if (!guild) return { discord: null, city: null, staff: null, goal: null, updatedAt: new Date().toISOString() };
    const gcfg = db.peekGuild(guild.id);
    return {
      discord: { members: guild.memberCount, online: await approximateOnline(guild) },
      city: city(guild, gcfg),
      staff: staffOnDuty(guild, gcfg),
      goal: goalInfo(guild),
      updatedAt: new Date().toISOString(),
    };
  });
  loadMembers(site.siteGuild());
}

module.exports = { start, checkGoal, loadMembers };
