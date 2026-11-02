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
};

export default ys;
export type YsWoerterbuch = typeof ys;
