// Candidature per i lavori (LSPD, LSSD, EMS, U.S. Marshal, FIB), tutte su Discord.
//  1. /candidature pannello invia il messaggio con il pulsante "Candidati ora"
//  2. il pulsante apre il modulo con le domande, diviso in 3 pagine (Discord permette solo 5 domande per modulo).
//     Tra una pagina e l'altra c'è il pulsante "Continua": Discord non apre un modulo subito dopo un altro.
//     Le risposte restano in memoria fino all'invio (massimo 1 ora)
//  3. la candidatura arriva nel canale del lavoro (/candidature canale) con i pulsanti Accetta / Rifiuta
//  4. l'esito arriva in DM al candidato; se accettato riceve il ruolo del lavoro (/candidature ruolo)
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, EmbedBuilder, LabelBuilder, MessageFlags, ModalBuilder,
  PermissionFlagsBits: P, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, TextInputBuilder,
  TextInputStyle, ThumbnailBuilder,
} = require('discord.js');
const db = require('../utils/db');
const { JOBS, SECTIONS, getJob, pagesOf, questionsOf } = require('../config/candidature');
const { isStaff } = require('../utils/permissions');
const { COLORS, FOOTER, errorEmbed } = require('../utils/embeds');
const { unix } = require('../utils/time');

const EPH = MessageFlags.Ephemeral;
const MIN_AGE = 16;
const SESSION_TTL = 60 * 60 * 1000;
const GONE = new Set([10003, 10008]); // Unknown Channel, Unknown Message
const UNKNOWN = new Set([10007, 10013]); // Unknown Member, Unknown User

const sessions = new Map(); // "server:utente:lavoro" -> { answers, at }: risposte non ancora inviate
const sending = new Set(); // candidature in invio: un doppio click non le manda due volte

/** Impostazioni del lavoro nel server: { open, channelId, roleId, recruiterRoleId, counter, panels }. Live: modificale e chiama save(). */
const settingsOf = (guild, key) => db.getGuild(guild.id).candidature.jobs[key];

/** Canale dove arrivano le candidature del lavoro, se impostato ed esistente. */
function reviewChannel(guild, key) {
  const { channelId } = settingsOf(guild, key);
  const channel = channelId && guild.channels.cache.get(channelId);
  return channel?.isTextBased() ? channel : null;
}

const isOpen = (guild, key) => Boolean(settingsOf(guild, key).open && reviewChannel(guild, key));

async function findMember(guild, id) {
  try {
    return await guild.members.fetch(id);
  } catch (err) {
    if (UNKNOWN.has(err.code)) return null;
    throw err;
  }
}

/** Come `promise`, ma dopo `ms` restituisce `fallback` (0 = aspetta sempre). */
const within = (promise, ms, fallback) => (ms ? Promise.race([promise, new Promise((r) => setTimeout(() => r(fallback), ms))]) : promise);

/**
 * Candidatura in attesa dell'utente per il lavoro, o null. Se lo staff ha eliminato il messaggio (o il canale)
 * della candidatura, questa decade: altrimenti l'utente resterebbe "in attesa" per sempre.
 * `wait`: dopo il click il modulo va aperto entro 3 secondi, quindi il controllo del messaggio non può durare di più.
 */
async function pendingOf(guild, userId, key, wait = 0) {
  for (const app of Object.values(db.getGuild(guild.id).candidature.applications)) {
    if (app.job !== key || app.userId !== userId || app.status !== 'pending') continue;
    if (!app.messageId && Date.now() - app.createdAt < 5 * 60 * 1000) return app; // la sta inviando proprio ora
    // ancora senza messaggio dopo 5 minuti = invio interrotto (es. bot riavviato): decade anche questa
    const channel = app.messageId && guild.channels.cache.get(app.channelId);
    if (channel?.messages.cache.has(app.messageId)) return app;
    const exists = channel
      // altri errori o risposta lenta: nel dubbio resta valida
      ? await within(channel.messages.fetch(app.messageId).then(() => true, (err) => !GONE.has(err.code)), wait, true)
      : false;
    if (exists) return app;
    app.status = 'deleted';
    db.save();
  }
  return null;
}

