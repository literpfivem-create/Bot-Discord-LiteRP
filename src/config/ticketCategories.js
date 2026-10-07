// Categorie ticket di LiteRP.
// key: identificativo interno (usato anche per il nome del canale, es. "generali-0001")
// questions: domande del modulo (max 5, label max 45 caratteri)

const nomeIC = {
  id: 'nome_ic',
  label: 'Nome e cognome del personaggio',
  style: 'short',
  required: false,
  placeholder: 'Es. Mario Rossi',
};

module.exports = [
  {
    key: 'generali',
    label: 'Ticket Generali',
    emoji: '🟢',
    color: 0x57f287,
    description: 'Supporto generale, domande e richieste varie',
    questions: [
      nomeIC,
      { id: 'richiesta', label: 'Descrivi la tua richiesta', style: 'paragraph', placeholder: 'Spiega nel dettaglio di cosa hai bisogno...' },
    ],
  },
  {
    key: 'criminalita',
    label: 'Ticket Criminalità',
    emoji: '🔫',
    color: 0xed4245,
    description: 'Gang, organizzazioni criminali e attività illegali',
    questions: [
      nomeIC,
      { id: 'gruppo', label: 'Gang / organizzazione di appartenenza', style: 'short', required: false },
      { id: 'richiesta', label: 'Descrivi la tua richiesta', style: 'paragraph' },
    ],
  },
  {
    key: 'convalide',
    label: 'Ticket Convalide',
    emoji: '❓',
    color: 0xfee75c,
    description: 'Convalida di azioni, situazioni e proprietà in gioco',
    questions: [
      nomeIC,
      { id: 'oggetto', label: 'Cosa vuoi convalidare?', style: 'short' },
      { id: 'dettagli', label: 'Dettagli e prove (link a clip/screen)', style: 'paragraph' },
    ],
  },
  {
    key: 'legalita',
    label: 'Ticket Legalità',
    emoji: '🏠',
    color: 0x3498db,
    description: 'Fazioni legali, lavori, attività e proprietà',
    questions: [
      nomeIC,
      { id: 'fazione', label: 'Fazione / lavoro / attività', style: 'short', required: false },
      { id: 'richiesta', label: 'Descrivi la tua richiesta', style: 'paragraph' },
    ],
  },
  {
    key: 'donazioni',
    label: 'Ticket Donazioni',
    emoji: '💵',
    color: 0x2ecc71,
    description: 'Donazioni, pacchetti VIP e problemi di pagamento',
    questions: [
      { id: 'transazione', label: 'ID transazione / email usata', style: 'short' },
      { id: 'pacchetto', label: 'Pacchetto acquistato', style: 'short', required: false },
      { id: 'richiesta', label: 'Descrivi il problema o la richiesta', style: 'paragraph' },
    ],
  },
  {
    key: 'founder',
    label: 'Ticket Founder',
    emoji: '🟥',
    color: 0xc0392b,
    description: 'Questioni riservate da trattare con i Founder',
    questions: [
      { id: 'oggetto', label: 'Oggetto', style: 'short' },
      { id: 'richiesta', label: 'Descrivi la tua richiesta', style: 'paragraph' },
    ],
  },
  {
    key: 'developer',
    label: 'Ticket Developer',
    emoji: '💻',
    color: 0x5865f2,
    description: 'Bug, problemi tecnici e segnalazioni script',
    questions: [
      { id: 'bug', label: 'Tipo di problema / script coinvolto', style: 'short' },
      { id: 'passaggi', label: 'Descrizione e passaggi per riprodurlo', style: 'paragraph' },
      { id: 'prove', label: 'Screenshot / clip (link)', style: 'short', required: false },
    ],
  },
  {
    key: 'anticheat',
    label: 'Ticket Anticheat',
    emoji: '⚫',
    color: 0x2c2f33,
    description: 'Ricorsi ban anticheat e segnalazioni cheater',
    questions: [
      { id: 'id_ban', label: 'ID ban / nome del giocatore segnalato', style: 'short' },
      { id: 'richiesta', label: 'Spiega la situazione', style: 'paragraph' },
      { id: 'prove', label: 'Prove (link a clip/screen)', style: 'short', required: false },
    ],
  },
  {
    key: 'streamer',
    label: 'Ticket Streamer',
    emoji: '🟣',
    color: 0x9b59b6,
    description: 'Richieste ruolo streamer e collaborazioni',
    questions: [
      { id: 'canale', label: 'Link al tuo canale (Twitch/YouTube/TikTok)', style: 'short' },
      { id: 'follower', label: 'Follower e media spettatori', style: 'short' },
      { id: 'richiesta', label: 'Presentati e descrivi la richiesta', style: 'paragraph' },
    ],
  },
];
