// Candidature per i lavori (/candidature): lavori e domande del modulo che si apre con "Candidati ora".
// Il modulo ha 3 pagine perché Discord permette al massimo 5 elementi per pagina (domande + testi).
// Limiti di Discord: label max 45 caratteri, description e placeholder max 100.
// max = lunghezza massima della risposta: tutte insieme devono stare nel messaggio della candidatura (6000 caratteri).
// section = dove compare la risposta nel messaggio della candidatura (vedi SECTIONS).

const JOBS = [
  {
    key: 'lspd',
    name: 'LSPD',
    emoji: '🚓',
    color: 0x1d4ed8,
    why: 'Perché vuoi entrare in LSPD?',
    scenario: 'Scopri che un tuo collega ha accettato una tangente. Cosa fa il tuo personaggio?',
    rules: 'governi e FDO',
    experience: 'FDO',
  },
  {
    key: 'lssd',
    name: 'LSSD',
    emoji: '⭐',
    color: 0x15803d,
    why: 'Perché vuoi entrare in LSSD?',
    scenario: 'Scopri che un tuo collega ha accettato una tangente. Cosa fa il tuo personaggio?',
    rules: 'governi e FDO',
    experience: 'FDO',
  },
  {
    key: 'ems',
    name: 'EMS',
    emoji: '🚑',
    color: 0xdc2626,
    why: 'Perché vuoi entrare in EMS?',
    scenario: 'Durante un intervento trovi due feriti gravi e sei da solo in attesa dei rinforzi. Come ti comporti e chi soccorri per primo?',
    rules: 'governi e servizi di emergenza',
    experience: 'EMS/medico',
    extra: {
      question: 'Come gestisci il RP medico (diagnosi, cure, trattamenti) senza fare metagaming?',
      label: 'Come gestisci il RP medico?',
      description: 'Diagnosi, cure e trattamenti, senza fare metagaming',
    },
  },
  {
    key: 'usm',
    name: 'U.S. Marshal',
    emoji: '🦅',
    color: 0xb45309,
    why: 'Perché vuoi entrare negli U.S. Marshals?',
    scenario: 'Durante il trasferimento di un detenuto pericoloso, un tuo collega ti propone di chiudere un occhio in cambio di denaro. Cosa fa il tuo personaggio?',
    rules: 'governi e FDO',
    experience: 'FDO',
    extra: {
      question: 'Come gestiresti la cattura di un latitante senza fare powergaming o metagaming?',
      label: 'Come gestiresti la cattura di un latitante?',
      description: 'Senza fare powergaming o metagaming',
    },
  },
  {
    key: 'fib',
    name: 'FIB',
    emoji: '🕵️',
    color: 0x475569,
    why: "Perché vuoi entrare nell'FIB?",
    scenario: "Durante un'indagine riservata scopri che un tuo collega passa informazioni a un'organizzazione criminale. Cosa fa il tuo personaggio?",
    rules: 'governi e FDO',
    experience: 'FDO',
    extra: {
      question: "Come condurresti un'indagine senza fare powergaming o metagaming?",
      label: "Come condurresti un'indagine?",
      description: 'Senza fare powergaming o metagaming',
    },
  },
];

/** Titoli dei riquadri del messaggio della candidatura (come nel vecchio modulo da copiare). */
const SECTIONS = {
  ooc: '📌 OOC',
  pg: '👤 Personaggio IC',
  intervista: '🎙️ Intervista',
};

const getJob = (key) => JOBS.find((j) => j.key === key);

/** Pagine del modulo: ogni elemento è una domanda ({ id, label, ... }) oppure un testo da leggere ({ text }). */
function pagesOf(job) {
  return [
    {
      title: 'OOC e personaggio',
      items: [
        { id: 'eta', section: 'ooc', inline: true, label: 'Età anagrafica (min. 16)', field: '🎂 Età anagrafica', placeholder: 'Es. 18', max: 2 },
        { id: 'tempo', section: 'ooc', inline: true, label: 'Da quanto sei su LiteRP?', field: '⏳ Da quanto sei su LiteRP?', placeholder: 'Es. 2 mesi', max: 50 },
        {
          id: 'background', section: 'pg', paragraph: true, min: 200, max: 1000,
          label: 'Background del personaggio',
          description: 'La storia del tuo personaggio: almeno 5 righe',
          field: '📖 Background',
        },
        {
          id: 'fedina', section: 'pg', paragraph: true, max: 200,
          label: 'Fedina penale IC',
          description: 'Scrivi «Pulita» oppure elenca i precedenti del tuo personaggio',
          field: '⚖️ Fedina penale IC',
        },
        {
          id: 'fazioni', section: 'pg', paragraph: true, max: 300,
          label: 'Fazioni/lavori precedenti IC',
          description: "Fazione · ruolo · motivo dell'uscita. Se non ne hai, scrivi «Nessuna»",
          field: '🏢 Fazioni/lavori precedenti IC',
        },
      ],
    },
    {
      title: 'Intervista',
      items: [
        {
          id: 'motivazione', section: 'intervista', paragraph: true, min: 150, max: 600,
          label: job.why,
          description: 'Rispondi IC, cioè come il tuo personaggio: almeno 4 righe',
          field: `❓ ${job.why}`,
        },
        { text: `🎬 **Scenario**\n> ${job.scenario}` },
        {
          id: 'scenario', section: 'intervista', paragraph: true, min: 30, max: 600,
          label: 'La tua risposta allo scenario',
          placeholder: 'Racconta cosa fa il tuo personaggio',
          field: `🎬 Scenario: «${job.scenario}»`,
        },
        {
          id: 'regolamento', section: 'intervista', paragraph: true, max: 250,
          label: 'Hai letto il regolamento?',
          description: `Regolamento di ${job.rules}. Se sì cita una norma, se no scrivi «No»`,
          field: `📚 Hai letto il regolamento di ${job.rules}?`,
        },
        {
          id: 'disponibilita', section: 'intervista', max: 100,
          label: 'Disponibilità oraria',
          placeholder: 'Es. tutti i giorni dalle 21 alle 24',
          field: '🕒 Disponibilità oraria',
        },
      ],
    },
    {
      title: 'Ultime domande',
      items: [
        {
          id: 'esperienza', section: 'intervista', paragraph: true, max: 200,
          label: `Esperienza RP ${job.experience}`,
          description: 'Se sì: ruolo · periodo. Altrimenti scrivi «No»',
          field: `🎖️ Esperienza RP ${job.experience}`,
        },
        ...(job.extra
          ? [{ id: 'extra', section: 'intervista', paragraph: true, max: 500, label: job.extra.label, description: job.extra.description, field: `💭 ${job.extra.question}` }]
          : []),
        {
          id: 'rp', section: 'intervista', paragraph: true, max: 400,
          label: 'Cosa distingue un buon RP da uno mediocre?',
          field: '⭐ Cosa distingue un buon RP da uno mediocre?',
        },
        {
          id: 'altro', section: 'intervista', paragraph: true, required: false, max: 250,
          label: 'Altro (facoltativo)',
          description: 'Qualcosa che vuoi far sapere ai recruiter',
          field: '📎 Altro',
        },
      ],
    },
  ];
}

/** Tutte le domande del lavoro, in ordine. */
const questionsOf = (job) => pagesOf(job).flatMap((page) => page.items.filter((item) => item.id));

module.exports = { JOBS, SECTIONS, getJob, pagesOf, questionsOf };
