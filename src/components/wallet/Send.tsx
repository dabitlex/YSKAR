'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
import { useWallet } from '@/lib/wallet/useWallet';
import { isValidAddress, decodeAddress } from '@/lib/core/address';
import { buildTransfer, serializeTx, txid } from '@/lib/core/tx';
import { MIN_FEE, DUST_LIMIT } from '@/lib/core/params';
import { transferBytes } from '@/lib/core/tx';

/** Siehe useMining.ts -- leer heisst: derselbe Server wie die App. */
const MINING_BASIS = (process.env.NEXT_PUBLIC_MINING_BASE ?? '').trim()
  .replace(/\/+$/, '');

/** Antwort von /api/v2/fees -- siehe src/lib/core/feemarket.ts. */
interface Markt {
  minFee: string;
  /** Weiterleitungs-Satz je Byte ab Konsensfassung 3, sonst null. */
  mindestJeByte?: string | null;
  wartend: number;
  andrang: boolean;
  stufen: Record<'langsam' | 'normal' | 'schnell', { fee: string; block: number }>;
  hinweis: string;
}
import { toHex } from '@/lib/core/codec';
import { Notice } from '@/components/ui/Primitives';
import Scanner from '@/components/wallet/Scanner';
import Ziffernfeld from '@/components/wallet/Ziffernfeld';
import KontaktBlatt from '@/components/wallet/KontaktBlatt';
import { AdresseVierer, Gegenkachel, Kappe, Schritte, WKopf, WertZeile, Zeichen } from '@/components/wallet/Teile';
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
                               onFertig, onAbbruch }: {
  account: (Account & { history?: Ausgang[] }) | null; decimals: number; symbol: string;
  /** Aus der Wallet mit „Scannen" geoeffnet: Kamera zuerst, Formular danach. */
  scanSofort?: boolean;
  /** Der Knoten hat die Zahlung angenommen -- Konto neu lesen. */
  onGesendet?: () => void;
  onFertig: () => void; onAbbruch: () => void;
}) {
  const wallet = useWallet();
  const { t, locale } = useT();
  const { kontakte, name } = useKontakte();
  const zeichen = useMemo(() => dezimalZeichen(locale), [locale]);
  const [schritt, setSchritt] = useState<Schritt>('empfaenger');
  const [ziel, setZiel] = useState('');
  // Ob die Adresse gescannt wurde -- im Pruefschritt steht das dabei, damit
  // klar ist, woher sie kommt und dass man sie trotzdem ganz lesen sollte.
  const [gescannt, setGescannt] = useState(false);
  const [scanner, setScanner] = useState(!!scanSofort);
  const [betrag, setBetrag] = useState('');
  // "Alles": Der Betrag folgt dem Guthaben und der Gebuehr, bis man tippt.
  const [alles, setAlles] = useState(false);
  // Betrag bzw. Notiz stammen aus einem QR-Code oder der Zwischenablage,
  // nicht vom Nutzer -- sie gehoeren zu DIESEM Empfaenger und gehen mit ihm.
  const [ausCode, setAusCode] = useState(false);
  const [notizAusCode, setNotizAusCode] = useState(false);
  const [notiz, setNotiz] = useState('');
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
  const [stufe, setStufe] = useState<'langsam' | 'normal' | 'schnell'>('normal');
  const [markt, setMarkt] = useState<Markt | null>(null);

  useEffect(() => {
    let lebt = true;
    fetch('/api/v2/fees')
      .then(r => r.json())
      .then(d => { if (lebt && !d.error) setMarkt(d); })
      .catch(() => { /* ohne Auskunft bleibt es bei der Mindestgebühr */ });
    return () => { lebt = false; };
  }, []);

  // Ohne Auskunft vom Knoten: alte Mindestgebühr -- die deckt jede Regel.
  // Mit Auskunft: Stufe des Marktes, aber nie unter dem Satz je Byte für
  // die tatsächliche Größe dieser Transaktion (die Notiz macht sie länger).
  const bodenJeByte = markt?.mindestJeByte ? BigInt(markt.mindestJeByte) * BigInt(transferBytes(notizBytes(notiz))) : 0n;
  const stufenGebuehr = markt ? BigInt(markt.stufen[stufe].fee) : MIN_FEE;
  const gebuehr = stufenGebuehr > bodenJeByte ? stufenGebuehr : bodenJeByte;
  const zielBlock = markt ? markt.stufen[stufe].block : 1;

  // Verfuegbar ist, was nach den schon wartenden Zahlungen uebrig bleibt.
  // Die Kette zieht sie erst mit dem Block ab -- die App muss es vorher tun,
  // sonst laesst sie eine zweite Zahlung zu, die der Knoten ablehnt.
  const wartendAus = (account?.pending ?? [])
    .filter(p => p.kind === 'out')
    .reduce((s, p) => s + BigInt(p.amount) + BigInt(p.fee), 0n);
  const kontostand = BigInt(account?.balance ?? '0');
  const guthaben = kontostand > wartendAus ? kontostand - wartendAus : 0n;
  const adresse = ziel.trim().toLowerCase();
  const zielGueltig = isValidAddress(adresse);
  const eigene = zielGueltig && wallet.address === adresse;

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
  const bereit = zielGueltig && !eigene && reicht && !staub;

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
        nonce: BigInt(account?.nextNonce
          ?? String(BigInt(account?.nonce ?? '0')
                    + BigInt((account?.pending ?? []).filter(p => p.kind === 'out').length))),
        publicKey: kp.publicKey,
        privateKey: kp.privateKey,
        memo: notiz ? new TextEncoder().encode(notizKuerzen(notiz)) : undefined,
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
      if (!body.accepted) throw new Error(uebersetze(body.reason, t));

      setErgebnis({ txid: body.txid ?? toHex(txid(tx)), um: Date.now(), betrag: tx.amount, an: adresse });
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
  const wer = zielName
    ? <span className="truncate text-[14.5px] font-extrabold">{zielName}</span>
    : <span className="truncate font-mono text-[13.5px] font-medium">{kurzAdresse(adresse, '')}</span>;
  const rahmen = 'flex min-h-[min(700px,calc(92dvh_-_64px))] flex-col';
  const haupt = 'flex h-14 w-full shrink-0 items-center justify-center gap-2.5 rounded-[18px] bg-work text-[15px] font-extrabold text-white ' +
    'shadow-[0_12px_24px_-14px_rgb(var(--work)/.8)] transition-[transform,opacity] active:scale-[.985] disabled:opacity-45 disabled:shadow-none disabled:active:scale-100';

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
        <div className="mt-10 flex flex-col items-center gap-2 text-center">
          <span aria-hidden="true" className="zoom flex h-[72px] w-[72px] items-center justify-center rounded-full bg-proof text-white shadow-[0_14px_28px_-14px_rgb(var(--proof)/.8)]">
            {Zeichen.Haken(32, 2.4)}
          </span>
          <h1 className="rise mt-3 text-[26px] font-extrabold tracking-[-0.02em]">{t.senden.gesendet}</h1>
          <p className="rise rise-1 max-w-[300px] text-[15px] font-medium leading-[1.5] text-dim">
            <strong className="font-extrabold text-text">{genau(ergebnis?.betrag ?? einheiten)} {symbol}</strong>{' '}
            {t.senden.unterwegsAn}{' '}
            {anName
              ? <strong className="font-extrabold text-text">{anName}</strong>
              : <span className="whitespace-nowrap font-mono text-[13.5px]">{kurzAdresse(an, '')}</span>}
          </p>
        </div>

        <section aria-label={t.senden.stand} className="panel rise rise-2 mt-[26px] flex flex-col !rounded-[24px] px-[18px] pb-4 pt-[18px]">
          {stufen.map((s, i) => (
            <div key={i} className="flex gap-3.5">
              <div aria-hidden="true" className="flex shrink-0 flex-col items-center">
                {s.stand === 'fertig' ? (
                  <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-proof text-white">{Zeichen.Haken(14, 3)}</span>
                ) : s.stand === 'dran' ? (
                  <span className="puls h-[26px] w-[26px] rounded-full border-[3px] border-work bg-work/10" />
                ) : (
                  <span className="h-[26px] w-[26px] rounded-full border-2 border-line bg-surface" />
                )}
                {i < stufen.length - 1 && (
                  <span className={`min-h-[22px] w-0.5 flex-1 ${s.stand === 'fertig' ? 'bg-proof' : 'bg-line'}`} />
                )}
              </div>
              <div className={`flex flex-col gap-0.5 ${i < stufen.length - 1 ? 'pb-[18px]' : ''}`}>
                <span className={`text-[14.5px] font-extrabold ${s.stand === 'offen' ? 'text-dim' : ''}`}>{s.titel}</span>
                <span className="text-[12.5px] font-semibold text-dim">{s.text}</span>
              </div>
            </div>
          ))}
        </section>

        <div className="mt-auto flex flex-col gap-2.5 pt-6">
          {!anName && (
            <button type="button" onClick={() => setKontaktBlatt(an)}
                    className="flex h-[54px] w-full items-center justify-center gap-2 rounded-[18px] border border-line bg-surface text-[15px] font-extrabold active:scale-[.985]">
              {Zeichen.Person()}{t.kontakt.alsKontakt}
            </button>
          )}
          <button type="button" onClick={onFertig} className={haupt}>{t.allgemein.fertig}</button>
        </div>
        <KontaktBlatt adresse={kontaktBlatt} onSchliessen={() => setKontaktBlatt(null)} />
      </div>
    );
  }

  // ------------------------------------------------------------- pruefen
  if (schritt === 'pruefen') {
    return (
      <div className={rahmen}>
        <WKopf titel={t.senden.pruefenTitel} onZurueck={() => { setFehler(null); setSchritt('betrag'); }} rechts={<Schritte schritt={3} />} />

        <section className="panel rise !rounded-[24px] px-[18px] pb-1.5 pt-4">
          <Kappe>{t.senden.duSendest}</Kappe>
          <p className="tnum mt-1 flex flex-wrap items-baseline gap-x-[7px]">
            <span className="font-extrabold leading-[1.1] tracking-[-0.03em]"
                  style={{ fontSize: Math.max(22, Math.min(36, Math.floor(280 / (genau(einheiten).length * 0.6)))) }}>
              {genau(einheiten)}
            </span>
            <span className="text-[15px] font-extrabold text-dim">{symbol}</span>
          </p>

          <div className="mt-3.5 border-t border-line pt-3.5">
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <Gegenkachel adresse={adresse} size={34} />
                <div className="flex min-w-0 flex-col">
                  <Kappe>{t.senden.an}</Kappe>
                  {zielName && <span className="truncate text-[14.5px] font-extrabold">{zielName}</span>}
                </div>
              </div>
              {bekannt === 'nein' ? (
                <span className="warte inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full pl-2 pr-[11px] text-[12px] font-extrabold">
                  {Zeichen.Warnung()}{t.senden.neueAdresse}
                </span>
              ) : bekannt === 'ja' ? (
                <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-proof/[.12] pl-2 pr-[11px] text-[12px] font-extrabold text-proof">
                  {Zeichen.Haken(14)}{t.senden.bekannt}
                </span>
              ) : null}
            </div>
            <AdresseVierer adresse={adresse} gross className="mt-2.5 rounded-[16px] bg-raised px-3.5 py-3" />
            <p className={`mt-2 text-[12.5px] font-semibold leading-[1.45] ${bekannt === 'nein' ? 'warte-text' : 'text-dim'}`}>
              {bekannt === 'nein' ? t.senden.neuText : bekannt === 'ja' ? t.senden.bekanntText : t.senden.pruefText}
              {gescannt && ` ${t.senden.perScan}`}
            </p>
          </div>

          <div className="mt-3.5 flex flex-col">
            {notiz && <WertZeile label={t.senden.notiz}>{t.wallet.zitat(notiz)}</WertZeile>}
            <WertZeile label={t.senden.netzgebuehr}>{fmtGebuehr(gebuehr)} {symbol}</WertZeile>
            <WertZeile label={t.senden.gesamt} stark>{fmtGebuehr(summe)} {symbol}</WertZeile>
            <WertZeile label={t.senden.danach}>
              {guthaben < summe ? `−${fmtGebuehr(summe - guthaben)}` : fmtGebuehr(guthaben - summe)} {symbol}
            </WertZeile>
          </div>
        </section>

        {/* Das Guthaben kann sich aendern, waehrend man hier liest (eine andere
            Zahlung geht hinaus). Dann nicht senden lassen, was der Knoten ablehnt. */}
        {!bereit ? (
          <div className="mt-3"><Notice tone="risk">{staub ? t.senden.staub : t.senden.zuViel(fmtGebuehr(gebuehr))}</Notice></div>
        ) : (
          <p className="rise rise-1 mx-1 mt-3 text-[12.5px] font-semibold leading-[1.45] text-dim">{t.senden.warnung}</p>
        )}

        {bio && !pinManuell ? (
          <div className="mt-auto flex flex-col pt-5">
            {fehler && <div className="mb-3"><Notice tone="risk">{fehler}</Notice></div>}
            <button type="button" onClick={sendenMitBiometrie} disabled={busy || !bereit} className={haupt}>
              {Zeichen.Finger()}{busy ? t.senden.signiert : t.senden.mitBio}
            </button>
            <button type="button" onClick={() => { setFehler(null); setPinManuell(true); }}
                    className="mt-1 h-11 text-[13.5px] font-extrabold text-work">
              {t.senden.pinStatt}
            </button>
          </div>
        ) : (
          <form className="mt-auto flex flex-col pt-5" onSubmit={e => { e.preventDefault(); if (pin.length === 6 && !busy && bereit) senden(); }}>
            <label htmlFor="spin" className="mb-1.5 block text-[13px] font-bold text-dim">{t.senden.pinSignieren}</label>
            <input
              id="spin" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} autoFocus
              onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setFehler(null); }}
              className="tnum sunk w-full !rounded-[16px] px-4 py-3.5 text-center font-mono text-xl
                         tracking-[0.45em] outline-none transition-colors focus:border-work"
            />
            {fehler && <div className="mt-3"><Notice tone="risk">{fehler}</Notice></div>}
            <button type="submit" disabled={pin.length !== 6 || busy || !bereit} className={`${haupt} mt-4`}>
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
    const groesse = Math.max(28, Math.min(58, Math.floor(270 / (Math.max(anzeige.length, 1) * 0.6))));
    return (
      <div className={rahmen}>
        <WKopf titel={t.senden.betrag} onZurueck={() => setSchritt('empfaenger')} rechts={<Schritte schritt={2} />} />

        <div className="panel flex items-center gap-3 !rounded-[18px] py-2 pl-3 pr-1.5">
          <Gegenkachel adresse={adresse} size={40} />
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="text-[11.5px] font-bold text-dim">{t.senden.an}</span>
            {wer}
          </div>
          <button type="button" onClick={() => setSchritt('empfaenger')}
                  className="h-11 shrink-0 px-3 text-[13px] font-extrabold text-work">{t.senden.aendern}</button>
        </div>

        <div className="mt-[18px] flex flex-col items-center gap-1.5 text-center">
          <p className="tnum flex items-baseline gap-2" aria-live="polite">
            <span className={`font-extrabold leading-none tracking-[-0.04em] ${anzeige ? '' : 'text-faint'}`} style={{ fontSize: groesse }}>
              {anzeige || '0'}
            </span>
            <span className="text-[18px] font-extrabold text-dim">{symbol}</span>
          </p>
          <p className="tnum text-[13px] font-semibold text-dim">{t.senden.verfuegbar(betragText(guthaben, locale, decimals), symbol)}</p>
          {einheiten > 0n && !reicht ? (
            <p className="text-[12.5px] font-bold text-risk">{t.senden.zuViel(fmtGebuehr(gebuehr))}</p>
          ) : staub ? (
            <p className="text-[12.5px] font-bold text-risk">{t.senden.staub}</p>
          ) : ausCode ? (
            <p className="text-[12.5px] font-semibold text-work">{t.senden.ausCode}</p>
          ) : null}
        </div>

        <div role="group" aria-label={t.senden.anteil} className="mt-3 flex justify-center gap-2">
          {([25, 50, 100] as const).map(p => (
            <button key={p} type="button" onClick={() => setzeAnteil(p)} aria-pressed={p === 100 && alles}
                    className={`h-10 rounded-[13px] px-4 text-[13px] font-extrabold transition-colors ${
                      p === 100 && alles ? 'bg-work/10 text-work' : 'bg-raised text-dim'}`}>
              {p === 100 ? t.senden.alles : `${p} %`}
            </button>
          ))}
        </div>

        <div className="panel mt-3.5 flex h-[50px] items-center gap-2.5 !rounded-[16px] px-3.5 focus-within:border-work">
          <label htmlFor="notiz" className="shrink-0 text-[13px] font-bold text-dim">{t.senden.notiz}</label>
          <input id="notiz" value={notiz} onChange={e => { setNotiz(notizKuerzen(e.target.value)); setNotizAusCode(false); }}
                 autoComplete="off" enterKeyHint="done"
                 className="h-11 min-w-0 flex-1 bg-transparent text-[14px] font-semibold outline-none focus-visible:outline-none" />
          <span className="tnum shrink-0 text-[12px] font-semibold text-dim">{notizBytes(notiz)} / {NOTIZ_BYTES}</span>
        </div>

        <div className="mt-2.5 flex justify-between gap-3 text-[13px] font-semibold">
          <span className="text-dim">{t.senden.netzgebuehr}</span>
          <span className="tnum text-right">
            {fmtGebuehr(gebuehr)} {symbol} · {zielBlock === 1 ? t.senden.naechsterKurz : t.senden.inBloeckenKurz(zielBlock)}
          </span>
        </div>
        {/*
          Gebührenwahl nur bei Andrang. Ohne Andrang sind alle drei Stufen
          gleich -- drei Knöpfe anzubieten, die dasselbe tun, wäre irreführend.
        */}
        {markt?.andrang && (
          <div className="mt-2">
            <div className="flex overflow-hidden rounded-[13px] bg-raised p-[3px]">
              {(['langsam', 'normal', 'schnell'] as const).map(k => (
                <button key={k} type="button" onClick={() => setStufe(k)} aria-pressed={stufe === k}
                        className={`h-9 flex-1 rounded-[10px] text-[12.5px] font-extrabold capitalize transition-colors ${
                          stufe === k ? 'bg-surface text-text shadow-sm' : 'text-dim'}`}>
                  {t.senden.stufe[k]}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[12px] font-medium leading-relaxed text-faint">
              {t.senden.warten(markt.wartend)} · {t.senden.geschaetzt}
            </p>
          </div>
        )}

        <div className="mt-auto pt-4">
          <Ziffernfeld onTaste={taste} zeichen={zeichen} />
          <button type="button" onClick={() => { setFehler(null); setPin(''); setSchritt('pruefen'); }} disabled={!bereit}
                  className={`${haupt} mt-3.5`}>
            {t.allgemein.weiter}
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

      <label htmlFor="ziel" className="block text-[13px] font-bold text-dim">{t.senden.empfaenger}</label>
      <div className="panel mt-[7px] flex h-[58px] items-center gap-1 !rounded-[18px] pl-4 pr-1.5 transition-colors focus-within:border-work">
        <input
          id="ziel" value={ziel} onChange={e => { setZiel(e.target.value); empfaengerWechsel(); }}
          autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false}
          placeholder={t.senden.platzhalter}
          className="h-11 min-w-0 flex-1 bg-transparent font-mono text-[14px] outline-none focus-visible:outline-none
                     placeholder:text-faint"
        />
        {!eingabe && (
          <button type="button" onClick={einfuegen} className="h-11 shrink-0 px-2.5 text-[13px] font-extrabold text-work">
            {t.senden.einfuegen}
          </button>
        )}
        {eingabe && (
          <button type="button" onClick={() => { setZiel(''); empfaengerWechsel(); }}
                  aria-label={t.wallet.sucheLeeren}
                  className="flex h-11 w-9 shrink-0 items-center justify-center text-dim">
            {Zeichen.Kreuz(14)}
          </button>
        )}
        <button type="button" onClick={() => setScanner(true)} aria-label={t.senden.scanAria}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-work/10 text-work active:scale-95">
          {Zeichen.Scan(20)}
        </button>
      </div>
      {einfuegeFehler ? (
        <p className="mt-1.5 text-[12.5px] font-bold text-risk">{einfuegeFehler}</p>
      ) : eigene ? (
        <p className="mt-1.5 text-[12.5px] font-bold text-risk">{t.senden.eigene}</p>
      ) : zielGueltig ? (
        <p className="mt-1.5 text-[12.5px] font-bold text-proof">
          {zielName ? `✓ ${zielName}` : gescannt ? t.senden.gueltigScan : t.senden.gueltig}
        </p>
      ) : eingabe && !suchtName && eingabe.length >= 42 ? (
        <p className="mt-1.5 text-[12.5px] font-bold text-risk">{t.senden.ungueltig}</p>
      ) : suchtName && kontaktListe.length === 0 ? (
        <p className="mt-1.5 text-[12.5px] font-bold text-dim">{t.senden.keinKontakt}</p>
      ) : null}

      {kontaktListe.length > 0 && (
        <>
          <div className="mb-1 mt-5 flex items-center justify-between">
            <Kappe als="h2">{t.kontakt.titel}</Kappe>
            <button type="button" onClick={() => setKontakteBearbeiten(b => !b)} aria-pressed={kontakteBearbeiten}
                    className="-my-2 h-9 px-1 text-[12.5px] font-extrabold text-work">
              {kontakteBearbeiten ? t.allgemein.fertig : t.kontakt.bearbeitenKurz}
            </button>
          </div>
          <ul className="panel flex flex-col !rounded-[20px] px-3.5">
            {kontaktListe.map(([adr, n], i) => (
              <li key={adr}>
                <button type="button" onClick={() => kontakteBearbeiten ? setKontaktBlatt(adr) : waehle(adr)}
                        className={`flex min-h-[62px] w-full items-center gap-3 py-2 text-left active:opacity-70 ${i ? 'border-t border-line' : ''}`}>
                  <Gegenkachel adresse={adr} size={40} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[14.5px] font-extrabold">{n}</span>
                    <span className="truncate font-mono text-[12px] text-dim">{kurzAdresse(adr, '')}</span>
                  </span>
                  <span className="shrink-0 text-dim">{kontakteBearbeiten ? Zeichen.Stift() : Zeichen.Rechts()}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {zuletzt.length > 0 && (
        <>
          <Kappe als="h2" className="mb-1 mt-5 block">{t.senden.zuletzt}</Kappe>
          <ul className="panel flex flex-col !rounded-[20px] px-3.5">
            {zuletzt.map((e, i) => (
              <li key={e.counterparty}>
                <button type="button" onClick={() => waehle(e.counterparty!)}
                        className={`flex min-h-[62px] w-full items-center gap-3 py-2 text-left active:opacity-70 ${i ? 'border-t border-line' : ''}`}>
                  <Gegenkachel adresse={e.counterparty} size={40} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-mono text-[13.5px] font-medium">{kurzAdresse(e.counterparty, '')}</span>
                    <span className="tnum truncate text-[12.5px] font-semibold text-dim">
                      {t.senden.zuletztZeile(tagText(e.timestamp), betragText(e.amount, locale, decimals), symbol)}
                    </span>
                  </span>
                  <span className="shrink-0 text-dim">{Zeichen.Rechts()}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-4 flex gap-[11px] rounded-[18px] bg-raised px-3.5 py-[13px]">
        <span className="mt-px shrink-0 text-work">{Zeichen.Info()}</span>
        <p className="text-[12.5px] font-semibold leading-[1.5] text-dim">{t.senden.info}</p>
      </div>

      <div className="mt-auto pt-5">
        <button type="button" onClick={() => setSchritt('betrag')} disabled={!zielGueltig || eigene} className={haupt}>
          {t.allgemein.weiter}
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
