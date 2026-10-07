const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/db');
const { findBadWord } = require('../utils/badwords');
const { COLORS, sendLog } = require('../utils/embeds');
const { isStaff } = require('../utils/permissions');
const { unix } = require('../utils/time');

// anche con spazi o punti travestiti: "discord . gg / abc", "discord,gg/abc", "dsc.gg/abc"
const INVITE_RE = /(discord\s*[.,]\s*(gg|io|me|li)|discord(app)?\s*\.\s*com\s*\/\s*invite|dsc\s*\.\s*gg)\s*[/\\]\s*[\w-]+/i;
const URL_RE = /https?:\/\/[^\s<]+/gi;
const STRIKE_WINDOW = 10 * 60 * 1000; // gli avvisi automod scadono dopo 10 minuti
const DUPLICATE_WINDOW = 30 * 1000;
const DUPLICATE_COUNT = 3;
const RAID_ALERT_COOLDOWN = 5 * 60 * 1000;

const spamTracker = new Map(); // guild:user -> [timestamp]
const duplicateTracker = new Map(); // guild:user -> [{ content, ts }]
const strikes = new Map(); // guild:user -> [timestamp]
const joinTracker = new Map(); // guild -> [timestamp]
const lastRaidAlert = new Map(); // guild -> timestamp

function isWhitelisted(url, domains) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return domains.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

function checkSpam(key, am) {
  const now = Date.now();
  const list = (spamTracker.get(key) || []).filter((t) => now - t < am.spamSeconds * 1000);
  list.push(now);
  spamTracker.set(key, list);
  if (list.length >= am.spamMessages) {
    spamTracker.delete(key);
    return true;
  }
  return false;
}

function checkDuplicate(key, content) {
  const text = content.trim().toLowerCase();
  if (text.length < 3) return false;
  const now = Date.now();
  const list = (duplicateTracker.get(key) || []).filter((m) => now - m.ts < DUPLICATE_WINDOW);
  list.push({ content: text, ts: now });
  duplicateTracker.set(key, list);
  if (list.filter((m) => m.content === text).length >= DUPLICATE_COUNT) {
    duplicateTracker.delete(key);
    return true;
  }
  return false;
}

/** Testi controllati: contenuto del messaggio + eventuali messaggi inoltrati. */
function collectTexts(message) {
  const texts = [message.content || ''];
  for (const snap of message.messageSnapshots?.values() ?? []) if (snap.content) texts.push(snap.content);
  return texts;
}

/**
 * Controlla un messaggio nuovo o modificato.
 * Le parole vietate valgono anche per lo staff (salvo `badWords.exemptStaff`); gli altri filtri no.
 */
async function onMessage(message, { edited = false } = {}) {
  if (!message.guild || !message.author || message.author.bot || message.webhookId || message.system) return;
  const gcfg = db.peekGuild(message.guild.id);
  if (!gcfg || !gcfg.automod.enabled) return;

  const am = gcfg.automod;
  const channel = message.channel;
  const ignored = [message.channelId, channel?.parentId, channel?.parent?.parentId]; // canale, categoria (o canale del thread), categoria del thread
  if (ignored.some((id) => id && am.ignoredChannels.includes(id))) return;

  const member = message.member ?? (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) return;
  if (member.roles.cache.some((r) => am.ignoredRoles.includes(r.id))) return;
  const staff = isStaff(member, gcfg);

  const texts = collectTexts(message);
  const content = texts.join('\n');
  const key = `${message.guild.id}:${message.author.id}`;
  let violation = null;

  if (am.badWords.enabled && am.badWords.list.length && !(staff && am.badWords.exemptStaff)) {
    const word = findBadWord(texts, am.badWords.list);
    if (word) violation = { type: 'Parola vietata', detail: 'Il messaggio conteneva una parola vietata.', logDetail: `Parola trovata: ||${word}||` };
  }

  if (!violation && !staff) {
    const inTicket = !!db.getTicket(message.channelId); // nei ticket i link (prove/clip) sono consentiti
    if (am.antiInvite && !inTicket && INVITE_RE.test(content)) {
      violation = { type: 'Invito Discord', detail: 'Non è consentito pubblicizzare altri server.' };
    }
    if (!violation && am.antiLink && !inTicket) {
      const links = content.match(URL_RE) || [];
      if (links.some((l) => !isWhitelisted(l, am.whitelistDomains))) violation = { type: 'Link non autorizzato', detail: 'Non è consentito inviare link.' };
    }
    if (!violation && am.antiMention) {
      const count = message.mentions.users.size + message.mentions.roles.size + (message.mentions.everyone ? 1 : 0);
      if (count >= am.maxMentions) violation = { type: 'Menzioni di massa', detail: `${count} menzioni in un messaggio.` };
    }
    if (!violation && am.antiCaps && content.length >= 15) {
      const letters = content.replace(/[^a-zA-Z]/g, '');
      const upper = letters.replace(/[^A-Z]/g, '').length;
      if (letters.length >= 10 && upper / letters.length >= 0.7) violation = { type: 'Troppe maiuscole', detail: 'Evita di scrivere tutto in maiuscolo.' };
    }
    // spam e messaggi ripetuti contano solo i messaggi nuovi, non le modifiche
    if (!violation && !edited && am.antiSpam && checkSpam(key, am)) {
      violation = { type: 'Spam', detail: `${am.spamMessages} messaggi in ${am.spamSeconds} secondi.`, forceTimeout: true };
    }
    if (!violation && !edited && am.antiDuplicate && checkDuplicate(key, content)) {
      violation = { type: 'Messaggi ripetuti', detail: 'Hai inviato lo stesso messaggio più volte.' };
    }
  }

  if (violation) await punish(message, member, gcfg, violation, { key, staff, edited });
}

