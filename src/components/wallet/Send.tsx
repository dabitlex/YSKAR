'use client';

import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useWallet } from '@/lib/wallet/useWallet';
import { isValidAddress, decodeAddress } from '@/lib/core/address';
import { buildTransfer, serializeTx, txid } from '@/lib/core/tx';
import { MIN_FEE, DUST_LIMIT, V6_HEIGHT, V6_HEIGHT_UNSET } from '@/lib/core/params';
import { auskunftHolen, sendeStand } from '@/lib/wallet/gebuehrAuskunft';
import { transferBytes, transferBytesAt } from '@/lib/core/tx';

/** Siehe useMining.ts -- leer heisst: derselbe Server wie die App. */
const MINING_BASIS = (process.env.NEXT_PUBLIC_MINING_BASE ?? '').trim()
  .replace(/\/+$/, '');

/** Antwort von /api/v2/fees -- siehe src/lib/core/feemarket.ts. */
interface Markt {
  minFee: string;
  /** Weiterleitungs-Satz je Byte ab Konsensfassung 3, sonst null. */
  mindestJeByte?: string | null;
  /** Fassung der Ueberweisung fuer den naechsten Block: 1, ab Konsensfassung 6 2. Aeltere Knoten nennen sie nicht. */
  fassung?: number;
  /** Groesse ohne Notiz an dieser Hoehe (168 oder 174 Byte). */
  basisBytes?: number;
  /** Die letzten Bloecke vor der Aktivierung von Fassung 6: jetzt nichts einreichen. */
  sendepause?: boolean;
  wartend: number;
  andrang: boolean;
  /** `fee` fuer eine Ueberweisung ohne Notiz, `jeByte` fuer jede andere Groesse (neuere Knoten). */
  stufen: Record<'langsam' | 'normal' | 'schnell', { fee: string; block: number; jeByte?: string }>;
  hinweis: string;
}
import { toHex } from '@/lib/core/codec';
import { Notice } from '@/components/ui/Primitives';
import Scanner from '@/components/wallet/Scanner';
import Ziffernfeld from '@/components/wallet/Ziffernfeld';
import KontaktBlatt from '@/components/wallet/KontaktBlatt';
import { AdresseVierer, KNOPF, Kappe, Pfeil, Punkt, Schritte, UMRISS, VERWEIS, WKopf, WertZeile, Zeichen } from '@/components/wallet/Teile';
import { biometrieAktiv, biometriePin } from '@/lib/native/biometrie';
import type { Account } from '@/hooks/useMining';
import { useT, fehlerText, type Woerterbuch } from '@/i18n';
import { betragGenau, betragText, dezimalZeichen, eingabeEinheiten, einheitenEingabe } from '@/lib/wallet/betrag';
import { kurzAdresse } from '@/lib/wallet/adresse';
import { NOTIZ_BYTES, notizBytes, notizKuerzen } from '@/lib/wallet/notiz';
import { tippen, eingabeAnzeige, type Taste } from '@/lib/wallet/ziffern';
import { zahlungAusText, type Zahlung } from '@/lib/wallet/qr';
import { tagSchluessel } from '@/lib/wallet/verlaufGruppen';
import { useKontakte } from '@/lib/wallet/kontakte';
import { eigeneLesen, eigeneMerken, naechsteEigeneNonce, type EigeneZahlung } from '@/lib/wallet/wartendeZahlungen';

/**
 * Senden -- vier Schritte, jeder mit einer Frage.
 *
 *   1  An wen?        Adresse, Kontakt oder QR-Code
 *   2  Wie viel?      Betrag ueber das eigene Ziffernfeld, Notiz, Gebuehr
 *   3  Stimmt alles?  volle Adresse in Vierergruppen, Hinweis bei einer
 *                     Adresse, an die noch nie gesendet wurde, dann PIN
 *                     oder Fingerabdruck
 *   4  Gesendet       Stand der Zahlung bis zur Bestaetigung
 *
 * Eine gesendete Zahlung laesst sich nicht zurueckholen. Ein Schritt weniger
 * waere bequemer und falsch. Die PIN wird erneut verlangt, weil der private
 * Schluessel zum Signieren gebraucht wird -- und weil ein zweites bewusstes
 * Ja an dieser Stelle angemessen ist.
 *
 * Die Transaktion wird VOLLSTAENDIG auf dem Geraet gebaut und signiert. Der
 * Server sieht nur fertige Bytes; er koennte Betrag oder Empfaenger gar
 * nicht aendern, ohne die Signatur zu brechen.
 */

type Schritt = 'empfaenger' | 'betrag' | 'pruefen' | 'fertig';

/** Nachkommastellen der Kette (1 YSR = 10^8 Einheiten). */
const STELLEN = 8;

/** Ein Eintrag des Verlaufs, soweit Senden ihn braucht. */
interface Ausgang {
  txid: string; kind: string; counterparty: string | null; amount: string; timestamp: string | null;
}

