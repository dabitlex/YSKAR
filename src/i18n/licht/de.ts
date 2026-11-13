/**
 * Texte des Designs "Erstes Licht" (November 2026): Minen-Reiter mit dem
 * Ufer, Einstieg, Wallet. Jede Sprache hat dieselben Schluessel; de.ts gibt die Form vor.
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
  ersterEtikett: 'Erster Share angenommen',
  ersterTitel: 'Dein Handy rechnet jetzt nachweislich mit.',
  ersterText: 'Ein Share ist dein Beleg an den Pool. Je mehr Shares, desto größer dein Anteil, sobald der Pool einen Block findet.',
  einstiegTitel: 'Mach dein\nLicht an.',
  einstiegText: 'Dein Handy rechnet an echten Blöcken mit und verdient dafür YSR. Für jeden, der mitmacht, brennt ein Licht am Ufer.',
  schritt: (n: number, von: number) => `Schritt ${n} von ${von}`,
  anWen: 'An wen?',
  leerTitel: (sym: string) => `So kommt ${sym} in deine Wallet`,
  leerMinenText: 'Jeder Block deines Pools zahlt deinen Anteil automatisch hierher.',
  leerEmpfangenText: 'Zeig jemandem deine Adresse oder deinen QR-Code.',
  legendeMining: 'Mining',
  legendeMenschen: 'Überweisungen',
};

export default licht;
