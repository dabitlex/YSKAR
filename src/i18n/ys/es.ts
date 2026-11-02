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
};

export default ys;
