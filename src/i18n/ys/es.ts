import type { YsWoerterbuch } from './en';

const ys: YsWoerterbuch = {
  status: {
    titel: 'Estado',
    erklaerung: 'Las tres bandas del símbolo de YSKAR muestran de un vistazo el estado de tu app.',
    band: { wallet: 'Wallet', netz: 'Red', mining: 'Minería' },
    wallet: { gesichert: 'Palabras de recuperación guardadas', offen: 'Palabras de recuperación aún sin guardar' },
    netz: { verbunden: 'Conectado a la red', getrennt: 'Conectando con la red…' },
    mining: { an: 'La minería está en marcha', aus: 'La minería está detenida' },
  },
  mining: {
    leistung: 'Potencia del teléfono',
    laufzeit: 'Tiempo activo',
    minuten: (n: number) => `${n} min`,
    jeBlock: 'por bloque del pool',
    soloUnter: 'Sin pool. Cámbialo en los detalles de minería.',
    details: 'Detalles de minería',
    detailsUnter: 'Shares, actividad, modo, workers',
    mehrTitel: 'Más potencia',
    mehrEinstieg: 'La Mini App es tu puerta de entrada para conocer YSKAR.',
    mehrText: 'Para minar en serio, usa Node Core en un PC con CPU y GPU (NVIDIA, AMD, Intel) o HiveOS en rigs.',
    mehrLink: 'Descargas en yskar.app',
    wegZumBlock: 'Camino a un bloque',
    besterShare: (p: string) => `Tu mejor share de esta sesión alcanza el ${p} del objetivo de bloque.`,
    blockziel: (d: string) => `Objetivo de bloque = difficulty ${d}. Un share por encima del objetivo es un bloque.`,
    letzteShares: 'Últimos shares',
    angenommen: (n: string) => `${n} aceptados`,
    abgelehnt: 'Share no aceptado',
    einstellungen: 'Ajustes',
    benchmark: 'Benchmark',
  },
};

export default ys;