/** Messaggio modificato: ricontrolla il nuovo testo (evita il trucco "scrivo normale e poi modifico"). */
async function onEdit(oldMessage, newMessage) {
  if (!newMessage.guild) return;
  if (!oldMessage.partial && oldMessage.content === newMessage.content) return; // es. anteprima link caricata
  if (newMessage.partial) newMessage = await newMessage.fetch().catch(() => null);
  if (newMessage) await onMessage(newMessage, { edited: true });
}

async function punish(message, member, gcfg, violation, { key, staff, edited }) {
  const am = gcfg.automod;
  const { channel, author, guild } = message;
  const problems = [];

  // 1. Eliminazione: se fallisce lo scriviamo nel log invece di ignorarlo
  const deleted = await message
    .delete()
    .then(() => true)
    .catch((err) => {
      if (err.code === 10008) return true; // già eliminato
      const canManage = channel.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.ManageMessages);
      problems.push(canManage ? `Eliminazione fallita: ${err.message}` : `Non posso eliminare messaggi in ${channel}: manca il permesso **Gestisci messaggi**.`);
      console.error(`[AutoMod] Eliminazione fallita in #${channel.name}:`, err.message);
      return false;
    });

  if (violation.type === 'Spam') {
    // Elimina anche gli ultimi messaggi di spam dell'utente
    const recent = await channel.messages.fetch({ limit: 30 }).catch(() => null);
    const toDelete = recent?.filter((m) => m.author.id === author.id && Date.now() - m.createdTimestamp < 30_000);
    if (toDelete?.size) await channel.bulkDelete(toDelete, true).catch(() => {});
  }

  // 2. Sanzione (lo staff non riceve avvisi né timeout, viene solo eliminato e registrato)
  let action = deleted ? 'Messaggio eliminato' : '⚠️ Messaggio NON eliminato';
  if (staff) {
    action += ' • Membro dello staff: nessuna sanzione';
  } else {
    const now = Date.now();
    const list = (strikes.get(key) || []).filter((t) => now - t < STRIKE_WINDOW);
    list.push(now);
    strikes.set(key, list);
    action += ` • Avviso ${list.length}/${am.warnThreshold}`;

    if (violation.forceTimeout || list.length >= am.warnThreshold) {
      strikes.delete(key);
      if (!member.moderatable) {
        problems.push('Timeout non applicato: l’utente ha un ruolo più alto del bot o il bot non ha il permesso **Metti in timeout i membri**.');
      } else {
        await member
          .timeout(am.timeoutMinutes * 60 * 1000, `AutoMod: ${violation.type}`)
          .then(() => { action = `${deleted ? 'Messaggio eliminato' : '⚠️ Messaggio NON eliminato'} • Timeout di ${am.timeoutMinutes} minuti`; })
          .catch((err) => problems.push(`Timeout fallito: ${err.message}`));
      }
    }
  }

  // 3. Avviso temporaneo nel canale (senza ripetere la parola vietata)
  const warn = await channel
    .send({
      content: `${author}`,
      embeds: [new EmbedBuilder().setColor(COLORS.warning).setDescription(`⚠️ **${violation.type}** — ${violation.detail}\n${action}`)],
      allowedMentions: { users: [author.id] },
    })
    .catch(() => null);
  if (warn) setTimeout(() => warn.delete().catch(() => {}), 7000);

  // 4. Log per lo staff
  if (!gcfg.channels.modLogs) {
    console.warn(`[AutoMod] ${violation.type} di ${author.tag} su "${guild.name}": canale log automod non impostato (/impostazioni log canali automod:#canale)`);
    return;
  }
  const fields = [
    { name: 'Utente', value: `${author} (\`${author.id}\`)`, inline: true },
    { name: 'Canale', value: `${channel}`, inline: true },
    { name: 'Azione', value: action },
  ];
  if (violation.logDetail) fields.push({ name: 'Dettaglio', value: violation.logDetail });
  fields.push({ name: edited ? 'Contenuto (dopo la modifica)' : 'Contenuto', value: collectTexts(message).join('\n').slice(0, 1000) || '*nessun testo*' });
  if (problems.length) fields.push({ name: '⚠️ Problemi', value: problems.join('\n').slice(0, 1024) });

  const sent = await sendLog(guild, gcfg.channels.modLogs, {
    embeds: [
      new EmbedBuilder()
        .setColor(problems.length ? COLORS.danger : COLORS.warning)
        .setTitle(`🛡️ AutoMod • ${violation.type}${edited ? ' (messaggio modificato)' : ''}`)
        .setAuthor({ name: author.tag, iconURL: author.displayAvatarURL() })
        .addFields(fields)
        .setTimestamp(),
    ],
    allowedMentions: { parse: [] },
  });
  if (!sent) console.error(`[AutoMod] Log non inviato su "${guild.name}": controlla che il canale log automod esista e che il bot possa scriverci.`);
}

