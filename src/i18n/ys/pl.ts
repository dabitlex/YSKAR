import type { YsWoerterbuch } from './en';

const ys: YsWoerterbuch = {
  status: {
    titel: 'Stan',
    erklaerung: 'Trzy pasy znaku YSKAR pokazują na pierwszy rzut oka stan twojej aplikacji.',
    band: { wallet: 'Portfel', netz: 'Sieć', mining: 'Kopanie' },
    wallet: { gesichert: 'Słowa odzyskiwania zapisane', offen: 'Słowa odzyskiwania jeszcze niezapisane' },
    netz: { verbunden: 'Połączono z siecią', getrennt: 'Łączenie z siecią…' },
    mining: { an: 'Kopanie trwa', aus: 'Kopanie zatrzymane' },
  },
};

export default ys;
