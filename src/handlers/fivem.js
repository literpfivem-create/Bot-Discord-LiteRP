// Integrazione FiveM:
//  - API HTTP che riceve dalla risorsa "literp_discord": statistiche, ban, revoche, eventi txAdmin (warn, kick, annunci, riavvii, connessioni)
//  - Fallback: interroga direttamente il server FiveM (dynamic.json / players.json) per il numero di player
//  - Aggiorna ogni minuto l'embed stato server, i canali contatore (server stats), il record player e lo stato del bot
const { ActionRowBuilder, ActivityType, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const api = require('../api/server');
const db = require('../utils/db');
const { COLORS, FOOTER, sendLog } = require('../utils/embeds');
const { todayKey, unix } = require('../utils/time');
const serverStats = require('./serverStats');

const UPDATE_INTERVAL = 60 * 1000;
const PUSH_TTL = 90 * 1000; // dati della risorsa considerati validi per 90s
const OFFLINE_CONFIRMATIONS = 2; // letture "offline" consecutive prima di avvisare

let pushed = null; // { players, maxPlayers, staff: [{name, id, discord}], list: [{id, name}], receivedAt }
const statusState = new Map(); // guildId -> { online, offlineCount, alertId }
const restartAlerts = new Map(); // guildId -> messageId
let updating = false;

// ---------------------------------------------------------------- lettura stato

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function pollServer(ip) {
  const base = /^https?:\/\//i.test(ip) ? ip.replace(/\/$/, '') : `http://${ip}`;
  try {
    const d = await fetchJson(`${base}/dynamic.json`);
    return { online: true, players: Number(d.clients) || 0, maxPlayers: Number(d.sv_maxclients) || 0, staff: null, list: null };
  } catch { /* prova players.json */ }
  try {
    const [players, info] = await Promise.all([fetchJson(`${base}/players.json`), fetchJson(`${base}/info.json`).catch(() => ({}))]);
    return {
      online: true,
      players: players.length,
      maxPlayers: Number(info?.vars?.sv_maxClients) || 0,
      staff: null,
      list: players.map((p) => ({ id: p.id, name: p.name })),
    };
  } catch {
    return { online: false };
  }
}

async function getStats(gcfg) {
  if (pushed && Date.now() - pushed.receivedAt < PUSH_TTL) return { online: true, ...pushed };
  if (gcfg.fivem.ip) return pollServer(gcfg.fivem.ip);
  return { online: false };
}

// ---------------------------------------------------------------- embed stato

function progressBar(value, max, size = 16) {
  if (!max) return '';
  const filled = Math.round(Math.min(value / max, 1) * size);
  return `\`${'█'.repeat(filled)}${'░'.repeat(size - filled)}\` ${Math.round((value / max) * 100)}%`;
}

function connectUrl(gcfg) {
  const c = gcfg.fivem.connect;
  if (/^https?:\/\//i.test(c || '')) return c;
  if (/^cfx\.re\/join\//i.test(c || '')) return `https://${c}`;
  return null; // un IP non è un link valido per un pulsante
}

function connectRow(gcfg) {
  const url = connectUrl(gcfg);
  return url
    ? [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Entra in città').setEmoji('🎮').setStyle(ButtonStyle.Link).setURL(url))]
    : [];
}

function buildStatus(gcfg, stats) {
  const name = gcfg.fivem.name || 'LiteRP';
  const peak = gcfg.fivem.peak;
  const embed = new EmbedBuilder().setTitle(`🎮 ${name} • Stato del server`).setFooter({ text: `${FOOTER.text} • Aggiornamento ogni minuto` }).setTimestamp();

  if (!stats.online) {
    embed.setColor(COLORS.danger).setDescription('🔴 **Offline**\nIl server è attualmente offline o in riavvio.');
  } else {
    const staffCount = Array.isArray(stats.staff) ? stats.staff.length : null;
    embed
      .setColor(COLORS.success)
      .setDescription(`🟢 **Online**\n${progressBar(stats.players, stats.maxPlayers)}`)
      .addFields(
        { name: '👥 Giocatori', value: `**${stats.players}/${stats.maxPlayers || '?'}**`, inline: true },
        { name: '🛡️ Staff online', value: staffCount === null ? 'N/D' : `**${staffCount}**`, inline: true },
      );
    if (staffCount) {
      const names = stats.staff.map((s) => (s.discord ? `<@${s.discord}>` : `\`${s.name}\``)).join(', ');
      embed.addFields({ name: '📋 Staff in città', value: names.slice(0, 1024) });
    }
  }
  if (peak.today.date === todayKey() || peak.allTime.value) {
    embed.addFields({
      name: '🏆 Record player',
      value: `Oggi: **${peak.today.date === todayKey() ? peak.today.value : 0}** • Di sempre: **${peak.allTime.value}**${peak.allTime.date ? ` (<t:${unix(peak.allTime.date)}:d>)` : ''}`,
    });
  }
  if (gcfg.fivem.connect) embed.addFields({ name: '🔗 Connettiti', value: `\`connect ${gcfg.fivem.connect}\`` });

  return { embeds: [embed], components: connectRow(gcfg) };
}

// ---------------------------------------------------------------- aggiornamento

function updatePeak(gcfg, stats) {
  if (!stats.online) return;
  const peak = gcfg.fivem.peak;
  const today = todayKey();
  let changed = false;
  if (peak.today.date !== today) {
    peak.today = { value: 0, date: today };
    changed = true;
  }
  if (stats.players > peak.today.value) {
    peak.today.value = stats.players;
    changed = true;
  }
  if (stats.players > peak.allTime.value) {
    peak.allTime = { value: stats.players, date: Date.now() };
    changed = true;
  }
  if (changed) db.save();
}

/** Avvisa nel canale stato-server quando il server va offline o torna online. */
async function handleStatusChange(guild, gcfg, stats) {
  const state = statusState.get(guild.id) || { online: null, offlineCount: 0, alertId: null };
  statusState.set(guild.id, state);
  if (stats.online) state.offlineCount = 0;
  else state.offlineCount++;

  const confirmedOnline = stats.online;
  const confirmedOffline = !stats.online && state.offlineCount >= OFFLINE_CONFIRMATIONS;
  if (state.online === null) {
    // primo controllo dopo l'avvio del bot: nessun avviso
    if (confirmedOnline || confirmedOffline) state.online = confirmedOnline;
    return;
  }
  if (!(confirmedOnline && !state.online) && !(confirmedOffline && state.online)) return;
  state.online = confirmedOnline;
  if (!gcfg.fivem.statusAlerts) return;

  const channel = guild.channels.cache.get(gcfg.channels.serverStatus);
  if (!channel?.isTextBased()) return;
  if (state.alertId) await channel.messages.delete(state.alertId).catch(() => {});
  const embed = confirmedOnline
    ? new EmbedBuilder().setColor(COLORS.success).setDescription(`🟢 **${gcfg.fivem.name} è di nuovo online!** Buon RP a tutti 🎉`).setTimestamp()
    : new EmbedBuilder().setColor(COLORS.danger).setDescription(`🔴 **${gcfg.fivem.name} è offline** o in riavvio. Vi avviseremo appena torna online.`).setTimestamp();
  const msg = await channel.send({ embeds: [embed], components: confirmedOnline ? connectRow(gcfg) : [] }).catch(() => null);
  state.alertId = msg?.id ?? null;
  // Gli avvisi "online" spariscono dopo 30 minuti per non intasare il canale
  if (msg && confirmedOnline) {
    setTimeout(() => {
      msg.delete().catch(() => {});
      if (state.alertId === msg.id) state.alertId = null;
    }, 30 * 60 * 1000);
  }
}

async function updateGuild(client, guild) {
  const gcfg = db.peekGuild(guild.id);
  if (!gcfg) return null;
  const stats = await getStats(gcfg);
  updatePeak(gcfg, stats);

  const channel = guild.channels.cache.get(gcfg.channels.serverStatus);
  if (channel?.isTextBased()) {
    const payload = buildStatus(gcfg, stats);
    const msg = gcfg.statusMessageId ? await channel.messages.fetch(gcfg.statusMessageId).catch(() => null) : null;
    if (msg) {
      await msg.edit(payload).catch((e) => console.error('[Stats] Modifica messaggio fallita:', e.message));
    } else {
      const sent = await channel.send(payload).catch((e) => console.error('[Stats] Invio messaggio fallito:', e.message));
      if (sent) {
        gcfg.statusMessageId = sent.id;
        db.save();
      }
    }
  }

  await serverStats.refreshGuild(guild, stats);
  await handleStatusChange(guild, gcfg, stats);
  return { gcfg, stats };
}

async function updateAll(client) {
  if (updating) return;
  updating = true;
  try {
    let presence = null;
    for (const guild of client.guilds.cache.values()) {
      const res = await updateGuild(client, guild).catch((e) => console.error('[Stats]', e));
      if (res?.gcfg.fivem.botPresence && !presence) presence = res.stats;
    }
    if (presence) {
      client.user.setActivity(
        presence.online ? `🎮 ${presence.players}/${presence.maxPlayers || '?'} in città` : '🔴 Server offline',
        { type: ActivityType.Custom },
      );
    }
  } finally {
    updating = false;
  }
}

// ---------------------------------------------------------------- ban e azioni txAdmin

function formatBanDuration(data) {
  const exp = Number(data.expiration);
  if (data.duration && !/perm/i.test(String(data.duration))) {
    return exp > 0 ? `${data.duration} (scade <t:${Math.floor(exp)}:R>)` : String(data.duration);
  }
  if (exp > 0) return `Fino al <t:${Math.floor(exp)}:f> (<t:${Math.floor(exp)}:R>)`;
  return '♾️ Permanente';
}

const validDiscordId = (id) => (/^\d{15,21}$/.test(String(id || '')) ? String(id) : null);

/** Esegue fn(guild, gcfg) per ogni server configurato. */
async function forEachGuild(client, fn) {
  for (const guild of client.guilds.cache.values()) {
    const gcfg = db.peekGuild(guild.id);
    if (gcfg) await fn(guild, gcfg).catch((e) => console.error('[FiveM]', e.message));
  }
}

async function announceBan(client, data) {
  const discordId = validDiscordId(data.discord);
  const user = discordId ? await client.users.fetch(discordId).catch(() => null) : null;
  const duration = formatBanDuration(data);
  const reason = String(data.reason || 'Nessun motivo specificato').slice(0, 1024);
  let dmSent = false;

  await forEachGuild(client, async (guild, gcfg) => {
    const embed = new EmbedBuilder()
      .setColor(COLORS.danger)
      .setTitle('🔨 Giocatore bannato dalla città')
      .addFields(
        { name: '👤 Giocatore', value: String(data.name || 'Sconosciuto').slice(0, 256), inline: true },
        { name: '💬 Discord', value: discordId ? `<@${discordId}>` : 'Non collegato', inline: true },
        { name: '⏳ Durata', value: duration, inline: true },
        { name: '📝 Motivo', value: reason },
      )
      .setFooter({ text: `${gcfg.fivem.name || 'LiteRP'} • Sistema ban${data.source ? ` (${data.source})` : ''}` })
      .setTimestamp();
    if (gcfg.fivem.showBanAuthor && data.author) embed.addFields({ name: '👮 Staff', value: String(data.author).slice(0, 256), inline: true });
    if (data.banId) embed.addFields({ name: '🔖 ID Ban', value: `\`${String(data.banId).slice(0, 100)}\``, inline: true });
    if (user) embed.setThumbnail(user.displayAvatarURL({ size: 256 }));
    await sendLog(guild, gcfg.channels.fivemBans, { embeds: [embed], allowedMentions: { parse: [] } });

    // DM al giocatore bannato (una sola volta)
    if (user && gcfg.fivem.dmBan && !dmSent) {
      dmSent = true;
      const dm = new EmbedBuilder()
        .setColor(COLORS.danger)
        .setTitle(`🔨 Sei stato bannato da ${gcfg.fivem.name || 'LiteRP'}`)
        .addFields(
          { name: '📝 Motivo', value: reason },
          { name: '⏳ Durata', value: duration },
          ...(data.banId ? [{ name: '🔖 ID Ban', value: `\`${String(data.banId).slice(0, 100)}\`` }] : []),
        )
        .setDescription(`Se ritieni che il ban sia ingiusto puoi fare ricorso aprendo un **⚫ Ticket Anticheat** nel server Discord **${guild.name}**, indicando l'ID ban.`)
        .setFooter(FOOTER)
        .setTimestamp();
      await user.send({ embeds: [dm] }).catch(() => {});
    }
  });
}

async function announceRevoke(client, data) {
  const discordId = validDiscordId(data.discord);
  const isBan = data.actionType !== 'warn';
  await forEachGuild(client, async (guild, gcfg) => {
    const embed = new EmbedBuilder()
      .setColor(COLORS.success)
      .setTitle(isBan ? '🔓 Ban revocato' : '🧹 Avvertimento revocato')
      .addFields(
        { name: '👤 Giocatore', value: String(data.name || 'Sconosciuto').slice(0, 256), inline: true },
        { name: '💬 Discord', value: discordId ? `<@${discordId}>` : 'Non collegato', inline: true },
        ...(data.actionId ? [{ name: '🔖 ID', value: `\`${String(data.actionId).slice(0, 100)}\``, inline: true }] : []),
        ...(data.reason ? [{ name: '📝 Motivo originale', value: String(data.reason).slice(0, 1024) }] : []),
      )
      .setTimestamp();
    if (gcfg.fivem.showBanAuthor && data.revokedBy) embed.addFields({ name: '👮 Revocato da', value: String(data.revokedBy).slice(0, 256), inline: true });
    // I ban revocati vanno nel canale pubblico dei ban, i warn nel log staff
    await sendLog(guild, isBan ? gcfg.channels.fivemBans : gcfg.channels.fivemLogs, { embeds: [embed], allowedMentions: { parse: [] } });
  });
}

const EVENT_STYLE = {
  warn: { title: '⚠️ Avvertimento in game', color: COLORS.warning },
  kick: { title: '👢 Giocatore espulso dal server', color: 0xe74c3c },
  announcement: { title: '📢 Annuncio staff (txAdmin)', color: COLORS.info },
  connect: { title: '🟢 Giocatore connesso', color: COLORS.success },
  disconnect: { title: '🔴 Giocatore disconnesso', color: COLORS.dark },
};

async function handleEvent(client, data) {
  const type = String(data.type || '');

  if (type === 'restart' || type === 'shutdown') {
    const text =
      type === 'restart'
        ? `🔄 **Riavvio programmato del server tra ${Math.max(1, Math.round(Number(data.seconds || 0) / 60))} minuti.** Mettete al sicuro i vostri veicoli e oggetti!`
        : '⏹️ **Il server si sta spegnendo/riavviando ora.**';
    await forEachGuild(client, async (guild, gcfg) => {
      const channel = guild.channels.cache.get(gcfg.channels.serverStatus);
      if (!channel?.isTextBased()) return;
      const prev = restartAlerts.get(guild.id);
      if (prev) await channel.messages.delete(prev).catch(() => {});
      const msg = await channel.send({ embeds: [new EmbedBuilder().setColor(COLORS.warning).setDescription(text).setTimestamp()] }).catch(() => null);
      if (!msg) return;
      restartAlerts.set(guild.id, msg.id);
      setTimeout(() => msg.delete().catch(() => {}), 20 * 60 * 1000);
    });
    return;
  }

  const style = EVENT_STYLE[type];
  if (!style) throw new Error(`Tipo evento sconosciuto: ${type}`);
  const discordId = validDiscordId(data.discord);
  await forEachGuild(client, async (guild, gcfg) => {
    const embed = new EmbedBuilder().setColor(style.color).setTitle(style.title).setTimestamp();
    if (data.name) embed.addFields({ name: '👤 Giocatore', value: String(data.name).slice(0, 256), inline: true });
    if (data.id) embed.addFields({ name: '🆔 ID server', value: String(data.id), inline: true });
    if (discordId) embed.addFields({ name: '💬 Discord', value: `<@${discordId}>`, inline: true });
    if (data.author) embed.addFields({ name: '👮 Staff', value: String(data.author).slice(0, 256), inline: true });
    if (data.reason) embed.addFields({ name: type === 'announcement' ? '💬 Messaggio' : '📝 Motivo', value: String(data.reason).slice(0, 1024) });
    await sendLog(guild, gcfg.channels.fivemLogs, { embeds: [embed], allowedMentions: { parse: [] } });
  });
}

// ---------------------------------------------------------------- API HTTP (rotte della risorsa FiveM)

function registerApi(client) {
  api.route('POST', '/api/stats', 'API_SECRET', ({ body: data }) => {
    pushed = {
      players: Number(data.players) || 0,
      maxPlayers: Number(data.maxPlayers) || 0,
      staff: Array.isArray(data.staff) ? data.staff.slice(0, 200) : [],
      list: Array.isArray(data.list) ? data.list.slice(0, 2048) : null,
      receivedAt: Date.now(),
    };
  });
  api.route('POST', '/api/ban', 'API_SECRET', ({ body }) => announceBan(client, body));
  api.route('POST', '/api/revoke', 'API_SECRET', ({ body }) => announceRevoke(client, body));
  api.route('POST', '/api/event', 'API_SECRET', ({ body }) => handleEvent(client, body));
}

function start(client) {
  if (!api.secretOf('API_SECRET')) {
    console.warn('⚠️  API_SECRET non impostata nel file .env: la risorsa FiveM non può inviare dati (ban automatici e staff online non funzioneranno).');
  }
  registerApi(client);
  updateAll(client);
  setInterval(() => updateAll(client), UPDATE_INTERVAL);
}

module.exports = { start, getStats, buildStatus, updateGuild, announceBan };
