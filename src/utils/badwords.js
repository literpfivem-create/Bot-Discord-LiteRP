// Filtro parole vietate, resistente ai trucchi più usati per aggirarlo:
// maiuscole e accenti, leetspeak (p0rc0d10), lettere ripetute (negrooo), lettere separate
// (n e g r o, n.e.g.r.o, porco-dio, n||egr||o), parole attaccate (diocane = dio cane),
// caratteri invisibili, font "fancy" (𝐧𝐞𝐠𝐫𝐨), emoji lettera (🇳🇪...) e lettere cirilliche/greche
// identiche a quelle latine (nеgro con la "е" russa).
//
// Nella lista si può usare * all'inizio o alla fine: "negr*" blocca negro, negri, negra...

// Lettere non latine identiche (o quasi) a quelle latine
const CONFUSABLES = {
  а: 'a', в: 'b', с: 'c', ԁ: 'd', е: 'e', ё: 'e', һ: 'h', н: 'h', і: 'i', ї: 'i', ј: 'j', к: 'k', ӏ: 'l',
  м: 'm', п: 'n', о: 'o', р: 'p', ԛ: 'q', г: 'r', ѕ: 's', т: 't', и: 'u', у: 'y', х: 'x', ԝ: 'w', з: 'z',
  α: 'a', β: 'b', ε: 'e', η: 'n', ι: 'i', κ: 'k', μ: 'u', ν: 'v', ο: 'o', ρ: 'p', τ: 't', υ: 'u', χ: 'x', ω: 'w',
  ı: 'i', ł: 'l', ø: 'o', đ: 'd', ħ: 'h', ŧ: 't', ß: 'ss', æ: 'ae', œ: 'oe', ɡ: 'g', ɑ: 'a',
};
const LEET = { 0: 'o', 1: 'i', 2: 'z', 3: 'e', 4: 'a', 5: 's', 6: 'g', 7: 't', 8: 'b', 9: 'g', '@': 'a', $: 's', '€': 'e', '£': 'l', '!': 'i', '|': 'i', '+': 't', '¡': 'i' };
const LEET_RE = /[0-9@$€£!|+¡]/g;
const SEP = '[^\\p{L}]{0,6}'; // separatori ammessi tra le lettere (spazi, punti, spoiler, emoji...)

/** Minuscolo, senza accenti/caratteri invisibili, font fancy e lettere "travestite" convertite in latino. */
function baseNormalize(s) {
  return String(s)
    .normalize('NFKC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\p{M}\p{Cf}]/gu, '')
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, (c) => String.fromCharCode(c.codePointAt(0) - 0x1f1e6 + 97))
    .replace(/[^\x00-\x7f]/g, (c) => CONFUSABLES[c] ?? c);
}

const leet = (s) => s.replace(LEET_RE, (c) => LEET[c]);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Converte una voce della lista in regex. null se non contiene lettere. */
function compile(entry) {
  const raw = String(entry).trim();
  const prefix = raw.startsWith('*');
  const suffix = raw.endsWith('*');
  // solo lettere, senza doppie consecutive ("porca madonna" -> "porcamadona")
  const letters = [...leet(baseNormalize(raw)).replace(/[^\p{L}]/gu, '')].filter((c, i, a) => c !== a[i - 1]);
  if (!letters.length) return null;
  // ogni lettera può ripetersi (anche separata: "neee e gro"), tra una lettera e l'altra sono ammessi separatori
  const body = letters.map((c) => `${escapeRe(c)}(?:${SEP}${escapeRe(c)})*`).join(SEP);
  return new RegExp(`${prefix ? '' : '(?<!\\p{L})'}${body}${suffix ? '' : '(?!\\p{L})'}`, 'u');
}

let cacheKey = null;
let cacheRules = [];
function rulesFor(list) {
  const key = list.join('\u0000');
  if (key !== cacheKey) {
    cacheKey = key;
    cacheRules = list.map((word) => ({ word, re: compile(word) })).filter((r) => r.re);
  }
  return cacheRules;
}

/**
 * @param {string|string[]} texts testo (o più testi) da controllare
 * @param {string[]} list parole vietate
 * @returns {string|null} la voce della lista trovata
 */
function findBadWord(texts, list) {
  if (!list?.length) return null;
  const rules = rulesFor(list);
  for (const text of [texts].flat()) {
    if (!text) continue;
    const plain = baseNormalize(text.slice(0, 6000));
    // due varianti: con il leetspeak convertito (p0rc0 -> porco) e senza (così "negro!" o "negro1" restano validi)
    const variants = [plain, leet(plain)];
    const hit = rules.find((r) => variants.some((v) => r.re.test(v)));
    if (hit) return hit.word;
  }
  return null;
}

module.exports = { findBadWord, compile, baseNormalize };
