/**
 * Inhalte des Bereichs „Entdecken" -- Deutsch.
 *
 * Reine Daten, kein React. Zahlen kommen aus src/lib/core/params.ts, damit
 * ein Artikel nie etwas anderes behauptet als die Kette selbst. Die
 * Formatierung der Zahlen kommt von aussen (Sprache).
 */

import {
  INITIAL_REWARD, UNIT, MAX_SUPPLY, EPOCH_BLOCKS, SEASON_BLOCKS,
  TARGET_BLOCK_TIME, MIN_FEE, MAX_TXS_PER_BLOCK, DECIMALS,
} from '@/lib/core/params';
import { MAX_COINBASE_OUTPUTS } from '@/lib/core/params';
import { MAX_FEE_BPS } from '@/lib/pool/settlement';
import type { Inhalte, Artikel, Frage, Neuigkeit } from './entdecken';

export default function inhalteDe(z: (n: number) => string): Inhalte {
const ysr = (v: bigint) => z(Number(v) / 10 ** DECIMALS);
const REWARD = Number(INITIAL_REWARD / UNIT);
const EPOCHE_TAGE = Math.round(EPOCH_BLOCKS * Number(TARGET_BLOCK_TIME) / 86400);

const ARTIKEL: Artikel[] = [
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
      { art: 'absatz', text: 'Die Bedienung läuft über die Telegram Mini App oder die ' +
        'Android-App „YSKAR Wallet". Das Eigentum hängt aber an Schlüsseln, nicht an ' +
        'Telegram: Wer die zwölf Wörter hat, hat das Guthaben — mit oder ohne Telegram-Konto.' },
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
      { art: 'absatz', text: 'In Telegram bleibt das Display an, solange gemint wird — ' +
        'sperrt es, hält die Plattform den Worker an. Die Android-App rechnet auch bei ' +
        'gesperrtem Bildschirm weiter, sichtbar an der Benachrichtigung mit der Hashrate.' },
      { art: 'hinweis', tone: 'work', text: 'Neue Nutzer minen im Pool; Solo bleibt unter ' +
        '„Mining → Erweitert" wählbar. Im Pool zahlt der Block selbst alle Beteiligten aus — der ' +
        'Betreiber hält nie fremdes Geld.' },
    ],
  },
  {
    slug: 'pool-oder-solo', icon: 'Wuerfel', farbe: 'work',
    titel: 'Pool oder Solo?',
    teaser: 'Kleine, regelmäßige Anteile oder alles oder nichts.',
    lesezeit: '2 min',
    einleitung: `Alle ${Number(TARGET_BLOCK_TIME) / 60} Minuten findet im Mittel ein Miner im ` +
      `Netz einen Block mit ${REWARD} YSR. Die Frage ist, wie du für deinen Teil bezahlt werden willst.`,
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: 'Pool', wert: 'kleine Anteile, regelmäßig' },
        { label: 'Solo', wert: 'ganzer Block, selten' },
      ] },
      { art: 'absatz', text: 'Im Pool minen viele Geräte gemeinsam. Findet der Pool einen Block, ' +
        'teilt der Block selbst die Belohnung nach der Arbeit der letzten Zeit auf (PPLNS). Dein ' +
        'Anteil hängt davon ab, wie viel deine Hashrate zur Leistung des Pools beiträgt.' },
      { art: 'absatz', text: 'Solo bekommst du den ganzen Block — aber nur, wenn dein Gerät ihn ' +
        'selbst findet. Ein Telefon allein hat gegen das ganze Netz eine sehr kleine Chance je ' +
        'Block; es kann lange dauern, bis es einmal klappt.' },
      { art: 'schritte', titel: 'Was du über Pools wissen solltest', punkte: [
        `Der Betreiber legt eine Gebühr zwischen 0 und ${MAX_FEE_BPS / 100} % fest; die App zeigt sie vor dem Start.`,
        `Ein Pool kann je Block nur begrenzt viele Miner bezahlen (zurzeit ${MAX_COINBASE_OUTPUTS - 1}). ` +
          'Ist er voll, wählst du einen anderen.',
        'Jede Auszahlung steht öffentlich im Block und im Explorer.',
      ] },
      { art: 'hinweis', tone: 'work', text: 'Neue Nutzer minen im Pool. Solo stellst du unter ' +
        '„Mining → Erweitert" um.' },
    ],
  },
  {
    slug: 'tokenomics', icon: 'Tabelle', farbe: 'amber',
    titel: 'Tokenomics',
    teaser: `${ysr(MAX_SUPPLY)} YSR, ${REWARD} je Block, Halving alle ${z(EPOCH_BLOCKS)} Blöcke.`,
    lesezeit: '3 min',
    einleitung: 'Es gibt keinen Vorverkauf, keine Team-Zuteilung und keinen ' +
      'Airdrop. Jeder YSR entsteht als Blockreward — bei dem, der den Block ' +
      'gefunden hat.',
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: 'Max. Menge', wert: `${ysr(MAX_SUPPLY)} YSR` },
        { label: 'Reward heute', wert: `${REWARD} YSR` },
        { label: 'Halving', wert: `alle ${z(EPOCH_BLOCKS)} Blöcke` },
        { label: 'Blockzeit', wert: `≈ ${Number(TARGET_BLOCK_TIME) / 60} Minuten` },
      ] },
      { art: 'balken', titel: 'Emission über die Zeit', werte: [
        { label: `Epoche 1 · ${REWARD}`, anteil: 1 },
        { label: `Epoche 2 · ${REWARD / 2}`, anteil: .5 },
        { label: `Epoche 3 · ${REWARD / 4}`, anteil: .25 },
        { label: '', anteil: .125 }, { label: '', anteil: .0625 }, { label: '', anteil: .031 },
      ], fuss: `Eine Epoche sind ${z(EPOCH_BLOCKS)} Blöcke, also rund ` +
        `${EPOCHE_TAGE} Tage. Danach halbiert sich der Reward — wie bei Bitcoin, nur schneller.` },
      { art: 'absatz', text: `Eine Season sind ${z(SEASON_BLOCKS)} Blöcke, ` +
        'zwei Seasons eine Epoche. Der Reward wird durch reine Bitverschiebung ' +
        'halbiert, ohne Runden — die Gesamtmenge landet dadurch knapp unter ' +
        `${ysr(MAX_SUPPLY)}, genau wie bei Bitcoin.` },
      { art: 'kennzahlen', werte: [
        { label: 'Mindestgebühr', wert: `${ysr(MIN_FEE)} YSR` },
        { label: 'Plätze je Block', wert: z(MAX_TXS_PER_BLOCK) },
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
      { art: 'hinweis', tone: 'work', text: 'Im Reiter „Mining" wählt die App den Pool mit ' +
        'den meisten freien Plätzen; unter „Wechseln" suchst du dir selbst einen aus. Der Pool ' +
        'meldet Leistung, Minerzahl und Gebühr, bevor du startest.' },
    ],
  },
  {
    slug: 'roadmap', icon: 'Pfeil', farbe: 'proof',
    titel: 'Roadmap',
    teaser: 'Erst stabilisieren, dann wachsen, dann neue Funktionen.',
    lesezeit: '2 min',
    einleitung: 'Kein Datum, das nicht hält. Stattdessen Zustände, die jeder im ' +
      'Explorer und im Quelltext nachsehen kann.',
    bausteine: [
      { art: 'schritte', titel: 'Erreicht', punkte: [
        'Kette, Wallet, Transaktionen im Block, Miner auf dem Telefon.',
        'Gebühr je Byte und Gebührenmarkt aus der tatsächlichen Warteschlange.',
        'Pool-Mining mit PPLNS-Auszahlung direkt aus dem Block; Pool-Auswahl in den Apps.',
        'P2P zwischen Full Nodes; mehrere unabhängige Knoten laufen gleichzeitig.',
        'Android-App mit Mining im Hintergrund — als APK über GitHub.',
        'YSKAR Node Core 0.7.1 für Windows und Linux.',
      ] },
      { art: 'schritte', titel: 'Jetzt', punkte: [
        'Das Netz stabilisieren und kleine Fehler beheben.',
      ] },
      { art: 'schritte', titel: 'Geplant', punkte: [
        'Node Core: mehrere Grafikkarten gleichzeitig, danach GPU-Mining für AMD und Intel (OpenCL).',
        `Netz-Upgrade (Soft Fork) bei Block ${z(7000)}.`,
        'YSKAR Wallet im Google Play Store.',
      ] },
      { art: 'schritte', titel: 'Später', punkte: [
        'Stratum-Mining, sobald das Netz eine gewisse Größe hat.',
        'Direkte Zahlungskanäle zwischen Sender und Empfänger.',
      ] },
      { art: 'hinweis', tone: 'work', text: 'Der Quelltext ist offen. Jeder Schritt hier ' +
        'entspricht einem Dokument im Repository.' },
    ],
  },
];

