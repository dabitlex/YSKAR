import type { YsWoerterbuch } from './en';

const ys: YsWoerterbuch = {
  status: {
    titel: 'Stato',
    erklaerung: 'Le tre bande del simbolo YSKAR mostrano a colpo d’occhio lo stato della tua app.',
    band: { wallet: 'Wallet', netz: 'Rete', mining: 'Mining' },
    wallet: { gesichert: 'Parole di recupero salvate', offen: 'Parole di recupero non ancora salvate' },
    netz: { verbunden: 'Connesso alla rete', getrennt: 'Connessione alla rete…' },
    mining: { an: 'Il mining è attivo', aus: 'Il mining è fermo' },
  },
};

export default ys;
