// Testo dei messaggi Discord per il sito: menzioni e date diventano testo leggibile,
// la formattazione (grassetto, elenchi, link...) resta in markdown e la converte il sito.
// Le emoji personalizzate <:nome:id> restano così: il sito le mostra come immagini.

const TZ = 'Europe/Rome';
const fmt = (options) => new Intl.DateTimeFormat('it-IT', { timeZone: TZ, ...options });
const DATE_STYLES = {
  t: fmt({ hour: '2-digit', minute: '2-digit' }),
  T: fmt({ hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  d: fmt({ day: '2-digit', month: '2-digit', year: 'numeric' }),
  D: fmt({ day: 'numeric', month: 'long', year: 'numeric' }),
  f: fmt({ day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
  F: fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
};

/**
 * Sostituisce menzioni, ruoli, canali, comandi e date <t:...> con testo normale e toglie @everyone/@here.
 * Le date relative (<t:...:R>, "tra 2 ore") diventano assolute, perché sul sito resterebbero ferme.
 */
function resolveMentions(text, guild) {
  if (!text) return '';
  return text
    // righe fatte solo di menzioni (il "ping" a inizio annuncio): sul sito non servono
    .replace(/^[ \t]*(?:(?:<@[!&]?\d+>|@everyone|@here)[ \t,]*)+$/gm, '')
    .replace(/<@!?(\d+)>/g, (_, id) => {
      const member = guild?.members.cache.get(id);
      const user = member?.user ?? guild?.client.users.cache.get(id);
      return `@${member?.displayName ?? user?.displayName ?? 'utente'}`;
    })
    .replace(/<@&(\d+)>/g, (_, id) => `@${guild?.roles.cache.get(id)?.name ?? 'ruolo'}`)
    .replace(/<#(\d+)>/g, (_, id) => `#${guild?.channels.cache.get(id)?.name ?? 'canale'}`)
    .replace(/<\/([\w -]+):\d+>/g, '/$1')
    .replace(/<t:(-?\d+)(?::([tTdDfFR]))?>/g, (_, ts, style) => (DATE_STYLES[style] ?? DATE_STYLES.f).format(new Date(Number(ts) * 1000)))
    .replace(/@(everyone|here)\b/g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Toglie la formattazione markdown: per titoli e anteprime. */
function plain(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<a?:(\w+):\d+>/g, '')
    .replace(/\[([^\]]+)\]\((?:<)?[^)\s]+(?:>)?\)/g, '$1')
    .replace(/^\s*(#{1,3}|-#|>{1,3}|[-*]|\d+\.)\s+/gm, '')
    .replace(/(\*\*|__|\*|_|~~|\|\||`)/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Taglia a `max` caratteri senza spezzare le parole. */
function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?-]+$/, '')}…`;
}

/** Anteprima di una riga: testo semplice, massimo `max` caratteri. */
const excerpt = (text, max = 220) => truncate(plain(text).replace(/\s*\n+\s*/g, ' '), max);

const TITLE_MAX = 120;

/**
 * Divide il testo in titolo e corpo. Il titolo è la prima riga (# Titolo, **Titolo** o una riga non troppo lunga);
 * se la prima riga è un paragrafo lungo, il titolo è il suo inizio e il corpo resta intero.
 */
function splitTitle(text) {
  const lines = text.split('\n');
  const first = lines.findIndex((l) => l.trim());
  if (first === -1) return { title: '', body: '' };
  const line = lines[first].trim();
  const rest = lines.slice(first + 1).join('\n').trim();

  const heading = line.match(/^#{1,3}\s+(.+)$/) ?? line.match(/^(?:__)?\*\*(.+)\*\*(?:__)?$/) ?? line.match(/^__(.+)__$/);
  const title = plain(heading ? heading[1] : line);
  if (title && (heading || title.length <= TITLE_MAX)) return { title: truncate(title, TITLE_MAX), body: rest };
  return { title: truncate(plain(text).split('\n').find((l) => l.trim()) ?? '', 90), body: text.trim() };
}

module.exports = { resolveMentions, plain, excerpt, truncate, splitTitle, TZ };
