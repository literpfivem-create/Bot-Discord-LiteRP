const { MessageFlags, PermissionFlagsBits: P, SlashCommandBuilder } = require('discord.js');
const db = require('../utils/db');
const { findBadWord } = require('../utils/badwords');
const { COLORS, baseEmbed, errorEmbed, successEmbed } = require('../utils/embeds');
const { isAdmin, isStaff } = require('../utils/permissions');

const EPH = MessageFlags.Ephemeral;
const MODULES = [
  { name: 'Anti-invito Discord', value: 'antiInvite' },
  { name: 'Anti-link', value: 'antiLink' },
  { name: 'Anti-spam', value: 'antiSpam' },
  { name: 'Anti-messaggi ripetuti', value: 'antiDuplicate' },
  { name: 'Anti-menzioni di massa', value: 'antiMention' },
  { name: 'Anti-maiuscole', value: 'antiCaps' },
  { name: 'Anti-raid (allarme ingressi di massa)', value: 'antiRaid' },
  { name: 'Parole vietate', value: 'badWords' },
];
const actionChoices = [{ name: 'Aggiungi', value: 'add' }, { name: 'Rimuovi', value: 'remove' }];
const onOff = (v) => (v ? '🟢 Attivo' : '🔴 Disattivo');

/** Aggiunge o rimuove valori (separati da virgola) da una lista. */
function editList(list, action, input, transform = (s) => s) {
  const values = input.split(',').map((s) => transform(s.trim())).filter(Boolean);
  if (action === 'add') {
    for (const v of values) if (!list.includes(v)) list.push(v);
    return list;
  }
  return list.filter((v) => !values.includes(v));
}

