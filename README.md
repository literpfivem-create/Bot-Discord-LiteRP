# 🤖 LiteRP Bot

Bot Discord ufficiale del server FiveM **LiteRP**.

| Funzione | Descrizione |
|---|---|
| 🎫 **Ticket** | Pannello con banner "CENTRO ASSISTENZA", configurazione completa con `/ticket configura`, 9 categorie con modulo di domande, presa in carico, priorità, spostamento tra categorie, aggiungi/rimuovi utenti, transcript TXT, **valutazione ⭐** dopo la chiusura, **chiusura automatica dei ticket inattivi**, limite di ticket per utente, blacklist, statistiche e classifica staff |
| 📜 **Log** | Log ticket, log automod, **log moderazione** (con numero caso), **log server** (messaggi eliminati/modificati, ingressi/uscite, ruoli, nickname, timeout, ban, vocali), **log FiveM** (warn, kick, annunci txAdmin) |
| ⚖️ **Moderazione** | `/mod warn` con **sanzioni automatiche** (timeout/kick/ban a soglia), timeout, kick, ban e `/canale pulisci|slowmode|blocca`, con DM all'utente |
| 👋 **Benvenuto/Addio** | **Immagine "BENVENUTO <nome> dentro LiteRP"** con foto profilo e logo del server, testo personalizzabile, DM di benvenuto |
| 🎭 **Ruoli** | Autorole per utenti e per bot, sincronizzazione sui membri esistenti, **pannelli ruoli self-service con pulsanti** |
| 🛡️ **AutoMod** | Anti-invito, anti-link, anti-spam, **anti-messaggi ripetuti**, anti-menzioni, anti-maiuscole, parole vietate, **anti-raid**, **filtro account appena creati** |
| ✉️ **Messaggi** | Testi, embed, **annunci ufficiali**, **DM a nome dello staff**, modifica embed, **messaggi programmati/ricorrenti** |
| 🔨 **Ban FiveM** | Annuncio automatico dei ban (txAdmin o altri sistemi), **revoche**, **DM al giocatore bannato** con istruzioni per il ricorso |
| 📊 **Server stats** | Embed live con player/staff online, **record giornaliero e di sempre**, **avviso online/offline**, **avviso riavvii programmati**, **canali contatore e canali con testo libero** con `/serverstats`, `/giocatori` |

---

## 1. Creare il bot su Discord

1. Vai su <https://discord.com/developers/applications> → **New Application** → nome "LiteRP".
2. Scheda **Bot** → **Reset Token** → copia il token.
3. Sempre in **Bot**, attiva i **Privileged Gateway Intents**:
   - ✅ **SERVER MEMBERS INTENT** (benvenuto, autorole, log membri)
   - ✅ **MESSAGE CONTENT INTENT** (automod, log messaggi)
4. Scheda **OAuth2 → URL Generator**: spunta `bot` e `applications.commands`, permesso **Administrator**. Apri il link generato e invita il bot nel server.
5. Nelle impostazioni del server, **trascina il ruolo del bot sopra** ai ruoli che deve assegnare (ruoli automatici, ruoli self-service) e moderare.

## 2. Installare e avviare il bot

