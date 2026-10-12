// Bandi staff: candidature inviate dalla pagina /bandi-staff del sito.
//  - GET  /site/bandi?user=ID  il sito chiede se i bandi sono aperti e se l'utente può candidarsi
//  - POST /site/bandi          il sito invia una candidatura (l'ID Discord viene dalla sessione firmata del sito)
// La candidatura arriva nel canale scelto con /bandi canale, con i pulsanti Accetta / Rifiuta.
// L'esito arriva in DM al candidato; se accettato riceve il ruolo scelto con /bandi ruolo.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits: P } = require('discord.js');
const api = require('../api/server');
const db = require('../utils/db');
const site = require('./site');
const { isStaff } = require('../utils/permissions');
const { COLORS, FOOTER, errorEmbed } = require('../utils/embeds');

const SNOWFLAKE = /^\d{17,20}$/;
const UNKNOWN = new Set([10007, 10013]); // Unknown Member, Unknown User

// Stessi limiti di data/bandi.ts del sito
const TEXT_FIELDS = {
  nome: 60,
  disponibilita: 300,
  motivazione: 1000,
  dove: 200,
  durata: 100,
  ruolo: 100,
};

async function findMember(guild, id) {
  try {
    return await guild.members.fetch(id);
  } catch (err) {
    if (UNKNOWN.has(err.code)) return null;
    throw err;
  }
}

/** Canale delle candidature, se impostato ed esistente. */
function bandiChannel(guild) {
  const { channelId } = db.getBandi();
  const channel = channelId && guild.channels.cache.get(channelId);
  return channel?.isTextBased() ? channel : null;
}

const isOpen = (guild) => Boolean(db.getBandi().open && guild && bandiChannel(guild));

const hasPending = (userId) =>
  Object.values(db.getBandi().applications).some((a) => a.userId === userId && a.status === 'pending');

const GONE = new Set([10003, 10008]); // Unknown Channel, Unknown Message

/**
 * true se l'utente ha una candidatura in attesa. Se lo staff ha cancellato il messaggio (o il canale)
 * della candidatura, questa decade: altrimenti l'utente resterebbe "in attesa" per sempre.
 */
async function checkPending(guild, userId) {
  for (const app of Object.values(db.getBandi().applications)) {
    if (app.userId !== userId || app.status !== 'pending') continue;
    if (!app.messageId) return true; // la sta inviando proprio ora
    const channel = guild.channels.cache.get(app.channelId);
    const exists = channel
      ? await channel.messages.fetch(app.messageId).then(() => true, (err) => !GONE.has(err.code)) // altri errori: nel dubbio resta valida
      : false;
    if (exists) return true;
    app.status = 'deleted';
    db.save();
  }
  return false;
}

const hasAcceptRole = (member) => Boolean(db.getBandi().roleId && member.roles.cache.has(db.getBandi().roleId));

/** Risposte pulite e controllate. Lancia HttpError 400 se mancano o sono troppo lunghe. */
function cleanAnswers(body) {
  const bad = (field) => new api.HttpError(400, `campo non valido: ${field}`);
  const text = (field, required = true) => {
    const value = String(body?.[field] ?? '').trim();
    if ((required && !value) || value.length > TEXT_FIELDS[field]) throw bad(field);
    return value;
  };
  const int = (field, min, max) => {
    const value = Number(body?.[field]);
    if (!Number.isInteger(value) || value < min || value > max) throw bad(field);
    return value;
  };
  if (body?.consapevole !== true) throw bad('consapevole');
  if (typeof body?.staffer !== 'boolean') throw bad('staffer');

  return {
    nome: text('nome'),
    eta: int('eta', 10, 99),
    disponibilita: text('disponibilita'),
    motivazione: text('motivazione'),
    voto: int('voto', 1, 10),
    staffer: body.staffer,
    dove: body.staffer ? text('dove') : null,
    durata: body.staffer ? text('durata') : null,
    ruolo: text('ruolo'),
  };
}

function applicationEmbed(number, app, user) {
  const a = app.answers;
  const fields = [
    { name: '👤 Nome', value: a.nome, inline: true },
    { name: '🎂 Età', value: String(a.eta), inline: true },
    { name: '⭐ Voto al suo RP', value: `${a.voto}/10`, inline: true },
    { name: '🕒 Disponibilità', value: a.disponibilita },
    { name: '💬 Perché vorrebbe far parte dello staff', value: a.motivazione },
    { name: '🛡️ È mai stato staffer?', value: a.staffer ? 'Sì' : 'No', inline: true },
  ];
  if (a.staffer) {
    fields.push({ name: '📍 Dove', value: a.dove, inline: true }, { name: '⏳ Per quanto tempo', value: a.durata, inline: true });
  }
  fields.push({ name: '🎯 Ruolo che vorrebbe fare', value: a.ruolo });

  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(`📋 Candidatura staff #${number}`)
    .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .setDescription(`Candidato: <@${app.userId}> · ID \`${app.userId}\`\nInviata dal sito <t:${Math.floor(app.createdAt / 1000)}:R>`)
    .addFields(fields)
    .setFooter(FOOTER)
    .setTimestamp(app.createdAt);
}

const buttons = (number) =>
  new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`bando:accetta:${number}`).setLabel('Accetta').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`bando:rifiuta:${number}`).setLabel('Rifiuta').setEmoji('✖️').setStyle(ButtonStyle.Danger),
  );

