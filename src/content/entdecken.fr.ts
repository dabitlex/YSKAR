/**
 * Contenu « Découvrir » -- français.
 *
 * Données brutes, sans React. Les chiffres viennent de src/lib/core/params.ts,
 * pour qu'un article n'affirme jamais rien que la chaîne elle-même ne dise pas.
 * Le formatage des nombres est passé en paramètre (langue).
 */

import {
  INITIAL_REWARD, UNIT, MAX_SUPPLY, EPOCH_BLOCKS, SEASON_BLOCKS,
  TARGET_BLOCK_TIME, MIN_FEE, MAX_TXS_PER_BLOCK, DECIMALS,
} from '@/lib/core/params';
import type { Inhalte, Artikel, Frage, Neuigkeit } from './entdecken';

export default function inhalteFr(z: (n: number) => string): Inhalte {
const ysr = (v: bigint) => z(Number(v) / 10 ** DECIMALS);
const REWARD = Number(INITIAL_REWARD / UNIT);
const EPOCHE_TAGE = Math.round(EPOCH_BLOCKS * Number(TARGET_BLOCK_TIME) / 86400);

const ARTIKEL: Artikel[] = [
  {
    slug: 'was-ist-yskar', icon: 'Muenze', farbe: 'work',
    titel: 'Qu’est-ce que YSKAR ?',
    teaser: 'Sa propre chaîne PoW. Pas un token sur la blockchain de quelqu’un d’autre.',
    lesezeit: '2 min',
    einleitung: 'YSKAR est une cryptomonnaie indépendante à preuve de travail, avec sa propre ' +
      'chaîne, son propre consensus et son propre mineur. Il n’existe aucun smart contract ' +
      'nommé « YSKAR » sur une autre blockchain — le produit, c’est la chaîne elle-même.',
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: 'Réseau', wert: 'yskar-main-1' },
        { label: 'Genesis', wert: '09/09/2026' },
        { label: 'Fonction de hachage', wert: 'SHA-256d' },
        { label: 'Temps de bloc', wert: `≈ ${Number(TARGET_BLOCK_TIME) / 60} min` },
      ] },
      { art: 'absatz', text: 'Le bloc genesis porte une inscription qui donne le ton pour ' +
        'tout ce qui suit : « proof, not promise ». Aucune valeur n’est simulée. Ton appareil ' +
        'calcule de vrais hashs, chaque nœud revérifie lui-même chaque share, et ton solde ' +
        'peut être reconstitué à partir des seuls blocs.' },
      { art: 'absatz', text: 'Tu l’utilises via la Mini App Telegram ou l’app Android ' +
        '« YSKAR Wallet ». La propriété, elle, est liée aux clés, pas à Telegram : qui ' +
        'possède les douze mots possède le solde — avec ou sans compte Telegram.' },
      { art: 'hinweis', tone: 'dim', text: 'YSKAR est un projet, pas un moyen de paiement. ' +
        'Plusieurs nœuds complets vérifient la chaîne indépendamment les uns des autres ; ' +
        'chaque bloc peut être contrôlé dans l’explorateur.' },
    ],
  },
  {
    slug: 'mining-auf-dem-telefon', icon: 'Blitz', farbe: 'proof',
    titel: 'Le minage sur ton téléphone',
    teaser: 'Shares, difficulté, blocs — comment ton appareil participe.',
    lesezeit: '3 min',
    einleitung: 'Ton téléphone calcule des hashs SHA-256d sur un job envoyé par le réseau. ' +
      'C’est la même méthode que Bitcoin — seule la difficulté est choisie pour ' +
      'qu’un téléphone ait une vraie chance.',
    bausteine: [
      { art: 'schritte', titel: 'Comment naît un bloc', punkte: [
        'Le nœud distribue un job : l’en-tête du prochain bloc, valable 90 secondes.',
        'Tes workers essaient des nonces. Chaque calcul est un vrai hash.',
        'Un hash sous la cible de share est un share. Le nœud le recalcule — ' +
          'sans travail, pas de share valide.',
        'Si le hash est même sous la difficulté du bloc, un bloc est trouvé. ' +
          `La récompense de ${REWARD} YSR va à ton adresse.`,
      ] },
      { art: 'absatz', text: 'La charge (25–100 %) détermine à quel point ton appareil ' +
        'est sollicité. Le nombre de workers suit le nombre de cœurs — le calibrage trouve ' +
        'le meilleur réglage pour ton téléphone.' },
      { art: 'absatz', text: 'Dans Telegram, l’écran reste allumé pendant le minage — s’il se ' +
        'verrouille, la plateforme suspend le worker. L’app Android continue de calculer ' +
        'écran verrouillé, avec le hashrate affiché dans la notification.' },
      { art: 'hinweis', tone: 'work', text: 'Solo et pool sont à égalité. Le premier pool est ' +
        'en ligne : c’est le bloc lui-même qui paie tous les participants — l’opérateur ne ' +
        'détient jamais l’argent des autres.' },
    ],
  },
  {
    slug: 'tokenomics', icon: 'Tabelle', farbe: 'amber',
    titel: 'Tokenomics',
    teaser: `${ysr(MAX_SUPPLY)} YSR, ${REWARD} par bloc, halving tous les ${z(EPOCH_BLOCKS)} blocs.`,
    lesezeit: '3 min',
    einleitung: 'Pas de prévente, pas d’allocation pour l’équipe, pas d’airdrop. Chaque YSR ' +
      'naît comme récompense de bloc — pour celui qui a trouvé le bloc.',
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: 'Offre max.', wert: `${ysr(MAX_SUPPLY)} YSR` },
        { label: 'Récompense actuelle', wert: `${REWARD} YSR` },
        { label: 'Halving', wert: `tous les ${z(EPOCH_BLOCKS)} blocs` },
        { label: 'Temps de bloc', wert: `≈ ${Number(TARGET_BLOCK_TIME) / 60} minutes` },
      ] },
      { art: 'balken', titel: 'Émission dans le temps', werte: [
        { label: `Époque 1 · ${REWARD}`, anteil: 1 },
        { label: `Époque 2 · ${REWARD / 2}`, anteil: .5 },
        { label: `Époque 3 · ${REWARD / 4}`, anteil: .25 },
        { label: '', anteil: .125 }, { label: '', anteil: .0625 }, { label: '', anteil: .031 },
      ], fuss: `Une époque compte ${z(EPOCH_BLOCKS)} blocs, soit environ ${EPOCHE_TAGE} jours. ` +
        'Ensuite, la récompense est divisée par deux — comme Bitcoin, mais en plus rapide.' },
      { art: 'absatz', text: `Une saison compte ${z(SEASON_BLOCKS)} blocs, deux saisons font une ` +
        'époque. La récompense est divisée par deux par un simple décalage de bits, sans arrondi — ' +
        `l’offre totale finit donc juste sous ${ysr(MAX_SUPPLY)}, exactement comme Bitcoin.` },
      { art: 'kennzahlen', werte: [
        { label: 'Frais minimum', wert: `${ysr(MIN_FEE)} YSR` },
        { label: 'Places par bloc', wert: z(MAX_TXS_PER_BLOCK) },
      ] },
      { art: 'hinweis', tone: 'work', text: 'Les chiffres de cette page viennent directement ' +
        'des paramètres de consensus de la chaîne — pas d’un livre blanc.' },
    ],
  },
  {
    slug: 'wallet-und-sicherheit', icon: 'Schloss', farbe: 'ink',
    titel: 'Portefeuille et sécurité',
    teaser: 'Douze mots, un PIN, des signatures sur l’appareil.',
    lesezeit: '2 min',
    einleitung: 'Ton portefeuille, ce sont douze mots. Qui les a possède ton solde — ' +
      'et qui les perd le perd. Personne ne peut les réinitialiser : ni nous, ni ' +
      'Telegram, personne.',
    bausteine: [
      { art: 'schritte', titel: 'Ce qui se passe sur l’appareil', punkte: [
        'Les mots sont stockés sur le téléphone, chiffrés avec ton PIN.',
        'Un paiement est construit et signé entièrement sur l’appareil.',
        'Le serveur ne voit que des octets finis — il ne peut modifier ni le montant ni le ' +
          'destinataire sans casser la signature.',
      ] },
      { art: 'absatz', text: 'Le PIN protège contre quelqu’un qui prend ton téléphone ' +
        'déverrouillé. Face à un attaquant déterminé ayant accès à l’appareil, la seule ' +
        'protection est de ne pas y garder de grosses sommes.' },
      { art: 'absatz', text: 'Le QR code sous « Recevoir » est généré sur l’appareil. ' +
        'Lors d’un envoi, tu peux scanner le code d’un autre utilisateur avec l’appareil photo — ' +
        'l’adresse est validée avant d’être utilisée.' },
      { art: 'hinweis', tone: 'risk', text: 'Un paiement envoyé ne peut pas être annulé. ' +
        'Vérifie l’adresse en entier, pas seulement le début et la fin.' },
    ],
  },
  {
    slug: 'full-node-und-pool', icon: 'Wuerfel', farbe: 'work',
    titel: 'Nœud complet et pool',
    teaser: 'Plusieurs nœuds, premier pool en ligne — comment le réseau s’articule.',
    lesezeit: '3 min',
    einleitung: 'Un nœud complet récupère la chaîne, vérifie lui-même chaque bloc et construit ' +
      'ses propres blocs. Plusieurs nœuds tournent déjà en parallèle et se synchronisent en ' +
      'P2P — la chaîne ne dépend plus d’un seul serveur.',
    bausteine: [
      { art: 'schritte', titel: 'Ce que fait un nœud', punkte: [
        'Les en-têtes d’abord : il récupère la chaîne auprès d’autres nœuds et vérifie chaîne et ' +
          'travail localement avant d’accepter un bloc.',
        'Il accepte les transactions dans son mempool et distribue des jobs aux mineurs.',
        'Quand un mineur trouve un bloc, le nœud le soumet et le relaie à ses pairs.',
        'Tout a ses limites : tailles de message, délais et places par pair sont fixés — ' +
          'un pair seul ne peut pas surcharger un nœud.',
      ] },
      { art: 'absatz', text: 'Le nœud tourne sur n’importe quelle machine avec Node 22 ; son stockage ' +
        'tient dans un seul fichier SQLite. Chacun peut faire tourner le sien et vérifier la chaîne ' +
        'sans devoir faire confiance à personne.' },
      { art: 'schritte', titel: 'Le minage en pool, comment ça marche', punkte: [
        'Le pool ne détient jamais l’argent des autres. La répartition devient la coinbase du ' +
          'bloc (consensus version 2 : coinbase à plusieurs destinataires).',
        'PPLNS : les N dernières unités de travail sont payées — d’un bloc trouvé à l’autre. ' +
          'Le pool hopping ne paie pas.',
        'La répartition figure dans le bloc, vérifiable par tous.',
      ] },
      { art: 'hinweis', tone: 'work', text: 'Le premier pool est en ligne. Dans l’onglet « Minage », ' +
        'choisis « Pool » et saisis son adresse — le pool indique puissance de hash, ' +
        'nombre de mineurs et frais avant que tu commences.' },
    ],
  },
  {
    slug: 'roadmap', icon: 'Pfeil', farbe: 'proof',
    titel: 'Feuille de route',
    teaser: 'Micropaiements, Node Core pour tous les systèmes, apps avec portefeuille Lightning.',
    lesezeit: '2 min',
    einleitung: 'Pas de dates qui ne seront pas tenues. À la place, des états que chacun peut ' +
      'vérifier dans l’explorateur et dans le code source.',
    bausteine: [
      { art: 'schritte', titel: 'Fait', punkte: [
        'Chaîne, portefeuille, transactions dans le bloc, mineur sur le téléphone.',
        'Marché des frais : recommandation basée sur la file d’attente réelle.',
        'Consensus version 2 : coinbase à plusieurs destinataires.',
        'Minage en pool avec paiement PPLNS directement depuis le bloc — le premier pool est en ligne.',
        'P2P entre nœuds complets ; plusieurs nœuds tournent en parallèle.',
        'La chaîne vit sur les nœuds complets ; le serveur n’est qu’un miroir pour l’app.',
        'App Android « YSKAR Wallet » : notifications pour les paiements reçus, biométrie, minage ' +
          'en arrière-plan, alerte de mise à jour dans l’app — en APK sur GitHub.',
      ] },
      { art: 'schritte', titel: 'Ensuite', punkte: [
        'Micropaiements : transférer de petits montants rapidement et à bas coût.',
        'YSKAR Node Core : version avec portefeuille et minage intégrés pour tous les systèmes.',
        'App iOS ; portefeuille Lightning dans les deux apps.',
      ] },
      { art: 'hinweis', tone: 'work', text: 'Le code source est ouvert. Chaque étape ici ' +
        'correspond à un document dans le dépôt.' },
    ],
  },
];

