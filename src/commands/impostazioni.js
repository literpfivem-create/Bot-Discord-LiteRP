// /impostazioni — tutta la configurazione del bot, divisa per funzione.
const { ChannelType, EmbedBuilder, MessageFlags, PermissionFlagsBits: P, SlashCommandBuilder } = require('discord.js');
const db = require('../utils/db');
const fivem = require('../handlers/fivem');
const { buildWelcome, buildWelcomeDm, buildGoodbye } = require('../handlers/welcome');
const { COLORS, FOOTER, errorEmbed, successEmbed, isUrl, parseColor } = require('../utils/embeds');
const { parseDuration, formatDuration } = require('../utils/time');

const EPH = MessageFlags.Ephemeral;
const TEXT = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const LOG_CHANNELS = [
  ['ticket', 'ticketLogs', 'Ticket'],
  ['moderazione', 'modActions', 'Moderazione'],
  ['automod', 'modLogs', 'AutoMod'],
  ['server', 'serverLogs', 'Server'],
  ['fivem', 'fivemLogs', 'FiveM (staff)'],
];

const roleList = (ids) => (ids?.length ? ids.map((id) => `<@&${id}>`).join(', ') : '*nessuno*');
const chan = (id) => (id ? `<#${id}>` : '*non impostato*');
const yesNo = (v) => (v ? '✅' : '❌');
const check = (ok) => (ok ? '✅' : '⚠️');

