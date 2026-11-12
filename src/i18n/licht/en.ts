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
};

export default en;