const FAQ: Frage[] = [
  { frage: 'YSKAR, c’est un airdrop ou du tap-to-earn ?',
    antwort: 'Non. Il n’y a rien à taper et rien n’est distribué. Les YSR ne ' +
      'naissent que comme récompenses de bloc pour un vrai travail de calcul que le ' +
      'nœud a revérifié.' },
  { frage: 'Combien je gagne avec mon téléphone ?',
    antwort: 'Ça dépend de ton hashrate par rapport à l’ensemble du réseau. ' +
      `En moyenne, toutes les ${Number(TARGET_BLOCK_TIME) / 60} minutes, un appareil du ` +
      `réseau trouve un bloc qui rapporte ${REWARD} YSR. L’onglet « Réseau » affiche le ` +
      'hashrate du réseau — ta part de celui-ci est ta chance attendue par bloc.' },
  { frage: 'Que se passe-t-il si je perds mes douze mots ?',
    antwort: 'Le solde est perdu. Il n’y a pas de « mot de passe oublié » : ni nous ni ' +
      'Telegram ne pouvons restaurer les mots. Écris-les sur papier — pas en capture d’écran.' },
  { frage: 'Qui fait tourner la chaîne ?',
    antwort: 'Personne à lui seul. Plusieurs nœuds complets tournent en parallèle, se synchronisent ' +
      'en P2P et revérifient eux-mêmes chaque bloc. L’app lit via un miroir — ' +
      'chacun peut faire tourner son propre nœud et n’a même pas besoin de ce miroir.' },
];

const NEUIGKEITEN: Neuigkeit[] = [
  {
    datum: '2026-09-30',
    titel: 'App Android « YSKAR Wallet »',
    text: 'Notifications pour les paiements reçus, déverrouillage et envoi par empreinte, ' +
      'minage écran verrouillé. En APK sur GitHub — et l’app parle désormais plusieurs langues.',
    link: 'https://github.com/dabitlex/YSKAR/releases',
  },
  {
    datum: '2026-09-29',
    titel: 'Nouveau design et scan QR',
    text: 'L’app montre désormais ce qu’est YSKAR — et les adresses peuvent être scannées avec ' +
      'l’appareil photo lors d’un envoi.',
  },
  {
    datum: '2026-09-09',
    titel: 'La chaîne est lancée',
    text: 'Bloc genesis miné, inscription « proof, not promise ». Le minage est ' +
      'ouvert à tous.',
  },
];

return { ARTIKEL, FAQ, NEUIGKEITEN };
}
