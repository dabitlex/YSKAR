import type licht from './de';

const it: typeof licht = {
  deinLicht: 'La tua luce',
  deinPlatz: 'Il tuo posto',
  keinLicht: 'Ancora nessuna luce',
  seit: (min: number) => `Mining · ${min} min`,
  bereit: 'Pronto.',
  bereitPool: (pool: string, n: number) => `Tocca avvia e il tuo telefono entra nel pool ${pool}. La tua luce sarebbe la numero ${n} sulla riva.`,
  bereitSolo: (n: number) => `Tocca avvia e il tuo telefono mina da solo. La tua luce sarebbe la numero ${n} sulla riva.`,
  waehlen: 'Scegli un pool e la tua luce si accende.',
  erwartung: (min: string, anteil: string, sym: string) => `Il tuo pool trova un blocco in media ogni ${min} minuti circa. La tua parte: circa ${anteil} ${sym}.`,
  erwartungOffen: 'La tua luce è accesa. Ogni share accettato dal pool conta per la tua parte del prossimo blocco del pool.',
  solo: 'Il tuo telefono mina da solo. Se trova un blocco, l’intera ricompensa è tua. Succede di rado.',
  leistung: 'Potenza',
  last: (p: number, w: number) => `Carico ${p} % · ${w} worker`,
  anpassen: 'Regola',
  ersterEtikett: 'Primo share accettato',
  ersterTitel: 'Ora il tuo telefono partecipa al lavoro, in modo verificabile.',
  ersterText: 'Uno share è la tua prova per il pool. Più share hai, più grande è la tua parte quando il pool trova un blocco.',
};

export default it;
