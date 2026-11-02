import type { YsWoerterbuch } from './en';

const ys: YsWoerterbuch = {
  status: {
    titel: 'Durum',
    erklaerung: 'YSKAR işaretinin üç bandı uygulamanın durumunu bir bakışta gösterir.',
    band: { wallet: 'Cüzdan', netz: 'Ağ', mining: 'Madencilik' },
    wallet: { gesichert: 'Kurtarma kelimeleri yedeklendi', offen: 'Kurtarma kelimeleri henüz yedeklenmedi' },
    netz: { verbunden: 'Ağa bağlı', getrennt: 'Ağa bağlanılıyor…' },
    mining: { an: 'Madencilik çalışıyor', aus: 'Madencilik durduruldu' },
  },
};

export default ys;
