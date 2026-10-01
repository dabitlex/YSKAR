/**
 * "Discover" content -- Polish.
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

export default function inhaltePl(z: (n: number) => string): Inhalte {
const ysr = (v: bigint) => z(Number(v) / 10 ** DECIMALS);
const REWARD = Number(INITIAL_REWARD / UNIT);
const EPOCHE_TAGE = Math.round(EPOCH_BLOCKS * Number(TARGET_BLOCK_TIME) / 86400);

const ARTIKEL: Artikel[] = [
  {
    slug: 'was-ist-yskar', icon: 'Muenze', farbe: 'work',
    titel: 'Czym jest YSKAR?',
    teaser: 'Własny łańcuch PoW. Nie token na cudzym blockchainie.',
    lesezeit: '2 min',
    einleitung: 'YSKAR to niezależna kryptowaluta typu Proof of Work z własnym ' +
      'łańcuchem, własnym konsensusem i własnym minerem. Nie ma żadnego smart contractu ' +
      'o nazwie „YSKAR” na innym blockchainie — produktem jest sam łańcuch.',
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: 'Sieć', wert: 'yskar-main-1' },
        { label: 'Genesis', wert: '2026-09-09' },
        { label: 'Funkcja skrótu', wert: 'SHA-256d' },
        { label: 'Czas bloku', wert: `≈ ${Number(TARGET_BLOCK_TIME) / 60} min` },
      ] },
      { art: 'absatz', text: 'Blok genesis zawiera inskrypcję, która wyznacza ' +
        'standard dla wszystkiego, co nastąpi: „proof, not promise”. Żadna wartość nie jest ' +
        'symulowana. Twoje urządzenie liczy prawdziwe hashe, każdy węzeł sam ponownie ' +
        'weryfikuje każdy share, a Twoje saldo da się odtworzyć wyłącznie z bloków.' },
      { art: 'absatz', text: 'Korzystasz z niego przez Mini App w Telegramie albo aplikację ' +
        'na Androida „YSKAR Wallet”. Własność jest jednak powiązana z kluczami, a nie z Telegramem: ' +
        'kto ma dwanaście słów, ma saldo — z kontem w Telegramie lub bez.' },
      { art: 'hinweis', tone: 'dim', text: 'YSKAR to projekt, a nie środek płatniczy. ' +
        'Kilka pełnych węzłów weryfikuje łańcuch niezależnie od siebie; każdy blok ' +
        'można sprawdzić w explorerze.' },
    ],
  },
  {
    slug: 'mining-auf-dem-telefon', icon: 'Blitz', farbe: 'proof',
    titel: 'Mining na telefonie',
    teaser: 'Share’y, trudność, bloki — jak Twoje urządzenie bierze udział.',
    lesezeit: '3 min',
    einleitung: 'Twój telefon liczy hashe SHA-256d dla zadania otrzymanego z sieci. ' +
      'To ta sama procedura co w Bitcoinie — tylko trudność jest dobrana tak, ' +
      'żeby telefon miał realną szansę.',
    bausteine: [
      { art: 'schritte', titel: 'Jak powstaje blok', punkte: [
        'Węzeł rozdaje zadanie: nagłówek następnego bloku, ważny przez 90 sekund.',
        'Twoje workery próbują kolejnych nonce’ów. Każde obliczenie to prawdziwy hash.',
        'Hash poniżej celu share to share. Węzeł przelicza go ponownie — ' +
          'bez pracy nie ma ważnego share’a.',
        'Jeśli hash jest nawet poniżej trudności bloku, blok zostaje znaleziony. ' +
          `Nagroda ${REWARD} YSR trafia na Twój adres.`,
      ] },
      { art: 'absatz', text: 'Obciążenie (25–100 %) określa, jak mocno pracuje Twoje ' +
        'urządzenie. Liczba workerów zależy od rdzeni — kalibracja znajduje ' +
        'najlepsze ustawienie dla Twojego telefonu.' },
      { art: 'absatz', text: 'W Telegramie ekran podczas miningu pozostaje włączony — gdy się ' +
        'zablokuje, platforma wstrzymuje workery. Aplikacja na Androida liczy dalej przy ' +
        'zablokowanym ekranie, co widać w powiadomieniu z hashrate.' },
      { art: 'hinweis', tone: 'work', text: 'Solo i pool są równorzędne. Pierwszy pool ' +
        'działa: sam blok wypłaca wszystkim uczestnikom — operator nigdy nie ' +
        'trzyma cudzych pieniędzy.' },
    ],
  },
  {
    slug: 'tokenomics', icon: 'Tabelle', farbe: 'amber',
    titel: 'Tokenomia',
    teaser: `${ysr(MAX_SUPPLY)} YSR, ${REWARD} na blok, halving co ${z(EPOCH_BLOCKS)} bloków.`,
    lesezeit: '3 min',
    einleitung: 'Nie ma przedsprzedaży, puli dla zespołu ani airdropu. Każdy YSR ' +
      'powstaje jako nagroda za blok — dla tego, kto go znalazł.',
    bausteine: [
      { art: 'kennzahlen', werte: [
        { label: 'Maks. podaż', wert: `${ysr(MAX_SUPPLY)} YSR` },
        { label: 'Nagroda dziś', wert: `${REWARD} YSR` },
        { label: 'Halving', wert: `co ${z(EPOCH_BLOCKS)} bloków` },
        { label: 'Czas bloku', wert: `≈ ${Number(TARGET_BLOCK_TIME) / 60} minut` },
      ] },
      { art: 'balken', titel: 'Emisja w czasie', werte: [
        { label: `Epoka 1 · ${REWARD}`, anteil: 1 },
        { label: `Epoka 2 · ${REWARD / 2}`, anteil: .5 },
        { label: `Epoka 3 · ${REWARD / 4}`, anteil: .25 },
        { label: '', anteil: .125 }, { label: '', anteil: .0625 }, { label: '', anteil: .031 },
      ], fuss: `Epoka to ${z(EPOCH_BLOCKS)} bloków, czyli około ${EPOCHE_TAGE} dni. ` +
        'Potem nagroda spada o połowę — jak w Bitcoinie, tylko szybciej.' },
      { art: 'absatz', text: `Sezon to ${z(SEASON_BLOCKS)} bloków, dwa sezony tworzą ` +
        'epokę. Nagroda jest dzielona na pół zwykłym przesunięciem bitowym, bez zaokrąglania — ' +
        `dlatego całkowita podaż kończy się tuż poniżej ${ysr(MAX_SUPPLY)}, dokładnie jak w Bitcoinie.` },
      { art: 'kennzahlen', werte: [
        { label: 'Opłata minimalna', wert: `${ysr(MIN_FEE)} YSR` },
        { label: 'Miejsc w bloku', wert: z(MAX_TXS_PER_BLOCK) },
      ] },
      { art: 'hinweis', tone: 'work', text: 'Liczby na tej stronie pochodzą wprost z ' +
        'parametrów konsensusu łańcucha — nie z whitepapera.' },
    ],
  },
  {
    slug: 'wallet-und-sicherheit', icon: 'Schloss', farbe: 'ink',
    titel: 'Portfel i bezpieczeństwo',
    teaser: 'Dwanaście słów, PIN, podpisy na urządzeniu.',
    lesezeit: '2 min',
    einleitung: 'Twój portfel to dwanaście słów. Kto je ma, ma Twoje saldo — ' +
      'a kto je zgubi, traci je. Nikt nie może ich zresetować: ani my, ani ' +
      'Telegram, nikt.',
    bausteine: [
      { art: 'schritte', titel: 'Co dzieje się na urządzeniu', punkte: [
        'Słowa są przechowywane na telefonie, zaszyfrowane Twoim PIN-em.',
        'Płatność jest w całości tworzona i podpisywana na urządzeniu.',
        'Serwer widzi tylko gotowe bajty — nie może zmienić kwoty ani ' +
          'odbiorcy bez złamania podpisu.',
      ] },
      { art: 'absatz', text: 'PIN chroni przed kimś, kto weźmie do ręki Twój odblokowany ' +
        'telefon. Przed zdeterminowanym atakującym z dostępem do urządzenia chroni ' +
        'tylko jedno: nie trzymać na nim dużych kwot.' },
      { art: 'absatz', text: 'Kod QR w „Odbierz” jest generowany na urządzeniu. ' +
        'Przy wysyłaniu możesz zeskanować aparatem kod innego użytkownika — ' +
        'adres jest sprawdzany, zanim zostanie użyty.' },
      { art: 'hinweis', tone: 'risk', text: 'Wysłanej płatności nie da się cofnąć. ' +
        'Sprawdź adres w całości, nie tylko początek i koniec.' },
    ],
  },
  {
    slug: 'full-node-und-pool', icon: 'Wuerfel', farbe: 'work',
    titel: 'Full node i pool',
    teaser: 'Kilka węzłów, pierwszy pool działa — jak sieć jest zbudowana.',
    lesezeit: '3 min',
    einleitung: 'Pełny węzeł (full node) pobiera łańcuch, sam weryfikuje każdy blok i tworzy ' +
      'własne bloki. Już teraz działa jednocześnie kilka węzłów, które synchronizują się przez ' +
      'P2P — łańcuch nie zależy już od jednego serwera.',
    bausteine: [
      { art: 'schritte', titel: 'Co robi węzeł', punkte: [
        'Najpierw nagłówki: pobiera łańcuch od innych węzłów i lokalnie weryfikuje łańcuch i ' +
          'pracę, zanim przyjmie blok.',
        'Przyjmuje transakcje do swojego mempoola i rozdaje zadania minerom.',
        'Gdy miner znajdzie blok, węzeł go zgłasza i przekazuje dalej swoim peerom.',
        'Wszystko ma limity: rozmiary wiadomości, terminy i sloty na peera są stałe — ' +
          'pojedynczy peer nie przeciąży węzła.',
      ] },
      { art: 'absatz', text: 'Węzeł działa na każdej maszynie z Node 22; jego pamięć ' +
        'to jeden plik SQLite. Każdy może uruchomić własny i weryfikować łańcuch, ' +
        'nie musząc nikomu ufać.' },
      { art: 'schritte', titel: 'Jak działa mining w poolu', punkte: [
        'Pool nigdy nie trzyma cudzych pieniędzy. Podział staje się coinbase ' +
          'bloku (wersja konsensusu 2: coinbase z wieloma odbiorcami).',
        'PPLNS: wypłacane jest ostatnie N jednostek pracy — niezależnie od znalezionych bloków. ' +
          'Pool hopping się nie opłaca.',
        'Podział jest zapisany w bloku i każdy może go sprawdzić.',
      ] },
      { art: 'hinweis', tone: 'work', text: 'Pierwszy pool działa. W zakładce „Mining” ' +
        'wybierz „Pool” i wpisz jego adres — przed startem pool pokaże moc obliczeniową, ' +
        'liczbę minerów i opłatę.' },
    ],
  },
  {
    slug: 'roadmap', icon: 'Pfeil', farbe: 'proof',
    titel: 'Roadmapa',
    teaser: 'Mikropłatności, Node Core na każdy system, aplikacje z portfelem Lightning.',
    lesezeit: '2 min',
    einleitung: 'Żadnych dat, których nie da się dotrzymać. Zamiast tego stany, które każdy może sprawdzić ' +
      'w explorerze i w kodzie źródłowym.',
    bausteine: [
      { art: 'schritte', titel: 'Gotowe', punkte: [
        'Łańcuch, portfel, transakcje w bloku, miner na telefonie.',
        'Rynek opłat: rekomendacja na podstawie rzeczywistej kolejki.',
        'Wersja konsensusu 2: coinbase z wieloma odbiorcami.',
        'Mining w poolu z wypłatą PPLNS prosto z bloku — pierwszy pool działa.',
        'P2P między pełnymi węzłami; kilka węzłów działa jednocześnie.',
        'Łańcuch żyje na pełnych węzłach; serwer jest tylko lustrem dla aplikacji.',
        'Aplikacja na Androida „YSKAR Wallet”: powiadomienia o wpłatach, biometria, mining ' +
          'w tle, informacja o aktualizacji w aplikacji — jako APK na GitHubie.',
      ] },
      { art: 'schritte', titel: 'Dalej', punkte: [
        'Mikropłatności: szybkie i tanie przesyłanie małych kwot.',
        'YSKAR Node Core: wydanie ze zintegrowanym portfelem i miningiem na każdy system.',
        'Aplikacja na iOS; portfel Lightning w obu aplikacjach.',
      ] },
      { art: 'hinweis', tone: 'work', text: 'Kod źródłowy jest otwarty. Każdy krok tutaj ' +
        'odpowiada dokumentowi w repozytorium.' },
    ],
  },
];

const FAQ: Frage[] = [
  { frage: 'Czy YSKAR to airdrop albo tap-to-earn?',
    antwort: 'Nie. Nie ma tu nic do stukania i nic nie jest rozdawane. YSR ' +
      'powstają wyłącznie jako nagrody za bloki — za prawdziwą pracę obliczeniową, ' +
      'którą węzeł ponownie zweryfikował.' },
  { frage: 'Ile zarobię na swoim telefonie?',
    antwort: 'To zależy od Twojego hashrate w stosunku do całej sieci. ' +
      `Średnio co ${Number(TARGET_BLOCK_TIME) / 60} minut jakieś urządzenie w ` +
      `sieci znajduje blok wart ${REWARD} YSR. Zakładka „Sieć” pokazuje ` +
      'hashrate sieci — Twój udział w nim to Twoja oczekiwana szansa na blok.' },
  { frage: 'Co się stanie, jeśli zgubię dwanaście słów?',
    antwort: 'Saldo przepada. Nie ma opcji „Nie pamiętam hasła”: ani my, ani ' +
      'Telegram nie możemy odtworzyć słów. Zapisz je na papierze — nie jako zrzut ekranu.' },
  { frage: 'Kto prowadzi łańcuch?',
    antwort: 'Nikt w pojedynkę. Kilka pełnych węzłów działa jednocześnie, synchronizuje się przez P2P ' +
      'i samodzielnie weryfikuje każdy blok. Aplikacja czyta dane przez lustro — ' +
      'każdy może uruchomić własny węzeł i wtedy nawet tego nie potrzebuje.' },
];

const NEUIGKEITEN: Neuigkeit[] = [
  {
    datum: '2026-09-30',
    titel: 'Aplikacja na Androida „YSKAR Wallet”',
    text: 'Powiadomienia push o wpłatach, odblokowanie i wysyłanie odciskiem palca, ' +
      'mining przy zablokowanym ekranie. Jako APK na GitHubie — a aplikacja mówi teraz w kilku językach.',
    link: 'https://github.com/dabitlex/YSKAR/releases',
  },
  {
    datum: '2026-09-29',
    titel: 'Nowy wygląd i skanowanie QR',
    text: 'Aplikacja pokazuje teraz, czym jest YSKAR — a przy wysyłaniu adresy można ' +
      'skanować aparatem.',
  },
  {
    datum: '2026-09-09',
    titel: 'Łańcuch wystartował',
    text: 'Wykopano blok genesis z inskrypcją „proof, not promise”. Mining jest ' +
      'otwarty dla wszystkich.',
  },
];

return { ARTIKEL, FAQ, NEUIGKEITEN };
}