const channelOpt = (name, description, required = false) => (o) =>
  o.setName(name).setDescription(description).setRequired(required).addChannelTypes(...TEXT);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('impostazioni')
    .setDescription('Configura il bot LiteRP')
    .setDefaultMemberPermissions(P.ManageGuild)
    .addSubcommand((s) => s.setName('panoramica').setDescription('Riepilogo della configurazione e cosa manca da impostare'))

    .addSubcommandGroup((g) => g.setName('staff').setDescription('Ruoli staff')
      .addSubcommand((s) => s.setName('aggiungi').setDescription('Aggiunge un ruolo staff (gestisce i ticket, esente dall’automod tranne parole vietate)')
        .addRoleOption((o) => o.setName('ruolo').setDescription('Ruolo').setRequired(true)))
      .addSubcommand((s) => s.setName('rimuovi').setDescription('Rimuove un ruolo staff')
        .addRoleOption((o) => o.setName('ruolo').setDescription('Ruolo').setRequired(true)))
      .addSubcommand((s) => s.setName('lista').setDescription('Mostra i ruoli staff')))

    .addSubcommandGroup((g) => g.setName('benvenuto').setDescription('Messaggio di benvenuto')
      .addSubcommand((s) => s.setName('canale').setDescription('Canale dove inviare il benvenuto (lo attiva)')
        .addChannelOption(channelOpt('canale', 'Canale', true)))
      .addSubcommand((s) => s.setName('messaggio').setDescription('Testo sotto l’immagine')
        .addStringOption((o) => o.setName('testo').setDescription('{user} {nome} {username} {server} {count} — \\n per andare a capo').setRequired(true).setMaxLength(2000)))
      .addSubcommand((s) => s.setName('immagine').setDescription('Immagine "BENVENUTO <nome> dentro LiteRP"')
        .addBooleanOption((o) => o.setName('attiva').setDescription('Mostra l’immagine'))
        .addStringOption((o) => o.setName('titolo').setDescription('Scritta in alto (default: BENVENUTO)').setMaxLength(20))
        .addStringOption((o) => o.setName('sottotitolo').setDescription('Scritta sotto il nome (default: dentro {server})').setMaxLength(40))
        .addStringOption((o) => o.setName('sfondo').setDescription('URL immagine di sfondo ("rimuovi" = sfondo predefinito)'))
        .addStringOption((o) => o.setName('colore').setDescription('Colore principale, es. #00a8ff')))
      .addSubcommand((s) => s.setName('dm').setDescription('Messaggio privato al nuovo membro')
        .addBooleanOption((o) => o.setName('attivo').setDescription('Invia il DM').setRequired(true))
        .addStringOption((o) => o.setName('testo').setDescription('Testo del DM (stessi segnaposto)').setMaxLength(2000)))
      .addSubcommand((s) => s.setName('attiva').setDescription('Attiva o disattiva il benvenuto nel canale')
        .addBooleanOption((o) => o.setName('attivo').setDescription('Attivo?').setRequired(true)))
      .addSubcommand((s) => s.setName('prova').setDescription('Mostra un’anteprima del benvenuto con il tuo profilo')))

    .addSubcommandGroup((g) => g.setName('addio').setDescription('Messaggio quando qualcuno esce')
      .addSubcommand((s) => s.setName('canale').setDescription('Canale (vuoto = stesso del benvenuto)')
        .addChannelOption(channelOpt('canale', 'Canale')))
      .addSubcommand((s) => s.setName('messaggio').setDescription('Testo del messaggio di addio')
        .addStringOption((o) => o.setName('testo').setDescription('{username} {nome} {server} {count}').setRequired(true).setMaxLength(2000)))
      .addSubcommand((s) => s.setName('attiva').setDescription('Attiva o disattiva il messaggio di addio')
        .addBooleanOption((o) => o.setName('attivo').setDescription('Attivo?').setRequired(true)))
      .addSubcommand((s) => s.setName('prova').setDescription('Anteprima del messaggio di addio')))

    .addSubcommandGroup((g) => g.setName('log').setDescription('Canali di log')
      .addSubcommand((s) => {
        s.setName('canali').setDescription('Imposta i canali di log (solo quelli che vuoi cambiare)');
        for (const [opt, , label] of LOG_CHANNELS) s.addChannelOption(channelOpt(opt, `Log ${label}`));
        return s.addBooleanOption((o) => o.setName('disattiva_vuoti').setDescription('Disattiva i log che non hai indicato'));
      })
      .addSubcommand((s) => s.setName('eventi').setDescription('Cosa registrare nel log server')
        .addBooleanOption((o) => o.setName('messaggi').setDescription('Messaggi eliminati/modificati'))
        .addBooleanOption((o) => o.setName('membri').setDescription('Ingressi, uscite, ruoli, nickname, timeout, ban'))
        .addBooleanOption((o) => o.setName('vocali').setDescription('Ingressi/uscite dai canali vocali'))))

    .addSubcommandGroup((g) => g.setName('fivem').setDescription('Server FiveM')
      .addSubcommand((s) => s.setName('server').setDescription('IP, link connect e nome del server')
        .addStringOption((o) => o.setName('ip').setDescription('IP:porta (es. 123.45.67.89:30120)'))
        .addStringOption((o) => o.setName('connect').setDescription('Link connect (es. cfx.re/join/abc123)'))
        .addStringOption((o) => o.setName('nome').setDescription('Nome del server (es. LiteRP)').setMaxLength(40)))
      .addSubcommand((s) => s.setName('canali').setDescription('Canale stato server e canale annunci ban')
        .addChannelOption(channelOpt('stato', 'Stato server live (player e staff online)'))
        .addChannelOption(channelOpt('ban', 'Annunci dei ban FiveM')))
      .addSubcommand((s) => s.setName('opzioni').setDescription('Opzioni ban e avvisi')
        .addBooleanOption((o) => o.setName('mostra_staff_ban').setDescription('Mostra lo staff negli annunci di ban'))
        .addBooleanOption((o) => o.setName('dm_ban').setDescription('Avvisa in DM il giocatore bannato'))
        .addBooleanOption((o) => o.setName('avvisi_stato').setDescription('Avvisa quando il server va offline/torna online'))
        .addBooleanOption((o) => o.setName('stato_bot').setDescription('Mostra i player online nello stato del bot'))))

    .addSubcommand((s) => s.setName('sanzioni').setDescription('Sanzioni automatiche in base agli avvertimenti (0 = disattiva)')
      .addIntegerOption((o) => o.setName('timeout_a').setDescription('Avvisi per il timeout automatico').setMinValue(0).setMaxValue(50))
      .addStringOption((o) => o.setName('durata_timeout').setDescription('Durata del timeout automatico (es. 1h, 1g)'))
      .addIntegerOption((o) => o.setName('kick_a').setDescription('Avvisi per l’espulsione automatica').setMinValue(0).setMaxValue(50))
      .addIntegerOption((o) => o.setName('ban_a').setDescription('Avvisi per il ban automatico').setMinValue(0).setMaxValue(50))
      .addIntegerOption((o) => o.setName('scadenza_avvisi_giorni').setDescription('Dopo quanti giorni un avviso scade (0 = mai)').setMinValue(0).setMaxValue(365))),

  async execute(interaction) {
    const { guild, options } = interaction;
    const gcfg = db.getGuild(guild.id);
    const group = options.getSubcommandGroup(false);
    const sub = options.getSubcommand();
    const ok = (text) => {
      db.save();
      return interaction.reply({ embeds: [successEmbed(text)], flags: EPH });
    };
    const fail = (text) => interaction.reply({ embeds: [errorEmbed(text)], flags: EPH });
    const writable = (channel) => channel.permissionsFor(guild.members.me)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks, P.AttachFiles]);

    if (!group && sub === 'panoramica') return interaction.reply({ embeds: [overview(guild, gcfg)], flags: EPH });
    if (!group && sub === 'sanzioni') return sanctions(interaction, gcfg, ok, fail);

    // ------------------------------------------------------------ STAFF
    if (group === 'staff') {
      if (sub === 'lista') return interaction.reply({ embeds: [successEmbed(`Ruoli staff: ${roleList(gcfg.staffRoles)}`)], flags: EPH });
      const role = options.getRole('ruolo', true);
      if (role.id === guild.id) return fail('Non puoi usare @everyone come ruolo staff.');
      if (sub === 'aggiungi' && !gcfg.staffRoles.includes(role.id)) gcfg.staffRoles.push(role.id);
      if (sub === 'rimuovi') gcfg.staffRoles = gcfg.staffRoles.filter((id) => id !== role.id);
      return ok(`Ruoli staff: ${roleList(gcfg.staffRoles)}\n-# Lo staff gestisce i ticket delle categorie senza ruoli specifici e non viene filtrato dall’automod (tranne le parole vietate).`);
    }

    // ------------------------------------------------------------ BENVENUTO
    if (group === 'benvenuto') {
      const w = gcfg.welcome;
      if (sub === 'canale') {
        const channel = options.getChannel('canale', true);
        if (!writable(channel)) return fail(`Il bot non può scrivere in ${channel}.`);
        gcfg.channels.welcome = channel.id;
        w.enabled = true;
        return ok(`I nuovi membri verranno accolti in ${channel}.\nProva il risultato con \`/impostazioni benvenuto prova\`.`);
      }
      if (sub === 'messaggio') {
        w.message = options.getString('testo', true);
        return ok('Testo del benvenuto aggiornato. Usa `/impostazioni benvenuto prova` per vederlo.');
      }
      if (sub === 'immagine') {
        const card = options.getBoolean('attiva');
        const title = options.getString('titolo');
        const subtitle = options.getString('sottotitolo');
        const bg = options.getString('sfondo');
        const color = options.getString('colore');
        if (card !== null) w.card = card;
        if (title) w.title = title;
        if (subtitle) w.subtitle = subtitle;
        if (bg) {
          if (bg.toLowerCase() === 'rimuovi') w.background = null;
          else if (isUrl(bg)) w.background = bg;
          else return fail('URL sfondo non valido (deve iniziare con http:// o https://).');
        }
        if (color) {
          if (parseColor(color) === null) return fail('Colore non valido. Usa il formato #RRGGBB.');
          w.color = parseColor(color);
        }
        return ok(`Immagine di benvenuto: ${yesNo(w.card)} • Titolo: **${w.title}** • Sottotitolo: **${w.subtitle}**\nSfondo: ${w.background ? 'personalizzato' : 'predefinito'}\nUsa \`/impostazioni benvenuto prova\` per vederla.`);
      }
      if (sub === 'dm') {
        w.dm = options.getBoolean('attivo', true);
        const text = options.getString('testo');
        if (text) w.dmMessage = text;
        return ok(`DM di benvenuto: ${yesNo(w.dm)}`);
      }
      if (sub === 'attiva') {
        w.enabled = options.getBoolean('attivo', true);
        return ok(`Benvenuto nel canale ${w.enabled ? 'attivato' : 'disattivato'} (${chan(gcfg.channels.welcome)}).`);
      }
      if (sub === 'prova') {
        await interaction.deferReply({ flags: EPH });
        const preview = await buildWelcome(interaction.member, gcfg);
        const embeds = [...preview.embeds];
        if (w.dm) embeds.push(...buildWelcomeDm(interaction.member, gcfg).embeds);
        const status = !gcfg.channels.welcome ? '\n⚠️ Nessun canale impostato: usa `/impostazioni benvenuto canale`.' : !w.enabled ? '\n⚠️ Il benvenuto è disattivato.' : '';
        return interaction.editReply({
          content: `👀 **Anteprima**${w.dm ? ' (canale + DM)' : ''}${status}\n${preview.content}`,
          embeds,
          files: preview.files,
          allowedMentions: { parse: [] },
        });
      }
    }

    // ------------------------------------------------------------ ADDIO
    if (group === 'addio') {
      const gb = gcfg.goodbye;
      if (sub === 'canale') {
        const channel = options.getChannel('canale');
        if (channel && !writable(channel)) return fail(`Il bot non può scrivere in ${channel}.`);
        gcfg.channels.goodbye = channel?.id ?? null;
        return ok(`Messaggio di addio in ${channel ?? `${chan(gcfg.channels.welcome)} (canale del benvenuto)`}.`);
      }
      if (sub === 'messaggio') {
        gb.message = options.getString('testo', true);
        return ok('Messaggio di addio aggiornato.');
      }
      if (sub === 'attiva') {
        gb.enabled = options.getBoolean('attivo', true);
        return ok(`Messaggio di addio ${gb.enabled ? 'attivato' : 'disattivato'}.`);
      }
      if (sub === 'prova') {
        return interaction.reply({ content: '👀 **Anteprima**', ...buildGoodbye(interaction.member, gcfg), flags: EPH });
      }
    }

    // ------------------------------------------------------------ LOG
    if (group === 'log') {
      if (sub === 'canali') {
        const changed = [];
        for (const [opt, key, label] of LOG_CHANNELS) {
          const channel = options.getChannel(opt);
          if (channel) {
            if (!writable(channel)) return fail(`Il bot non può scrivere in ${channel}.`);
            gcfg.channels[key] = channel.id;
            changed.push(label);
          } else if (options.getBoolean('disattiva_vuoti')) {
            gcfg.channels[key] = null;
          }
        }
        if (!changed.length && !options.getBoolean('disattiva_vuoti')) return fail('Indica almeno un canale.');
        return ok(LOG_CHANNELS.map(([, key, label]) => `**${label}:** ${chan(gcfg.channels[key])}`).join('\n'));
      }
      if (sub === 'eventi') {
        for (const [opt, key] of [['messaggi', 'messages'], ['membri', 'members'], ['vocali', 'voice']]) {
          const v = options.getBoolean(opt);
          if (v !== null) gcfg.logs[key] = v;
        }
        return ok(`Log server in ${chan(gcfg.channels.serverLogs)}\nMessaggi ${yesNo(gcfg.logs.messages)} • Membri ${yesNo(gcfg.logs.members)} • Vocali ${yesNo(gcfg.logs.voice)}`);
      }
    }

    // ------------------------------------------------------------ FIVEM
    if (group === 'fivem') {
      const f = gcfg.fivem;
      if (sub === 'server') {
        const ip = options.getString('ip');
        const connect = options.getString('connect');
        const name = options.getString('nome');
        if (ip) f.ip = ip.trim();
        if (connect) f.connect = connect.trim().replace(/^https?:\/\//i, '');
        if (name) f.name = name.trim();
        db.save();
        fivem.updateGuild(interaction.client, guild).catch(() => {});
        return ok(`IP: \`${f.ip ?? '—'}\` • Connect: \`${f.connect ?? '—'}\` • Nome: **${f.name}**`);
      }
      if (sub === 'canali') {
        const status = options.getChannel('stato');
        const bans = options.getChannel('ban');
        if (!status && !bans) return fail('Indica almeno un canale.');
        for (const c of [status, bans]) if (c && !writable(c)) return fail(`Il bot non può scrivere in ${c}.`);
        if (status && status.id !== gcfg.channels.serverStatus) {
          gcfg.channels.serverStatus = status.id;
          gcfg.statusMessageId = null;
        }
        if (bans) gcfg.channels.fivemBans = bans.id;
        db.save();
        fivem.updateGuild(interaction.client, guild).catch(() => {});
        return ok(`Stato server: ${chan(gcfg.channels.serverStatus)}\nAnnunci ban: ${chan(gcfg.channels.fivemBans)}`);
      }
      if (sub === 'opzioni') {
        for (const [opt, key] of [['mostra_staff_ban', 'showBanAuthor'], ['dm_ban', 'dmBan'], ['avvisi_stato', 'statusAlerts'], ['stato_bot', 'botPresence']]) {
          const v = options.getBoolean(opt);
          if (v !== null) f[key] = v;
        }
        if (options.getBoolean('stato_bot') === false) interaction.client.user.setPresence({ activities: [] });
        return ok(
          `Staff negli annunci ban: ${yesNo(f.showBanAuthor)} • DM al bannato: ${yesNo(f.dmBan)}\n` +
            `Avvisi online/offline: ${yesNo(f.statusAlerts)} • Player nello stato del bot: ${yesNo(f.botPresence)}`,
        );
      }
    }
  },
};

