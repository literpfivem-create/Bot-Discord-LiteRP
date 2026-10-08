local secret = GetConvar('literp_discord_secret', '')
local ESX, QBCore

--- true se Config.Framework = 'qbox' e qbx_core è avviato (controllato ogni volta: funziona anche se questa risorsa parte prima)
local function qbox()
    return Config.Framework == 'qbox' and GetResourceState('qbx_core') == 'started'
end

local function debug(msg)
    if Config.Debug then print(('^5[literp_discord]^7 %s'):format(msg)) end
end

if secret == '' then
    print('^1[literp_discord] ATTENZIONE: imposta "set literp_discord_secret" nel server.cfg, altrimenti il bot rifiuterà i dati!^7')
end

local function post(path, data)
    PerformHttpRequest(Config.BotUrl .. path, function(status)
        if status ~= 200 then
            print(('^1[literp_discord] Errore %s inviando %s al bot (bot spento, URL o chiave errati?)^7'):format(tostring(status), path))
        else
            debug(('%s inviato'):format(path))
        end
    end, 'POST', json.encode(data), {
        ['Content-Type'] = 'application/json',
        ['Authorization'] = 'Bearer ' .. secret,
    })
end

CreateThread(function()
    if Config.Framework == 'esx' and GetResourceState('es_extended') == 'started' then
        ESX = exports['es_extended']:getSharedObject()
    elseif Config.Framework == 'qbcore' and GetResourceState('qb-core') == 'started' then
        QBCore = exports['qb-core']:GetCoreObject()
    elseif Config.Framework == 'qbox' then
        Wait(10000)
        if not qbox() then print('^1[literp_discord] Config.Framework = "qbox" ma qbx_core non è avviato: personaggi e staff Qbox non verranno letti.^7') end
    end
end)

local function discordFromIds(ids)
    for _, id in ipairs(ids or {}) do
        if type(id) == 'string' and id:sub(1, 8) == 'discord:' then return id:sub(9) end
    end
    return nil
end

local function getDiscordId(src)
    return discordFromIds(GetPlayerIdentifiers(src))
end

local function safeName(src)
    if not src then return nil end
    local ok, name = pcall(GetPlayerName, tostring(src))
    if ok then return name end
    return nil
end

local function isStaff(src)
    if IsPlayerAceAllowed(src, Config.StaffAce) then return true end

    if ESX then
        local xPlayer = ESX.GetPlayerFromId(tonumber(src))
        if xPlayer then
            local group = xPlayer.getGroup()
            for _, g in ipairs(Config.StaffGroups) do
                if group == g then return true end
            end
        end
    end

    if QBCore then
        for _, g in ipairs(Config.StaffGroups) do
            if QBCore.Functions.HasPermission(tonumber(src), g) then return true end
        end
    end

    if qbox() then
        for _, g in ipairs(Config.StaffGroups) do
            if exports.qbx_core:HasPermission(tonumber(src), g) then return true end
        end
    end

    return false
end

-- ===================================================== STATISTICHE (player / staff online)