/** Motivo per cui l'utente non può candidarsi al lavoro (null = può). */
async function applyError(guild, member, job, wait) {
  if (!isOpen(guild, job.key)) return `Le candidature per **${job.name}** sono chiuse al momento.`;
  const { roleId } = settingsOf(guild, job.key);
  if (roleId && member.roles.cache.has(roleId)) return `Hai già il ruolo <@&${roleId}>: fai già parte di **${job.name}**.`;
  if (await pendingOf(guild, member.id, job.key, wait)) return `Hai già una candidatura **${job.name}** in attesa: riceverai l'esito in DM.`;
  return null;
}

// ---------------------------------------------------------------- risposte in corso

const sessionKey = (interaction, job) => `${interaction.guildId}:${interaction.user.id}:${job.key}`;

function getSession(interaction, job) {
  const session = sessions.get(sessionKey(interaction, job));
  return session && Date.now() - session.at < SESSION_TTL ? session : null;
}

/** Risposte dell'utente per il lavoro: quelle già date (se non scadute) oppure nuove. */
function startSession(interaction, job) {
  for (const [key, session] of sessions) if (Date.now() - session.at >= SESSION_TTL) sessions.delete(key);
  const key = sessionKey(interaction, job);
  const session = sessions.get(key) ?? { answers: {} };
  session.at = Date.now();
  sessions.set(key, session);
  return session;
}

// ---------------------------------------------------------------- pannello

