/**
 * "Discover" content -- Italiano.
 *
 * Plain data, no React. Numbers come from src/lib/core/params.ts so an
 * article never claims anything the chain itself does not. Number
 * formatting is passed in (language).
 */

import {
  INITIAL_REWARD, UNIT, MAX_SUPPLY, EPOCH_BLOCKS, SEASON_BLOCKS,
  TARGET_BLOCK_TIME, MIN_FEE, MAX_TXS_PER_BLOCK, DECIMALS,
} from '@/lib/core/params';
import type { Inhalte, Artikel, Frage, Neuigkeit } from './entdecken';

export default function inhalteIt(z: (n: number) => string): Inhalte {
const ysr = (v: bigint) => z(Number(v) / 10 ** DECIMALS);
const REWARD = Number(INITIAL_REWARD / UNIT);
const EPOCHE_TAGE = Math.round(EPOCH_BLOCKS * Number(TARGET_BLOCK_TIME) / 86400);

const ARTIKEL: Artikel[] = [
  {
    slug: 'was-ist-yskar', icon: 'Muenze', farbe: 'work',
    titel: 'Cos’è YSKAR?',
    teaser: 'Una catena PoW tutta sua. Non un token sulla blockchain di qualcun altro.',
    lesezeit: '2 min',
    einleitung: 'YSKAR è una criptovaluta proof of work indipendente, con una sua ' +
      'catena, un suo consenso e un suo miner. Non esiste nessuno smart contract su ' +
      'un’altra blockchain chiamato «YSKAR»: il prodotto è la catena stessa.',
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: 'Rete', wert: 'yskar-main-1' },
        { label: 'Genesis', wert: '2026-09-09' },
        { label: 'Funzione di hash', wert: 'SHA-256d' },
        { label: 'Tempo di blocco', wert: `≈ ${Number(TARGET_BLOCK_TIME) / 60} min` },
      ] },
      { art: 'absatz', text: 'Il blocco genesis porta un’iscrizione che fissa lo ' +
        'standard per tutto ciò che segue: «proof, not promise». Nessun valore è ' +
        'simulato. Il tuo dispositivo calcola hash veri, ogni nodo ricontrolla da sé ' +
        'ogni share e il tuo saldo si può ricostruire partendo solo dai blocchi.' },
      { art: 'absatz', text: 'Lo usi tramite la Mini App di Telegram o l’app Android ' +
        '«YSKAR Wallet». La proprietà però è legata alle chiavi, non a Telegram: chi ' +
        'ha le dodici parole ha il saldo, con o senza account Telegram.' },
      { art: 'hinweis', tone: 'dim', text: 'YSKAR è un progetto, non un mezzo di pagamento. ' +
        'Più full node verificano la catena in modo indipendente l’uno dall’altro; ogni blocco ' +
        'si può controllare nell’explorer.' },
    ],
  },
  {
    slug: 'mining-auf-dem-telefon', icon: 'Blitz', farbe: 'proof',
    titel: 'Mining sul telefono',
    teaser: 'Share, difficulty, blocchi: come partecipa il tuo dispositivo.',
    lesezeit: '3 min',
    einleitung: 'Il tuo telefono calcola hash SHA-256d su un job ricevuto dalla rete. ' +
      'È lo stesso procedimento di Bitcoin, solo che la difficulty è scelta in modo ' +
      'che anche un telefono abbia una possibilità reale.',
    bausteine: [
      { art: 'schritte', titel: 'Come nasce un blocco', punkte: [
        'Il nodo distribuisce un job: l’header del prossimo blocco, valido per 90 secondi.',
        'I tuoi worker provano dei nonce. Ogni calcolo è un hash vero.',
        'Un hash sotto il target dello share è uno share. Il nodo lo ricalcola: ' +
          'senza lavoro non c’è share valido.',
        'Se l’hash è addirittura sotto la difficulty del blocco, il blocco è trovato. ' +
          `La ricompensa di ${REWARD} YSR va al tuo indirizzo.`,
      ] },
      { art: 'absatz', text: 'Il carico CPU (25–100 %) regola quanto viene sfruttato il tuo ' +
        'dispositivo. Il numero di worker segue i core: la calibrazione trova ' +
        'l’impostazione migliore per il tuo telefono.' },
      { art: 'absatz', text: 'In Telegram lo schermo resta acceso durante il mining: se si ' +
        'blocca, la piattaforma sospende il worker. L’app Android continua a calcolare ' +
        'anche a schermo bloccato, come si vede dalla notifica con l’hashrate.' },
      { art: 'hinweis', tone: 'work', text: 'Solo e pool sono alla pari. Il primo pool è ' +
        'attivo: è il blocco stesso a pagare tutti i partecipanti, e il gestore non ' +
        'custodisce mai i soldi degli altri.' },
    ],
  },
  {
    slug: 'tokenomics', icon: 'Tabelle', farbe: 'amber',
    titel: 'Tokenomics',
    teaser: `${ysr(MAX_SUPPLY)} YSR, ${REWARD} per blocco, halving ogni ${z(EPOCH_BLOCKS)} blocchi.`,
    lesezeit: '3 min',
    einleitung: 'Niente prevendita, niente quota per il team, niente airdrop. Ogni YSR ' +
      'nasce come reward di un blocco, per chi ha trovato quel blocco.',
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: 'Offerta max.', wert: `${ysr(MAX_SUPPLY)} YSR` },
        { label: 'Reward oggi', wert: `${REWARD} YSR` },
        { label: 'Halving', wert: `ogni ${z(EPOCH_BLOCKS)} blocchi` },
        { label: 'Tempo di blocco', wert: `≈ ${Number(TARGET_BLOCK_TIME) / 60} minuti` },
      ] },
      { art: 'balken', titel: 'Emissione nel tempo', werte: [
        { label: `Epoca 1 · ${REWARD}`, anteil: 1 },
        { label: `Epoca 2 · ${REWARD / 2}`, anteil: .5 },
        { label: `Epoca 3 · ${REWARD / 4}`, anteil: .25 },
        { label: '', anteil: .125 }, { label: '', anteil: .0625 }, { label: '', anteil: .031 },
      ], fuss: `Un’epoca dura ${z(EPOCH_BLOCKS)} blocchi, circa ${EPOCHE_TAGE} giorni. ` +
        'Poi la ricompensa si dimezza: come in Bitcoin, solo più in fretta.' },
      { art: 'absatz', text: `Una season dura ${z(SEASON_BLOCKS)} blocchi, due season fanno ` +
        'un’epoca. La ricompensa viene dimezzata con un semplice bit shift, senza ' +
        `arrotondamenti: così l’offerta totale si ferma appena sotto ${ysr(MAX_SUPPLY)}, ` +
        'esattamente come in Bitcoin.' },
      { art: 'kennzahlen', werte: [
        { label: 'Commissione minima', wert: `${ysr(MIN_FEE)} YSR` },
        { label: 'Slot per blocco', wert: z(MAX_TXS_PER_BLOCK) },
      ] },
      { art: 'hinweis', tone: 'work', text: 'I numeri di questa pagina vengono direttamente ' +
        'dai parametri di consenso della catena, non da un whitepaper.' },
    ],
  },
  {
    slug: 'wallet-und-sicherheit', icon: 'Schloss', farbe: 'ink',
    titel: 'Wallet e sicurezza',
    teaser: 'Dodici parole, un PIN, firme sul dispositivo.',
    lesezeit: '2 min',
    einleitung: 'Il tuo wallet sono dodici parole. Chi le ha, ha il tuo saldo, ' +
      'e chi le perde lo perde. Nessuno può reimpostarle: né noi, né ' +
      'Telegram, nessuno.',
    bausteine: [
      { art: 'schritte', titel: 'Cosa succede sul dispositivo', punkte: [
        'Le parole vengono salvate sul telefono, cifrate con il tuo PIN.',
        'Un pagamento viene creato e firmato interamente sul dispositivo.',
        'Il server vede solo byte già pronti: non può cambiare importo o ' +
          'destinatario senza invalidare la firma.',
      ] },
      { art: 'absatz', text: 'Il PIN ti protegge se qualcuno prende in mano il tuo telefono ' +
        'sbloccato. Contro un attaccante determinato con accesso al dispositivo, l’unica ' +
        'protezione è non tenerci sopra grandi somme.' },
      { art: 'absatz', text: 'Il codice QR in «Ricevi» viene generato sul dispositivo. ' +
        'Quando invii, puoi scansionare con la fotocamera il codice di un altro utente: ' +
        'l’indirizzo viene verificato prima di essere usato.' },
      { art: 'hinweis', tone: 'risk', text: 'Un pagamento inviato non può essere annullato. ' +
        'Controlla l’indirizzo per intero, non solo l’inizio e la fine.' },
    ],
  },
  {
    slug: 'full-node-und-pool', icon: 'Wuerfel', farbe: 'work',
    titel: 'Full node e pool',
    teaser: 'Più nodi, il primo pool attivo: come funziona la rete.',
    lesezeit: '3 min',
    einleitung: 'Un full node scarica la catena, verifica da sé ogni blocco e crea ' +
      'i propri blocchi. Già oggi più nodi funzionano in contemporanea e si sincronizzano ' +
      'via P2P: la catena non dipende più da un singolo server.',
    bausteine: [
      { art: 'schritte', titel: 'Cosa fa un nodo', punkte: [
        'Prima gli header: scarica la catena dagli altri nodi e verifica catena e ' +
          'lavoro in locale prima di accettare un blocco.',
        'Accetta le transazioni nel suo mempool e distribuisce job ai miner.',
        'Quando un miner trova un blocco, il nodo lo inoltra e lo trasmette ai suoi peer.',
        'Tutto ha dei limiti: dimensioni dei messaggi, scadenze e slot per peer sono fissi, ' +
          'quindi un singolo peer non può sovraccaricare un nodo.',
      ] },
      { art: 'absatz', text: 'Il nodo gira su qualsiasi macchina con Node 22; il suo archivio ' +
        'è un singolo file SQLite. Chiunque può farne girare uno e verificare la catena ' +
        'senza doversi fidare di nessuno.' },
      { art: 'schritte', titel: 'Il pool mining, come funziona', punkte: [
        'Il pool non custodisce mai i soldi degli altri. La ripartizione diventa la coinbase ' +
          'del blocco (versione di consenso 2: coinbase con più destinatari).',
        'PPLNS: vengono pagate le ultime N unità di lavoro, anche tra un blocco trovato e l’altro. ' +
          'Il pool hopping non conviene.',
        'La ripartizione è nel blocco, verificabile da chiunque.',
      ] },
      { art: 'hinweis', tone: 'work', text: 'Il primo pool è attivo. Nella scheda «Mining» ' +
        'scegli «Pool» e inserisci il suo indirizzo: prima che tu inizi, il pool indica ' +
        'potenza di calcolo, numero di miner e commissione.' },
    ],
  },
  {
    slug: 'roadmap', icon: 'Pfeil', farbe: 'proof',
    titel: 'Roadmap',
    teaser: 'Micropagamenti, Node Core per ogni sistema, app con wallet Lightning.',
    lesezeit: '2 min',
    einleitung: 'Niente date che non verranno rispettate. Al loro posto, traguardi che ' +
      'chiunque può verificare nell’explorer e nel codice sorgente.',
    bausteine: [
      { art: 'schritte', titel: 'Fatto', punkte: [
        'Catena, wallet, transazioni nel blocco, miner sul telefono.',
        'Mercato delle commissioni: consiglio basato sulla coda reale.',
        'Versione di consenso 2: coinbase con più destinatari.',
        'Pool mining con pagamento PPLNS direttamente dal blocco: il primo pool è attivo.',
        'P2P tra full node; più nodi funzionano in contemporanea.',
        'La catena vive sui full node; il server è solo uno specchio per l’app.',
        'App Android «YSKAR Wallet»: notifiche push per i pagamenti in entrata, biometria, ' +
          'mining in background, avviso di aggiornamento nell’app, come APK su GitHub.',
      ] },
      { art: 'schritte', titel: 'Prossimi passi', punkte: [
        'Micropagamenti: trasferire piccoli importi in modo rapido ed economico.',
        'YSKAR Node Core: release con wallet e mining integrati per ogni sistema.',
        'App iOS; wallet Lightning in entrambe le app.',
      ] },
      { art: 'hinweis', tone: 'work', text: 'Il codice è aperto. Ogni passo qui ' +
        'corrisponde a un documento nel repository.' },
    ],
  },
];