export default function Send({ account, decimals, symbol, scanSofort, onGesendet,
                               onFertig, onAbbruch, ersetzen, vorgabe }: {
  account: (Account & { history?: Ausgang[] }) | null; decimals: number; symbol: string;
  /** Aus der Wallet mit „Scannen" geoeffnet: Kamera zuerst, Formular danach. */
  scanSofort?: boolean;
  /** Der Knoten hat die Zahlung angenommen -- Konto neu lesen. */
  onGesendet?: () => void;
  onFertig: () => void; onAbbruch: () => void;
  /**
   * Gebuehr einer wartenden eigenen Zahlung erhoehen: dieselbe Zahlung
   * (Empfaenger, Betrag, Notiz, Nonce) mit hoeherer Gebuehr. Beginnt direkt
   * beim Pruefen; Empfaenger und Betrag stehen fest.
   */
  ersetzen?: EigeneZahlung | null;
  /** Vorbereitete Zahlung (z. B. Eigentumsnachweis fuer einen Gewinn): wie aus einem QR-Code. */
  vorgabe?: Zahlung | null;
}) {
  const wallet = useWallet();
  const { t, locale } = useT();
  const { kontakte, name } = useKontakte();
  const zeichen = useMemo(() => dezimalZeichen(locale), [locale]);
  const [schritt, setSchritt] = useState<Schritt>(ersetzen ? 'pruefen' : 'empfaenger');
  const [ziel, setZiel] = useState(ersetzen?.an ?? '');
  // Ob die Adresse gescannt wurde -- im Pruefschritt steht das dabei, damit
  // klar ist, woher sie kommt und dass man sie trotzdem ganz lesen sollte.
  const [gescannt, setGescannt] = useState(false);
  const [scanner, setScanner] = useState(!!scanSofort);
  const [betrag, setBetrag] = useState(() => ersetzen
    ? einheitenEingabe(BigInt(ersetzen.betrag), dezimalZeichen(locale), STELLEN, STELLEN) : '');
  // "Alles": Der Betrag folgt dem Guthaben und der Gebuehr, bis man tippt.
  const [alles, setAlles] = useState(false);
  // Betrag bzw. Notiz stammen aus einem QR-Code oder der Zwischenablage,
  // nicht vom Nutzer -- sie gehoeren zu DIESEM Empfaenger und gehen mit ihm.
  const [ausCode, setAusCode] = useState(false);
  const [notizAusCode, setNotizAusCode] = useState(false);
  const [notiz, setNotiz] = useState(ersetzen?.notiz ?? '');
  // Nach einer Ablehnung wegen Andrang: die Gebuehr, die der Knoten nannte.
  const [nachAblehnung, setNachAblehnung] = useState<bigint>(0n);
  const [pin, setPin] = useState('');
  // Biometrie (Android-App): Sensor statt PIN beim Signieren; PIN bleibt als Ausweg.
  const [bio, setBio] = useState(false);
  const [pinManuell, setPinManuell] = useState(false);
  useEffect(() => { setBio(biometrieAktiv()); }, []);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [einfuegeFehler, setEinfuegeFehler] = useState<string | null>(null);
  // Was tatsaechlich signiert wurde. Der Schritt "Gesendet" zeigt NUR das --
  // nicht, was nach dem Senden in den Feldern steht.
  const [ergebnis, setErgebnis] = useState<{ txid: string; um: number; betrag: bigint; an: string } | null>(null);
  const [kontaktBlatt, setKontaktBlatt] = useState<string | null>(null);
  const [kontakteBearbeiten, setKontakteBearbeiten] = useState(false);

  // Zahlung aus QR-Code oder Zwischenablage uebernehmen.
  const uebernehmen = useCallback((z: Zahlung, perScan: boolean) => {
    setZiel(z.adresse); setGescannt(perScan); setEinfuegeFehler(null);
    // Betrag und Notiz gelten fuer genau diesen Code. Nennt er keine,
    // bleibt auch nichts vom vorigen stehen.
    setBetrag(z.betrag ? einheitenEingabe(z.betrag, zeichen, STELLEN, STELLEN) : '');
    setAlles(false); setAusCode(!!z.betrag);
    setNotiz(z.notiz ? notizKuerzen(z.notiz) : ''); setNotizAusCode(!!z.notiz);
  }, [zeichen]);
  // Vorbereitete Zahlung: einmal uebernehmen, dann gleich zum Betrag.
  const vorgabeUebernommen = useRef(false);
  useEffect(() => {
    if (!vorgabe || vorgabeUebernommen.current) return;
    vorgabeUebernommen.current = true;
    uebernehmen(vorgabe, false);
    setSchritt('betrag');
  }, [vorgabe, uebernehmen]);
  // Anderer Empfaenger von Hand: Was aus einem Code kam, gehoert nicht zu ihm.
  const empfaengerWechsel = () => {
    setGescannt(false); setEinfuegeFehler(null);
    if (ausCode) { setBetrag(''); setAusCode(false); }
    if (notizAusCode) { setNotiz(''); setNotizAusCode(false); }
  };
  const scanErgebnis = useCallback((adr: string, z?: Zahlung) => {
    uebernehmen(z ?? { adresse: adr, betrag: null, notiz: null }, true);
    setScanner(false);
    // Die eigene Adresse bleibt im ersten Schritt stehen -- mit der Meldung dazu.
    if (adr !== wallet.address) setSchritt('betrag');
  }, [uebernehmen, wallet.address]);
  const scanAbbruch = useCallback(() => setScanner(false), []);
  const einfuegen = async () => {
    try {
      const z = zahlungAusText(await navigator.clipboard.readText(), STELLEN);
      if (!z) { setEinfuegeFehler(t.senden.einfuegenFehler); return; }
      uebernehmen(z, false);
    } catch { setEinfuegeFehler(t.scanner.zwischenablage); }
  };

  /*
    Gebührenwahl.

    Die Stufen kommen vom Knoten und sind GEMESSEN -- aus dem tatsächlichen
    Mempool und der Zahl freier Plätze je Block. Ohne Andrang sind alle drei
    gleich der Mindestgebühr, und die Anzeige sagt das auch, statt drei
    erfundene Preise anzubieten.
  */
  const [stufe, setStufe] = useState<'langsam' | 'normal' | 'schnell'>(ersetzen ? 'schnell' : 'normal');
  const [markt, setMarkt] = useState<Markt | null>(null);
  const [marktFehlt, setMarktFehlt] = useState(false);

  const [marktStand, setMarktStand] = useState(0);
  useEffect(() => {
    let lebt = true;
    let laeuft = false;
    let wieder: ReturnType<typeof setTimeout> | undefined;
    const holen = () => {
      // Nie zwei Abfragen zugleich -- sonst ueberholt eine aeltere Antwort
      // eine neuere, und nach einem Ausfall laufen Wiederholungen doppelt.
      if (laeuft) return;
      laeuft = true;
      if (wieder) { clearTimeout(wieder); wieder = undefined; }
      // Erst die Route der App, bei Fehler der Knoten selbst
      // (src/lib/wallet/gebuehrAuskunft.ts).
      void auskunftHolen<Markt>(MINING_BASIS).then(d => {
        laeuft = false;
        if (!lebt) return;
        if (d) { setMarkt(d); setMarktFehlt(false); return; }
        setMarktFehlt(true);
        // Ohne Hoehe bleibt es bei der Mindestgebuehr. Mit Hoehe gilt eine
        // alte Auskunft nicht mehr: Sie koennte die Sendepause verpassen.
        // Also sperren und nachfragen, bis eine Quelle antwortet.
        if (V6_HEIGHT !== V6_HEIGHT_UNSET) {
          setMarkt(null);
          wieder = setTimeout(holen, 15_000);
        }
      });
    };
    holen();
    // Bei Andrang aendert sich die Lage von Block zu Block: einmal je Minute nachfragen.
    const takt = setInterval(holen, 60_000);
    return () => { lebt = false; clearInterval(takt); if (wieder) clearTimeout(wieder); };
  }, [marktStand]);

  // Ohne Auskunft vom Knoten: alte Mindestgebühr -- die deckt jede Regel.
  // Mit Auskunft: Stufe des Marktes, aber nie unter dem Satz je Byte für
  // die tatsächliche Größe dieser Transaktion (die Notiz macht sie länger).
  // Empfaenger der Version 1 (ysr1p…) machen eine Ueberweisung der
  // Fassung 2 um 12 Byte groesser -- sonst reichte die Gebuehr nicht.
  const zielRoh = ziel.trim().toLowerCase();
  const empfaengerMehr = markt?.fassung === 2 && isValidAddress(zielRoh)
    ? transferBytesAt(1, 0, 0, decodeAddress(zielRoh).length) - transferBytesAt(1, 0, 0) : 0;
  const groesse = (markt?.basisBytes ?? transferBytes(0)) + notizBytes(notiz) + empfaengerMehr;
  const bodenJeByte = markt?.mindestJeByte
    ? BigInt(markt.mindestJeByte) * BigInt(groesse) : 0n;
  // Fassung 2 ab der Aktivierungshoehe von Konsensfassung 6, Fassung 1 davor
  // (CONSENSUS_V6.md 3). Der Knoten sagt, was der naechste Block verlangt.
  // Gesperrt wird nur in den drei Bloecken vor der Hoehe (der Knoten meldet
  // `sendepause`) -- oder wenn eine Hoehe gesetzt ist und weder die App noch
  // der Knoten antwortet: Dann ist die Fassung unbekannt, und eine falsch
  // gewaehlte lehnt jeder Knoten ab.
  const stand = sendeStand(markt, V6_HEIGHT);
  const fassung = stand.fassung;
  const wechselPause = stand.pause;
  const fassungUnbekannt = stand.unbekannt;
  // Die Meldung erst, wenn die Anfrage gescheitert ist -- nicht waehrend sie laeuft.
  const fassungMeldung = fassungUnbekannt && marktFehlt;
  // Die Stufe gilt je Byte: Mit Notiz ist dieselbe Stufe entsprechend teurer.
  const stufeJeByte = markt?.stufen[stufe].jeByte ? Number(markt.stufen[stufe].jeByte) : null;
  const stufenGebuehr = !markt ? MIN_FEE
    : stufeJeByte !== null ? BigInt(Math.ceil(stufeJeByte * groesse)) : BigInt(markt.stufen[stufe].fee);
  const hoechste = (...xs: bigint[]) => xs.reduce((m, x) => (x > m ? x : m), 0n);
  // Beim Erhoehen: mindestens alte Gebuehr plus Weiterleitungsgebuehr, sonst
  // nimmt kein Knoten die Ersetzung an -- und mindestens, was der Knoten
  // zuletzt als noetig genannt hat.
  // Endgueltig abgelehnt (etwa alte Fassung nach der Aktivierung): Die alte
  // gilt nirgends mehr, es gibt nichts zu ersetzen -- neu senden genuegt.
  const ersatzBoden = ersetzen && !ersetzen.abgelehnt
    ? BigInt(ersetzen.gebuehr) + (markt?.mindestJeByte ? BigInt(markt.mindestJeByte) * BigInt(groesse) : MIN_FEE)
    : 0n;
  const gebuehr = hoechste(stufenGebuehr, bodenJeByte, ersatzBoden,
    ersetzen?.noetig ? BigInt(ersetzen.noetig) : 0n, nachAblehnung);
  const zielBlock = markt ? markt.stufen[stufe].block : 1;

  // Verfuegbar ist, was nach den schon wartenden Zahlungen uebrig bleibt.
  // Die Kette zieht sie erst mit dem Block ab -- die App muss es vorher tun,
  // sonst laesst sie eine zweite Zahlung zu, die der Knoten ablehnt.
  const wartendAus = (account?.pending ?? [])
    .filter(p => p.kind === 'out')
    .reduce((s, p) => s + BigInt(p.amount) + BigInt(p.fee), 0n);
  const kontostand = BigInt(account?.balance ?? '0');
  // Beim Erhoehen wird die wartende Zahlung ersetzt -- ihr Betrag und ihre
  // Gebuehr sind dann wieder frei.
  // Nur, wenn sie beim Knoten wirklich noch wartet: Sonst ist sie in
  // `wartendAus` gar nicht enthalten und zaehlte doppelt.
  const alteWartet = !!ersetzen && (account?.pending ?? []).some(p => p.txid === ersetzen.txid);
  const frei = alteWartet ? BigInt(ersetzen!.betrag) + BigInt(ersetzen!.gebuehr) : 0n;
  const guthaben = kontostand + frei > wartendAus ? kontostand + frei - wartendAus : 0n;
  const adresse = ziel.trim().toLowerCase();
  const zielGueltig = isValidAddress(adresse);
  const eigene = zielGueltig && wallet.address === adresse;
  // Adressen der Version 1 (ysr1p…) gibt es erst ab Konsensfassung 6. Vorher
  // kann keine Ueberweisung an sie gueltig sein -- der Knoten lehnte sie ab.
  const zuFrueh = zielGueltig && fassung !== 2 && decodeAddress(adresse).length !== 20;

  // Exakt aus den getippten Ziffern, nicht ueber Gleitkomma.
  const einheiten = useMemo(() => eingabeEinheiten(betrag, STELLEN), [betrag]);

  // "Alles" bleibt alles, auch wenn eine Notiz die Gebuehr veraendert --
  // aber NUR im Betragsschritt. Im Pruefschritt steht der Betrag fest: Was
  // der Nutzer dort liest, wird signiert, auch wenn inzwischen ein Ertrag
  // dazugekommen ist. Und nach dem Senden aendert sich gar nichts mehr.
  useEffect(() => {
    if (!alles || schritt !== 'betrag') return;
    const verfuegbar = guthaben > gebuehr ? guthaben - gebuehr : 0n;
    setBetrag(einheitenEingabe(verfuegbar, zeichen, STELLEN, STELLEN));
  }, [alles, schritt, guthaben, gebuehr, zeichen]);

  // Staubgrenze gilt ab derselben Höhe wie der Satz je Byte.
  const staub = !!markt?.mindestJeByte && einheiten > 0n && einheiten < DUST_LIMIT;
  const summe = einheiten + gebuehr;
  const reicht = einheiten > 0n && summe <= guthaben;
  const bereit = zielGueltig && !eigene && !zuFrueh && reicht && !staub && !wechselPause && !fassungUnbekannt;

  const genau = (v: bigint) => betragGenau(v, locale, decimals);
  // Gebühren sind seit Fassung 3 winzig: so viele Stellen wie nötig, mindestens vier.
  // Dieselbe Schreibweise für Gesamt und Rest -- die Zeilen stehen untereinander.
  const fmtGebuehr = (v: bigint) => betragGenau(v, locale, decimals, 4);

  const setzeAnteil = (prozent: 25 | 50 | 100) => {
    setAusCode(false);
    if (prozent === 100) { setAlles(true); return; }
    setAlles(false);
    const verfuegbar = guthaben > gebuehr ? guthaben - gebuehr : 0n;
    let wert = (verfuegbar * BigInt(prozent)) / 100n;
    wert -= wert % 10_000n;   // ein Viertel soll keine acht Nachkommastellen haben
    setBetrag(einheitenEingabe(wert, zeichen, STELLEN, STELLEN));
  };
  const taste = useCallback((k: Taste) => {
    setAlles(false); setAusCode(false);
    setBetrag(b => tippen(b, k, zeichen, STELLEN));
  }, [zeichen]);

  // Tastatur am Rechner (Telegram Desktop, Browser): Ziffern tippen wie gewohnt.
  useEffect(() => {
    if (schritt !== 'betrag' || scanner) return;
    const hoere = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^\d$/.test(e.key)) taste(e.key as Taste);
      else if (e.key === ',' || e.key === '.') taste('komma');
      else if (e.key === 'Backspace') taste('loeschen');
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', hoere);
    return () => window.removeEventListener('keydown', hoere);
  }, [schritt, scanner, taste]);

  /*
    An wen wurde schon gesendet?

    Fuer "Zuletzt gesendet" und fuer den Hinweis "Neue Adresse" im
    Pruefschritt. Die letzten 40 Ausgaenge kommen in einem Abruf; ist das
    der ganze Verlauf, ist die Frage damit beantwortet. Sonst fragt der
    Pruefschritt den Server gezielt nach dieser einen Adresse.
  */
  const [ausgaenge, setAusgaenge] = useState<{ eintraege: Ausgang[]; komplett: boolean } | null>(null);
  useEffect(() => {
    if (!wallet.address) return;
    let lebt = true;
    fetch(`/api/v2/account/${wallet.address}/verlauf?richtung=aus&limit=40`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then((s: { eintraege: Ausgang[]; weiter: string | null }) => {
        if (lebt) setAusgaenge({ eintraege: s.eintraege, komplett: !s.weiter });
      })
      .catch(() => { /* dann nur, was das Konto mitbringt */ });
    return () => { lebt = false; };
  }, [wallet.address]);

  const gesendet = useMemo(() => {
    // Die Kontoliste immer dabei: Sie ist neuer als der Abruf beim Oeffnen
    // (eine eben bestaetigte Zahlung steht nur dort).
    const liste = [...(account?.history ?? []).filter(e => e.kind === 'out'), ...(ausgaenge?.eintraege ?? [])];
    const m = new Map<string, Ausgang>();
    for (const e of liste) if (e.counterparty && !m.has(e.counterparty)) m.set(e.counterparty, e);
    return m;
    // Die Liste des Kontos aendert sich alle paar Sekunden als Objekt, selten im Inhalt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ausgaenge, account?.history?.[0]?.txid]);
  const wartendAn = (account?.pending ?? []).some(p => p.kind === 'out' && p.to === adresse);

  const [gefragt, setGefragt] = useState<Record<string, boolean>>({});
  const bekannt: 'ja' | 'nein' | 'unklar' = !zielGueltig ? 'unklar'
    : gesendet.has(adresse) || wartendAn || gefragt[adresse] === true ? 'ja'
    : ausgaenge?.komplett || gefragt[adresse] === false ? 'nein'
    : 'unklar';
  useEffect(() => {
    if (schritt !== 'pruefen' || bekannt !== 'unklar' || !wallet.address || !zielGueltig) return;
    let lebt = true;
    fetch(`/api/v2/account/${wallet.address}/verlauf?richtung=aus&limit=5&q=${adresse}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then((s: { eintraege: Ausgang[] }) => {
        if (lebt) setGefragt(g => ({ ...g, [adresse]: s.eintraege.some(e => e.counterparty === adresse) }));
      })
      .catch(() => { /* bleibt unklar: dann kein Urteil, nur die Bitte zu vergleichen */ });
    return () => { lebt = false; };
  }, [schritt, bekannt, wallet.address, zielGueltig, adresse]);

  async function senden(pinWert: string = pin) {
    setBusy(true); setFehler(null);
    try {
      // Der Schluessel kommt frisch aus dem Tresor, nicht aus dem Speicher.
      const auf = await wallet.revealMnemonic(pinWert);
      if (!auf.ok || !auf.mnemonic) throw new Error(fehlerText(auf.reason ?? 'wrong_pin', t));

      const { keypairFromMnemonic } = await import('@/lib/core/wallet');
      const kp = keypairFromMnemonic(auf.mnemonic);

      const tx = buildTransfer({
        from: kp.addressRaw,
        to: decodeAddress(adresse),
        amount: einheiten,
        fee: gebuehr,
        // Die naechste Nonce des Kontos: Zustand PLUS eigene wartende
        // Zahlungen. Mit der reinen Zustands-Nonce gaelte eine zweite
        // Zahlung vor der Bestaetigung als Ersatz der ersten -- und der
        // Knoten lehnte sie ab, weil die Gebuehr nicht hoeher ist.
        // Gemerkte eigene Zahlungen zaehlen mit: Hat der Knoten eine davon
        // verdraengt, laege `nextNonce` auf ihrer Nonce, und die neue
        // Zahlung ersetzte sie still (wartendeZahlungen.ts).
        nonce: ersetzen ? BigInt(ersetzen.nonce)
          : naechsteEigeneNonce(wallet.address ? eigeneLesen(wallet.address) : [], account),
        publicKey: kp.publicKey,
        privateKey: kp.privateKey,
        memo: notiz ? new TextEncoder().encode(notizKuerzen(notiz)) : undefined,
        version: fassung,
      });

      /*
        Transaktionen gehen dorthin, wo auch die Bloecke gebaut werden.

        Ein Spiegel nimmt sie zwar an, aber sie kaemen nie in einen Block:
        Wer die Jobs ausgibt, waehlt die Transaktionen aus -- und das ist
        nach der Umstellung der Knoten.
      */
      const res = await fetch(`${MINING_BASIS}/api/v2/tx`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ raw: toHex(serializeTx(tx)) }),
      });
      const body = await res.json();
      if (!body.accepted) {
        // Andrang: Der Knoten nennt die Gebuehr, die jetzt reicht. Sie wird
        // uebernommen und angezeigt; gesendet wird erst nach einem neuen Ja.
        // `fee_not_higher` nur beim Erhoehen: Beim normalen Senden heisst es,
        // dass schon eine andere Zahlung diese Nonce traegt -- sie zu
        // ersetzen waere eine ganz andere Handlung als "Gebuehr anpassen".
        const anpassbar = body.reason === 'pool_min_fee' || body.reason === 'fee_too_low'
          || (body.reason === 'fee_not_higher' && !!ersetzen && !ersetzen.abgelehnt);
        if (anpassbar && typeof body.required === 'string' && /^\d+$/.test(body.required)) {
          setNachAblehnung(BigInt(body.required));
          setMarktStand(n => n + 1);
          setPin('');
          throw new Error(t.fehler.tx.pool_min_fee);
        }
        // Ohne `required` (selten: nichts im Mempool des Knotens kann weichen)
        // gibt es keinen Betrag, der jetzt sicher reicht -- dann nichts versprechen.
        if (body.reason === 'pool_min_fee') {
          const eigeneWarten = (account?.pending ?? []).some(p => p.kind === 'out');
          throw new Error(eigeneWarten ? t.fehler.tx.pool_vorgaenger : t.fehler.tx.pool_voll);
        }
        throw new Error(uebersetze(body.reason, t));
      }
      const id = body.txid ?? toHex(txid(tx));
      // Fuer den Fall, dass ein Knoten sie bei Andrang verdraengt oder nach
      // einem Neustart vergisst: Die Wallet reicht dieselben Bytes erneut ein.
      if (wallet.address) {
        eigeneMerken(wallet.address, {
          txid: id, raw: toHex(serializeTx(tx)), nonce: tx.nonce.toString(), an: adresse,
          betrag: tx.amount.toString(), gebuehr: tx.fee.toString(),
          notiz: notiz ? notizKuerzen(notiz) : '', um: Date.now(), zuletzt: Date.now(), noetig: null, abgelehnt: null,
        });
      }

      setErgebnis({ txid: id, um: Date.now(), betrag: tx.amount, an: adresse });
      setSchritt('fertig');
      onGesendet?.();
    } catch (e) {
      setFehler(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function sendenMitBiometrie() {
    const p = await biometriePin(t.senden.bioGrund(genau(einheiten), symbol));
    if (!p) { setFehler(t.senden.bioNicht); return; }
    await senden(p);
  }

  const zielName = name(adresse);
  const rahmen = 'flex min-h-[min(700px,calc(92dvh_-_64px))] flex-col';
  const meldung = 'mt-2 text-[13.5px] leading-[1.4]';
  const reihe = 'flex min-h-[62px] w-full items-center gap-3.5 border-b border-line py-[11px] text-left active:opacity-70';
  // Grosser Betrag: Ganzzahl gross, Nachkommastellen halb so gross.
  const teile = (text: string): [string, string] => {
    const i = text.lastIndexOf(zeichen);
    return i < 0 ? [text, ''] : [text.slice(0, i), text.slice(i)];
  };
  const groesseFuer = (ganz: string, bruch: string, max: number) =>
    Math.max(34, Math.min(max, Math.floor(268 / (Math.max(ganz.length, 1) * 0.5 + bruch.length * 0.26))));

  // ------------------------------------------------------------- fertig
  if (schritt === 'fertig') {
    const bestaetigt = !!ergebnis && (account?.history ?? []).some(e => e.txid === ergebnis.txid);
    const uhr = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(ergebnis?.um ?? Date.now()));
    const an = ergebnis?.an ?? adresse;
    const anName = name(an);
    const stufen = [
      { titel: t.senden.zSigniert, text: t.senden.zSigniertText(uhr), stand: 'fertig' as const },
      { titel: t.senden.zWartet, text: t.senden.zWartetText, stand: bestaetigt ? 'fertig' as const : 'dran' as const },
      { titel: t.senden.zBestaetigt, text: bestaetigt ? t.senden.zBestaetigtDa : t.senden.zBestaetigtText,
        stand: bestaetigt ? 'fertig' as const : 'offen' as const },
    ];
    return (
      <div className={rahmen}>
        <div className="mt-8 flex flex-col">
          <h1 className="aussage zoom origin-left text-[42px]">{t.senden.gesendet}</h1>
          <p className="rise rise-1 mt-4 max-w-[330px] text-[16px] leading-[1.5] text-lese">
            <span className="tnum font-medium text-text">{genau(ergebnis?.betrag ?? einheiten)} {symbol}</span>{' '}
            {t.senden.unterwegsAn}{' '}
            {anName
              ? <span className="font-medium text-text">{anName}</span>
              : <span className="whitespace-nowrap font-mono text-[14.5px] text-text">{kurzAdresse(an, '')}</span>}
          </p>
        </div>

        <section aria-label={t.senden.stand} className="rise rise-2 mt-8 flex flex-col border-t border-line pt-5">
          {stufen.map((s, i) => (
            <div key={i} className="flex gap-4">
              <div aria-hidden="true" className="flex w-5 shrink-0 flex-col items-center">
                <span className="flex h-[22px] w-5 items-center justify-center">
                  {s.stand === 'fertig' ? (
                    <span className="text-proof">{Zeichen.Haken(18, 2.2)}</span>
                  ) : s.stand === 'dran' ? (
                    <span className="puls h-3 w-3 rounded-full shadow-[inset_0_0_0_2px_#FFD29A]" />
                  ) : (
                    <span className="h-3 w-3 rounded-full shadow-[inset_0_0_0_1.5px_rgb(238_244_255/.3)]" />
                  )}
                </span>
                {i < stufen.length - 1 && (
                  <span className={`my-1 min-h-[20px] w-px flex-1 ${s.stand === 'fertig' ? 'bg-proof/50' : 'bg-line'}`} />
                )}
              </div>
              <div className={`flex flex-col gap-0.5 ${i < stufen.length - 1 ? 'pb-5' : ''}`}>
                <span className={`text-[16px] font-medium leading-[1.3] ${s.stand === 'offen' ? 'text-dim' : ''}`}>{s.titel}</span>
                <span className="text-[13.5px] leading-[1.4] text-dim">{s.text}</span>
              </div>
            </div>
          ))}
        </section>

        <div className="mt-auto flex flex-col gap-2.5 pt-6">
          {!anName && (
            <button type="button" onClick={() => setKontaktBlatt(an)} className={UMRISS}>
              {Zeichen.Person()}{t.kontakt.alsKontakt}
            </button>
          )}
          <button type="button" onClick={onFertig} className={KNOPF}>{t.allgemein.fertig}</button>
        </div>
        <KontaktBlatt adresse={kontaktBlatt} onSchliessen={() => setKontaktBlatt(null)} />
      </div>
    );
  }

  // ------------------------------------------------------------- pruefen
  if (schritt === 'pruefen') {
    const [ganz, bruch] = teile(genau(einheiten));
    return (
      <div className={rahmen}>
        <WKopf titel={ersetzen ? (ersetzen.abgelehnt ? t.wallet.neuSenden : t.senden.erhoehenTitel) : t.senden.pruefenTitel}
               onZurueck={() => { setFehler(null); if (ersetzen) onAbbruch(); else setSchritt('betrag'); }}
               rechts={ersetzen ? undefined : <Schritte schritt={3} />} />
        {ersetzen && (
          <p className="mb-5 text-[14.5px] leading-[1.45] text-lese">{ersetzen.abgelehnt ? t.wallet.abgelehntText : t.senden.erhoehenText}</p>
        )}

        <section className="rise mt-2 flex flex-col">
          <Kappe>{t.senden.duSendest}</Kappe>
          <p className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="betrag" style={{ fontSize: groesseFuer(ganz, bruch, 76) }}>{ganz}<small>{bruch}</small></span>
            <span className="font-mono text-[15px] text-lese">{symbol}</span>
          </p>

          <div className="mt-6 border-t border-line py-[14px]">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-[14.5px] text-dim">
                {t.senden.an}{zielName && <span className="ml-2 font-medium text-text">{zielName}</span>}
              </span>
              {bekannt === 'nein' ? (
                <span className="flex shrink-0 items-center gap-2 text-[13px] font-medium text-lamp">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-lamp" />{t.senden.neueAdresse}
                </span>
              ) : bekannt === 'ja' ? (
                <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-proof">
                  {Zeichen.Haken(14, 2.2)}{t.senden.bekannt}
                </span>
              ) : null}
            </div>
            <AdresseVierer adresse={adresse} gross className="mt-2.5" />
            <p className={`mt-2.5 text-[13px] leading-[1.45] ${bekannt === 'nein' ? 'text-lamp' : 'text-dim'}`}>
              {bekannt === 'nein' ? t.senden.neuText : bekannt === 'ja' ? t.senden.bekanntText : t.senden.pruefText}
              {gescannt && ` ${t.senden.perScan}`}
            </p>
          </div>

          <div className="flex flex-col border-b border-line">
            {notiz && <WertZeile label={t.senden.notiz}>{t.wallet.zitat(notiz)}</WertZeile>}
            <WertZeile label={t.senden.netzgebuehr}><span className="font-mono text-[14px]">{fmtGebuehr(gebuehr)} {symbol}</span></WertZeile>
            <WertZeile label={t.senden.gesamt} stark><span className="font-mono text-[14px]">{fmtGebuehr(summe)} {symbol}</span></WertZeile>
            <WertZeile label={t.senden.danach}>
              <span className="font-mono text-[14px]">
                {guthaben < summe ? `−${fmtGebuehr(summe - guthaben)}` : fmtGebuehr(guthaben - summe)} {symbol}
              </span>
            </WertZeile>
          </div>
        </section>

        {/* Das Guthaben kann sich aendern, waehrend man hier liest (eine andere
            Zahlung geht hinaus). Dann nicht senden lassen, was der Knoten ablehnt. */}
        {!bereit && !(fassungUnbekannt && !marktFehlt) ? (
          <div className="mt-3.5"><Notice tone="risk">{wechselPause ? t.senden.wechselPause : fassungMeldung ? t.senden.fassungUnbekannt : staub ? t.senden.staub : t.senden.zuViel(fmtGebuehr(gebuehr))}</Notice></div>
        ) : (
          <p className="rise rise-1 mt-3.5 text-[13px] leading-[1.45] text-dim">{t.senden.warnung}</p>
        )}

        {bio && !pinManuell ? (
          <div className="mt-auto flex flex-col pt-6">
            {fehler && <div className="mb-3"><Notice tone="risk">{fehler}</Notice></div>}
            <button type="button" onClick={sendenMitBiometrie} disabled={busy || !bereit} className={`${KNOPF} !px-4`}>
              {Zeichen.Finger()}<span className="truncate">{busy ? t.senden.signiert : t.senden.mitBio}</span>
            </button>
            <button type="button" onClick={() => { setFehler(null); setPinManuell(true); }}
                    className={`${VERWEIS} mt-1 justify-center`}>
              {t.senden.pinStatt}
            </button>
          </div>
        ) : (
          <form className="mt-auto flex flex-col pt-6" onSubmit={e => { e.preventDefault(); if (pin.length === 6 && !busy && bereit) senden(); }}>
            <label htmlFor="spin" className="mb-2 block text-[13.5px] font-medium text-dim">{t.senden.pinSignieren}</label>
            <input
              id="spin" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} autoFocus
              onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setFehler(null); }}
              className="tnum feld h-14 w-full bg-transparent px-4 text-center font-mono text-[22px]
                         tracking-[0.45em] text-text outline-none"
            />
            {fehler && <div className="mt-3"><Notice tone="risk">{fehler}</Notice></div>}
            <button type="submit" disabled={pin.length !== 6 || busy || !bereit} className={`${KNOPF} mt-4`}>
              {busy ? t.senden.signiert : t.senden.jetzt}
            </button>
          </form>
        )}
      </div>
    );
  }

  // ------------------------------------------------------------- betrag
  if (schritt === 'betrag' && !scanner) {
    const anzeige = eingabeAnzeige(betrag, zeichen, locale);
    const [ganz, bruch] = teile(anzeige);
    return (
      <div className={rahmen}>
        <WKopf titel={t.senden.titel} onZurueck={() => setSchritt('empfaenger')} rechts={<Schritte schritt={2} />} />

        <div className="flex items-center gap-3.5 border-b border-line pb-3">
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="text-[13px] text-dim">{t.senden.an}</span>
            {zielName && <span className="truncate text-[16px] font-medium leading-[1.3]">{zielName}</span>}
            <span className={`truncate font-mono ${zielName ? 'text-[13px] text-dim' : 'text-[15px]'}`}>{kurzAdresse(adresse, '')}</span>
          </span>
          <button type="button" onClick={() => setSchritt('empfaenger')} className={`${VERWEIS} shrink-0`}>{t.senden.aendern}</button>
        </div>

        <Kappe className="mt-4 block [@media(max-height:700px)]:hidden">{t.senden.betrag}</Kappe>
        <p className="mt-2 flex items-baseline gap-2.5 [@media(max-height:700px)]:mt-3.5" aria-live="polite">
          {/* Auf niedrigen Bildschirmen kleiner: Betrag und Ziffernfeld sollen zusammen sichtbar bleiben. */}
          <span className={`betrag ${anzeige ? '' : 'text-faint'}`} style={{ fontSize: `min(${groesseFuer(ganz, bruch, 76)}px, 9.5dvh)` }}>
            {ganz || '0'}<small>{bruch}</small>
          </span>
          <span className="font-mono text-[15px] text-lese">{symbol}</span>
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
          <span className="tnum text-[13.5px] text-lese">{t.senden.verfuegbar(betragText(guthaben, locale, decimals), symbol)}</span>
          <div role="group" aria-label={t.senden.anteil} className="flex gap-1">
            {([25, 50, 100] as const).map(p => (
              <button key={p} type="button" onClick={() => setzeAnteil(p)} aria-pressed={p === 100 && alles}
                      className={`h-9 rounded-full px-2.5 text-[13px] transition-colors ${
                        p === 100 && alles ? 'bg-text/[.14] font-semibold text-text'
                          : 'font-medium text-lese shadow-[inset_0_0_0_1px_rgb(var(--line))]'}`}>
                {p === 100 ? t.senden.alles : `${p} %`}
              </button>
            ))}
          </div>
        </div>
        {einheiten > 0n && !reicht ? (
          <p className={`${meldung} text-risk`}>{t.senden.zuViel(fmtGebuehr(gebuehr))}</p>
        ) : staub ? (
          <p className={`${meldung} text-risk`}>{t.senden.staub}</p>
        ) : wechselPause ? (
          <p className={`${meldung} text-risk`}>{t.senden.wechselPause}</p>
        ) : fassungMeldung ? (
          <p className={`${meldung} text-risk`}>{t.senden.fassungUnbekannt}</p>
        ) : ausCode ? (
          <p className={`${meldung} text-lese`}>{t.senden.ausCode}</p>
        ) : null}

        <div className="mt-3.5 flex h-12 items-center gap-3 border-y border-line transition-colors focus-within:border-text/60">
          <label htmlFor="notiz" className="shrink-0 text-[14.5px] text-dim">{t.senden.notiz}</label>
          <input id="notiz" value={notiz} onChange={e => { setNotiz(notizKuerzen(e.target.value)); setNotizAusCode(false); }}
                 autoComplete="off" enterKeyHint="done"
                 className="h-11 min-w-0 flex-1 bg-transparent text-[16px] outline-none focus-visible:outline-none" />
          <span className="tnum shrink-0 text-[12.5px] text-dim">{notizBytes(notiz)} / {NOTIZ_BYTES}</span>
        </div>
        <div className="flex min-h-[44px] items-center justify-between gap-3 border-b border-line text-[14.5px]">
          <span className="shrink-0 text-dim">{t.senden.netzgebuehr}</span>
          <span className="tnum text-right text-lese">
            <span className="font-mono text-[13.5px]">{fmtGebuehr(gebuehr)} {symbol}</span> · {zielBlock === 1 ? t.senden.naechsterKurz : t.senden.inBloeckenKurz(zielBlock)}
          </span>
        </div>
        {/*
          Gebührenwahl nur bei Andrang. Ohne Andrang sind alle drei Stufen
          gleich -- drei Knöpfe anzubieten, die dasselbe tun, wäre irreführend.
        */}
        {markt?.andrang && (
          <div className="mt-3">
            <div className="flex rounded-full p-[3px] shadow-[inset_0_0_0_1px_rgb(var(--line))]">
              {(['langsam', 'normal', 'schnell'] as const).map(k => (
                <button key={k} type="button" onClick={() => setStufe(k)} aria-pressed={stufe === k}
                        className={`h-10 flex-1 rounded-full text-[14px] capitalize transition-colors ${
                          stufe === k ? 'bg-text/[.14] font-semibold text-text' : 'font-medium text-lese'}`}>
                  {t.senden.stufe[k]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[13px] leading-[1.45] text-dim">
              {t.senden.warten(markt.wartend)} · {t.senden.geschaetzt}
            </p>
          </div>
        )}

        <div className="mt-auto pt-2">
          <Ziffernfeld onTaste={taste} zeichen={zeichen} />
          <button type="button" onClick={() => { setFehler(null); setPin(''); setSchritt('pruefen'); }} disabled={!bereit}
                  className={`${KNOPF} mt-3`}>
            {t.allgemein.weiter}<Pfeil />
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------- empfaenger
  if (scanner) {
    return <Scanner onErgebnis={scanErgebnis} onAbbruch={scanAbbruch} />;
  }
  // Was im Feld steht, ist entweder eine Adresse (oder ihr Anfang) oder ein Name.
  const eingabe = ziel.trim();
  const suchtName = eingabe.length > 0 && !eingabe.toLowerCase().startsWith('ysr1');
  const passt = (adr: string, n?: string) => !eingabe
    || adr.startsWith(eingabe.toLowerCase())
    || (!!n && n.toLowerCase().includes(eingabe.toLowerCase()));
  const kontaktListe = Object.entries(kontakte)
    .filter(([adr, n]) => adr !== wallet.address && passt(adr, n))
    .sort((a, b) => a[1].localeCompare(b[1], locale));
  const zuletzt = [...gesendet.values()]
    .filter(e => e.counterparty && !kontakte[e.counterparty] && passt(e.counterparty))
    .slice(0, 3);
  const heute = tagSchluessel(Math.floor(Date.now() / 1000));
  const tagText = (ts: string | null) => {
    if (!ts) return '';
    if (tagSchluessel(ts) === heute) return t.wallet.heute;
    const d = new Date(Number(ts) * 1000);
    return new Intl.DateTimeFormat(locale, d.getFullYear() === new Date().getFullYear()
      ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  };
  const waehle = (adr: string) => { if (adr !== adresse) empfaengerWechsel(); setZiel(adr); setSchritt('betrag'); };

  return (
    <div className={rahmen}>
      <WKopf titel={t.senden.titel} onSchliessen={onAbbruch} rechts={<Schritte schritt={1} />} />

      <h2 className="aussage mt-1 text-[33px] leading-[1.05] tracking-[-.036em]">{t.licht.anWen}</h2>
      <label htmlFor="ziel" className="mt-[22px] block text-[13.5px] font-medium text-dim">{t.senden.empfaenger}</label>
      <div className="feld mt-2 flex h-[58px] items-center gap-1 pl-[18px] pr-2">
        <input
          id="ziel" value={ziel} onChange={e => { setZiel(e.target.value); empfaengerWechsel(); }}
          autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false}
          placeholder={t.senden.platzhalter}
          className="h-11 min-w-0 flex-1 bg-transparent font-mono text-[16px] outline-none focus-visible:outline-none
                     placeholder:text-faint"
        />
        {!eingabe && (
          <button type="button" onClick={einfuegen}
                  className="h-[42px] shrink-0 rounded-full bg-text/[.14] px-4 text-[14.5px] font-semibold active:scale-95">
            {t.senden.einfuegen}
          </button>
        )}
        {eingabe && (
          <button type="button" onClick={() => { setZiel(''); empfaengerWechsel(); }}
                  aria-label={t.wallet.sucheLeeren}
                  className="flex h-11 w-11 shrink-0 items-center justify-center text-lese">
            {Zeichen.Kreuz(15)}
          </button>
        )}
      </div>
      {einfuegeFehler ? (
        <p className={`${meldung} text-risk`}>{einfuegeFehler}</p>
      ) : eigene ? (
        <p className={`${meldung} text-risk`}>{t.senden.eigene}</p>
      ) : zuFrueh ? (
        <p className={`${meldung} text-risk`}>{t.senden.adresseAbV6}</p>
      ) : zielGueltig ? (
        <p className={`${meldung} text-proof`}>
          {zielName ? `✓ ${zielName}` : gescannt ? t.senden.gueltigScan : t.senden.gueltig}
        </p>
      ) : eingabe && !suchtName && eingabe.length >= 42 ? (
        <p className={`${meldung} text-risk`}>{t.senden.ungueltig}</p>
      ) : suchtName && kontaktListe.length === 0 ? (
        <p className={`${meldung} text-dim`}>{t.senden.keinKontakt}</p>
      ) : null}

      <button type="button" onClick={() => setScanner(true)}
              className="mt-3 flex h-12 items-center gap-2.5 self-start rounded-full px-5 text-[15px] font-semibold
                         shadow-[inset_0_0_0_1px_rgb(238_244_255/.42)] active:scale-[.98]">
        {Zeichen.Scan(19)}{t.senden.scanAria}
      </button>

      {kontaktListe.length > 0 && (
        <>
          <div className="mt-6 flex min-h-9 items-center justify-between border-b border-line">
            <Kappe als="h2">{t.kontakt.titel}</Kappe>
            <button type="button" onClick={() => setKontakteBearbeiten(b => !b)} aria-pressed={kontakteBearbeiten}
                    className={`${VERWEIS} !text-[13.5px]`}>
              {kontakteBearbeiten ? t.allgemein.fertig : t.kontakt.bearbeitenKurz}
            </button>
          </div>
          <ul>
            {kontaktListe.map(([adr, n]) => (
              <li key={adr}>
                <button type="button" onClick={() => kontakteBearbeiten ? setKontaktBlatt(adr) : waehle(adr)} className={reihe}>
                  <Punkt art="mensch" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[16px] font-medium leading-[1.3]">{n}</span>
                    <span className="truncate font-mono text-[13px] text-dim">{kurzAdresse(adr, '')}</span>
                  </span>
                  <span className="-mr-1 shrink-0 text-dim">{kontakteBearbeiten ? Zeichen.Stift() : Zeichen.Rechts(18)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {zuletzt.length > 0 && (
        <>
          <Kappe als="h2" className="mt-6 block border-b border-line pb-2">{t.senden.zuletzt}</Kappe>
          <ul>
            {zuletzt.map(e => (
              <li key={e.counterparty}>
                <button type="button" onClick={() => waehle(e.counterparty!)} className={reihe}>
                  <Punkt art="mensch" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-mono text-[15px]">{kurzAdresse(e.counterparty, '')}</span>
                    <span className="tnum truncate text-[13.5px] text-dim">
                      {t.senden.zuletztZeile(tagText(e.timestamp), betragText(e.amount, locale, decimals), symbol)}
                    </span>
                  </span>
                  <span className="-mr-1 shrink-0 text-dim">{Zeichen.Rechts(18)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-4 text-[13px] leading-[1.45] text-dim">{t.senden.info}</p>

      <div className="mt-auto pt-5">
        <button type="button" onClick={() => setSchritt('betrag')} disabled={!zielGueltig || eigene || zuFrueh} className={KNOPF}>
          {t.allgemein.weiter}<Pfeil />
        </button>
      </div>
      <KontaktBlatt adresse={kontaktBlatt} onSchliessen={() => setKontaktBlatt(null)} />
    </div>
  );
}

function uebersetze(grund: string, t: Woerterbuch): string {
  const texte = t.fehler.tx;
  if (grund in texte && grund !== 'sonst') return texte[grund as Exclude<keyof typeof texte, 'sonst'>];
  return texte.sonst(grund);
}
