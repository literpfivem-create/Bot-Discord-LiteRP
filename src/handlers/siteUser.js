// Profilo del sito (GET /site/user/:id): il sito lo chiede solo per l'utente che ha fatto l'accesso con Discord,
// con l'ID preso dalla sua sessione firmata. Nessuna cache: ruoli, whitelist e dati FiveM sono sempre quelli di adesso.
const api = require('../api/server');
const db = require('../utils/db');
const site = require('./site');
const siteStaff = require('./siteStaff');
const fivemPlayers = require('./fivemPlayers');

const SNOWFLAKE = /^\d{17,20}$/;
const UNKNOWN = new Set([10007, 10013]); // Unknown Member, Unknown User

/** Membro del server collegato, oppure null se non è nel server. */
async function findMember(guild, id) {
  try {
    return await guild.members.fetch(id);
  } catch (err) {
    if (UNKNOWN.has(err.code)) return null;
    throw err;
  }
}

function profile(member) {
  const { whitelistRoleId } = db.getSite();
  const roles = member.roles.cache
    .filter((r) => r.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name, color: r.color ? r.hexColor : null }));
  return {
    name: member.displayName,
    avatar: member.displayAvatarURL({ size: 256, extension: 'webp' }),
    joinedAt: member.joinedAt?.toISOString() ?? null,
    roles,
    staff: siteStaff.groupOf(member)?.name ?? null,
    whitelist: {
      configured: Boolean(whitelistRoleId && member.guild.roles.cache.has(whitelistRoleId)),
      has: Boolean(whitelistRoleId && member.roles.cache.has(whitelistRoleId)),
    },
  };
}

function start() {
  site.siteRoute('/site/user/:id', async ({ params }) => {
    if (!SNOWFLAKE.test(params.id)) throw new api.HttpError(400, 'ID non valido');
    const guild = site.siteGuild();
    if (!guild) throw new api.HttpError(503, 'nessun server collegato (/sito collega)');
    const member = await findMember(guild, params.id);
    return {
      guild: { name: guild.name, icon: guild.iconURL({ size: 128, extension: 'webp' }) },
      inGuild: Boolean(member),
      member: member ? profile(member) : null,
      // dati in città: null se non è mai entrato (o il server FiveM non è ancora collegato)
      fivem: fivemPlayers.profile(params.id),
      fivemConnected: fivemPlayers.serverActive(),
    };
  });
}

module.exports = { start };
