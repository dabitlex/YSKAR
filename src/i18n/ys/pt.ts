import type { YsWoerterbuch } from './en';

const ys: YsWoerterbuch = {
  status: {
    titel: 'Estado',
    erklaerung: 'As três faixas do símbolo YSKAR mostram de relance o estado do seu app.',
    band: { wallet: 'Carteira', netz: 'Rede', mining: 'Mineração' },
    wallet: { gesichert: 'Palavras de recuperação guardadas', offen: 'Palavras de recuperação ainda não guardadas' },
    netz: { verbunden: 'Conectado à rede', getrennt: 'Conectando à rede…' },
    mining: { an: 'A mineração está ativa', aus: 'A mineração está parada' },
  },
};

export default ys;
