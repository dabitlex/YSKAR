import type { YsWoerterbuch } from './en';

const ys: YsWoerterbuch = {
  status: {
    titel: 'État',
    erklaerung: 'Les trois bandes du symbole YSKAR montrent d’un coup d’œil l’état de ton app.',
    band: { wallet: 'Wallet', netz: 'Réseau', mining: 'Minage' },
    wallet: { gesichert: 'Mots de récupération sauvegardés', offen: 'Mots de récupération pas encore sauvegardés' },
    netz: { verbunden: 'Connecté au réseau', getrennt: 'Connexion au réseau…' },
    mining: { an: 'Le minage est en cours', aus: 'Le minage est arrêté' },
  },
  mining: {
    leistung: 'Puissance du téléphone',
    laufzeit: 'Durée',
    minuten: (n: number) => `${n} min`,
    jeBlock: 'par bloc du pool',
    soloUnter: 'Sans pool. À changer dans les détails du minage.',
    details: 'Détails du minage',
    detailsUnter: 'Shares, activité, mode, workers',
    mehrTitel: 'Plus de puissance',
    mehrEinstieg: 'La Mini App est ton point d’entrée pour découvrir YSKAR.',
    mehrText: 'Pour miner sérieusement, utilise Node Core sur un PC avec CPU et GPU (NVIDIA, AMD, Intel), ou HiveOS sur des rigs.',
    mehrLink: 'Téléchargements sur yskar.app',
    wegZumBlock: 'Vers un bloc',
    besterShare: (p: string) => `Ton meilleur share de cette session atteint ${p} de la cible du bloc.`,
    blockziel: (d: string) => `Cible du bloc = difficulty ${d}. Un share au-dessus de la cible est un bloc.`,
    letzteShares: 'Derniers shares',
    angenommen: (n: string) => `${n} acceptés`,
    abgelehnt: 'Share non accepté',
    einstellungen: 'Réglages',
    benchmark: 'Benchmark',
  },
};

export default ys;
