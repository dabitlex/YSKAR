/**
 * Inhalte des Bereichs „Entdecken".
 *
 * Reine Daten, kein React: So lassen sich Texte aendern, ohne eine
 * Komponente anzufassen. Zahlen kommen aus src/lib/core/params.ts, damit
 * ein Artikel nie etwas anderes behauptet als die Kette selbst.
 */

import {
  INITIAL_REWARD, UNIT, MAX_SUPPLY, EPOCH_BLOCKS, SEASON_BLOCKS,
  TARGET_BLOCK_TIME, MIN_FEE, MAX_TXS_PER_BLOCK, DECIMALS,
} from '@/lib/core/params';

export type Baustein =
  | { art: 'absatz'; text: string }
  | { art: 'kennzahlen'; werte: { label: string; wert: string }[] }
  | { art: 'schritte'; titel: string; punkte: string[] }
  | { art: 'balken'; titel: string; werte: { label: string; anteil: number }[]; fuss: string }
  | { art: 'hinweis'; text: string; tone?: 'work' | 'dim' | 'risk' };

export interface Artikel {
  slug: string;
  icon: 'Muenze' | 'Blitz' | 'Tabelle' | 'Schloss' | 'Wuerfel' | 'Pfeil';
  farbe: 'work' | 'proof' | 'amber' | 'ink';
  titel: string;
  teaser: string;
  lesezeit: string;
  einleitung: string;
  bausteine: Baustein[];
}

const ysr = (v: bigint) => (Number(v) / 10 ** DECIMALS).toLocaleString('de-DE');
const REWARD = Number(INITIAL_REWARD / UNIT);
const EPOCHE_TAGE = Math.round(EPOCH_BLOCKS * Number(TARGET_BLOCK_TIME) / 86400);