const FAQ: Frage[] = [
  { frage: 'YSKAR è un airdrop o un tap-to-earn?',
    antwort: 'No. Non c’è niente da toccare e niente viene regalato. Gli YSR nascono ' +
      'solo come reward dei blocchi, per un vero lavoro di calcolo che il ' +
      'nodo ha ricontrollato.' },
  { frage: 'Quanto guadagno con il mio telefono?',
    antwort: 'Dipende dal tuo hashrate rispetto a quello dell’intera rete. ' +
      `In media, ogni ${Number(TARGET_BLOCK_TIME) / 60} minuti un dispositivo della ` +
      `rete trova un blocco da ${REWARD} YSR. La scheda «Rete» mostra l’hashrate ` +
      'di rete: la tua quota è la tua probabilità attesa per ogni blocco.' },
  { frage: 'Cosa succede se perdo le mie dodici parole?',
    antwort: 'Il saldo è perso. Non esiste «password dimenticata»: né noi né ' +
      'Telegram possiamo ripristinare le parole. Scrivile su carta, non come screenshot.' },
  { frage: 'Chi gestisce la catena?',
    antwort: 'Nessuno da solo. Più full node funzionano in contemporanea, si sincronizzano via P2P ' +
      'e ricontrollano da sé ogni blocco. L’app legge tramite uno specchio, ' +
      'ma chiunque può far girare il proprio nodo e non ha bisogno nemmeno di quello.' },
];

const NEUIGKEITEN: Neuigkeit[] = [
  {
    datum: '2026-09-30',
    titel: 'App Android «YSKAR Wallet»',
    text: 'Notifiche push per i pagamenti in entrata, sblocco e invio con l’impronta, ' +
      'mining a schermo bloccato. Come APK su GitHub, e ora l’app parla più lingue.',
    link: 'https://github.com/dabitlex/YSKAR/releases',
  },
  {
    datum: '2026-09-29',
    titel: 'Nuovo design e scansione QR',
    text: 'Ora l’app spiega cos’è YSKAR, e quando invii puoi scansionare gli indirizzi ' +
      'con la fotocamera.',
  },
  {
    datum: '2026-09-09',
    titel: 'La catena è partita',
    text: 'Blocco genesis minato, iscrizione «proof, not promise». Il mining è ' +
      'aperto a tutti.',
  },
];

return { ARTIKEL, FAQ, NEUIGKEITEN };
}
