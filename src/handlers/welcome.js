const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const db = require('../utils/db');
const { COLORS } = require('../utils/embeds');
const { renderWelcomeCard } = require('../utils/welcomeCard');

/** Segnaposto: {user} {username} {nome} {server} {count} — "\n" per andare a capo */
function format(text, member) {
  return String(text)
    .replaceAll('{user}', `${member}`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{nome}', member.displayName)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{count}', member.guild.memberCount.toLocaleString('it-IT'))
    .replaceAll('\\n', '\n');
}

async function giveAutoroles(member, gcfg) {
  const ids = member.user.bot ? gcfg.autorolesBots : gcfg.autoroles;
  const blocked = ids.map((id) => member.guild.roles.cache.get(id)).filter((r) => r && !r.editable);
  if (blocked.length) {
    console.warn(`[Autorole] Il bot non può assegnare ${blocked.map((r) => r.name).join(', ')}: sposta il ruolo del bot più in alto.`);
  }
  const roles = ids.map((id) => member.guild.roles.cache.get(id)).filter((r) => r?.editable && !member.roles.cache.has(r.id));
  if (!roles.length) return 0;
  await member.roles.add(roles, 'Autorole LiteRP').catch((err) => console.error('[Autorole] Errore:', err.message));
  return roles.length;
}

/** Messaggio di benvenuto nel canale: immagine "BENVENUTO <nome> dentro LiteRP" + embed con il logo del server. */
async function buildWelcome(member, gcfg) {
  const w = gcfg.welcome;
  const color = w.color ?? COLORS.primary;
  const serverName = gcfg.fivem.name || member.guild.name;
  const icon = member.guild.iconURL({ size: 256 }) ?? undefined;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: `${member.guild.name} • Nuovo cittadino`, iconURL: icon })
    .setDescription(format(w.message, member))
    .setFooter({ text: `Sei il membro #${member.guild.memberCount.toLocaleString('it-IT')}`, iconURL: icon })
    .setTimestamp();
  if (icon) embed.setThumbnail(icon);

  const files = [];
  if (w.card) {
    const png = await renderWelcomeCard(member, {
      accent: color,
      background: w.background,
      title: w.title,
      subtitle: (w.subtitle || 'dentro {server}').replaceAll('{server}', serverName),
      highlight: serverName,
      count: member.guild.memberCount,
    }).catch((err) => {
      console.error('[Benvenuto] Errore creazione immagine:', err.message);
      return null;
    });
    if (png) {
      files.push(new AttachmentBuilder(png, { name: 'benvenuto.png' }));
      embed.setImage('attachment://benvenuto.png');
    }
  }
  // Senza immagine (disattivata o non disponibile) mostra almeno la foto profilo
  if (!files.length) embed.setThumbnail(member.user.displayAvatarURL({ size: 256 }));

  return {
    content: `👋 Benvenuto ${member}!`,
    embeds: [embed],
    files,
    allowedMentions: { users: [member.id] },
  };
}

function buildWelcomeDm(member, gcfg) {
  const embed = new EmbedBuilder()
    .setColor(gcfg.welcome.color ?? COLORS.primary)
    .setTitle(`👋 Benvenuto su ${member.guild.name}`)
    .setDescription(format(gcfg.welcome.dmMessage, member))
    .setThumbnail(member.guild.iconURL({ size: 256 }))
    .setTimestamp();
  return { embeds: [embed] };
}

function buildGoodbye(member, gcfg) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.danger)
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
    .setDescription(`📤 ${format(gcfg.goodbye.message, member)}`)
    .setTimestamp();
  return { embeds: [embed], allowedMentions: { parse: [] } };
}

async function onJoin(member) {
  const gcfg = db.peekGuild(member.guild.id);
  if (!gcfg) return;

  // Ruoli subito all'ingresso, anche se il membro non ha ancora accettato le regole (screening):
  // su LiteRP la maggior parte dei membri resta "in attesa" per sempre e non riceverebbe mai il ruolo.
  await giveAutoroles(member, gcfg);
  if (member.user.bot) return;

  if (gcfg.welcome.enabled) {
    const channel = member.guild.channels.cache.get(gcfg.channels.welcome);
    if (channel?.isTextBased()) await channel.send(await buildWelcome(member, gcfg)).catch((e) => console.error('[Benvenuto]', e.message));
  }
  if (gcfg.welcome.dm) await member.send(buildWelcomeDm(member, gcfg)).catch(() => {}); // DM chiusi
}

async function onUpdate(oldMember, newMember) {
  if (!oldMember.pending || newMember.pending) return;
  const gcfg = db.peekGuild(newMember.guild.id);
  if (gcfg) await giveAutoroles(newMember, gcfg);
}

async function onLeave(member) {
  const gcfg = db.peekGuild(member.guild.id);
  if (!gcfg || !gcfg.goodbye.enabled || member.user.bot) return;
  const channel = member.guild.channels.cache.get(gcfg.channels.goodbye || gcfg.channels.welcome);
  if (!channel?.isTextBased()) return;
  await channel.send(buildGoodbye(member, gcfg)).catch((e) => console.error('[Addio]', e.message));
}

module.exports = { onJoin, onUpdate, onLeave, buildWelcome, buildWelcomeDm, buildGoodbye, giveAutoroles };
