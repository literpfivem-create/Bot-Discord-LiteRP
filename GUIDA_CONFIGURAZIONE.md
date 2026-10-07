# 📘 Guida configurazione LiteRP Bot

Questa guida è in due parti:

1. **[Discord](#parte-1--discord)**: cosa impostare nel server, in ordine.
2. **[FiveM e txAdmin](#parte-2--collegamento-a-fivem-e-txadmin)**: come collegare il server di gioco al bot, per staff online, ban automatici, riavvii e altro.

> 💡 In qualsiasi momento scrivi **`/impostazioni panoramica`** su Discord: ti mostra cosa è configurato (✅) e cosa manca (⚠️).

---

## 📋 Situazione attuale (6 ottobre 2026)

| Cosa | Stato |
|---|---|
| Canale di benvenuto | ✅ Fatto |
| Pannello ticket | ✅ Fatto (va aggiornato col nuovo design, vedi punto 2) |
| Log ticket | ✅ Fatto |
| Ruolo automatico (`・Cittadino di Lite®`) | ✅ Fatto |
| **Ruolo staff** | ❌ **Da fare**: è il più importante |
| Log moderazione, automod, server, FiveM | ❌ Da fare |
| Dati del server FiveM (IP, canali stato e ban) | ❌ Da fare |
| **Collegamento FiveM** (`API_SECRET` nel file `.env`) | ❌ **Da fare**: oggi è disattivato |

---

# PARTE 1 — Discord

Tutti i comandi si scrivono in un canale qualsiasi del server. Le risposte dei comandi di configurazione le vedi solo tu.

### ✅ 1. Ruolo staff (obbligatorio)

```
/impostazioni staff aggiungi ruolo:@Staff
```

Ripeti il comando per ogni ruolo staff (es. `@Helper`, `@Moderatore`, `@Amministrazione`).

I ruoli staff:
- vedono e gestiscono i ticket, tranne nelle categorie a cui assegni ruoli specifici;
- non vengono bloccati dall'AutoMod (tranne le parole vietate, che valgono per tutti);
- possono ancora scrivere quando un canale viene bloccato con `/canale blocca`.

### ✅ 2. Sistema ticket

```
/ticket configura
```

Si apre una schermata con menu e pulsanti. Ogni modifica viene salvata subito.

1. **📩 Canale del pannello**: scegli il canale dove gli utenti aprono i ticket. Riselezionalo anche se è già impostato, così il pannello viene rimandato con il nuovo design.
2. **📜 Canale dei log**: già fatto. Lì arrivano aperture, chiusure, transcript e valutazioni.
3. **🗂️ Tipo di ticket**: per ogni tipo puoi scegliere:
   - la **categoria Discord** in cui si aprono quei ticket (oppure "📁 Crea categoria automaticamente");
   - i **ruoli che li gestiscono**. Esempi consigliati:

   | Tipo | Chi lo gestisce |
   |---|---|
   | 🟥 Ticket Founder | solo `@Founder` / `@Owner` |
   | 💻 Ticket Developer | `@Developer` |
   | 💵 Ticket Donazioni | `@Owner` / `@Amministrazione` |
   | ⚫ Ticket Anticheat | `@Amministrazione` |
   | Tutti gli altri | lasciali vuoti: li gestisce lo staff |

4. **⏰ Limiti e inattività**: per esempio 2 ticket aperti per utente e chiusura dopo 48 ore senza risposte.
5. **🔔 Ping staff** e **⭐ Valutazione**: attivali o disattivali a piacere.

### ✅ 3. Benvenuto e addio

Il canale è già impostato. Per vedere com'è oggi:

```
/impostazioni benvenuto prova
```

Personalizzazioni facoltative:

```
/impostazioni benvenuto messaggio testo:...        ← testo sotto l'immagine
/impostazioni benvenuto immagine colore:#00a8ff    ← colore; con "sfondo:" metti un'immagine tua
/impostazioni benvenuto dm attivo:True             ← messaggio privato al nuovo membro
/impostazioni addio canale canale:#addii           ← se vuoto usa il canale di benvenuto
/impostazioni addio attiva attivo:False            ← per disattivare il messaggio di addio
```

Nei testi puoi usare: `{user}` (menzione), `{nome}`, `{username}`, `{server}`, `{count}` (numero di membri), `\n` per andare a capo.
Per citare un canale, scrivi `#` e sceglilo dalla lista.

### ✅ 4. Canali di log

Crea i canali (visibili solo allo staff) e poi:

```
/impostazioni log canali moderazione:#log-moderazione automod:#log-automod server:#log-server fivem:#log-fivem
```

| Log | Cosa contiene |
|---|---|
| Moderazione | warn, timeout, kick e ban fatti con `/mod`, con numero del caso |
| AutoMod | messaggi bloccati (link, spam, parolacce…), allarmi raid |
| Server | messaggi eliminati o modificati, ingressi e uscite, cambi di ruoli e nickname, vocali |
| FiveM | warn, kick e annunci fatti in game da txAdmin |

Per scegliere cosa registrare nel log server: `/impostazioni log eventi messaggi:True membri:True vocali:False`

### ✅ 5. Ruoli automatici

Già fatto. Comandi utili:

```
/ruoli automatici lista            ← controlla che sia tutto ✅
/ruoli automatici sincronizza      ← dà il ruolo a chi non ce l'ha
```

### ✅ 6. Sanzioni automatiche dei warn

```
/impostazioni sanzioni timeout_a:3 durata_timeout:1h kick_a:5 ban_a:7 scadenza_avvisi_giorni:30
```

Con queste impostazioni:
- a **3** warn: timeout di 1 ora;
- a **5** warn: kick;
- a **7** warn: ban;
- dopo 30 giorni un warn scade.

Metti `0` per disattivare una sanzione.

### ✅ 7. AutoMod

```
/automod stato                                         ← vedi i filtri attivi
/automod test testo:...                                ← controlla permessi, canale log ed esenzioni
/automod parola azione:Aggiungi parole:parola1, parola2
/automod parola azione:Aggiungi parole:negr*           ← * blocca anche le varianti (negro, negri, negra…)
/automod modulo nome:Anti-link attivo:True             ← blocca i link (YouTube, Twitch… restano consentiti)
/automod impostazioni eta_minima_account:7 azione_account:Solo segnalazione nel log
```

### ✅ 8. Dati del server FiveM (anche prima della Parte 2)

```
/impostazioni fivem server ip:IP_DEL_SERVER:30120 connect:cfx.re/join/xxxxxx nome:LiteRP
/impostazioni fivem canali stato:#stato-server ban:#ban-fivem
/serverstats aggiungi tipo:Giocatori online su FiveM
```

- **IP**: lo trovi su txAdmin o dal tuo hosting. La porta di solito è `30120`.
- **connect**: il link `cfx.re/join/...` del server (lo trovi su txAdmin o su servers.fivem.net).
- **contatori**: ora si gestiscono con `/serverstats` (vocali o testuali, anche per ruoli, membri, ticket...). Discord permette 2 rinomine ogni 10 minuti per canale.

Già solo con l'IP il bot mostra quanti **player** sono online. Per vedere chi dello **staff** è online e ricevere **ban** e **riavvii** automatici serve la Parte 2.

### ✅ 9. Facoltativi

```
/ruoli pannello crea titolo:🔔 Notifiche          ← pannello con pulsanti per prendersi ruoli da soli
/messaggio programmato aggiungi canale:#generale testo:Ricorda di votare il server! intervallo:6h
/messaggio annuncio canale:#annunci menzione:@everyone
```

### ✅ 10. Controllo finale

```
/impostazioni panoramica
```

Se in cima compare **"✅ Tutto configurato!"**, la parte Discord è finita.

---

# PARTE 2 — Collegamento a FiveM e txAdmin

### Come funziona

```
 Server FiveM                                   Bot Discord
┌──────────────────────┐   ogni 30 secondi    ┌─────────────────────┐
│ risorsa literp_discord│ ──── player, staff ─▶│  porta 3000 (API)   │──▶ #stato-server, contatori
│  + eventi di txAdmin  │ ──── ban, kick… ────▶│  protetta da chiave │──▶ #ban-fivem, #log-fivem
└──────────────────────┘                       └─────────────────────┘
```

Il server FiveM **manda** i dati al bot, quindi il server FiveM deve riuscire a raggiungere il PC (o la VPS) dove gira il bot.
**Su txAdmin non va configurato niente**: la risorsa riceve da sola gli eventi di txAdmin (ban, warn, kick, annunci, riavvii).

### Passo 1 — Crea la chiave segreta (sul PC del bot)

La chiave è una password che il server FiveM e il bot devono avere **uguale**. Generane una in PowerShell:

```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | ForEach-Object {[char]$_})
```

Apri il file **`.env`** nella cartella del bot e sostituisci la riga `API_SECRET`:

```env
API_SECRET=la_chiave_che_hai_generato
```

Riavvia il bot (`avvia.bat`). Nella finestra del bot deve comparire:

```
🌐 API FiveM in ascolto sulla porta 3000
```

Se invece compare `⚠️ API_SECRET non impostata`, la chiave non è stata salvata bene.

### Passo 2 — Il server FiveM deve poter raggiungere il bot

Scegli il tuo caso:

| Dove gira il bot | Cosa fare | `BotUrl` (passo 4) |
|---|---|---|
| **Sulla stessa macchina/VPS del server FiveM** *(consigliato)* | Niente | `http://127.0.0.1:3000` |
| **Su una VPS diversa** | Apri la porta 3000 nel firewall della VPS del bot | `http://IP_VPS_BOT:3000` |
| **Sul tuo PC di casa** | Apri la porta 3000 nel firewall di Windows **e** inoltrala dal router al PC (port forwarding). Il PC deve restare acceso | `http://TUO_IP_PUBBLICO:3000` |

Per aprire la porta nel firewall di Windows (PowerShell **come amministratore**):

```powershell
New-NetFirewallRule -DisplayName "LiteRP Bot API" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

**Prova:** da un browser su un altro computer apri `http://IP_DEL_BOT:3000/api/health`. Deve comparire `{"ok":true}`.
Se la pagina non si carica, la porta è chiusa (firewall o router).

> Se il server FiveM è su un hosting "solo game server" (dove non puoi installare programmi), il bot non può girare lì. Usa una VPS oppure il tuo PC con il port forwarding.

### Passo 3 — Installa la risorsa sul server FiveM

1. Copia la cartella **`fivem-resource/literp_discord`** nella cartella **`resources`** del server FiveM, per esempio con l'editor file di txAdmin, FileZilla o il pannello dell'hosting.
2. Apri il **`server.cfg`** (su txAdmin: *CFG Editor*) e aggiungi **in fondo**:

```cfg
# --- LiteRP Bot Discord ---
set literp_discord_secret "la_chiave_che_hai_generato"
ensure literp_discord
```

> ⚠️ La chiave deve essere **identica** a quella del `.env` del bot.

### Passo 4 — Configura la risorsa (`literp_discord/config.lua`)

```lua
Config.BotUrl = 'http://127.0.0.1:3000'   -- vedi la tabella del passo 2
Config.Framework = 'esx'                   -- 'esx', 'qbcore' oppure 'ace'
Config.StaffGroups = { 'helper', 'mod', 'admin', 'superadmin', 'god' }   -- i gruppi staff del tuo server
```

**Come vengono riconosciuti gli staff online:**
- **ESX**: i giocatori con un gruppo tra quelli in `Config.StaffGroups` (es. `admin`).
- **QBCore**: i giocatori con uno dei permessi in `Config.StaffGroups`.
- **ACE**: aggiungi nel `server.cfg`:

```cfg
add_ace group.admin literp.staff allow
add_principal identifier.discord:ID_DISCORD_DELLO_STAFF group.admin
```

In tutti i casi è sempre riconosciuto staff chi ha il permesso ACE `literp.staff`.

Nello stesso file puoi spegnere i singoli eventi di txAdmin (`Config.TxAdmin`) e attivare i log di entrata e uscita dei giocatori (`Config.LogConnections`, sconsigliato con tanti player).

### Passo 5 — Avvia e prova

1. Nella **console live** di txAdmin scrivi:
   ```
   refresh
   ensure literp_discord
   ```
   Oppure riavvia il server.
2. Sempre nella console di txAdmin:
   ```
   literp_testban
   ```
   ➜ Nel canale **#ban-fivem** deve comparire un **ban di test** (puoi cancellarlo).
3. Entra in città con un account staff, aspetta 30 secondi e scrivi `/stato` su Discord: devi comparire tra gli **staff online**.

### Cosa arriva su Discord da quel momento

| Evento | Dove |
|---|---|
| Player e staff online, record giornaliero | #stato-server (aggiornato da solo) + contatori vocali |
| Ban da txAdmin | #ban-fivem + **DM al giocatore** con le istruzioni per il ricorso (se ha Discord collegato a FiveM) |
| Ban revocato | #ban-fivem |
| Warn, kick, annunci staff | #log-fivem |
| Riavvio programmato / spegnimento | #stato-server (il messaggio sparisce da solo) |
| Server offline / di nuovo online | #stato-server |

Per i ban fatti da **altri script** (non da txAdmin), aggiungi nello script del ban:

```lua
exports['literp_discord']:NotifyBan({
    target = source,              -- id del giocatore bannato
    reason = 'Uso di mod menu',
    author = GetPlayerName(staffSource),
    duration = '7 giorni',
})
```

---

## 🛠️ Problemi comuni

| Problema | Causa e soluzione |
|---|---|
| Console FiveM: `Errore 401 inviando ... al bot` | La chiave nel `server.cfg` è diversa da quella del `.env`. Correggila e riavvia sia il bot sia la risorsa |
| Console FiveM: `Errore 0 inviando ... al bot` | Il server FiveM non raggiunge il bot: bot spento, `BotUrl` sbagliato o porta 3000 chiusa (passo 2) |
| Console FiveM: `ATTENZIONE: imposta "set literp_discord_secret"` | Manca la riga `set literp_discord_secret` nel `server.cfg`, oppure è **sotto** `ensure literp_discord` (deve stare sopra) |
| `/stato` mostra i player ma "Staff online: N/D" | La risorsa non è collegata: ricontrolla i passi 1-5 |
| Lo staff online risulta 0 anche se ci sono staff | `Config.Framework` o `Config.StaffGroups` non corrispondono ai gruppi del tuo server |
| Nessun ban in #ban-fivem | Canale non impostato (`/impostazioni fivem canali ban:`) oppure risorsa non collegata (prova `literp_testban`) |
| I comandi nuovi non si vedono su Discord | Riavvia il bot e premi **Ctrl+R** su Discord |
| Il ruolo automatico non viene dato | `/ruoli automatici lista`: se un ruolo ha ⚠️, sposta il ruolo del bot più in alto in *Impostazioni server → Ruoli* |
