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
  mining: {
    leistung: 'Potência do celular',
    laufzeit: 'Tempo ativo',
    minuten: (n: number) => `${n} min`,
    jeBlock: 'por bloco do pool',
    soloUnter: 'Sem pool. Altere nos detalhes de mineração.',
    details: 'Detalhes de mineração',
    detailsUnter: 'Shares, atividade, modo, workers',
    mehrTitel: 'Mais potência',
    mehrEinstieg: 'O Mini App é a sua porta de entrada para conhecer o YSKAR.',
    mehrText: 'Para minerar de verdade, use o Node Core num PC com CPU e GPU (NVIDIA, AMD, Intel) ou o HiveOS em rigs.',
    mehrLink: 'Downloads em yskar.app',
    wegZumBlock: 'Caminho até um bloco',
    besterShare: (p: string) => `Seu melhor share nesta sessão alcança ${p} da meta do bloco.`,
    blockziel: (d: string) => `Meta do bloco = difficulty ${d}. Um share acima da meta é um bloco.`,
    letzteShares: 'Últimos shares',
    angenommen: (n: string) => `${n} aceitos`,
    abgelehnt: 'Share não aceito',
    einstellungen: 'Configurações',
    benchmark: 'Benchmark',
  },
  netz: {
    naechster: 'Próximo',
    laeuft: (n: number) => `há ${n} min`,
    ketteAria: 'Os últimos blocos da cadeia',
  },
};

export default ys;
