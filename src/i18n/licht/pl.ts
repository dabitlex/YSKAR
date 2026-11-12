import type licht from './de';

const pl: typeof licht = {
  deinLicht: 'Twoje światło',
  deinPlatz: 'Twoje miejsce',
  keinLicht: 'Jeszcze bez światła',
  seit: (min: number) => `Mining · ${min} min`,
  bereit: 'Gotowe.',
  bereitPool: (pool: string, n: number) => `Stuknij Start, a Twój telefon dołączy do poola ${pool}. Twoje światło byłoby ${n}. na brzegu.`,
  bereitSolo: (n: number) => `Stuknij Start, a Twój telefon zacznie kopać sam. Twoje światło byłoby ${n}. na brzegu.`,
  waehlen: 'Wybierz pool, a Twoje światło się zapali.',
  erwartung: (min: string, anteil: string, sym: string) => `Twój pool znajduje blok średnio mniej więcej co ${min} min. Twoja część: około ${anteil} ${sym}.`,
  erwartungOffen: 'Twoje światło się pali. Każdy share przyjęty przez pool liczy się do Twojej części następnego bloku poola.',
  solo: 'Twój telefon kopie sam. Jeśli znajdzie blok, cała nagroda jest Twoja. To zdarza się rzadko.',
  leistung: 'Moc',
  last: (p: number, w: number) => `Obciążenie ${p} % · workery: ${w}`,
  anpassen: 'Zmień',
};

export default pl;
