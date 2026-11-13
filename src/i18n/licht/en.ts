import type licht from './de';

const en: typeof licht = {
  deinLicht: 'Your light',
  deinPlatz: 'Your spot',
  keinLicht: 'No light yet',
  seit: (min: number) => `Mining · for ${min} min`,
  bereit: 'Ready.',
  bereitPool: (pool: string, n: number) => `Tap Start and your phone joins the pool ${pool}. Your light would be number ${n} on the shore.`,
  bereitSolo: (n: number) => `Tap Start and your phone mines on its own. Your light would be number ${n} on the shore.`,
  waehlen: 'Pick a pool, then your light comes on.',
  erwartung: (min: string, anteil: string, sym: string) => `Your pool finds a block about every ${min} minutes on average. Your share of it: about ${anteil} ${sym}.`,
  erwartungOffen: 'Your light is on. Every share the pool accepts counts towards your part of the next pool block.',
  solo: 'Your phone mines on its own. If it finds a block, the whole reward is yours. That is rare.',
  leistung: 'Hashrate',
  last: (p: number, w: number) => `Load ${p}% · ${w} ${w === 1 ? 'worker' : 'workers'}`,
  anpassen: 'Adjust',
  ersterEtikett: 'First share accepted',
  ersterTitel: 'Your phone is now provably part of the work.',
  ersterText: 'A share is your proof to the pool. The more shares, the larger your part once the pool finds a block.',
  einstiegTitel: 'Switch your\nlight on.',
  einstiegText: 'Your phone works on real blocks and earns YSR for it. For everyone who takes part, a light burns on the shore.',
  schritt: (n: number, von: number) => `Step ${n} of ${von}`,
  anWen: 'Who to?',
  leerTitel: (sym: string) => `How ${sym} gets into your wallet`,
  leerMinenText: 'Every block your pool finds pays your share here automatically.',
  leerEmpfangenText: 'Show someone your address or your QR code.',
  legendeMining: 'Mining',
  legendeMenschen: 'Transfers',
};

export default en;
