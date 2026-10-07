// API HTTP del bot: un solo server per tutte le integrazioni.
//  - /api/*  risorsa FiveM "literp_discord" (chiave API_SECRET)
//  - /site/* sito LiteRP su Vercel (chiave SITE_API_SECRET)
// Porta: PORT (impostata da Railway) oppure API_PORT del .env.
const http = require('http');
const crypto = require('crypto');

const PLACEHOLDER_SECRETS = new Set(['', 'cambia_questa_chiave_segreta']);
const RATE_WINDOW = 60 * 1000;
const RATE_MAX = 300; // richieste al minuto per IP alle rotte pubbliche
const RATE_MAX_FAILED = 10; // richieste sbagliate al minuto per IP (chiave errata, rotta inesistente)
const MAX_BODY = 200_000;

const routes = []; // [{ method, regex, keys, secretEnv, handler }]
const hits = new Map(); // ip -> { count, failed, reset }
let started = false;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Valore di una chiave segreta dal .env, oppure null se manca o è ancora quella d'esempio. */
function secretOf(envName) {
  const value = String(process.env[envName] || '').trim();
  return PLACEHOLDER_SECRETS.has(value) ? null : value;
}

const port = () => Number(process.env.PORT || process.env.API_PORT) || 3001;

/**
 * Registra una rotta. pattern: '/site/media/:file'. secretEnv: variabile con la chiave richiesta
 * (null = rotta pubblica). handler({ params, query, body, req, res }) restituisce l'oggetto da
 * inviare come JSON (default { ok: true }) oppure scrive lui la risposta su res.
 */
function route(method, pattern, secretEnv, handler) {
  const keys = [];
  const source = pattern.replace(/:(\w+)/g, (_, key) => {
    keys.push(key);
    return '([^/]+)';
  });
  routes.push({ method, regex: new RegExp(`^${source}$`), keys, secretEnv, handler });
}

function checkAuth(header, secret) {
  const token = String(header || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) {
        reject(new HttpError(413, 'Body troppo grande'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new HttpError(400, 'JSON non valido')); }
    });
    req.on('error', reject);
  });
}

function clientIp(req) {
  return String(req.headers['x-real-ip'] || req.socket.remoteAddress || '?');
}

function rateEntry(ip) {
  const now = Date.now();
  let entry = hits.get(ip);
  if (!entry || entry.reset < now) {
    entry = { count: 0, failed: 0, reset: now + RATE_WINDOW };
    hits.set(ip, entry);
  }
  return entry;
}

function match(method, pathname) {
  let pathFound = false;
  for (const r of routes) {
    const m = r.regex.exec(pathname);
    if (!m) continue;
    pathFound = true;
    if (r.method !== method) continue;
    const params = {};
    r.keys.forEach((key, i) => { params[key] = decodeURIComponent(m[i + 1]); });
    return { route: r, params };
  }
  return { route: null, pathFound };
}

async function handle(req, res) {
  const send = (code, obj, headers = {}) => {
    if (res.headersSent) return;
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
    res.end(JSON.stringify(obj));
  };

  // Il limite colpisce solo le richieste sbagliate (rotte inesistenti, chiavi errate): chi ha la chiave
  // giusta passa sempre, anche se dietro al proxy di Railway tutti risultassero con lo stesso IP.
  const entry = rateEntry(clientIp(req));
  const reject = (code, obj) => {
    if (++entry.failed > RATE_MAX_FAILED) {
      return send(429, { error: 'troppe richieste' }, { 'Retry-After': String(Math.ceil((entry.reset - Date.now()) / 1000)) });
    }
    return send(code, obj);
  };

  try {
    const url = new URL(req.url, 'http://localhost');
    const found = match(req.method, url.pathname);
    if (!found.route) return reject(found.pathFound ? 405 : 404, { error: found.pathFound ? 'metodo non consentito' : 'not found' });

    const { route: r, params } = found;
    if (r.secretEnv) {
      const secret = secretOf(r.secretEnv);
      if (!secret) return send(503, { error: `${r.secretEnv} non impostata sul bot` });
      if (!checkAuth(req.headers.authorization, secret)) return reject(401, { error: 'unauthorized' });
    } else if (++entry.count > RATE_MAX) {
      return send(429, { error: 'troppe richieste' });
    }

    const body = req.method === 'POST' ? await readBody(req) : null;
    const result = await r.handler({ params, query: url.searchParams, body, req, res });
    if (!res.writableEnded) send(200, result ?? { ok: true });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 400;
    if (!(err instanceof HttpError)) console.error('[API]', req.method, req.url, err.message);
    send(status, { error: err.message });
  }
}

/** Avvia il server (una sola volta, dopo che tutti i moduli hanno registrato le rotte). */
function start() {
  if (started) return;
  started = true;
  if (!secretOf('API_SECRET') && !secretOf('SITE_API_SECRET')) {
    console.warn('⚠️  Né API_SECRET né SITE_API_SECRET sono impostate nel file .env: API disattivata (FiveM e sito non riceveranno dati).');
    return;
  }

  route('GET', '/api/health', null, () => ({ ok: true }));
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) if (entry.reset < now) hits.delete(ip);
  }, RATE_WINDOW).unref();

  const server = http.createServer((req, res) => { handle(req, res); });
  server.on('error', (err) => console.error(`[API] Impossibile avviare l'API sulla porta ${port()}:`, err.message));
  server.listen(port(), '0.0.0.0', () => console.log(`🌐 API in ascolto sulla porta ${port()}`));
}

module.exports = { route, start, secretOf, port, HttpError };
