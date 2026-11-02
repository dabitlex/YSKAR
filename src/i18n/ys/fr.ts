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
};

export default ys;
