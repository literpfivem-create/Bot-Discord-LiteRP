const { PermissionFlagsBits } = require('discord.js');

const isAdmin = (member) => member.permissions.has(PermissionFlagsBits.Administrator);
const hasAnyRole = (member, roleIds = []) => roleIds.some((id) => member.roles.cache.has(id));

/** Staff generale: amministratori o membri con un ruolo staff configurato. */
const isStaff = (member, gcfg) => isAdmin(member) || hasAnyRole(member, gcfg.staffRoles);

/** Ruoli che gestiscono una categoria di ticket: quelli specifici della categoria, altrimenti i ruoli staff. */
const ticketRolesOf = (gcfg, categoryKey) =>
  gcfg.ticketRoles[categoryKey]?.length ? gcfg.ticketRoles[categoryKey] : gcfg.staffRoles;

/** Può gestire i ticket di una determinata categoria. */
const canManageTicket = (member, gcfg, categoryKey) => isAdmin(member) || hasAnyRole(member, ticketRolesOf(gcfg, categoryKey));

module.exports = { isAdmin, hasAnyRole, isStaff, ticketRolesOf, canManageTicket };
