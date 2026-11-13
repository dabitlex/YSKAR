import type licht from './de';

const pt: typeof licht = {
  deinLicht: 'Sua luz',
  deinPlatz: 'Seu lugar',
  keinLicht: 'Ainda sem luz',
  seit: (min: number) => `Minerando · ${min} min`,
  bereit: 'Pronto.',
  bereitPool: (pool: string, n: number) => `Toque em iniciar e seu celular entra no pool ${pool}. Sua luz seria a de número ${n} na margem.`,
  bereitSolo: (n: number) => `Toque em iniciar e seu celular minera sozinho. Sua luz seria a de número ${n} na margem.`,
  waehlen: 'Escolha um pool e sua luz se acende.',
  erwartung: (min: string, anteil: string, sym: string) => `Seu pool encontra um bloco a cada ${min} minutos, em média. Sua parte: cerca de ${anteil} ${sym}.`,
  erwartungOffen: 'Sua luz está acesa. Cada share aceito pelo pool conta para a sua parte do próximo bloco do pool.',
  solo: 'Seu celular minera sozinho. Se encontrar um bloco, a recompensa inteira é sua. Isso é raro.',
  leistung: 'Potência',
  last: (p: number, w: number) => `Carga ${p} % · ${w} workers`,
  anpassen: 'Ajustar',
  ersterEtikett: 'Primeiro share aceito',
  ersterTitel: 'Seu celular agora participa do trabalho, e isso pode ser comprovado.',
  ersterText: 'Um share é a sua prova para o pool. Quanto mais shares, maior a sua parte quando o pool encontra um bloco.',
};

export default pt;
