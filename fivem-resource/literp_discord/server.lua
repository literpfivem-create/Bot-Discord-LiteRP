local secret = GetConvar('literp_discord_secret', '')
local ESX, QBCore

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
            list[#list + 1] = { id = tonumber(src), name = name }
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