Serve [Node.js](https://nodejs.org) 18 o superiore.

```bash
npm install
copy .env.example .env      # su Linux: cp .env.example .env
```

Apri `.env` e compila:

```env
DISCORD_TOKEN=il_token_del_bot
API_PORT=3001
API_SECRET=una_stringa_lunga_e_casuale
```

Avvio: `npm start` (oppure doppio clic su `avvia.bat` su Windows, che riavvia il bot automaticamente se si ferma).

> **Errore "L'esecuzione di script è disabilitata" in PowerShell?** Usa `npm.cmd install` / `npm.cmd start`,
> oppure sblocca una volta sola con `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`.

> Per tenerlo sempre acceso su una VPS: `npm i -g pm2` → `pm2 start src/index.js --name literp-bot` → `pm2 save`.

## 3. Configurazione

Non c'è nessun comando che crea canali in automatico: **scegli tu i canali** che il bot deve usare. Tutto si configura con `/impostazioni` (serve il permesso *Gestisci server*).

Parti da qui: mostra cosa è già configurato e cosa manca.

```
/impostazioni panoramica
```

Configurazione consigliata, in ordine:

```
# 1. Ruolo staff (gestisce i ticket, non viene filtrato dall'automod tranne le parole vietate)
/impostazioni staff aggiungi ruolo:@Staff

# 2. Sistema ticket: si apre una schermata con menu e pulsanti (vedi sotto)
/ticket configura

# 3. Benvenuto con immagine (BENVENUTO <nome> dentro LiteRP)
/impostazioni benvenuto canale canale:#benvenuto
/impostazioni benvenuto prova

# 4. Canali di log (indica solo quelli che vuoi)
/impostazioni log canali ticket:#log-ticket moderazione:#log-moderazione automod:#log-automod server:#log-server fivem:#log-fivem

# 5. Server FiveM
/impostazioni fivem server ip:123.45.67.89:30120 connect:cfx.re/join/abc123 nome:LiteRP
/impostazioni fivem canali stato:#stato-server ban:#ban-fivem
/serverstats aggiungi tipo:Giocatori online su FiveM   # canale "🎮 | Player: X/Y"

# 6. Ruoli automatici per chi entra
/ruoli automatici aggiungi ruolo:@Cittadino
```

Opzioni utili:

```
# Immagine di benvenuto: sfondo personalizzato e colore
/impostazioni benvenuto immagine sfondo:https://.../sfondo.png colore:#00a8ff

# Sanzioni automatiche: timeout 1h a 3 warn, kick a 5, ban a 7, i warn scadono dopo 30 giorni
/impostazioni sanzioni timeout_a:3 durata_timeout:1h kick_a:5 ban_a:7 scadenza_avvisi_giorni:30
```

### `/ticket configura` — tutto il sistema ticket in un'unica schermata

Si apre un messaggio visibile solo a te, con menu e pulsanti. Ogni modifica viene salvata subito.

| Elemento | Cosa fa |
|---|---|
| 📩 **Canale del pannello** | Invia il pannello in quel canale (se c'era già altrove, lo sposta) |
| 📜 **Canale dei log** | Dove arrivano aperture, chiusure, transcript e valutazioni |
| 🗂️ **Tipo di ticket** | Per ogni tipo (Generali, Criminalità, Founder…): **categoria Discord** in cui aprirli e **ruoli** che li gestiscono. Senza ruoli specifici li gestisce lo staff |
| 🔔 / ⭐ | Ping dello staff all'apertura e valutazione dopo la chiusura (on/off) |
| ⏰ **Limiti e inattività** | Ticket aperti per utente e chiusura automatica dei ticket inattivi |
| 🔄 **Aggiorna pannello** | Reinvia il pannello (es. dopo aver cambiato il logo del server) |

Il pannello ha un design fisso: il banner "CENTRO ASSISTENZA" con il logo del server, poi una scheda con le istruzioni e il menu per scegliere il motivo. All'avvio il bot aggiorna da solo il pannello esistente.

> Se nel server esistono già categorie con il nome del tipo di ticket (es. `🟢 | Ticket Generali`), vengono usate quelle. Altrimenti la categoria viene creata al primo ticket, oppure con il pulsante **📁 Crea categoria automaticamente**.

## 4. Risorsa FiveM e txAdmin

Senza la risorsa il bot mostra comunque i **player online** leggendo `IP:porta/dynamic.json`. Per **staff online, elenco giocatori, ban e tutti gli eventi txAdmin** serve la risorsa:

1. Copia `fivem-resource/literp_discord` nella cartella `resources` del server.
2. Nel `server.cfg`:
   ```cfg
   set literp_discord_url "https://NOME.up.railway.app"   # indirizzo del bot
   set literp_discord_secret "la_stessa_chiave_di_API_SECRET"
   ensure literp_discord   # dopo es_extended

   # Chi è staff (modalità 'ace'): per gruppo...
   add_ace group.admin literp.staff allow
   # ...e chi fa parte del gruppo, tramite ID Discord
   add_principal identifier.discord:123456789012345678 group.admin
   ```
3. `config.lua` è già pronto per ESX (staff dai gruppi ESX e personaggi per il profilo del sito). Da cambiare solo per altri framework (`qbcore`, `ace`), gruppi staff diversi o per spegnere eventi txAdmin.
4. Se bot e server FiveM sono su macchine diverse, apri la porta `API_PORT` nel firewall della macchina del bot.
5. All'avvio la console scrive `Collegato al bot` oppure il motivo dell'errore (riprova con `literp_check`).
6. Prova dalla console live di txAdmin: `literp_testban` → deve comparire un ban di test nel canale ban.

### Cosa arriva su Discord da txAdmin (nessuna configurazione su txAdmin)

| Evento txAdmin | Dove |
|---|---|
| Ban | canale ban (pubblico) + DM al giocatore se ha Discord collegato |
| Ban revocato | canale ban |
| Warn / warn revocato | log FiveM (staff) |
| Kick | log FiveM (staff) |
| Annuncio staff | log FiveM (staff) |
| Riavvio programmato / spegnimento | canale stato server (si cancella da solo) |
| Connessioni/disconnessioni (opzionale) | log FiveM (staff) |

### Ban da altri sistemi (non txAdmin)

```lua
exports['literp_discord']:NotifyBan({
    target = source,           -- id del player (ricava nome e Discord da solo)
    reason = 'Uso di mod menu',
    author = GetPlayerName(staffSource),
    duration = '7 giorni',      -- oppure expiration = os.time() + 604800
    banId = 'BAN-1234',
})
```

## 4bis. Collegamento con il sito e Railway

Il sito LiteRP (su Vercel) legge i dati dal bot tramite l'API (rotte `/site/*`), e il bot avvisa il sito quando un contenuto cambia, così la pagina si aggiorna subito.

Variabili da impostare (file `.env` in locale, scheda **Variables** su Railway):

| Variabile | A cosa serve |
|---|---|
| `SITE_API_SECRET` | Chiave con cui il sito legge dal bot. Sul sito va messa uguale in `BOT_API_SECRET`. |
| `SITE_URL` | Indirizzo del sito senza `/` finale. Solo se il bot può raggiungere il sito: con il bot su Railway serve l'indirizzo pubblico (Vercel), `localhost` non funziona. Vuoto = il sito si aggiorna da solo ogni minuto. |
| `REVALIDATE_SECRET` | Chiave con cui il bot dice al sito di aggiornarsi. Uguale sul sito. |
| `DATA_DIR` | Cartella di database e immagini. Su Railway: il percorso del **Volume** (es. `/data`). |
| `PRESENCE_INTENT` | `true` per vedere chi è online. Prima attiva **PRESENCE INTENT** nel Developer Portal → Bot. |

**Railway**
1. **Volume**: nel progetto premi **Ctrl+K** (oppure clic destro su uno spazio vuoto della mappa del progetto) → **Volume** → scegli il servizio del bot → come *Mount path* scrivi `/data`. Poi nelle variabili del bot aggiungi `DATA_DIR=/data`. Senza Volume Railway cancella database e immagini a ogni deploy.
2. **Settings → Networking → Generate Domain**: è l'indirizzo pubblico del bot (va in `BOT_API_URL` sul sito). Railway imposta da solo `PORT`.
3. Su Discord: `/sito collega` nel server da mostrare, poi `/sito stato` e `/sito prova`.

Per creare una chiave casuale: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## 5. Comandi

I comandi sono raggruppati per funzione. Su Discord ognuno vede solo quelli per cui ha i permessi. `/aiuto` mostra l'elenco adatto a chi lo usa.

### 👥 Per tutti
| Comando | Descrizione |
|---|---|
| `/stato` | Stato del server FiveM, player e staff online |
| `/giocatori` | Elenco dei giocatori in città |
| `/info utente\|server\|bot` | Informazioni (lo staff vede anche warn e ticket dell'utente) |
| `/ticket chiudi` | Chiude il proprio ticket |
| `/aiuto` | Elenco comandi |

### 🎫 `/ticket` — staff
| Sottocomando | Descrizione |
|---|---|
| `reclama` `aggiungi` `rimuovi` `rinomina` | Gestione del ticket (anche con i pulsanti nel ticket) |
| `priorita` | 🟢 Bassa / 🟡 Media / 🟠 Alta / 🔴 Urgente (aggiunta al nome del canale) |
| `sposta` | Sposta in un'altra categoria e avvisa i nuovi ruoli |
| `lista` `statistiche` | Ticket aperti, totali, valutazione media, classifica staff |
| `blacklist aggiungi\|rimuovi\|lista` | Utenti a cui è vietato aprire ticket |
| `configura` | Pannello, categorie, ruoli, log e opzioni dei ticket in un'unica schermata (serve *Gestisci server*) |

### ⚖️ `/mod` — moderazione
| Sottocomando | Descrizione |
|---|---|
| `warn` `avvisi` `rimuovi-avviso` | Avvertimenti con sanzioni automatiche |
| `timeout` `rimuovi-timeout` | Durata come `10m`, `1h`, `2g` |
| `kick` `ban` `unban` | Con DM all'utente e numero caso nel log |

### 💬 `/canale`
| Sottocomando | Descrizione |
|---|---|
| `pulisci` | Elimina fino a 100 messaggi (anche di un solo utente) |
| `slowmode` | Modalità lenta |
| `blocca` `sblocca` | Solo lo staff può scrivere |

### ✉️ `/messaggio`
| Sottocomando | Descrizione |
|---|---|
| `testo` `embed` `annuncio` `dm` `modifica` | Messaggi tramite il bot |
| `programmato aggiungi\|lista\|rimuovi\|prova` | Messaggi automatici (es. "Ricorda di votare il server" ogni 6h) |

### 🎭 `/ruoli`
| Sottocomando | Descrizione |
|---|---|
| `automatici aggiungi\|rimuovi\|lista\|sincronizza` | Ruoli dati a chi entra (anche per i bot) |
| `pannello crea\|aggiungi\|rimuovi` | Pannelli con pulsanti per prendersi i ruoli da soli |

### 📊 `/serverstats` — gestori del server
Canali vocali in una categoria dedicata, visibili ma non utilizzabili da nessuno. Contatori nel formato `👥 | Cittadini: 42`, testi liberi nel formato `🌐・IP: 123.45.67.89`. I contatori si aggiornano in tempo reale (Discord permette 2 rinomine ogni 10 minuti per canale: le variazioni successive vengono raggruppate).

| Sottocomando | Descrizione |
|---|---|
| `aggiungi` | Crea un contatore: tipo (membri con un ruolo, membri, bot, boost, ticket aperti, player e staff FiveM), nome, emoji |
| `testo` | Canale con un testo scelto da te (IP del server, sito web, orari...) |
| `modifica` `rimuovi` | Cambia nome/testo/emoji o elimina un contatore (si sceglie il canale) |
| `lista` `aggiorna` | Valori attuali / aggiornamento forzato |
| `ripara` | Ricrea i canali eliminati e rimette tutto nella categoria |
| `categoria nome|posizione` | Nome della categoria, in cima o in fondo ai canali |
| `reset` | Elimina tutti i contatori e la categoria |

### ⚙️ `/impostazioni` — amministratori
| Gruppo | Sottocomandi |
|---|---|
| `panoramica` | Riepilogo e cosa manca da configurare |
| `staff` | `aggiungi` `rimuovi` `lista` |
| `benvenuto` | `canale` `messaggio` `immagine` `dm` `attiva` `prova` — segnaposto: `{user}` `{nome}` `{username}` `{server}` `{count}`, `\n` per andare a capo |
| `addio` | `canale` `messaggio` `attiva` `prova` |
| `log` | `canali` `eventi` |
| `fivem` | `server` `canali` `opzioni` |
| `sanzioni` | Sanzioni automatiche dei warn e scadenza |

### 🛡️ `/automod`
`stato` `test` `attiva` `modulo` `parola` `dominio` `ignora-canale` `ignora-ruolo` `impostazioni`

### 🌐 `/sito`
`stato` (cosa è collegato e cosa manca) `collega` (server Discord mostrato sul sito) `prova` (avviso di prova al sito)
`obiettivo imposta` (barra "Siamo a 870 / 1000 membri" sul sito, annuncio al traguardo) `obiettivo rimuovi`
`staff aggiungi` (ruolo come gruppo della pagina Staff, con descrizione, nome e posizione) `staff rimuovi` `staff ordine` `staff lista`
`news aggiungi` (canale i cui messaggi diventano notizie, tipo Annunci o Aggiornamenti) `news rimuovi` `news lista`

La **pagina News** mostra ogni messaggio dei canali di `/sito news` (titolo = prima riga o titolo dell'embed, testo, fino a 4 immagini),
con autore "Staff di LiteRP". Modifiche ed eliminazioni su Discord si vedono anche sul sito; quando aggiungi un canale e a ogni
avvio il bot rilegge gli ultimi 50 messaggi. Le immagini vengono salvate nella cartella dati (`media/`), perché i link Discord scadono.
In cima alla pagina ci sono gli **eventi programmati di Discord** (menu del server → Crea evento) con conto alla rovescia;
quelli finiti restano come storico (ultimi 50), quelli annullati spariscono.

La **pagina Staff** mostra i gruppi di `/sito staff`, nell'ordine scelto: nome e colore vengono dal ruolo Discord (o dal nome scelto),
i membri da chi ha il ruolo. Chi ha più ruoli compare solo nel primo gruppo. Senza gruppi il sito usa la lista scritta nel suo codice.

Sul sito lo **staff in servizio** sono i membri di quei gruppi (o, se non ce ne sono, con un ruolo di `/impostazioni staff`) online su Discord: serve `PRESENCE_INTENT=true`.

## Personalizzazione

- **Domande dei moduli ticket, emoji, colori, descrizioni**: `src/config/ticketCategories.js`
- **Testi e valori di default**: `src/utils/db.js` (`defaultGuild`)
- **Dati salvati**: `data/database.json` e le immagini del sito in `data/media/` (o nella cartella `DATA_DIR`). Fai un backup ogni tanto