const text = (content) => new TextDisplayBuilder().setContent(content);
const separator = (big = false) => new SeparatorBuilder().setDivider(true).setSpacing(big ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
const button = (id, label, emoji, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style);
const row = (...buttons) => new ActionRowBuilder().addComponents(buttons);

/**
 * Messaggio con il bando del lavoro (config/candidature.js) e il pulsante "Candidati ora".
 * Con le candidature chiuse l'annuncio dell'apertura sparisce e il pulsante diventa "Candidature chiuse".
 */
function buildPanel(guild, key) {
  const job = getJob(key);
  const { bando } = job;
  const open = isOpen(guild, key);
  const name = db.getGuild(guild.id).fivem.name || guild.name;
  const icon = guild.iconURL({ extension: 'png', size: 256 });
  const title = `## ${job.emoji} ${bando.title}\n### ${open ? '📋 APERTURA BANDI DI RECLUTAMENTO' : '🔒 BANDI DI RECLUTAMENTO CHIUSI'}`;
  const intro = open
    ? bando.apertura
    : `Al momento le candidature per **${job.name}** sono **chiuse**: quando riapriranno, il pulsante qui sotto tornerà attivo.`;

  const container = new ContainerBuilder().setAccentColor(job.color);
  if (icon) {
    container.addSectionComponents(new SectionBuilder().addTextDisplayComponents(text(title)).setThumbnailAccessory(new ThumbnailBuilder().setURL(icon)));
  } else {
    container.addTextDisplayComponents(text(title));
  }
  container
    .addTextDisplayComponents(text(`${intro}\n\n${bando.descrizione}`))
    .addSeparatorComponents(separator(true))
    .addTextDisplayComponents(text(`### REQUISITI DI ACCESSO\n${bando.requisiti.map((r) => `- ${r}`).join('\n')}`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`**Preparati a dimostrare di avere ciò che serve.**${bando.motto ? `\n*${bando.motto}*` : ''}`))
    .addSeparatorComponents(separator(true));
  if (open) {
    container
      .addTextDisplayComponents(text(
        '### ⚠️ Istruzioni\n' +
          `> Premi **Candidati ora**: si apre un modulo di **${pagesOf(job).length} pagine**\n` +
          '> Rispondi a tutte le domande: quelle **IC** vanno scritte come il tuo personaggio\n' +
          "> Attendi l'esito nei **DM** entro 3 giorni: tieni aperti i messaggi privati\n" +
          '> Non sollecitare in pubblico',
      ))
      .addSeparatorComponents(separator());
  }
  container
    .addActionRowComponents(row(open
      ? button(`cand:apply:${key}`, 'Candidati ora', '📝', ButtonStyle.Success)
      : button(`cand:apply:${key}`, 'Candidature chiuse', '🔒').setDisabled(true)))
    .addTextDisplayComponents(text(`-# 📋 ${name}${open ? ' · Un recruiter ti risponderà entro 72h' : ''}`));

  return { flags: MessageFlags.IsComponentsV2, components: [container], allowedMentions: { parse: [] } };
}

/** Invia il pannello del lavoro nel canale. Quello vecchio dello stesso lavoro nello stesso canale viene eliminato. */
async function postPanel(channel, key) {
  const settings = settingsOf(channel.guild, key);
  const old = settings.panels.filter((p) => p.channelId === channel.id);
  const message = await channel.send(buildPanel(channel.guild, key));
  for (const panel of old) await channel.messages.delete(panel.messageId).catch(() => {});
  settings.panels = [...settings.panels.filter((p) => p.channelId !== channel.id), { channelId: channel.id, messageId: message.id }].slice(-10);
  db.save();
  return message;
}

/** Aggiorna i pannelli del lavoro (aperto / chiuso). Quelli eliminati vengono dimenticati. */
async function refreshPanels(guild, key) {
  const deleted = new Set();
  for (const panel of settingsOf(guild, key).panels) {
    const channel = guild.channels.cache.get(panel.channelId);
    const message = channel?.isTextBased()
      ? await channel.messages.fetch(panel.messageId).catch((err) => (GONE.has(err.code) ? null : undefined))
      : null;
    if (message === null) deleted.add(panel.messageId);
    else if (message) await message.edit(buildPanel(guild, key)).catch((err) => console.error('[Candidature] Aggiornamento pannello fallito:', err.message));
  }
  if (!deleted.size) return;
  const settings = settingsOf(guild, key);
  settings.panels = settings.panels.filter((p) => !deleted.has(p.messageId));
  db.save();
}

/** All'avvio: aggiorna i pannelli già inviati, così prendono i testi dei bandi e i colori nuovi. */
async function refreshAllPanels(client) {
  for (const guild of client.guilds.cache.values()) {
    if (!db.peekGuild(guild.id)) continue;
    for (const job of JOBS) await refreshPanels(guild, job.key);
  }
}

// ---------------------------------------------------------------- modulo

function buildModal(job, page, answers) {
  const pages = pagesOf(job);
  const modal = new ModalBuilder().setCustomId(`cand:form:${job.key}:${page}`).setTitle(`Candidatura ${job.name} · ${page}/${pages.length}`);
  for (const item of pages[page - 1].items) {
    if (item.text) {
      modal.addTextDisplayComponents(text(item.text));
      continue;
    }
    const input = new TextInputBuilder()
      .setCustomId(item.id)
      .setStyle(item.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(item.required !== false)
      .setMaxLength(item.max);
    if (item.min) input.setMinLength(item.min);
    if (item.placeholder) input.setPlaceholder(item.placeholder);
    if (answers[item.id]) input.setValue(answers[item.id]); // risposta già data: non va riscritta
    const label = new LabelBuilder().setLabel(item.label).setTextInputComponent(input);
    if (item.description) label.setDescription(item.description);
    modal.addLabelComponents(label);
  }
  return modal;
}

/** Messaggio privato tra una pagina e l'altra del modulo. */
function stepMessage(job, done) {
  const pages = pagesOf(job);
  const next = done + 1;
  const embed = new EmbedBuilder()
    .setColor(job.color)
    .setTitle(`${job.emoji} Candidatura ${job.name}`)
    .setDescription(`✅ Pagina **${done} di ${pages.length}** salvata.\nPremi **Continua** per la pagina ${next}: **${pages[next - 1].title}**.`)
    .setFooter({ text: 'Le risposte restano salvate per 1 ora' });
  return {
    embeds: [embed],
    components: [row(
      button(`cand:page:${job.key}:${next}`, `Continua (${next}/${pages.length})`, '➡️', ButtonStyle.Primary),
      button(`cand:cancel:${job.key}`, 'Annulla', '✖️'),
    )],
  };
}

const errorMessage = (content, ...buttons) => ({ embeds: [errorEmbed(content)], components: buttons.length ? [row(...buttons)] : [] });
const expired = (job) => errorMessage(`Le risposte della candidatura **${job.name}** non ci sono più (è passata più di un'ora o il bot si è riavviato). Ricomincia con **Candidati ora**.`);

/** true se il modulo è stato aperto dal messaggio privato dei passaggi, non dal pannello pubblico. */
const fromStep = (interaction) => Boolean(interaction.message?.flags.has(MessageFlags.Ephemeral));

/** Risponde a un modulo: aggiorna il messaggio privato dei passaggi, oppure lo crea se il modulo è stato aperto dal pannello. */
const respond = (interaction, payload) => (fromStep(interaction) ? interaction.update(payload) : interaction.reply({ ...payload, flags: EPH }));

/** Pulsante "Candidati ora". */
async function apply(interaction, job) {
  const error = await applyError(interaction.guild, interaction.member, job, 1500);
  if (error) return interaction.reply({ embeds: [errorEmbed(error)], flags: EPH });
  await interaction.showModal(buildModal(job, 1, startSession(interaction, job).answers));
}

/** Pulsanti "Continua" e "Correggi": apre la pagina del modulo con le risposte già date. */
async function openPage(interaction, job, page) {
  const session = getSession(interaction, job);
  if (!session || !(page >= 1 && page <= pagesOf(job).length)) return interaction.update(expired(job));
  if (!isOpen(interaction.guild, job.key)) return interaction.update(errorMessage(`Le candidature per **${job.name}** sono chiuse al momento.`));
  await interaction.showModal(buildModal(job, page, session.answers));
}

async function cancel(interaction, job) {
  sessions.delete(sessionKey(interaction, job));
  const embed = new EmbedBuilder().setColor(COLORS.dark).setDescription(`Candidatura **${job.name}** annullata: le risposte sono state cancellate.`);
  return interaction.update({ embeds: [embed], components: [] });
}

/** Una pagina del modulo è stata inviata: salva le risposte e passa alla pagina dopo (o invia la candidatura). */
async function submitPage(interaction, job, page) {
  const pages = pagesOf(job);
  if (!(page >= 1 && page <= pages.length)) return;
  const session = page === 1 ? startSession(interaction, job) : getSession(interaction, job);
  if (!session) return respond(interaction, expired(job));

  for (const item of pages[page - 1].items) {
    if (!item.id) continue;
    let value = '';
    try { value = interaction.fields.getTextInputValue(item.id) ?? ''; } catch { /* campo assente nel modulo */ }
    session.answers[item.id] = value.slice(0, item.max); // salvata com'è scritta, così il modulo si riapre uguale
  }
  session.at = Date.now();

  if (page === 1) {
    const age = session.answers.eta.trim();
    if (!/^\d{1,2}$/.test(age)) {
      return respond(interaction, errorMessage("Scrivi l'età solo in numeri, per esempio **18**.", button(`cand:page:${job.key}:1`, 'Correggi pagina 1', '✏️', ButtonStyle.Primary)));
    }
    if (Number(age) < MIN_AGE) {
      sessions.delete(sessionKey(interaction, job));
      return respond(interaction, errorMessage(`Per candidarti in **${job.name}** devi avere almeno **${MIN_AGE} anni**.`));
    }
  }
  if (page < pages.length) return respond(interaction, stepMessage(job, page));
  return finish(interaction, job);
}

// ---------------------------------------------------------------- invio

/** Messaggio della candidatura nel canale dello staff: un riquadro per ogni parte del modulo. */
function applicationEmbeds(job, number, app, member, answers) {
  const { user } = member;
  const fields = (section) => questionsOf(job)
    .filter((q) => q.section === section && (q.required !== false || answers[q.id]?.trim()))
    .map((q) => {
      const value = answers[q.id]?.trim() || '—';
      return { name: q.field, value: q.id === 'eta' ? `${value} anni` : value, inline: Boolean(q.inline) };
    });
  const joined = member.joinedTimestamp ? `Ingresso nel server: <t:${unix(member.joinedTimestamp)}:R> · ` : '';

  const head = new EmbedBuilder()
    .setColor(job.color)
    .setAuthor({ name: member.displayName, iconURL: user.displayAvatarURL() })
    .setTitle(`${job.emoji} Candidatura ${job.name} #${number}`)
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .setDescription(`Candidato: <@${app.userId}> · ID \`${app.userId}\`\n${joined}Inviata <t:${unix(app.createdAt)}:R>\n\n**${SECTIONS.ooc}**`)
    .addFields({ name: '🙍 Username Discord', value: user.username, inline: true }, ...fields('ooc'));
  const pg = new EmbedBuilder().setColor(job.color).setTitle(SECTIONS.pg).addFields(fields('pg'));
  const interview = new EmbedBuilder()
    .setColor(job.color)
    .setTitle(SECTIONS.intervista)
    .addFields(fields('intervista'))
    .setFooter(FOOTER)
    .setTimestamp(app.createdAt);
  return [head, pg, interview];
}

const decisionRow = (key, number) => row(
  button(`cand:accept:${key}:${number}`, 'Accetta', '✅', ButtonStyle.Success),
  button(`cand:reject:${key}:${number}`, 'Rifiuta', '✖️', ButtonStyle.Danger),
);

/** Ultima pagina del modulo (o "Riprova l'invio"): manda la candidatura nel canale del lavoro. */
async function finish(interaction, job) {
  if (fromStep(interaction)) await interaction.deferUpdate();
  else await interaction.deferReply({ flags: EPH });
  const reply = (payload) => interaction.editReply(payload);

  const session = getSession(interaction, job);
  if (!session || questionsOf(job).some((q) => q.required !== false && !session.answers[q.id]?.trim())) return reply(expired(job));
  const key = sessionKey(interaction, job);
  if (sending.has(key)) return reply(errorMessage('Invio già in corso, attendi qualche secondo.'));
  sending.add(key);
  try {
    const { guild, member } = interaction;
    const error = await applyError(guild, member, job);
    if (error) return reply(errorMessage(error));

    const { candidature } = db.getGuild(guild.id);
    const number = ++candidature.jobs[job.key].counter;
    const id = `${job.key}-${number}`;
    const app = { job: job.key, number, userId: member.id, status: 'pending', channelId: null, messageId: null, createdAt: Date.now(), decidedBy: null, decidedAt: null };
    candidature.applications[id] = app;
    db.save();

    try {
      const channel = reviewChannel(guild, job.key);
      const message = await channel.send({
        embeds: applicationEmbeds(job, number, app, member, session.answers),
        components: [decisionRow(job.key, number)],
        allowedMentions: { parse: [] },
      });
      app.channelId = channel.id;
      app.messageId = message.id;
      db.save();
    } catch (err) {
      delete candidature.applications[id];
      db.save();
      console.error(`[Candidature] Invio della candidatura ${job.name} fallito:`, err.message);
      return reply(errorMessage(
        'Non sono riuscito a inviare la candidatura allo staff. Riprova tra poco o avvisa lo staff: le tue risposte restano salvate per 1 ora.',
        button(`cand:send:${job.key}`, "Riprova l'invio", '🔁', ButtonStyle.Primary),
      ));
    }

    sessions.delete(key);
    const embed = new EmbedBuilder()
      .setColor(COLORS.success)
      .setTitle(`✅ Candidatura ${job.name} inviata!`)
      .setDescription("Un recruiter la valuterà entro **72 ore**: riceverai l'esito in **DM**, quindi tieni aperti i messaggi privati.\n\n⚠️ Non sollecitare in pubblico.");
    return reply({ embeds: [embed], components: [] });
  } finally {
    sending.delete(key);
  }
}

// ---------------------------------------------------------------- pulsanti Accetta / Rifiuta

/** Chi può decidere: amministratori, ruoli staff (/impostazioni), chi può gestire i ruoli o i recruiter del lavoro. */
function canDecide(member, key) {
  const gcfg = db.getGuild(member.guild.id);
  const { recruiterRoleId } = gcfg.candidature.jobs[key];
  return isStaff(member, gcfg) || member.permissions.has(P.ManageRoles) || Boolean(recruiterRoleId && member.roles.cache.has(recruiterRoleId));
}

/** Dà il ruolo di /candidature ruolo. Restituisce il ruolo assegnato (o null) e la nota per il messaggio dello staff. */
async function giveRole(guild, job, userId) {
  const { roleId } = settingsOf(guild, job.key);
  const fail = (note) => ({ role: null, note: `⚠️ ${note}` });
  if (!roleId) return fail('Nessun ruolo da assegnare: impostalo con `/candidature ruolo`.');
  const role = guild.roles.cache.get(roleId);
  if (!role) return fail('Il ruolo impostato non esiste più: reimpostalo con `/candidature ruolo`.');
  if (!role.editable) return fail(`Non posso assegnare ${role}: sposta il ruolo del bot più in alto.`);
  const member = await findMember(guild, userId);
  if (!member) return fail(`Ruolo ${role} non assegnato: il candidato non è più nel server.`);
  await member.roles.add(role, `Candidatura ${job.name} accettata`);
  return { role, note: `🎭 Ruolo ${role} assegnato.` };
}

/** DM con l'esito. role = ruolo davvero assegnato (solo se accettato). */
async function sendOutcome(client, userId, accepted, guild, job, role) {
  const embed = new EmbedBuilder()
    .setColor(accepted ? COLORS.success : COLORS.danger)
    .setTitle(accepted ? `✅ Candidatura ${job.name} accettata!` : `❌ Candidatura ${job.name} non accettata`)
    .setDescription(accepted
      ? `Complimenti! La tua candidatura **${job.name}** su **${guild.name}** è stata **accettata**.${role ? `\nTi è stato dato il ruolo **${role.name}**.` : ''}\n\nUn recruiter ti contatterà a breve per i prossimi passi. Benvenuto nel team!`
      : `Ci dispiace, la tua candidatura **${job.name}** su **${guild.name}** **non è stata accettata**.\n\nGrazie per l'interesse: potrai ricandidarti più avanti.`)
    .setFooter(FOOTER)
    .setTimestamp();
  try {
    const user = await client.users.fetch(userId);
    await user.send({ embeds: [embed] });
    return '📩 Esito inviato in DM.';
  } catch {
    return '⚠️ Esito **non** inviato in DM (ha i messaggi privati chiusi).';
  }
}

async function decide(interaction, job, number, accepted) {
  const fail = (content) => interaction.reply({ embeds: [errorEmbed(content)], flags: EPH });
  if (!canDecide(interaction.member, job.key)) return fail(`Solo lo staff o i recruiter di **${job.name}** possono valutare le candidature.`);

  const app = db.getGuild(interaction.guild.id).candidature.applications[`${job.key}-${number}`];
  if (!app) return fail('Candidatura non trovata.');
  if (app.status !== 'pending') return fail('Questa candidatura è già stata valutata.');

  // stato cambiato subito: due click insieme non danno due esiti
  app.status = accepted ? 'accepted' : 'rejected';
  app.decidedBy = interaction.user.id;
  app.decidedAt = Date.now();
  db.save();
  await interaction.deferUpdate();

  const notes = [];
  let role = null;
  if (accepted) {
    const given = await giveRole(interaction.guild, job, app.userId).catch((err) => ({ role: null, note: `⚠️ Ruolo non assegnato: ${err.message}` }));
    role = given.role;
    notes.push(given.note);
  }
  notes.push(await sendOutcome(interaction.client, app.userId, accepted, interaction.guild, job, role));

  const color = accepted ? COLORS.success : COLORS.danger;
  const embeds = interaction.message.embeds.map((e) => EmbedBuilder.from(e).setColor(color));
  if (!embeds.length) embeds.push(new EmbedBuilder().setColor(color).setTitle(`${job.emoji} Candidatura ${job.name} #${number}`));
  embeds.at(-1).addFields({
    name: accepted ? '✅ Accettata' : '❌ Rifiutata',
    value: `Da ${interaction.user} <t:${unix(app.decidedAt)}:R>\n${notes.join('\n')}`,
  });
  await interaction.editReply({ embeds, components: [], allowedMentions: { parse: [] } });
}

// ---------------------------------------------------------------- smistamento

/** Pulsanti e moduli con customId "cand:azione:lavoro[:numero]". */
async function handle(interaction) {
  const [, action, key, arg] = interaction.customId.split(':');
  const job = getJob(key);
  if (!job) return;
  if (interaction.isModalSubmit()) return submitPage(interaction, job, Number(arg));
  if (!interaction.isButton()) return;
  switch (action) {
    case 'apply': return apply(interaction, job);
    case 'page': return openPage(interaction, job, Number(arg));
    case 'cancel': return cancel(interaction, job);
    case 'send': return finish(interaction, job);
    case 'accept':
    case 'reject': return decide(interaction, job, arg, action === 'accept');
  }
}

module.exports = { handle, buildPanel, postPanel, refreshPanels, refreshAllPanels, reviewChannel, isOpen };
