// Durate in formato umano: "30s", "10m", "2h", "1d"/"1g", "1w", anche combinate ("1h30m")
const UNITS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, g: 86_400_000, w: 604_800_000 };

/** @returns {number|null} millisecondi, null se non valida */
function parseDuration(input) {
  if (!input) return null;
  const text = String(input).toLowerCase().replace(/\s+/g, '');
  if (!/^(\d+[smhdgw])+$/.test(text)) return null;
  let total = 0;
  for (const [, n, unit] of text.matchAll(/(\d+)([smhdgw])/g)) total += Number(n) * UNITS[unit];
  return total > 0 ? total : null;
}

function formatDuration(ms) {
  if (!ms || ms < 1000) return '0s';
  const parts = [];
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  if (d) parts.push(`${d}g`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s && !d) parts.push(`${s}s`);
  return parts.join(' ');
}

const unix = (ms = Date.now()) => Math.floor(ms / 1000);

/** Data odierna (fuso Europa/Roma) in formato YYYY-MM-DD */
const todayKey = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });

/** Esegue una promessa ma smette di aspettare dopo `ms` (la promessa continua in background). */
function withTimeout(promise, ms) {
  return Promise.race([promise.then(() => true), new Promise((r) => setTimeout(() => r(false), ms))]);
}

module.exports = { parseDuration, formatDuration, unix, todayKey, withTimeout };
