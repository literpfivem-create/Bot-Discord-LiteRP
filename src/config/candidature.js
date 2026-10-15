// Candidature per i lavori (/candidature): lavori e domande del modulo che si apre con "Candidati ora".
// Il modulo ha 3 pagine perché Discord permette al massimo 5 elementi per pagina (domande + testi).
// Limiti di Discord: label max 45 caratteri, description e placeholder max 100.
// max = lunghezza massima della risposta: tutte insieme devono stare nel messaggio della candidatura (6000 caratteri).
// section = dove compare la risposta nel messaggio della candidatura (vedi SECTIONS).
// bando = testo del pannello con il pulsante "Candidati ora": apertura compare solo quando le candidature sono aperte.
// options = domanda con menu a tendina invece del testo (la risposta salvata è l'opzione scelta).

const JOBS = [
  {
    key: 'lspd',
    name: 'LSPD',
    emoji: '👮‍♂️',
    color: 0x1d4ed8, // blu
    bando: {
      title: 'LOS SANTOS POLICE DEPARTMENT',
      apertura: 'Il Los Santos Police Department comunica ufficialmente l’apertura dei bandi di reclutamento per l’ingresso nel Dipartimento.\nCerchiamo persone motivate, serie e realmente interessate a costruire un’esperienza di roleplay di qualità all’interno delle forze dell’ordine.',
      descrizione: 'Entrare nella LSPD non significa solamente indossare una divisa: significa imparare procedure, lavorare in squadra, assumersi responsabilità e contribuire attivamente alla vita della città.',
      requisiti: [
        'Presentarsi con un abbigliamento consono in centrale',
        'Non avere tatuaggi',
        'Taglio capelli consono per un agente di polizia',
        'Fedina penale pulita',
        'Cittadinanza Americana',
        'Non avere voce bianca',
      ],
      motto: 'Protect and Serve.',
    },
    why: 'Perché vuoi entrare in LSPD?',
    scenario: 'Scopri che un tuo collega ha accettato una tangente. Cosa fa il tuo personaggio?',
    rules: 'governi e FDO',
    experience: 'FDO',
  },
  {
    key: 'lssd',
    name: 'LSSD',
    emoji: '👮',
    color: 0x38bdf8, // azzurro
    bando: {
      title: "LOS SANTOS SHERIFF'S DEPARTMENT",
      apertura: "Il Los Santos Sheriff's Department comunica ufficialmente l’apertura dei bandi di reclutamento per l’ingresso nel Dipartimento.\nCerchiamo persone motivate, serie e realmente interessate a costruire un’esperienza di roleplay di qualità all’interno delle forze dell’ordine.",
      descrizione: 'Entrare nella LSSD non significa solamente indossare una divisa: significa imparare procedure, lavorare in squadra, assumersi responsabilità e contribuire attivamente alla vita della contea.',
      requisiti: [
        'Presentarsi con un abbigliamento consono in stazione',
        'Non avere tatuaggi',
        'Taglio capelli consono per un deputy dello sceriffo',
        'Fedina penale pulita',
        'Cittadinanza Americana',
        'Non avere voce bianca',
      ],
    },
    why: 'Perché vuoi entrare in LSSD?',
    scenario: 'Scopri che un tuo collega ha accettato una tangente. Cosa fa il tuo personaggio?',
    rules: 'governi e FDO',
    experience: 'FDO',
  },
  {
    key: 'ems',
    name: 'EMS',
    emoji: '🚑',
    color: 0xdc2626, // rosso
    bando: {
      title: 'LOS SANTOS MEDICAL SERVICES',
      apertura: 'Il Los Santos Medical Services comunica ufficialmente l’apertura dei bandi di reclutamento per l’ingresso nel Servizio.\nCerchiamo persone motivate, serie e realmente interessate a costruire un’esperienza di roleplay di qualità all’interno del servizio di emergenza sanitaria.',
      descrizione: "Entrare nell'EMS non significa solamente indossare una divisa: significa imparare procedure di soccorso, lavorare in squadra, mantenere la calma sotto pressione e contribuire attivamente alla vita della città salvando vite.",
      requisiti: [
        'Presentarsi con un abbigliamento consono in ospedale',
        'Non avere tatuaggi visibili',
        'Taglio capelli consono per un paramedico',
        'Fedina penale pulita',
        'Cittadinanza Americana',
        'Non avere voce bianca',
      ],
      motto: 'Save Lives.',
    },
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
    emoji: '🎖️',
    color: 0xf97316, // arancione
    bando: {
      title: 'UNITED STATES MARSHALS SERVICE',
      apertura: 'Lo United States Marshals Service comunica ufficialmente l’apertura dei bandi di reclutamento per l’ingresso nel Servizio.\nCerchiamo persone motivate, serie e realmente interessate a costruire un’esperienza di roleplay di qualità all’interno delle forze dell’ordine federali.',
      descrizione: 'Entrare nei Marshals non significa solamente indossare un distintivo: significa imparare procedure federali, gestire latitanti e trasferimenti di detenuti, proteggere il tribunale, lavorare in squadra, assumersi responsabilità e contribuire attivamente alla giustizia dello Stato.',
      requisiti: [
        'Presentarsi con un abbigliamento consono (formale) in sede',
        'Non avere tatuaggi',
        'Taglio capelli consono per un agente federale',
        'Fedina penale pulita',
        'Cittadinanza Americana',
        'Non avere voce bianca',
      ],
      motto: 'Justice. Integrity. Service.',
    },
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
    emoji: '🚨',
    color: 0xa67b5b, // marroncino
    bando: {
      title: 'FEDERAL INVESTIGATION BUREAU',
      apertura: 'Il Federal Investigation Bureau comunica ufficialmente l’apertura dei bandi di reclutamento per l’ingresso nel Bureau.\nCerchiamo persone motivate, serie e realmente interessate a costruire un’esperienza di roleplay di qualità all’interno delle forze dell’ordine federali.',
      descrizione: "Entrare nell'FIB non significa solamente indossare un distintivo: significa imparare tecniche investigative, condurre indagini complesse, lavorare in squadra, mantenere la riservatezza, assumersi responsabilità e contribuire attivamente alla sicurezza dello Stato.",
      requisiti: [
        'Presentarsi con un abbigliamento consono (formale) in sede',
        'Non avere tatuaggi',
        'Taglio capelli consono per un agente federale',
        'Fedina penale pulita',
        'Cittadinanza Americana',
        'Non avere voce bianca',
      ],
      motto: 'Fidelity. Bravery. Integrity.',
    },
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
  {
    key: 'gov',
    name: 'Governo',
    emoji: '⚖️',
    color: 0xd4af37, // oro
    bando: {
      title: 'GOVERNO DI LOS SANTOS',
      apertura: 'Il Governo di Los Santos comunica ufficialmente l’apertura dei bandi di reclutamento per l’ingresso nel Sistema Giudiziario.\nCerchiamo persone motivate, serie e realmente interessate a costruire un’esperienza di roleplay di qualità all’interno delle istituzioni.',
      descrizione: 'Entrare nel Governo non significa solamente indossare un abito elegante: significa conoscere le leggi, rispettare le procedure, garantire processi equi e contribuire attivamente alla giustizia della città.',
      requisiti: [
        'Presentarsi con un abbigliamento formale',
        'Non avere tatuaggi visibili',
        'Taglio capelli consono per un professionista del tribunale',
        'Fedina penale pulita',
        'Cittadinanza Americana',
        'Non avere voce bianca',
      ],
      motto: 'Justice for All.',
    },
    // posizioni = ruoli tra cui scegliere (menu a tendina "Posizione richiesta" e elenco nel pannello)
    posizioni: ['Giudice', 'Procuratore', 'Avvocato'],
    why: 'Perché vuoi entrare nel Governo e in questa posizione?',
    whyLabel: 'Perché il Governo e questa posizione?',
    scenario: "Una persona molto influente ti offre denaro per influenzare l'esito di un caso. Cosa fa il tuo personaggio?",
    rules: 'governi e FDO',
    experience: 'Governo/tribunale',
    extra: {
      question: "Come gestiresti un'udienza o un processo senza fare powergaming o metagaming?",
      label: "Come gestiresti un'udienza o un processo?",
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
  const fazioni = {
    id: 'fazioni', section: 'pg', paragraph: true, max: 300,
    label: 'Fazioni/lavori precedenti IC',
    description: "Fazione · ruolo · motivo dell'uscita. Se non ne hai, scrivi «Nessuna»",
    field: '🏢 Fazioni/lavori precedenti IC',
  };
  return [
    {
      title: 'OOC e personaggio',
      items: [
        { id: 'eta', section: 'ooc', inline: true, label: 'Età anagrafica (min. 16)', field: '🎂 Età anagrafica', placeholder: 'Es. 18', max: 2 },
        { id: 'tempo', section: 'ooc', inline: true, label: 'Da quanto sei su LiteRP?', field: '⏳ Da quanto sei su LiteRP?', placeholder: 'Es. 2 mesi', max: 50 },
        ...(job.posizioni
          ? [{ id: 'posizione', section: 'pg', options: job.posizioni, label: 'Posizione richiesta', placeholder: 'Scegli la posizione', field: '🎯 Posizione richiesta', max: 50 }]
          : []),
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
        // con la posizione richiesta la pagina 1 avrebbe 6 domande: le fazioni passano alla pagina 3
        ...(job.posizioni ? [] : [fazioni]),
      ],
    },
    {
      title: 'Intervista',
      items: [
        {
          id: 'motivazione', section: 'intervista', paragraph: true, min: 150, max: 600,
          label: job.whyLabel ?? job.why,
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
        ...(job.posizioni ? [fazioni] : []),
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