export const ARTIKEL: Artikel[] = [
  {
    slug: 'was-ist-yskar', icon: 'Muenze', farbe: 'work',
    titel: 'Was ist YSKAR?',
    teaser: 'Eine eigene PoW-Kette. Kein Token auf einer fremden Chain.',
    lesezeit: '2 min',
    einleitung: 'YSKAR ist eine eigenständige Proof-of-Work-Kryptowährung mit ' +
      'eigener Kette, eigenem Konsens und eigenem Miner. Es gibt keinen Smart ' +
      'Contract auf einer anderen Blockchain, der „YSKAR" heißt — die Kette ' +
      'selbst ist das Produkt.',
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: 'Netz', wert: 'yskar-main-1' },
        { label: 'Genesis', wert: '09.09.2026' },
        { label: 'Hashfunktion', wert: 'SHA-256d' },
        { label: 'Blockzeit', wert: `≈ ${Number(TARGET_BLOCK_TIME) / 60} min` },
      ] },
      { art: 'absatz', text: 'Der Genesis-Block trägt eine Inschrift, und sie ist ' +
        'der Anspruch an alles Weitere: „proof, not promise". Kein Wert wird ' +
        'simuliert. Das Gerät rechnet echte Hashes, jeder Knoten rechnet jeden ' +
        'Share selbst nach, und der Kontostand ist allein aus den Blöcken ' +
        'wiederherstellbar.' },
      { art: 'absatz', text: 'Die Bedienung läuft über diese Telegram Mini App. Das ' +
        'Eigentum hängt aber an Schlüsseln, nicht an Telegram: Wer die zwölf ' +
        'Wörter hat, hat das Guthaben — mit oder ohne Telegram-Konto.' },
      { art: 'hinweis', tone: 'dim', text: 'YSKAR ist ein Projekt, kein Zahlungsmittel. ' +
        'Mehrere Full Nodes prüfen die Kette unabhängig voneinander; jeder Block ' +
        'ist im Explorer nachrechenbar.' },
    ],
  },
  {
    slug: 'mining-auf-dem-telefon', icon: 'Blitz', farbe: 'proof',
    titel: 'Mining auf dem Telefon',
    teaser: 'Shares, Difficulty, Blöcke — wie dein Gerät mitrechnet.',
    lesezeit: '3 min',
    einleitung: 'Dein Telefon rechnet SHA-256d-Hashes auf einen Job des Netzes. ' +
      'Das ist dasselbe Verfahren wie bei Bitcoin — nur die Difficulty ist so ' +
      'gewählt, dass ein Telefon eine reale Chance hat.',
    bausteine: [
      { art: 'schritte', titel: 'So entsteht ein Block', punkte: [
        'Der Knoten gibt einen Job aus: den Kopf des nächsten Blocks, 90 Sekunden gültig.',
        'Deine Worker probieren Nonces durch. Jede Berechnung ist ein echter Hash.',
        'Ein Hash unter dem Share-Ziel ist ein Share. Der Knoten rechnet ihn nach — ' +
          'ohne Arbeit gibt es keinen gültigen Share.',
        'Liegt der Hash sogar unter der Block-Difficulty, ist ein Block gefunden. ' +
          `Der Reward von ${REWARD} YSR geht an deine Adresse.`,
      ] },
      { art: 'absatz', text: 'Der Rechenanteil (25–100 %) steuert, wie stark dein ' +
        'Gerät ausgelastet wird. Die Worker-Zahl richtet sich nach den Kernen — ' +
        'die Kalibrierung ermittelt die beste Einstellung für dein Telefon.' },
      { art: 'absatz', text: 'Das Display bleibt an, solange gemint wird. Sperrt es, ' +
        'hält die Plattform den Worker an — Hintergrund-Mining lässt kein ' +
        'Telefon zu, und wir tun nicht so, als ginge es.' },
      { art: 'hinweis', tone: 'work', text: 'Solo und Pool sind gleichberechtigt. Der erste ' +
        'Pool ist aktiv: Der Block selbst zahlt alle Beteiligten aus — der ' +
        'Betreiber hält nie fremdes Geld.' },
    ],
  },
  {
    slug: 'tokenomics', icon: 'Tabelle', farbe: 'amber',
    titel: 'Tokenomics',
    teaser: `${ysr(MAX_SUPPLY)} YSR, ${REWARD} je Block, Halving alle ${EPOCH_BLOCKS.toLocaleString('de-DE')} Blöcke.`,
    lesezeit: '3 min',
    einleitung: 'Es gibt keinen Vorverkauf, keine Team-Zuteilung und keinen ' +
      'Airdrop. Jeder YSR entsteht als Blockreward — bei dem, der den Block ' +
      'gefunden hat.',
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: 'Max. Menge', wert: `${ysr(MAX_SUPPLY)} YSR` },
        { label: 'Reward heute', wert: `${REWARD} YSR` },
        { label: 'Halving', wert: `alle ${EPOCH_BLOCKS.toLocaleString('de-DE')} Blöcke` },
        { label: 'Blockzeit', wert: `≈ ${Number(TARGET_BLOCK_TIME) / 60} Minuten` },
      ] },
      { art: 'balken', titel: 'Emission über die Zeit', werte: [
        { label: `Epoche 1 · ${REWARD}`, anteil: 1 },
        { label: `Epoche 2 · ${REWARD / 2}`, anteil: .5 },
        { label: `Epoche 3 · ${REWARD / 4}`, anteil: .25 },
        { label: '', anteil: .125 }, { label: '', anteil: .0625 }, { label: '', anteil: .031 },
      ], fuss: `Eine Epoche sind ${EPOCH_BLOCKS.toLocaleString('de-DE')} Blöcke, also rund ` +
        `${EPOCHE_TAGE} Tage. Danach halbiert sich der Reward — wie bei Bitcoin, nur schneller.` },
      { art: 'absatz', text: `Eine Season sind ${SEASON_BLOCKS.toLocaleString('de-DE')} Blöcke, ` +
        'zwei Seasons eine Epoche. Der Reward wird durch reine Bitverschiebung ' +
        'halbiert, ohne Runden — die Gesamtmenge landet dadurch knapp unter ' +
        `${ysr(MAX_SUPPLY)}, genau wie bei Bitcoin.` },
      { art: 'kennzahlen', werte: [
        { label: 'Mindestgebühr', wert: `${ysr(MIN_FEE)} YSR` },
        { label: 'Plätze je Block', wert: MAX_TXS_PER_BLOCK.toLocaleString('de-DE') },
      ] },
      { art: 'hinweis', tone: 'work', text: 'Die Zahlen auf dieser Seite kommen direkt aus ' +
        'den Konsensparametern der Kette — nicht aus einem Whitepaper.' },
    ],
  },
  {
    slug: 'wallet-und-sicherheit', icon: 'Schloss', farbe: 'ink',
    titel: 'Wallet & Sicherheit',
    teaser: 'Zwölf Wörter, PIN, Signatur auf dem Gerät.',
    lesezeit: '2 min',
    einleitung: 'Deine Wallet sind zwölf Wörter. Wer sie hat, hat dein Guthaben — ' +
      'und wer sie verliert, verliert es. Niemand kann sie zurücksetzen: nicht ' +
      'wir, nicht Telegram, niemand.',
    bausteine: [
      { art: 'schritte', titel: 'Was auf dem Gerät passiert', punkte: [
        'Die Wörter werden mit deiner PIN verschlüsselt im Telefon abgelegt.',
        'Eine Zahlung wird vollständig auf dem Gerät gebaut und signiert.',
        'Der Server sieht nur fertige Bytes — Betrag oder Empfänger kann er nicht ' +
          'ändern, ohne die Signatur zu brechen.',
      ] },
      { art: 'absatz', text: 'Die PIN schützt davor, dass jemand dein entsperrtes ' +
        'Telefon in die Hand nimmt. Gegen einen entschlossenen Angreifer mit ' +
        'Zugriff auf das Gerät hilft nur, keine großen Beträge darauf zu lassen.' },
      { art: 'absatz', text: 'Der QR-Code unter „Empfangen" wird auf dem Gerät erzeugt. ' +
        'Beim Senden kannst du den Code eines anderen Nutzers mit der Kamera ' +
        'scannen — die Adresse wird geprüft, bevor sie übernommen wird.' },
      { art: 'hinweis', tone: 'risk', text: 'Eine gesendete Zahlung lässt sich nicht ' +
        'zurückholen. Prüfe die Adresse vollständig, nicht nur Anfang und Ende.' },
    ],
  },
  {
    slug: 'full-node-und-pool', icon: 'Wuerfel', farbe: 'work',
    titel: 'Full Node & Pool',
    teaser: 'Mehrere Knoten, erster Pool aktiv — so hängt das Netz zusammen.',
    lesezeit: '3 min',
    einleitung: 'Ein Full Node holt die Kette, prüft jeden Block selbst und baut ' +
      'eigene Blöcke. Es laufen bereits mehrere Knoten gleichzeitig, die sich ' +
      'per P2P abgleichen — die Kette hängt nicht mehr an einem einzelnen Server.',
    bausteine: [
      { art: 'schritte', titel: 'Was ein Knoten tut', punkte: [
        'Header zuerst: Er holt die Kette von anderen Knoten und prüft Kette und ' +
          'Arbeit lokal, bevor er einen Block übernimmt.',
        'Er nimmt Transaktionen in seinen Mempool und gibt Jobs an Miner aus.',
        'Findet ein Miner einen Block, reicht der Knoten ihn ein und verteilt ihn ' +
          'an seine Peers.',
        'Alles mit Grenzen: Nachrichtengrößen, Fristen und Plätze je Peer sind fest — ' +
          'ein einzelner Peer kann einen Knoten nicht überlasten.',
      ] },
      { art: 'absatz', text: 'Der Knoten läuft auf jedem Rechner mit Node 22; seine ' +
        'Ablage ist eine SQLite-Datei. Wer möchte, betreibt einen eigenen und prüft ' +
        'damit die Kette, ohne jemandem vertrauen zu müssen.' },
      { art: 'schritte', titel: 'Pool-Mining, wie es läuft', punkte: [
        'Der Pool hält nie fremdes Geld. Die Aufteilung wird zur Coinbase des Blocks ' +
          '(Konsensfassung 2: Coinbase mit mehreren Empfängern).',
        'PPLNS: Bezahlt werden die letzten N Arbeitseinheiten — über Blockfunde hinweg. ' +
          'Pool-Hopping lohnt sich nicht.',
        'Die Aufteilung steht für jeden nachrechenbar im Block.',
      ] },
      { art: 'hinweis', tone: 'work', text: 'Der erste Pool ist aktiv. Im Reiter „Mining" ' +
        'wählst du „Pool" und trägst seine Adresse ein — der Pool meldet Leistung, ' +
        'Minerzahl und Gebühr, bevor du startest.' },
    ],
  },
  {
    slug: 'roadmap', icon: 'Pfeil', farbe: 'proof',
    titel: 'Roadmap',
    teaser: 'Mikrozahlungen, Node Core für alle Systeme, Apps mit Lightning-Wallet.',
    lesezeit: '2 min',
    einleitung: 'Kein Datum, das nicht hält. Stattdessen Zustände, die jeder im ' +
      'Explorer und im Quelltext nachsehen kann.',
    bausteine: [
      { art: 'schritte', titel: 'Erreicht', punkte: [
        'Kette, Wallet, Transaktionen im Block, Miner auf dem Telefon.',
        'Gebührenmarkt: Empfehlung aus der tatsächlichen Warteschlange.',
        'Konsensfassung 2: Coinbase mit mehreren Empfängern.',
        'Pool-Mining mit PPLNS-Auszahlung direkt aus dem Block — der erste Pool ist aktiv.',
        'P2P zwischen Full Nodes; mehrere Knoten laufen gleichzeitig.',
        'Die Kette lebt auf den Full Nodes; der Server ist nur noch Spiegel für die App.',
      ] },
      { art: 'schritte', titel: 'Als Nächstes', punkte: [
        'Mikrozahlungen: kleine Beträge schnell und günstig übertragen.',
        'YSKAR Node Core: Veröffentlichung mit integrierter Wallet und Mining-Funktion ' +
          'für alle Systeme.',
        'Android- und iOS-App inklusive Lightning-Wallet.',
      ] },
      { art: 'hinweis', tone: 'work', text: 'Der Quelltext ist offen. Jeder Schritt hier ' +
        'entspricht einem Dokument im Repository.' },
    ],
  },
];