// ---------------------------------------------------------------- ingressi: anti-raid ed età account

/** @returns {Promise<boolean>} true se il membro è stato espulso (niente messaggio di benvenuto) */
async function onJoin(member) {
  if (member.user.bot) return false;
  const gcfg = db.peekGuild(member.guild.id);
  if (!gcfg || !gcfg.automod.enabled) return false;
  const am = gcfg.automod;
  const guild = member.guild;
  let removed = false;

  // Età minima dell'account
  const ageDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
  if (am.minAccountAgeDays > 0 && ageDays < am.minAccountAgeDays) {
    let action = 'Solo segnalazione';
    if (am.accountAgeAction === 'kick' && member.kickable) {
      await member
        .send(`⛔ Il tuo account Discord è troppo recente per entrare su **${guild.name}** (minimo ${am.minAccountAgeDays} giorni). Riprova più avanti!`)
        .catch(() => {});
      const kicked = await member.kick(`AutoMod: account creato da meno di ${am.minAccountAgeDays} giorni`).then(() => true).catch(() => false);
      if (kicked) {
        action = 'Espulso automaticamente';
        removed = true;
      }
    }
    await sendLog(guild, gcfg.channels.modLogs, {
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.warning)
          .setTitle('🛡️ AutoMod • Account recente')
          .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
          .addFields(
            { name: 'Utente', value: `${member.user} (\`${member.id}\`)`, inline: true },
            { name: 'Account creato', value: `<t:${unix(member.user.createdTimestamp)}:R>`, inline: true },
            { name: 'Azione', value: action },
          )
          .setTimestamp(),
      ],
      allowedMentions: { parse: [] },
    });
  }

  // Anti-raid: troppi ingressi in poco tempo
  if (!am.antiRaid) return removed;
  const now = Date.now();
  const joins = (joinTracker.get(guild.id) || []).filter((t) => now - t < am.raidSeconds * 1000);
  joins.push(now);
  joinTracker.set(guild.id, joins);
  if (joins.length >= am.raidJoins && now - (lastRaidAlert.get(guild.id) || 0) > RAID_ALERT_COOLDOWN) {
    lastRaidAlert.set(guild.id, now);
    const staff = gcfg.staffRoles.filter((id) => guild.roles.cache.has(id));
    await sendLog(guild, gcfg.channels.modLogs, {
      content: staff.map((id) => `<@&${id}>`).join(' ') || undefined,
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.danger)
          .setTitle('🚨 Possibile RAID in corso!')
          .setDescription(
            `**${joins.length}** utenti sono entrati negli ultimi **${am.raidSeconds} secondi**.\n\n` +
              'Azioni consigliate:\n• `/canale blocca` sui canali pubblici\n• Alza il livello di verifica del server\n• Controlla i nuovi ingressi nel log server',
          )
          .setTimestamp(),
      ],
      allowedMentions: { roles: staff },
    });
  }
  return removed;
}

// Pulizia periodica della memoria
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of strikes) if (!v.some((t) => now - t < STRIKE_WINDOW)) strikes.delete(k);
  for (const [k, v] of spamTracker) if (!v.some((t) => now - t < 60_000)) spamTracker.delete(k);
  for (const [k, v] of duplicateTracker) if (!v.some((m) => now - m.ts < DUPLICATE_WINDOW)) duplicateTracker.delete(k);
  for (const [k, v] of joinTracker) if (!v.some((t) => now - t < 120_000)) joinTracker.delete(k);
}, 5 * 60 * 1000).unref();

module.exports = { onMessage, onEdit, onJoin };