// ---------------------------------------------------------------- funzioni di supporto

function sanctions(interaction, gcfg, ok, fail) {
  const { options } = interaction;
  const m = gcfg.moderation;
  const durationRaw = options.getString('durata_timeout');
  if (durationRaw) {
    const ms = parseDuration(durationRaw);
    if (!ms || ms < 60_000 || ms > 28 * 86_400_000) return fail('Durata non valida (da 1m a 28g, es. `1h`, `1g`).');
    m.timeoutMinutes = Math.round(ms / 60_000);
  }
  for (const [opt, key] of [['timeout_a', 'timeoutAt'], ['kick_a', 'kickAt'], ['ban_a', 'banAt'], ['scadenza_avvisi_giorni', 'warnExpireDays']]) {
    const v = options.getInteger(opt);
    if (v !== null) m[key] = v;
  }
  return ok(
    `Timeout automatico: **${m.timeoutAt ? `a ${m.timeoutAt} avvisi, ${formatDuration(m.timeoutMinutes * 60_000)}` : 'off'}**\n` +
      `Kick automatico: **${m.kickAt ? `a ${m.kickAt} avvisi` : 'off'}**\nBan automatico: **${m.banAt ? `a ${m.banAt} avvisi` : 'off'}**\n` +
      `Scadenza avvisi: **${m.warnExpireDays ? `${m.warnExpireDays} giorni` : 'mai'}**`,
  );
}