export const FAQ: { frage: string; antwort: string }[] = [
  { frage: 'Ist YSKAR ein Airdrop oder Tap-to-Earn?',
    antwort: 'Nein. Es gibt nichts zu tippen und nichts wird verteilt. YSR ' +
      'entstehen ausschließlich als Blockreward für echte Rechenarbeit, die der ' +
      'Knoten nachgerechnet hat.' },
  { frage: 'Wie viel verdiene ich mit meinem Telefon?',
    antwort: 'Das hängt von deiner Hashrate im Verhältnis zum ganzen Netz ab. ' +
      `Alle ${Number(TARGET_BLOCK_TIME) / 60} Minuten findet im Mittel ein Gerät im ` +
      `Netz einen Block mit ${REWARD} YSR. Der Reiter „Netz" zeigt die ` +
      'Netz-Hashrate — dein Anteil daran ist deine erwartete Chance je Block.' },
  { frage: 'Was passiert, wenn ich meine zwölf Wörter verliere?',
    antwort: 'Das Guthaben ist verloren. Es gibt kein „Passwort vergessen": ' +
      'Weder wir noch Telegram können die Wörter wiederherstellen. Schreib sie ' +
      'auf Papier — nicht als Screenshot.' },
  { frage: 'Wer betreibt die Kette?',
    antwort: 'Niemand allein. Mehrere Full Nodes laufen gleichzeitig, gleichen ' +
      'sich per P2P ab und rechnen jeden Block selbst nach. Die App liest über ' +
      'einen Spiegel mit — wer will, betreibt einen eigenen Knoten und braucht ' +
      'auch den nicht.' },
];

export const NEUIGKEITEN = [
  {
    datum: '29.09.2026',
    titel: 'Neues Design und QR-Scan',
    text: 'Die App zeigt jetzt, was YSKAR ist — und Adressen lassen sich beim ' +
      'Senden per Kamera scannen.',
  },
  {
    datum: '09.09.2026',
    titel: 'Die Kette ist gestartet',
    text: 'Genesis-Block gemint, Inschrift „proof, not promise". Mining ist ' +
      'für alle offen.',
  },
];
