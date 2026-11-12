/**
 * Texte des Designs "Erstes Licht" (November 2026): der Minen-Reiter mit dem
 * Ufer. Jede Sprache hat dieselben Schluessel; de.ts gibt die Form vor.
 */
const licht = {
  deinLicht: 'Dein Licht',
  deinPlatz: 'Dein Platz',
  keinLicht: 'Noch kein Licht',
  seit: (min: number) => `Mining · seit ${min} Min.`,
  bereit: 'Bereit.',
  bereitPool: (pool: string, n: number) => `Ein Tipp auf Start, und dein Handy rechnet im Pool ${pool} mit. Dein Licht wäre das ${n}. am Ufer.`,
  bereitSolo: (n: number) => `Ein Tipp auf Start, und dein Handy rechnet allein. Dein Licht wäre das ${n}. am Ufer.`,
  waehlen: 'Such dir einen Pool aus, dann brennt dein Licht.',
  erwartung: (min: string, anteil: string, sym: string) => `Dein Pool findet im Schnitt etwa alle ${min} Minuten einen Block. Dein Anteil daran: etwa ${anteil} ${sym}.`,
  erwartungOffen: 'Dein Licht brennt. Jeder Share, den der Pool annimmt, zählt für deinen Anteil am nächsten Pool-Block.',
  solo: 'Dein Handy rechnet allein. Findet es einen Block, gehört die ganze Belohnung dir. Das ist selten.',
  leistung: 'Leistung',
  last: (p: number, w: number) => `Last ${p} % · ${w} Worker`,
  anpassen: 'Anpassen',
};

export default licht;