/** Prova un testo e controlla tutto ciò che può impedire all'automod di funzionare. */
async function runTest(interaction, gcfg, text) {
  const { guild, member, channel } = interaction;
  const am = gcfg.automod;
  const me = guild.members.me;
  const word = findBadWord(text, am.badWords.list);
  const checks = [];
  const ok = (cond, good, bad) => checks.push(cond ? `✅ ${good}` : `⚠️ ${bad}`);

  ok(am.enabled, 'AutoMod attivo', 'AutoMod **disattivato**: `/automod attiva attivo:True`');
  ok(am.badWords.enabled, 'Filtro parole attivo', 'Filtro parole **disattivato**: `/automod modulo nome:Parole vietate attivo:True`');
  ok(me.permissions.has(P.ManageMessages), 'Il bot può eliminare i messaggi', 'Al bot manca il permesso **Gestisci messaggi** (non può eliminare)');
  ok(me.permissions.has(P.ModerateMembers), 'Il bot può mettere in timeout', 'Al bot manca il permesso **Metti in timeout i membri**');

  const logChannel = gcfg.channels.modLogs && (await guild.channels.fetch(gcfg.channels.modLogs).catch(() => null));
  if (!gcfg.channels.modLogs) checks.push('⚠️ Canale log automod **non impostato**: `/impostazioni log canali automod:#canale`');
  else if (!logChannel) checks.push('⚠️ Il canale log automod **non esiste più**: reimpostalo con `/impostazioni log canali`');
  else {
    const perms = logChannel.permissionsFor(me);
    const missing = [[P.ViewChannel, 'Visualizza canale'], [P.SendMessages, 'Invia messaggi'], [P.EmbedLinks, 'Incorpora link']]
      .filter(([flag]) => !perms?.has(flag))
      .map(([, name]) => name);
    ok(!missing.length, `Il bot può scrivere in ${logChannel}`, `In ${logChannel} al bot mancano: **${missing.join(', ')}**`);
  }

  const ignoredHere = [channel?.id, channel?.parentId].some((id) => id && am.ignoredChannels.includes(id));
  ok(!ignoredHere, 'Questo canale non è ignorato', 'Questo canale (o la sua categoria) è **ignorato** dall’automod');
  const ignoredRole = member.roles.cache.find((r) => am.ignoredRoles.includes(r.id));
  ok(!ignoredRole, 'Non hai ruoli ignorati', `Hai il ruolo ignorato ${ignoredRole}: i tuoi messaggi non vengono controllati`);
  if (isStaff(member, gcfg)) {
    checks.push(am.badWords.exemptStaff
      ? 'ℹ️ Sei staff e lo staff è **esente** dalle parole vietate: per provare usa un account normale'
      : `ℹ️ Sei ${isAdmin(member) ? 'amministratore' : 'staff'}: le parole vietate vengono eliminate anche a te (senza sanzioni), gli altri filtri no`);
  }

  const embed = baseEmbed(word ? COLORS.danger : COLORS.success)
    .setTitle('🧪 Test AutoMod')
    .addFields(
      { name: 'Risultato', value: word ? `🚫 Verrebbe **bloccato** (parola vietata: ||${word}||)` : '✅ Nessuna parola vietata trovata' },
      { name: 'Controlli', value: checks.join('\n').slice(0, 1024) },
    );
  return interaction.reply({ embeds: [embed], flags: EPH });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configura la moderazione automatica')
    .setDefaultMemberPermissions(P.ManageGuild)
    .addSubcommand((s) => s.setName('stato').setDescription('Mostra la configurazione dell’automod'))
    .addSubcommand((s) => s.setName('test').setDescription('Prova un testo e controlla che l’automod funzioni (permessi, log, esenzioni)')
      .addStringOption((o) => o.setName('testo').setDescription('Testo da provare (non viene pubblicato)').setRequired(true)))
    .addSubcommand((s) => s.setName('attiva').setDescription('Attiva o disattiva tutto l’automod')
      .addBooleanOption((o) => o.setName('attivo').setDescription('Attivo?').setRequired(true)))
    .addSubcommand((s) => s.setName('modulo').setDescription('Attiva o disattiva un singolo filtro')
      .addStringOption((o) => o.setName('nome').setDescription('Filtro').setRequired(true).addChoices(...MODULES))
      .addBooleanOption((o) => o.setName('attivo').setDescription('Attivo?').setRequired(true)))
    .addSubcommand((s) => s.setName('parola').setDescription('Parole vietate, separate da virgola. Usa * per le varianti: negr* blocca negro, negri…')
      .addStringOption((o) => o.setName('azione').setDescription('Aggiungi o rimuovi').setRequired(true).addChoices(...actionChoices))
      .addStringOption((o) => o.setName('parole').setDescription('Es. parola1, parola2').setRequired(true)))
    .addSubcommand((s) => s.setName('dominio').setDescription('Domini consentiti dall’anti-link (es. youtube.com)')
      .addStringOption((o) => o.setName('azione').setDescription('Aggiungi o rimuovi').setRequired(true).addChoices(...actionChoices))
      .addStringOption((o) => o.setName('domini').setDescription('Es. youtube.com, twitch.tv').setRequired(true)))
    .addSubcommand((s) => s.setName('ignora-canale').setDescription('Canali o categorie ignorati dall’automod')
      .addStringOption((o) => o.setName('azione').setDescription('Aggiungi o rimuovi').setRequired(true).addChoices(...actionChoices))
      .addChannelOption((o) => o.setName('canale').setDescription('Canale o categoria').setRequired(true)))
    .addSubcommand((s) => s.setName('ignora-ruolo').setDescription('Ruoli ignorati dall’automod (lo staff è già esente, tranne parole vietate)')
      .addStringOption((o) => o.setName('azione').setDescription('Aggiungi o rimuovi').setRequired(true).addChoices(...actionChoices))
      .addRoleOption((o) => o.setName('ruolo').setDescription('Ruolo').setRequired(true)))
    .addSubcommand((s) => s.setName('impostazioni').setDescription('Soglie e sanzioni')
      .addIntegerOption((o) => o.setName('soglia_avvisi').setDescription('Avvisi (in 10 min) prima del timeout').setMinValue(1).setMaxValue(20))
      .addIntegerOption((o) => o.setName('timeout_minuti').setDescription('Durata timeout in minuti').setMinValue(1).setMaxValue(40320))
      .addIntegerOption((o) => o.setName('max_menzioni').setDescription('Menzioni massime per messaggio').setMinValue(2).setMaxValue(50))
      .addIntegerOption((o) => o.setName('spam_messaggi').setDescription('Messaggi considerati spam...').setMinValue(3).setMaxValue(30))
      .addIntegerOption((o) => o.setName('spam_secondi').setDescription('...in questo numero di secondi').setMinValue(2).setMaxValue(60))
      .addIntegerOption((o) => o.setName('raid_ingressi').setDescription('Ingressi che fanno scattare l’allarme raid...').setMinValue(3).setMaxValue(100))
      .addIntegerOption((o) => o.setName('raid_secondi').setDescription('...in questo numero di secondi').setMinValue(5).setMaxValue(300))
      .addIntegerOption((o) => o.setName('eta_minima_account').setDescription('Giorni minimi di vita dell’account Discord (0 = off)').setMinValue(0).setMaxValue(365))
      .addStringOption((o) => o.setName('azione_account').setDescription('Cosa fare con gli account troppo recenti').addChoices(
        { name: 'Solo segnalazione nel log', value: 'log' }, { name: 'Espelli automaticamente', value: 'kick' }))
      .addBooleanOption((o) => o.setName('staff_esente_parole').setDescription('Lo staff può scrivere parole vietate? (consigliato: No)'))),

  async execute(interaction) {
    const { options, guild } = interaction;
    const gcfg = db.getGuild(guild.id);
    const am = gcfg.automod;
    const sub = options.getSubcommand();
    const done = (text) => {
      db.save();
      return interaction.reply({ embeds: [successEmbed(text)], flags: EPH });
    };

    if (sub === 'stato') {
      const list = (arr, fmt = (v) => `\`${v}\``) => (arr.length ? arr.map(fmt).join(', ').slice(0, 1024) : '*nessuno*');
      const embed = baseEmbed(am.enabled ? COLORS.success : COLORS.danger)
        .setTitle('🛡️ AutoMod LiteRP')
        .setDescription(`Stato generale: **${onOff(am.enabled)}**\nStaff e amministratori sono esenti da tutti i filtri tranne le parole vietate.\nUsa \`/automod test\` per verificare che tutto funzioni.`)
        .addFields(
          ...MODULES.map((m) => ({ name: m.name, value: onOff(m.value === 'badWords' ? am.badWords.enabled : am[m.value]), inline: true })),
          { name: 'Sanzioni', value: `Timeout di **${am.timeoutMinutes} min** dopo **${am.warnThreshold}** avvisi in 10 minuti (spam = timeout immediato)` },
          { name: 'Limiti', value: `Menzioni max: **${am.maxMentions}** • Spam: **${am.spamMessages}** messaggi in **${am.spamSeconds}s** • Raid: **${am.raidJoins}** ingressi in **${am.raidSeconds}s**` },
          {
            name: 'Età minima account',
            value: am.minAccountAgeDays ? `**${am.minAccountAgeDays} giorni** • Azione: ${am.accountAgeAction === 'kick' ? 'espulsione' : 'solo segnalazione'}` : 'Disattivato',
          },
          { name: 'Parole vietate', value: list(am.badWords.list, (v) => `||${v}||`) },
          { name: 'Staff e parole vietate', value: am.badWords.exemptStaff ? 'Lo staff **non** viene filtrato' : 'Filtrato anche lo staff (messaggio eliminato, nessuna sanzione)' },
          { name: 'Domini consentiti (anti-link)', value: list(am.whitelistDomains) },
          { name: 'Canali ignorati', value: list(am.ignoredChannels, (id) => `<#${id}>`), inline: true },
          { name: 'Ruoli ignorati', value: list(am.ignoredRoles, (id) => `<@&${id}>`), inline: true },
        );
      return interaction.reply({ embeds: [embed], flags: EPH });
    }

    if (sub === 'test') return runTest(interaction, gcfg, options.getString('testo', true));

    if (sub === 'attiva') {
      am.enabled = options.getBoolean('attivo', true);
      return done(`AutoMod ${am.enabled ? 'attivato' : 'disattivato'}.`);
    }

    if (sub === 'modulo') {
      const name = options.getString('nome', true);
      const value = options.getBoolean('attivo', true);
      if (name === 'badWords') am.badWords.enabled = value;
      else am[name] = value;
      return done(`**${MODULES.find((m) => m.value === name).name}**: ${onOff(value)}`);
    }

    if (sub === 'parola') {
      am.badWords.list = editList(am.badWords.list, options.getString('azione', true), options.getString('parole', true), (s) => s.toLowerCase());
      return done(`Parole vietate aggiornate (${am.badWords.list.length} totali).`);
    }

    if (sub === 'dominio') {
      const clean = (s) => s.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      am.whitelistDomains = editList(am.whitelistDomains, options.getString('azione', true), options.getString('domini', true), clean);
      return done(`Domini consentiti: ${am.whitelistDomains.map((d) => `\`${d}\``).join(', ') || 'nessuno'}`);
    }

    if (sub === 'ignora-canale') {
      const id = options.getChannel('canale', true).id;
      am.ignoredChannels = editList(am.ignoredChannels, options.getString('azione', true), id);
      return done(`Canali ignorati: ${am.ignoredChannels.map((c) => `<#${c}>`).join(', ') || 'nessuno'}`);
    }

    if (sub === 'ignora-ruolo') {
      const id = options.getRole('ruolo', true).id;
      am.ignoredRoles = editList(am.ignoredRoles, options.getString('azione', true), id);
      return done(`Ruoli ignorati: ${am.ignoredRoles.map((r) => `<@&${r}>`).join(', ') || 'nessuno'}`);
    }

    if (sub === 'impostazioni') {
      const map = {
        soglia_avvisi: 'warnThreshold', timeout_minuti: 'timeoutMinutes', max_menzioni: 'maxMentions', spam_messaggi: 'spamMessages',
        spam_secondi: 'spamSeconds', raid_ingressi: 'raidJoins', raid_secondi: 'raidSeconds', eta_minima_account: 'minAccountAgeDays',
      };
      let changed = 0;
      for (const [opt, key] of Object.entries(map)) {
        const v = options.getInteger(opt);
        if (v !== null) { am[key] = v; changed++; }
      }
      const ageAction = options.getString('azione_account');
      if (ageAction) { am.accountAgeAction = ageAction; changed++; }
      const exemptStaff = options.getBoolean('staff_esente_parole');
      if (exemptStaff !== null) { am.badWords.exemptStaff = exemptStaff; changed++; }
      if (!changed) return interaction.reply({ embeds: [errorEmbed('Specifica almeno un’impostazione da modificare.')], flags: EPH });
      return done('Impostazioni automod aggiornate. Usa `/automod stato` per vederle.');
    }
  },
};