function overview(guild, gcfg) {
  const c = gcfg.channels;
  const ts = gcfg.ticketSettings;
  const f = gcfg.fivem;
  const m = gcfg.moderation;
  const todo = [];
  if (!gcfg.staffRoles.length) todo.push('`/impostazioni staff aggiungi` — scegli il ruolo staff');
  if (!c.ticketPanel) todo.push('`/ticket configura` — crea il pannello e configura i ticket');
  if (!c.welcome) todo.push('`/impostazioni benvenuto canale` — canale di benvenuto');
  if (!c.ticketLogs || !c.modActions) todo.push('`/impostazioni log canali` — canali di log');
  if (!f.ip) todo.push('`/impostazioni fivem server` — IP del server FiveM');
  if (!c.serverStatus) todo.push('`/impostazioni fivem canali` — stato server e ban');

  const embed = new EmbedBuilder()
    .setColor(todo.length ? COLORS.warning : COLORS.success)
    .setAuthor({ name: `${guild.name} • Configurazione bot`, iconURL: guild.iconURL() ?? undefined })
    .setDescription(todo.length ? `**Da completare**\n${todo.map((t) => `• ${t}`).join('\n')}` : '✅ **Tutto configurato!**')
    .addFields(
      { name: '🛡️ Staff', value: roleList(gcfg.staffRoles), inline: true },
      { name: '🎭 Autorole', value: `${roleList(gcfg.autoroles)}${gcfg.autorolesBots.length ? `\n🤖 ${roleList(gcfg.autorolesBots)}` : ''}`, inline: true },
      { name: '🛡️ AutoMod', value: gcfg.automod.enabled ? '✅ Attivo' : '❌ Disattivo', inline: true },
      {
        name: '🎫 Ticket · `/ticket configura`',
        value: `${check(c.ticketPanel)} Pannello: ${chan(c.ticketPanel)}\nMax aperti **${ts.maxOpen}** • Inattivi **${ts.autoCloseHours ? `${ts.autoCloseHours}h` : 'off'}** • Valutazione ${yesNo(ts.rating)}`,
      },
      {
        name: '👋 Benvenuto e addio',
        value: `${check(c.welcome && gcfg.welcome.enabled)} Benvenuto: ${chan(c.welcome)}${gcfg.welcome.enabled ? '' : ' (disattivato)'} • Immagine ${yesNo(gcfg.welcome.card)} • DM ${yesNo(gcfg.welcome.dm)}\n` +
          `${check(gcfg.goodbye.enabled)} Addio: ${gcfg.goodbye.enabled ? chan(c.goodbye || c.welcome) : 'disattivato'}`,
      },
      { name: '📜 Log', value: LOG_CHANNELS.map(([, key, label]) => `${check(c[key])} ${label}: ${chan(c[key])}`).join('\n') },
      {
        name: '🎮 FiveM',
        value: `${check(f.ip)} IP: ${f.ip ? `\`${f.ip}\`` : '*non impostato*'} • Nome: **${f.name}**\n` +
          `${check(c.serverStatus)} Stato: ${chan(c.serverStatus)} • ${check(c.fivemBans)} Ban: ${chan(c.fivemBans)}\n` +
          `Contatori: **${gcfg.stats.counters.length}** (/serverstats) • Avvisi online/offline ${yesNo(f.statusAlerts)} • DM ban ${yesNo(f.dmBan)}`,
      },
      {
        name: '⚖️ Sanzioni automatiche',
        value: `Timeout a **${m.timeoutAt || 'off'}** • Kick a **${m.kickAt || 'off'}** • Ban a **${m.banAt || 'off'}** avvisi • Scadenza **${m.warnExpireDays ? `${m.warnExpireDays}g` : 'mai'}**`,
      },
    )
    .setFooter(FOOTER);
  return embed;
}
