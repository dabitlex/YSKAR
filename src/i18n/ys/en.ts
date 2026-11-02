/**
 * Texts of the YSKAR system (redesign November 2026).
 * English is the template; every other language has the same keys.
 */
const ys = {
  status: {
    titel: 'Status',
    erklaerung: 'The three bands of the YSKAR mark show the state of your app at a glance.',
    band: { wallet: 'Wallet', netz: 'Network', mining: 'Mining' },
    wallet: { gesichert: 'Recovery words backed up', offen: 'Recovery words not backed up yet' },
    netz: { verbunden: 'Connected to the network', getrennt: 'Connecting to the network…' },
    mining: { an: 'Mining is running', aus: 'Mining is stopped' },
  },
  mining: {
    leistung: 'Phone power',
    laufzeit: 'Running',
    minuten: (n: number) => `${n} min`,
    jeBlock: 'per pool block',
    soloUnter: 'No pool. Change it in Mining details.',
    details: 'Mining details',
    detailsUnter: 'Shares, activity, mode, workers',
    mehrTitel: 'More power',
    mehrEinstieg: 'The Mini App is your way in to get to know YSKAR.',
    mehrText: 'For real mining, use Node Core on a PC with CPU and GPU (NVIDIA, AMD, Intel), or HiveOS on rigs.',
    mehrLink: 'Downloads on yskar.app',
    wegZumBlock: 'Path to a block',
    besterShare: (p: string) => `Your best share this session reaches ${p} of the block target.`,
    blockziel: (d: string) => `Block target = difficulty ${d}. A share above the target is a block.`,
    letzteShares: 'Latest shares',
    angenommen: (n: string) => `${n} accepted`,
    abgelehnt: 'Share not accepted',
    einstellungen: 'Settings',
    benchmark: 'Benchmark',
  },
};

export default ys;
export type YsWoerterbuch = typeof ys;
