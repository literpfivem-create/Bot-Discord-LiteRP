Config = {}

-- ===== Collegamento al bot =====
-- Indirizzo e chiave vanno nel server.cfg (così questo file non va mai modificato):
--   set literp_discord_url "https://indirizzo-del-bot.up.railway.app"
--   set literp_discord_secret "la_stessa_chiave_di_API_SECRET"
-- Config.BotUrl si usa solo se literp_discord_url non è impostato (es. bot sulla stessa macchina).
Config.BotUrl = 'http://127.0.0.1:3001'

-- Ogni quanti secondi inviare player/staff online al bot
Config.StatsInterval = 30

-- Invia al bot anche i nomi dei giocatori online (comando /giocatori su Discord)
-- Serve anche a contare le ore giocate mostrate nel profilo del sito
Config.SendPlayerList = true

-- ===== Profilo del sito =====
-- Invia al bot i personaggi ESX (nome, data di nascita, lavoro, contanti, banca) collegati al Discord del giocatore.
-- Li vede solo il giocatore stesso nella pagina /profilo del sito, dopo l'accesso con Discord.
-- Funziona solo con Config.Framework = 'esx'.
Config.SendCharacters = true
-- Ogni quanti secondi aggiornare i personaggi dei giocatori online (oltre a ingresso, cambio lavoro e uscita)
Config.CharacterInterval = 300

-- Come riconoscere lo staff in game:
--   'esx'    -> gruppo ESX del giocatore (Config.StaffGroups) + personaggi per il profilo del sito
--   'qbcore' -> permessi QBCore (Config.StaffGroups)
--   'ace'    -> solo permesso ACE (Config.StaffAce)
-- Il controllo ACE viene sempre fatto: nel server.cfg puoi aggiungere  add_ace group.admin literp.staff allow
Config.Framework = 'esx'
Config.StaffAce = 'literp.staff'
Config.StaffGroups = { 'helper', 'mod', 'admin', 'superadmin', 'owner' }

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
