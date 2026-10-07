// Immagini per il sito: i link degli allegati Discord scadono dopo ~24 ore, quindi il bot
// ne salva una copia in DATA_DIR/media e il sito la legge da /site/media/:file.
// Il nome del file è l'hash del contenuto: la stessa immagine viene salvata una volta sola.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

const { DATA_DIR } = db;

const MEDIA_DIR = path.join(DATA_DIR, 'media');
const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };
const MIME = Object.fromEntries(Object.entries(TYPES).map(([mime, ext]) => [ext, mime]));
const FILE_RE = /^[a-f0-9]{32}\.(png|jpg|gif|webp)$/;

/** Scarica un'immagine e la salva. Restituisce il nome del file (es. "3fa1....png"). */
async function saveFromUrl(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Download immagine fallito: HTTP ${res.status}`);
  const type = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const ext = TYPES[type];
  if (!ext) throw new Error(`Formato immagine non supportato: ${type || 'sconosciuto'}`);
  if (Number(res.headers.get('content-length')) > MAX_BYTES) throw new Error('Immagine troppo grande (max 10 MB)');
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_BYTES) throw new Error('Immagine troppo grande (max 10 MB)');

  const file = `${crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 32)}.${ext}`;
  const dest = path.join(MEDIA_DIR, file);
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
    fs.writeFileSync(dest, buffer);
  }
  return file;
}

/** Percorso e tipo di un file salvato, oppure null se il nome non è valido o il file non esiste. */
function find(file) {
  if (!FILE_RE.test(String(file))) return null;
  const full = path.join(MEDIA_DIR, file);
  if (!fs.existsSync(full)) return null;
  return { path: full, type: MIME[file.split('.').pop()], size: fs.statSync(full).size };
}

/** Elimina un file salvato (es. quando la news che lo usava viene cancellata). */
function remove(file) {
  const found = find(file);
  if (found) fs.rmSync(found.path, { force: true });
}

/** Immagini usate da notizie ed eventi della pagina News. */
function usedFiles() {
  const { posts, events } = db.getNews();
  return new Set([...Object.values(posts).flatMap((p) => p.images), ...Object.values(events).map((e) => e.image)].filter(Boolean));
}

/** Elimina i file che nessuna notizia o evento usa più (da chiamare dopo aver tolto/cambiato le immagini). */
function removeUnused(files) {
  const used = usedFiles();
  for (const file of new Set(files)) if (file && !used.has(file)) remove(file);
}

module.exports = { saveFromUrl, find, remove, removeUnused, FILE_RE };