local function sendStats()
    local players = GetPlayers()
    local staff, list = {}, {}
    for _, src in ipairs(players) do
        local name = GetPlayerName(src)
        if isStaff(src) then
            staff[#staff + 1] = { id = tonumber(src), name = name, discord = getDiscordId(src) }
        end
        if Config.SendPlayerList then
            -- discord: serve al bot per contare le ore giocate nel profilo del sito
            list[#list + 1] = { id = tonumber(src), name = name, discord = getDiscordId(src) }
        end
    end
    post('/api/stats', {
        players = #players,
        maxPlayers = GetConvarInt('sv_maxclients', 64),
        staff = staff,
        list = Config.SendPlayerList and list or nil,
    })
end

CreateThread(function()
    Wait(5000)
    while true do
        sendStats()
        Wait(Config.StatsInterval * 1000)
    end
end)

-- ===================================================== PERSONAGGI (profilo del sito)

local lastCharacter = {} -- src -> ultimo personaggio inviato (per inviarlo anche all'uscita, quando il player non c'è più)

--- Lavoro o gang (nil per la gang "none", cioè nessuna gang)
local function groupInfo(g)
    if type(g) ~= 'table' or not g.name or g.name == 'none' then return nil end
    return { label = g.label or g.name, grade = type(g.grade) == 'table' and g.grade.name or nil, onduty = g.onduty }
end

--- Dati del personaggio Qbox caricato da questo giocatore (nil se non ha ancora scelto il personaggio)
local function characterOf(src)
    local player = exports.qbx_core:GetPlayer(tonumber(src))
    if not player then return nil end
    local pd = player.PlayerData
    local info, money = pd.charinfo or {}, pd.money or {}
    return {
        citizenid = pd.citizenid,
        firstname = info.firstname,
        lastname = info.lastname,
        birthdate = info.birthdate,
        gender = info.gender,
        nationality = info.nationality,
        phone = info.phone,
        job = groupInfo(pd.job),
        gang = groupInfo(pd.gang),
        money = { cash = money.cash, bank = money.bank },
    }
end

--- Invia al bot i personaggi di questi giocatori (lista di server id)
local function sendCharacters(sources)
    if not (Config.SendCharacters and qbox()) then return end
    local players = {}
    for _, src in ipairs(sources) do
        local discord = getDiscordId(src)
        local character = discord and characterOf(src)
        if character then
            lastCharacter[tostring(src)] = { discord = discord, character = character }
            players[#players + 1] = lastCharacter[tostring(src)]
        end
    end
    if #players > 0 then post('/api/characters', { players = players }) end
end

-- Ingresso in città (personaggio scelto): Qbox passa l'oggetto player
AddEventHandler('QBCore:Server:PlayerLoaded', function(player)
    local src = player and player.PlayerData and player.PlayerData.source
    if src then SetTimeout(2000, function() sendCharacters({ src }) end) end
end)

-- Cambio lavoro o gang: aggiorna subito
AddEventHandler('QBCore:Server:OnJobUpdate', function(src) sendCharacters({ src }) end)
AddEventHandler('QBCore:Server:OnGangUpdate', function(src) sendCharacters({ src }) end)

-- Uscita (cambio personaggio o disconnessione): invia l'ultimo stato conosciuto
local function sendLast(src)
    local last = lastCharacter[tostring(src)]
    if not last then return end
    local fresh = qbox() and characterOf(src)
    if fresh then last.character = fresh end
    post('/api/characters', { players = { last } })
    lastCharacter[tostring(src)] = nil
end
AddEventHandler('QBCore:Server:OnPlayerUnload', function(src) sendLast(src) end)
AddEventHandler('playerDropped', function() sendLast(source) end)

-- Aggiornamento periodico (soldi e dati che cambiano spesso)
CreateThread(function()
    Wait(10000)
    while true do
        sendCharacters(GetPlayers())
        Wait(math.max(60, Config.CharacterInterval) * 1000)
    end
end)

-- ===================================================== BAN

--- Invia un ban al bot. Campi: name, reason, author, duration, expiration (unix), banId, discord, target (server id)
local function notifyBan(data)
    data = data or {}
    if data.target then
        local target = tostring(data.target)
        data.name = data.name or GetPlayerName(target)
        data.discord = data.discord or getDiscordId(target)
        data.target = nil
    end
    post('/api/ban', data)
end

-- Uso da altre risorse server-side:
--   exports['literp_discord']:NotifyBan({ target = source, reason = 'Cheat', author = 'Mario', duration = '7 giorni' })
--   TriggerEvent('literp_discord:ban', { name = 'Nome', discord = '123...', reason = '...', author = '...' })
exports('NotifyBan', notifyBan)
AddEventHandler('literp_discord:ban', notifyBan) -- solo server-side (non registrato come net event)

-- ===================================================== txAdmin

if Config.TxAdmin.Bans then
    AddEventHandler('txAdmin:events:playerBanned', function(ev)
        local expiration = ev.expiration
        if type(expiration) ~= 'number' then expiration = nil end

        local duration = ev.durationTranslated
        if not duration and not expiration then duration = 'Permanente' end

        notifyBan({
            name = ev.targetName or safeName(ev.targetNetId) or 'Sconosciuto (offline)',
            reason = ev.reason,
            author = ev.author,
            banId = ev.actionId,
            expiration = expiration,
            duration = duration,
            discord = discordFromIds(ev.targetIds),
            source = 'txAdmin',
        })
    end)
end

if Config.TxAdmin.Revokes then
    AddEventHandler('txAdmin:events:actionRevoked', function(ev)
        post('/api/revoke', {
            actionType = ev.actionType,
            actionId = ev.actionId,
            reason = ev.actionReason,
            name = (type(ev.playerName) == 'string' and ev.playerName) or 'Sconosciuto',
            discord = discordFromIds(ev.playerIds),
            revokedBy = ev.revokedBy,
        })
    end)
end

if Config.TxAdmin.Warns then
    AddEventHandler('txAdmin:events:playerWarned', function(ev)
        post('/api/event', {
            type = 'warn',
            name = ev.targetName or safeName(ev.targetNetId),
            id = ev.targetNetId,
            discord = discordFromIds(ev.targetIds),
            author = ev.author,
            reason = ev.reason,
            actionId = ev.actionId,
        })
    end)
end

if Config.TxAdmin.Kicks then
    AddEventHandler('txAdmin:events:playerKicked', function(ev)
        local target = ev.target or ev.targetNetId
        post('/api/event', {
            type = 'kick',
            name = safeName(target),
            id = target,
            discord = target and getDiscordId(tostring(target)) or nil,
            author = ev.author,
            reason = ev.reason,
        })
    end)
end

if Config.TxAdmin.Announcements then
    AddEventHandler('txAdmin:events:announcement', function(ev)
        post('/api/event', { type = 'announcement', author = ev.author, reason = ev.message })
    end)
end

if Config.TxAdmin.Restarts then
    AddEventHandler('txAdmin:events:scheduledRestart', function(ev)
        post('/api/event', { type = 'restart', seconds = ev.secondsRemaining })
    end)
    AddEventHandler('txAdmin:events:serverShuttingDown', function()
        post('/api/event', { type = 'shutdown' })
    end)
end

-- ===================================================== CONNESSIONI

if Config.LogConnections then
    AddEventHandler('playerJoining', function()
        local src = source
        post('/api/event', { type = 'connect', id = src, name = GetPlayerName(src), discord = getDiscordId(src) })
    end)
    AddEventHandler('playerDropped', function(reason)
        local src = source
        post('/api/event', { type = 'disconnect', id = src, name = GetPlayerName(src), discord = getDiscordId(src), reason = reason })
    end)
end

-- ===================================================== TEST

-- Comando console per testare il collegamento: literp_testban
RegisterCommand('literp_testban', function(src)
    if src ~= 0 then return end
    notifyBan({ name = 'Giocatore Test', reason = 'Test collegamento bot', author = 'Console', duration = '1 giorno', banId = 'TEST-001', source = 'test' })
    print('[literp_discord] Ban di test inviato al bot.')
end, true)
