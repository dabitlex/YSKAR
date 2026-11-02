import type { YsWoerterbuch } from './en';

const ys: YsWoerterbuch = {
  status: {
    titel: 'Status',
    erklaerung: 'Die drei Bänder des YSKAR-Zeichens zeigen auf einen Blick, wie es um deine App steht.',
    band: { wallet: 'Wallet', netz: 'Netz', mining: 'Mining' },
    wallet: { gesichert: '12 Wörter gesichert', offen: '12 Wörter noch nicht gesichert' },
    netz: { verbunden: 'Mit dem Netz verbunden', getrennt: 'Verbinde mit dem Netz…' },
    mining: { an: 'Mining läuft', aus: 'Mining gestoppt' },
  },
};

export default ys;