async function submit(body) {
  const guild = site.siteGuild();
  if (!isOpen(guild)) throw new api.HttpError(409, 'chiusi');
  const userId = String(body?.userId ?? '');
  if (!SNOWFLAKE.test(userId)) throw new api.HttpError(400, 'ID non valido');

  const member = await findMember(guild, userId);
  if (!member) throw new api.HttpError(403, 'non_nel_server');
  if (hasAcceptRole(member)) throw new api.HttpError(409, 'gia_staff');
  if (await checkPending(guild, userId)) throw new api.HttpError(409, 'in_attesa');
  const answers = cleanAnswers(body);
  // ricontrollo senza attese prima di salvare: due invii insieme non creano due candidature
  if (hasPending(userId)) throw new api.HttpError(409, 'in_attesa');

  const bandi = db.getBandi();
  const number = ++bandi.counter;
  const app = { userId, answers, status: 'pending', channelId: null, messageId: null, createdAt: Date.now(), decidedBy: null, decidedAt: null };
  bandi.applications[number] = app;
  db.save();

  try {
    const channel = bandiChannel(guild);
    const message = await channel.send({
      embeds: [applicationEmbed(number, app, member.user)],
      components: [buttons(number)],
      allowedMentions: { parse: [] },
    });
    app.channelId = channel.id;
    app.messageId = message.id;
    db.save();
  } catch (err) {
    delete bandi.applications[number];
    db.save();
    console.error('[Bandi] Invio della candidatura nel canale fallito:', err.message);
    throw new api.HttpError(502, 'invio_fallito');
  }
  return { ok: true, number };
}

// ---------------------------------------------------------------- pulsanti Accetta / Rifiuta

/** Chi può decidere: amministratori, ruoli staff (/impostazioni) o chi può gestire i ruoli. */
function canDecide(member) {
  return isStaff(member, db.getGuild(member.guild.id)) || member.permissions.has(P.ManageRoles);
}

/** Dà il ruolo di /bandi ruolo. Restituisce il ruolo assegnato (o null) e la nota per il messaggio dello staff. */
async function giveRole(guild, userId) {
  const { roleId } = db.getBandi();
  const fail = (note) => ({ role: null, note: `⚠️ ${note}` });
  if (!roleId) return fail('Nessun ruolo da assegnare: impostalo con `/bandi ruolo`.');
  const role = guild.roles.cache.get(roleId);
  if (!role) return fail('Il ruolo impostato non esiste più: reimpostalo con `/bandi ruolo`.');
  if (!role.editable) return fail(`Non posso assegnare ${role}: sposta il ruolo del bot più in alto.`);
  const member = await findMember(guild, userId);
  if (!member) return fail(`Ruolo ${role} non assegnato: il candidato non è più nel server.`);
  await member.roles.add(role, 'Candidatura staff accettata');
  return { role, note: `🎭 Ruolo ${role} assegnato.` };
}

/** DM con l'esito. role = ruolo davvero assegnato (solo se accettato). */
async function sendOutcome(client, userId, accepted, guild, role) {
  const embed = new EmbedBuilder()
    .setColor(accepted ? COLORS.success : COLORS.danger)
    .setTitle(accepted ? '✅ Candidatura staff accettata!' : '❌ Candidatura staff non accettata')
    .setDescription(accepted
      ? `Complimenti! La tua candidatura per lo staff di **${guild.name}** è stata **accettata**.${role ? `\nTi è stato dato il ruolo **${role.name}**.` : ''}\n\nUno staffer ti contatterà a breve per i prossimi passi. Benvenuto nel team!`
      : `Ci dispiace, la tua candidatura per lo staff di **${guild.name}** **non è stata accettata**.\n\nGrazie per l'interesse: potrai ricandidarti ai prossimi bandi.`)
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

async function handleButton(interaction) {
  const [, action, number] = interaction.customId.split(':');
  const fail = (text) => interaction.reply({ embeds: [errorEmbed(text)], flags: MessageFlags.Ephemeral });
  if (!canDecide(interaction.member)) return fail('Solo lo staff può valutare le candidature.');

  const app = db.getBandi().applications[number];
  if (!app) return fail('Candidatura non trovata.');
  if (app.status !== 'pending') return fail('Questa candidatura è già stata valutata.');

  // stato cambiato subito: due click insieme non danno due esiti
  const accepted = action === 'accetta';
  app.status = accepted ? 'accepted' : 'rejected';
  app.decidedBy = interaction.user.id;
  app.decidedAt = Date.now();
  db.save();
  await interaction.deferUpdate();

  const notes = [];
  let role = null;
  if (accepted) {
    const given = await giveRole(interaction.guild, app.userId).catch((err) => ({ role: null, note: `⚠️ Ruolo non assegnato: ${err.message}` }));
    role = given.role;
    notes.push(given.note);
  }
  notes.push(await sendOutcome(interaction.client, app.userId, accepted, interaction.guild, role));

  const embed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(accepted ? COLORS.success : COLORS.danger)
    .addFields({
      name: accepted ? '✅ Accettata' : '❌ Rifiutata',
      value: `Da ${interaction.user} <t:${Math.floor(app.decidedAt / 1000)}:R>\n${notes.join('\n')}`,
    });
  await interaction.editReply({ embeds: [embed], components: [], allowedMentions: { parse: [] } });
}

function start() {
  site.siteRoute('/site/bandi', async ({ query }) => {
    const guild = site.siteGuild();
    const open = isOpen(guild);
    const userId = query.get('user');
    if (!open || !userId) return { open, user: null };
    if (!SNOWFLAKE.test(userId)) throw new api.HttpError(400, 'ID non valido');
    const member = await findMember(guild, userId);
    return {
      open,
      user: {
        inGuild: Boolean(member),
        staff: Boolean(member && hasAcceptRole(member)),
        pending: await checkPending(guild, userId),
      },
    };
  });
  api.route('POST', '/site/bandi', 'SITE_API_SECRET', ({ body }) => {
    site.status.lastRequest = Date.now();
    return submit(body);
  });
}

module.exports = { start, handleButton, bandiChannel };
