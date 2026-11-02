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
  mining: {
    leistung: 'Moc telefonu',
    laufzeit: 'Czas pracy',
    minuten: (n: number) => `${n} min`,
    jeBlock: 'na blok puli',
    soloUnter: 'Bez puli. Zmień w szczegółach kopania.',
    details: 'Szczegóły kopania',
    detailsUnter: 'Shares, aktywność, tryb, workery',
    mehrTitel: 'Więcej mocy',
    mehrEinstieg: 'Mini App to twój start, by poznać YSKAR.',
    mehrText: 'Do prawdziwego kopania użyj Node Core na PC z CPU i GPU (NVIDIA, AMD, Intel) albo HiveOS na koparkach.',
    mehrLink: 'Pobieranie na yskar.app',
    wegZumBlock: 'Droga do bloku',
    besterShare: (p: string) => `Twój najlepszy share w tej sesji osiąga ${p} celu bloku.`,
    blockziel: (d: string) => `Cel bloku = difficulty ${d}. Share powyżej celu to blok.`,
    letzteShares: 'Ostatnie shares',
    angenommen: (n: string) => `${n} przyjętych`,
    abgelehnt: 'Share nieprzyjęty',
    einstellungen: 'Ustawienia',
    benchmark: 'Benchmark',
  },
};

export default ys;
