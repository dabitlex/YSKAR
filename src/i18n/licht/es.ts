import type licht from './de';

const es: typeof licht = {
  deinLicht: 'Tu luz',
  deinPlatz: 'Tu lugar',
  keinLicht: 'Aún sin luz',
  seit: (min: number) => `Minando · ${min} min`,
  bereit: 'Listo.',
  bereitPool: (pool: string, n: number) => `Toca iniciar y tu teléfono se une al pool ${pool}. Tu luz sería la número ${n} en la orilla.`,
  bereitSolo: (n: number) => `Toca iniciar y tu teléfono mina por su cuenta. Tu luz sería la número ${n} en la orilla.`,
  waehlen: 'Elige un pool y tu luz se enciende.',
  erwartung: (min: string, anteil: string, sym: string) => `Tu pool encuentra un bloque cada ${min} minutos de media, aproximadamente. Tu parte: unos ${anteil} ${sym}.`,
  erwartungOffen: 'Tu luz está encendida. Cada share que acepta el pool cuenta para tu parte del próximo bloque del pool.',
  solo: 'Tu teléfono mina por su cuenta. Si encuentra un bloque, toda la recompensa es tuya. Ocurre pocas veces.',
  leistung: 'Potencia',
  last: (p: number, w: number) => `Carga ${p} % · ${w} workers`,
  anpassen: 'Ajustar',
  ersterEtikett: 'Primer share aceptado',
  ersterTitel: 'Tu teléfono ya participa en el trabajo, y se puede comprobar.',
  ersterText: 'Un share es tu prueba ante el pool. Cuantos más shares, mayor es tu parte cuando el pool encuentra un bloque.',
  einstiegTitel: 'Enciende\ntu luz.',
  einstiegText: 'Tu teléfono trabaja en bloques reales y gana YSR por ello. Por cada persona que participa arde una luz en la orilla.',
  schritt: (n: number, von: number) => `Paso ${n} de ${von}`,
};

export default es;
