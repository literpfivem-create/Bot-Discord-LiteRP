Config = {}

-- Indirizzo del bot Discord (IP della macchina dove gira il bot + API_PORT del file .env)
-- Con il bot su Railway: l'indirizzo pubblico del bot, es. 'https://literp-bot.up.railway.app'
-- Se bot e server FiveM sono sulla stessa macchina lascia 127.0.0.1
Config.BotUrl = 'http://127.0.0.1:3001'

-- La chiave segreta NON va scritta qui: mettila nel server.cfg
--   set literp_discord_secret "la_stessa_chiave_di_API_SECRET"

-- Ogni quanti secondi inviare player/staff online al bot
Config.StatsInterval = 30

-- Invia al bot anche i nomi dei giocatori online (comando /giocatori su Discord)
-- Serve anche a contare le ore giocate mostrate nel profilo del sito
Config.SendPlayerList = true

-- ===== Profilo del sito =====
-- Invia al bot i personaggi Qbox (nome, lavoro, gang, contanti, banca, telefono) collegati al Discord del giocatore.
-- Li vede solo il giocatore stesso nella pagina /profilo del sito, dopo l'accesso con Discord.
-- Funziona solo con Config.Framework = 'qbox'.
Config.SendCharacters = true
-- Ogni quanti secondi aggiornare i personaggi dei giocatori online (oltre a ingresso e uscita dalla città)
Config.CharacterInterval = 300

-- Come riconoscere lo staff in game:
--   'ace'    -> permesso ACE (Config.StaffAce), es. nel server.cfg: add_ace group.admin literp.staff allow
--   'esx'    -> gruppo ESX (Config.StaffGroups)
--   'qbcore' -> permessi QBCore (Config.StaffGroups)
--   'qbox'   -> permessi Qbox / qbx_core (Config.StaffGroups) + personaggi per il profilo del sito
-- Il controllo ACE viene sempre fatto, anche con esx/qbcore.
Config.Framework = 'qbox'
Config.StaffAce = 'literp.staff'
Config.StaffGroups = { 'helper', 'mod', 'admin', 'superadmin', 'god' }

-- ===== Eventi txAdmin inviati al bot =====
Config.TxAdmin = {
    Bans = true,          -- ban -> canale pubblico ban-fivem (+ DM al giocatore)
    Revokes = true,       -- ban/warn revocati
    Warns = true,         -- avvertimenti in game -> log-fivem (staff)
    Kicks = true,         -- kick -> log-fivem (staff)
    Announcements = true, -- annunci staff -> log-fivem (staff)
    Restarts = true,      -- riavvii programmati -> avviso nel canale stato-server
}

-- Log di connessioni/disconnessioni nel canale log-fivem (sconsigliato con tanti player: molti messaggi)
Config.LogConnections = false

Config.Debug = false
