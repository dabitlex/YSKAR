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
  mining: {
    leistung: 'Leistung des Telefons',
    laufzeit: 'Laufzeit',
    minuten: (n: number) => `${n} min`,
    jeBlock: 'je Pool-Block',
    soloUnter: 'Ohne Pool. Umstellen in den Mining-Details.',
    details: 'Mining-Details',
    detailsUnter: 'Shares, Aktivität, Modus, Worker',
    mehrTitel: 'Mehr Leistung',
    mehrEinstieg: 'Die Mini App ist dein Einstieg, um YSKAR kennenzulernen.',
    mehrText: 'Richtig minen kannst du am PC mit Node Core – CPU und GPU (NVIDIA, AMD, Intel) – oder auf Rigs mit HiveOS.',
    mehrLink: 'Downloads auf yskar.app',
    wegZumBlock: 'Weg zum Block',
    besterShare: (p: string) => `Dein bester Share dieser Sitzung erreicht ${p} des Blockziels.`,
    blockziel: (d: string) => `Blockziel = Difficulty ${d}. Ein Share über dem Ziel ist ein Block.`,
    letzteShares: 'Letzte Shares',
    angenommen: (n: string) => `${n} angenommen`,
    abgelehnt: 'Share nicht angenommen',
    einstellungen: 'Einstellungen',
    benchmark: 'Benchmark',
  },
};

export default ys;
