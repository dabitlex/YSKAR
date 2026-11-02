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
  mining: {
    leistung: 'Potenza del telefono',
    laufzeit: 'Durata',
    minuten: (n: number) => `${n} min`,
    jeBlock: 'per blocco del pool',
    soloUnter: 'Senza pool. Cambialo nei dettagli del mining.',
    details: 'Dettagli mining',
    detailsUnter: 'Share, attività, modalità, worker',
    mehrTitel: 'Più potenza',
    mehrEinstieg: 'La Mini App è il tuo ingresso per conoscere YSKAR.',
    mehrText: 'Per minare davvero, usa Node Core su un PC con CPU e GPU (NVIDIA, AMD, Intel) o HiveOS sui rig.',
    mehrLink: 'Download su yskar.app',
    wegZumBlock: 'Verso un blocco',
    besterShare: (p: string) => `Il tuo miglior share di questa sessione raggiunge il ${p} del target del blocco.`,
    blockziel: (d: string) => `Target del blocco = difficulty ${d}. Uno share sopra il target è un blocco.`,
    letzteShares: 'Ultimi share',
    angenommen: (n: string) => `${n} accettati`,
    abgelehnt: 'Share non accettato',
    einstellungen: 'Impostazioni',
    benchmark: 'Benchmark',
  },
};

export default ys;