const FAQ: Frage[] = [
  { frage: 'Ist YSKAR ein Airdrop oder Tap-to-Earn?',
    antwort: 'Nein. Es gibt nichts zu tippen und nichts wird verteilt. YSR ' +
      'entstehen ausschließlich als Blockreward für echte Rechenarbeit, die der ' +
      'Knoten nachgerechnet hat.' },
  { frage: 'Wie viel bekomme ich mit meinem Telefon?',
    antwort: 'Im Pool bekommst du bei jedem Block, den der Pool findet, einen Anteil nach ' +
      'deiner Arbeit: grob deine Hashrate geteilt durch die des Pools, mal ' +
      `${REWARD} YSR, abzüglich Gebühr. Der Reiter „Mining" rechnet diese Schätzung mit ` +
      'deinen echten Werten vor. Solo hängt alles daran, ob dein Gerät selbst einen Block findet.' },
  { frage: 'Hat YSR einen Preis?',
    antwort: 'Nein. YSR hat keinen Preis und wird an keiner Börse gehandelt. Niemand sollte ' +
      'in der Erwartung minen, dass sich das ändert.' },
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

const NEUIGKEITEN: Neuigkeit[] = [
  {
    datum: '2026-10-12',
    titel: 'Node Core 0.7.1 für Windows und Linux',
    text: 'Den Desktop-Knoten mit Wallet und Mining gibt es jetzt in getrennten Paketen ' +
      'für Windows und Linux.',
    link: 'https://github.com/dabitlex/YSKAR/releases',
  },
  {
    datum: '2026-09-30',
    titel: 'Android-App „YSKAR Wallet"',
    text: 'Push-Benachrichtigung bei Eingängen, Entsperren und Senden per Fingerabdruck, ' +
      'Mining bei gesperrtem Bildschirm. Als APK auf GitHub — und die App spricht jetzt mehrere Sprachen.',
    link: 'https://github.com/dabitlex/YSKAR/releases',
  },
  {
    datum: '2026-09-29',
    titel: 'Neues Design und QR-Scan',
    text: 'Die App zeigt jetzt, was YSKAR ist — und Adressen lassen sich beim ' +
      'Senden per Kamera scannen.',
  },
  {
    datum: '2026-09-09',
    titel: 'Die Kette ist gestartet',
    text: 'Genesis-Block gemint, Inschrift „proof, not promise". Mining ist ' +
      'für alle offen.',
  },
];

return { ARTIKEL, FAQ, NEUIGKEITEN };
}
