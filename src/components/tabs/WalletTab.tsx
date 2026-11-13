'use client';

import { SicherungsHinweis } from '@/components/Sicherung';
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Primitives';
import type { Account, Wartend } from '@/hooks/useMining';
import { useT } from '@/i18n';
import { sucheAus } from '@/lib/api/suche';
import { type Zeitraum, IMMER, grenzen } from '@/lib/wallet/zeitraum';
import { SuchKnopf, SuchLeiste, FilterChips, ZeitraumBlatt, trefferGrund } from '@/components/wallet/VerlaufSuche';
import { ExternLink, EXPLORER_URL } from '@/components/ui/ExternLink';
import { betragText, betragZahl } from '@/lib/wallet/betrag';
import { kurzAdresse } from '@/lib/wallet/adresse';
import { notizAusHex } from '@/lib/wallet/notiz';
import { gruppiere, tagSchluessel, type Zeile } from '@/lib/wallet/verlaufGruppen';
import { useKontakte } from '@/lib/wallet/kontakte';
import { useGuthabenVerborgen } from '@/lib/wallet/verborgen';
import { useEinnahmen } from '@/lib/wallet/useEinnahmen';
import { useEigeneZahlungen } from '@/hooks/useEigeneZahlungen';
import type { EigeneZahlung } from '@/lib/wallet/wartendeZahlungen';
import Einnahmen from '@/components/wallet/Einnahmen';
import Detail from '@/components/wallet/Detail';
import { KNOPF, Kappe, PUNKTE, Punkt, UMRISS, VERWEIS, Zeichen } from '@/components/wallet/Teile';
import { Zeichen as YZeichen } from '@/components/ui/Marke';

/**
 * Wallet.
 *
 * Aufbau wie in Bank- und Wallet-Apps ueblich, und das aus gutem Grund:
 * Guthaben als Hauptflaeche ganz oben, Aktionen direkt daran, darunter der
 * Verlauf. Wer die App oeffnet, will genau in dieser Reihenfolge wissen,
 * was los ist.
 *
 * Der Verlauf ist nach Tagen gegliedert. Mining-Ertraege eines Tages stehen
 * in EINER Zeile (lib/wallet/verlaufGruppen.ts) -- sonst gehen zwischen
 * zwanzig Pool-Anteilen die zwei Ueberweisungen unter, um die es geht.
 */

export interface HistoryEintrag {
  txid: string; height: number; idx?: number; timestamp: string | null;
  kind: 'reward' | 'pool' | 'in' | 'out';
  counterparty: string | null; amount: string; fee: string;
  memo?: string | null;
  /** Pool-Anteil: wie viele sich den Block geteilt haben. */
  shares?: number;
}

/*
  Vollstaendiger Verlauf.

  Das Konto bringt die neuesten 40 Eintraege mit (alle Richtungen) und einen
  Cursor. Aeltere holt "Aeltere laden" seitenweise ueber
  /api/v2/account/:adresse/verlauf. Fuer "Eingaenge" und "Ausgaenge" fragt
  die Liste den Server mit Filter -- sonst saehe man unter "Ausgaenge" nur,
  was zufaellig unter den letzten 40 Eintraegen aller Art war.

  Gefiltert wird nach ART: Mining (Blockreward, Pool-Anteil) oder
  Ueberweisungen. Der Server waehlt aus (lib/api/verlaufArt.ts); eine Seite
  kann dabei LEER sein und trotzdem einen Cursor tragen -- dann lag in dem
  gelesenen Stueck nichts Passendes, und die Liste fragt von selbst weiter.
*/
type Sicht = 'alle' | 'mining' | 'transfer';
/** So oft fragt die Liste von selbst weiter, wenn eine Seite leer zurueckkommt. */
const LEER_WEITER = 6;
interface Seite { eintraege: HistoryEintrag[]; weiter: string | null }
const LEER: Seite = { eintraege: [], weiter: null };
const schluessel = (e: HistoryEintrag) => `${e.txid}:${e.kind}`;
const istMining = (e: HistoryEintrag) => e.kind === 'reward' || e.kind === 'pool';
/** So viele Ertraege zeigt ein aufgeklapptes Buendel, bevor "weitere" kommt. */
const BUENDEL_ERSTE = 3;
/** Rest eines Tages: mehr Bloecke hat ein Tag nicht (144 bei 10 Minuten). */
const REST_LIMIT = 200;

/** Zusammenfuehren ohne Doppel, neueste zuerst -- nach Block, dann Position im Block. */
function zusammen(...listen: HistoryEintrag[][]): HistoryEintrag[] {
  const m = new Map<string, HistoryEintrag>();
  for (const l of listen) for (const e of l) if (!m.has(schluessel(e))) m.set(schluessel(e), e);
  return [...m.values()].sort((a, b) => b.height - a.height || (b.idx ?? 0) - (a.idx ?? 0));
}

export default function WalletTab({ account, symbol, decimals, address, hoehe,
                                    onSenden, onScannen, onEmpfangen, onEinstellungen, onSichern, onErhoehen, onMinen }: {
  account: (Account & { history?: HistoryEintrag[]; historyWeiter?: string | null; pending?: Wartend[] }) | null;
  symbol: string; decimals: number; address: string | null;
  /** Aktuelle Hoehe der Kette -- fuer "n Bloecke danach" in den Einzelheiten. */
  hoehe: number | null;
  onSenden: () => void; onScannen: () => void; onEmpfangen: () => void;
  onEinstellungen: () => void;
  /** Gesetzt, solange die Woerter nicht gesichert sind: zeigt den Hinweis. */
  onSichern?: () => void;
  /** Eine festhaengende eigene Zahlung mit hoeherer Gebuehr ersetzen. */
  onErhoehen?: (z: EigeneZahlung) => void;
  /** Leere Wallet: zum Minen-Reiter wechseln. */
  onMinen?: () => void;
}) {
  // Ausgewaehlte Transaktion. Als Blatt und nicht als eigene Seite: Man
  // will danach wieder in derselben Liste stehen, an derselben Stelle.
  const [offen, setOffen] = useState<HistoryEintrag | null>(null);
  const [sicht, setSicht] = useState<Sicht>('alle');
  const [kopiert, setKopiert] = useState(false);
  const [verborgen, verbergen] = useGuthabenVerborgen();
  const { t, betrag, vorZeit, locale, zahl } = useT();
  const { name } = useKontakte();
  const unb = t.allgemein.unbekannt;

  // Zusatz fuer die Abfrage: die gewaehlte Art. "Alle" braucht keinen.
  const artParameter = sicht === 'alle' ? '' : `&art=${sicht}`;
  const passt = (e: HistoryEintrag) => sicht === 'alle' || (sicht === 'mining') === istMining(e);
  // Erste Seite je Art (nur Mining/Ueberweisungen; "alle" kommt mit dem Konto).
  const [koepfe, setKoepfe] = useState<Record<'mining' | 'transfer', Seite | null>>({ mining: null, transfer: null });
  // Nachgeladene aeltere Seiten je Art. null = noch nichts nachgeladen.
  const [aeltere, setAeltere] = useState<Record<Sicht, Seite | null>>({ alle: null, mining: null, transfer: null });
  const [laedt, setLaedt] = useState(false);
  const [ladeFehler, setLadeFehler] = useState(false);

  // Suche und Zeitraum (components/wallet/VerlaufSuche.tsx). Ist einer
  // davon aktiv, kommt die Liste ganz vom Server: Treffer aus dem GANZEN
  // Verlauf, seitenweise wie sonst auch.
  const [suchOffen, setSuchOffen] = useState(false);
  const [eingabe, setEingabe] = useState('');
  const [q, setQ] = useState('');
  const [zeitraum, setZeitraum] = useState<Zeitraum>(IMMER);
  const [blattOffen, setBlattOffen] = useState(false);
  const [treffer, setTreffer] = useState<{ key: string; seite: Seite } | null>(null);
  const [trefferFehler, setTrefferFehler] = useState(false);
  // Erst suchen, wenn der Nutzer kurz aufhoert zu tippen.
  useEffect(() => {
    const id = setTimeout(() => setQ(eingabe.trim()), 350);
    return () => clearTimeout(id);
  }, [eingabe]);
  const suche = useMemo(() => sucheAus(q), [q]);
  const [vonZeit, bisZeit] = useMemo(() => grenzen(zeitraum), [zeitraum]);
  const filterAktiv = suche !== null || vonZeit !== null || bisZeit !== null;
  const filterKey = filterAktiv ? `${sicht}|${q}|${vonZeit ?? ''}|${bisZeit ?? ''}` : '';
  const filterParameter = () => {
    const p = new URLSearchParams();
    if (suche) p.set('q', q);
    if (vonZeit !== null) p.set('von', String(vonZeit));
    if (bisZeit !== null) p.set('bis', String(bisZeit));
    return p.toString();
  };
  const filterWeg = () => { setEingabe(''); setQ(''); setZeitraum(IMMER); };

  // Aufgeklappte Mining-Buendel (je Tag) und solche, die alle Ertraege zeigen.
  const [aufgeklappt, setAufgeklappt] = useState<Set<string>>(() => new Set());
  const [ganz, setGanz] = useState<Set<string>>(() => new Set());
  const umschalten = (menge: Set<string>, k: string) => {
    const neu = new Set(menge);
    if (neu.has(k)) neu.delete(k); else neu.add(k);
    return neu;
  };

  // Rest des aeltesten geladenen Tages -- siehe unten.
  const [rest, setRest] = useState<{
    basis: string; key: string;
    /** Der Eintrag, hinter dem der Rest beginnt, und der davor -- siehe restGilt. */
    anker: string; vorAnker: string;
    eintraege: HistoryEintrag[]; voll: boolean;
  } | null>(null);

  // Andere Wallet: alles Nachgeladene gehoert nicht mehr hierher.
  useEffect(() => {
    setKoepfe({ mining: null, transfer: null });
    setAeltere({ alle: null, mining: null, transfer: null });
    setTreffer(null); setRest(null);
    setAufgeklappt(new Set()); setGanz(new Set());
    setEingabe(''); setQ(''); setZeitraum(IMMER); setSuchOffen(false);
  }, [address]);

  // Erste Trefferseite, sobald sich ein Filter aendert.
  useEffect(() => {
    if (!address || !filterAktiv) return;
    let abgebrochen = false;
    setTrefferFehler(false);
    fetch(`/api/v2/account/${address}/verlauf?richtung=alle${artParameter}&limit=40&${filterParameter()}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then((seite: Seite) => { if (!abgebrochen) setTreffer({ key: filterKey, seite }); })
      .catch(() => { if (!abgebrochen) setTrefferFehler(true); });
    return () => { abgebrochen = true; };
    // filterKey fasst Art, q, von und bis zusammen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, filterKey]);
  const trefferSeite = filterAktiv && treffer?.key === filterKey ? treffer.seite : null;

  // Erste gefilterte Seite holen -- beim Umschalten und wenn neue Eintraege
  // dazukommen (der neueste Eintrag des Kontos aendert sich).
  const neuester = account?.history?.[0] ? schluessel(account.history[0]) : '';
  useEffect(() => {
    if (!address || sicht === 'alle') return;
    let abgebrochen = false;
    fetch(`/api/v2/account/${address}/verlauf?richtung=alle${artParameter}&limit=40`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then((s: Seite) => { if (!abgebrochen) setKoepfe(k => ({ ...k, [sicht]: s })); })
      .catch(() => { /* bleibt bei der gefilterten Kontoliste */ });
    return () => { abgebrochen = true; };
    // artParameter folgt aus sicht.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, sicht, neuester]);

  // Bis der Server antwortet, steht unter "Mining"/"Ueberweisungen" das
  // Passende aus der Kontoliste -- vorlaeufig: Es kann mehr geben.
  const vorlaeufig = !filterAktiv && sicht !== 'alle' && !koepfe[sicht];
  const kopf: Seite = sicht === 'alle'
    ? { eintraege: account?.history ?? [], weiter: account?.historyWeiter ?? null }
    : koepfe[sicht] ?? {
        // Ohne "Aeltere laden" -- der Cursor waere einer fuer alle Arten.
        eintraege: (account?.history ?? []).filter(passt),
        weiter: null,
      };
  const nachgeladen = aeltere[sicht];
  const ungefiltert = useMemo(() => zusammen(kopf.eintraege, (nachgeladen ?? LEER).eintraege),
    [kopf.eintraege, nachgeladen]);
  // Gibt es aeltere Seiten? (Ab der letzten nachgeladenen, sonst ab der ersten.)
  const mehrDa = filterAktiv ? (trefferSeite?.weiter ?? null)
    : nachgeladen ? nachgeladen.weiter : kopf.weiter;

  /*
    Der aelteste geladene Tag ist fast immer angeschnitten: Die Seite endet
    nach 40 Eintraegen, nicht um Mitternacht. Ein Mining-Buendel dieses
    Tages zeigte dann eine Summe, die nur ein Teil ist. Deshalb wird der
    Rest GENAU dieses Tages nachgeholt (ein Abruf, begrenzt auf den Tag);
    bis er da ist, ist das Buendel als unvollstaendig gekennzeichnet.

    Nur noetig, wenn der Tag ueberhaupt Mining-Ertraege zeigt, und nicht
    bei aktiver Suche -- dort wird nicht gebuendelt.

    Der Rest ERGAENZT die Liste nur. Geblaettert wird immer mit dem Cursor
    des Servers (mehrDa), nie ab dem Ende des Rests: Der Rest ist nach
    Blockzeit begrenzt, der Cursor zaehlt nach Hoehe -- und Blockzeiten
    laufen nicht streng aufwaerts. Ein Block, der zwischen beiden liegt,
    kaeme sonst nie.
  */
  const basis = `${address ?? ''}|${sicht}`;
  const letzter = !filterAktiv && !vorlaeufig && mehrDa && sicht !== 'transfer'
    ? ungefiltert[ungefiltert.length - 1] : undefined;
  const vorLetzter = letzter ? ungefiltert[ungefiltert.length - 2] : undefined;
  const letzterTag = letzter ? tagSchluessel(letzter.timestamp) : '';
  const brauchtRest = !!letzter && letzter.idx != null && !!letzterTag
    && ungefiltert.some(e => istMining(e) && tagSchluessel(e.timestamp) === letzterTag);
  const restKey = brauchtRest && letzter ? `${basis}|${letzter.height}:${letzter.idx}` : '';
  useEffect(() => {
    if (!address || !restKey || !letzter) return;
    let abgebrochen = false;
    const beginn = new Date(Number(letzter.timestamp) * 1000);
    beginn.setHours(0, 0, 0, 0);
    fetch(`/api/v2/account/${address}/verlauf?richtung=alle${artParameter}&vor=${letzter.height}:${letzter.idx}` +
          `&von=${Math.floor(beginn.getTime() / 1000)}&limit=${REST_LIMIT}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then((s: Seite) => {
        // Der letzte Eintrag der Seite gehoert dazu: Kommt ein neuer Block,
        // rutscht er aus der ersten Seite und fehlte sonst kurz.
        if (!abgebrochen) setRest({
          basis, key: restKey,
          anker: schluessel(letzter), vorAnker: vorLetzter ? schluessel(vorLetzter) : '',
          eintraege: [letzter, ...s.eintraege], voll: s.eintraege.length >= REST_LIMIT,
        });
      })
      .catch(() => { /* das Buendel bleibt als unvollstaendig gekennzeichnet */ });
    return () => { abgebrochen = true; };
    // restKey fasst Adresse, Art und den letzten Eintrag zusammen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restKey]);
  /*
    Der Rest gilt nur, solange er lueckenlos an die Liste anschliesst: wenn
    die Liste noch mit demselben Eintrag endet wie beim Abruf (anker), oder
    mit dem davor -- dann ist genau ein neuer Eintrag dazugekommen und der
    Anker, der aus der ersten Seite gerutscht ist, steht im Rest. Bei
    allem anderen (zwei neue auf einmal, aeltere Seite nachgeladen) wird er
    nicht mehr gezeigt, bis der neue da ist.
  */
  const restGilt = !filterAktiv && !!rest && !!letzter && rest.basis === basis
    && (schluessel(letzter) === rest.anker || schluessel(letzter) === rest.vorAnker);
  const restEintraege = restGilt && rest ? rest.eintraege : null;

  const verlauf = useMemo(
    () => filterAktiv ? (trefferSeite?.eintraege ?? [])
      : restEintraege ? zusammen(ungefiltert, restEintraege) : ungefiltert,
    [filterAktiv, trefferSeite, ungefiltert, restEintraege]);
  // Weiterblaettern: immer mit dem Cursor des Servers. Was der Rest schon
  // gebracht hat, kommt dabei noch einmal -- zusammen() nimmt es heraus.
  const cursor = mehrDa;
  // Tag, dessen Mining-Summe (noch) nicht vollstaendig ist.
  const aeltester = verlauf[verlauf.length - 1];
  const teilTag = filterAktiv ? null
    : vorlaeufig ? (aeltester ? tagSchluessel(aeltester.timestamp) : null)
    : brauchtRest && (!restGilt || !!rest?.voll) ? letzterTag
    : null;

  const mehrLaden = async () => {
    if (!address || !cursor || laedt) return;
    setLaedt(true); setLadeFehler(false);
    try {
      const filterJetzt = filterAktiv ? filterKey : '';
      const sichtJetzt = sicht;
      let ab = cursor;
      // Mit einer Art kann eine Seite leer sein und trotzdem weitergehen:
      // dann gleich die naechste holen, statt einen Knopf zu zeigen, der
      // scheinbar nichts tut.
      for (let runde = 0; runde < LEER_WEITER; runde++) {
        const r = await fetch(`/api/v2/account/${address}/verlauf?richtung=alle${artParameter}&vor=${encodeURIComponent(ab)}&limit=50${
          filterAktiv ? '&' + filterParameter() : ''}`);
        if (!r.ok) throw new Error(String(r.status));
        const s: Seite = await r.json();
        if (filterJetzt) {
          // Treffer anhaengen -- aber nur, wenn der Filter noch derselbe ist.
          setTreffer(tr => tr && tr.key === filterJetzt
            ? { key: tr.key, seite: { eintraege: zusammen(tr.seite.eintraege, s.eintraege), weiter: s.weiter } }
            : tr);
        } else {
          // Beim ersten Nachladen die erste Seite mit festhalten: Kommt spaeter
          // ein neuer Eintrag dazu, rutscht der bisher letzte aus der ersten
          // Seite -- er darf dann nicht zwischen beiden Seiten verloren gehen.
          setAeltere(a => ({ ...a, [sichtJetzt]: {
            eintraege: [...(a[sichtJetzt]?.eintraege ?? kopf.eintraege), ...s.eintraege],
            weiter: s.weiter,
          } }));
        }
        if (s.eintraege.length > 0 || !s.weiter) break;
        ab = s.weiter;
      }
    } catch { setLadeFehler(true); }
    finally { setLaedt(false); }
  };

  /*
    Die erste Seite einer Art kam leer, aber mit Cursor: weiter hinten kann
    etwas sein. Dann fragt die Liste von selbst weiter -- begrenzt, damit ein
    sehr langer Verlauf nicht endlos im Hintergrund gelesen wird; danach
    bleibt der Knopf "Aeltere laden".
  */
  const [vonSelbst, setVonSelbst] = useState<{ key: string; n: number }>({ key: '', n: 0 });
  const selbstKey = `${address ?? ''}|${sicht}|${filterKey}`;
  const selbstRunden = vonSelbst.key === selbstKey ? vonSelbst.n : 0;
  const sucheWeiter = sicht !== 'alle' && !vorlaeufig && verlauf.length === 0 && !!cursor
    && (!filterAktiv || !!trefferSeite) && !ladeFehler && selbstRunden < LEER_WEITER;
  useEffect(() => {
    if (!sucheWeiter || laedt) return;
    setVonSelbst({ key: selbstKey, n: selbstRunden + 1 });
    void mehrLaden();
    // mehrLaden liest den aktuellen Stand; ausgeloest wird nur durch diese Bedingung.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucheWeiter, laedt, selbstKey, selbstRunden]);

  // ------------------------------------------------------------- Zahlen
  const zeigen = (wert: bigint | string | number) => verborgen ? PUNKTE : betragText(wert, locale, decimals);
  // Abgeschnitten, nie gerundet: Die Karte verspricht nicht mehr, als da ist.
  const g = betrag(betragZahl(account?.balance ?? 0, decimals));
  // Die Nachkommastellen stehen halb so gross: Sie brauchen halb so viel Platz.
  const guthabenGroesse = Math.max(34, Math.min(84,
    Math.floor(262 / (g.ganz.length * 0.5 + (g.bruch.length + g.trenner.length) * 0.26))));

  const pending = account?.pending ?? [];
  // Eigene Zahlungen nachhalten: erneut einreichen, Festhaengendes melden.
  const { fest } = useEigeneZahlungen(address, account);
  // Wann ist eine wartende Zahlung dran? Der Knoten rechnet es aus seiner
  // Warteschlange; ohne Angabe (aeltere Knoten) bleibt der bisherige Text.
  const wannText = (p: Wartend, n: number) => p.block != null && p.block > 1
    ? t.wallet.unterwegsVoraus(p.block, Math.round(p.block * 10))
    : t.wallet.unterwegsBlock(n);

  const einnahmen = useEinnahmen(address, neuester);
  const heute = tagSchluessel(Math.floor(Date.now() / 1000));
  const hatEinnahmen = !!einnahmen && einnahmen.some(x => x.summe !== '0');

  // ------------------------------------------------------------- Verlauf
  const tage = useMemo(() => gruppiere(verlauf, tagSchluessel, !filterAktiv), [verlauf, filterAktiv]);
  const gesternDatum = new Date(); gesternDatum.setDate(gesternDatum.getDate() - 1);
  const gestern = tagSchluessel(Math.floor(gesternDatum.getTime() / 1000));
  const jahr = String(new Date().getFullYear());
  const tagOhneJahr = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' });
  const tagMitJahr = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  const uhr = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });
  const tagTitel = (k: string) => {
    if (!k) return t.wallet.frueher;
    const [j, m, d] = k.split('-').map(Number);
    const datum = new Date(j, m - 1, d, 12);
    const text = (k.startsWith(jahr) ? tagOhneJahr : tagMitJahr).format(datum);
    return k === heute ? t.wallet.tagHeute(text) : k === gestern ? t.wallet.tagGestern(text) : text;
  };
  // Heute "vor 10 min", an frueheren Tagen die Uhrzeit -- der Tag steht darueber.
  const wann = (e: HistoryEintrag) => !e.timestamp ? ''
    : tagSchluessel(e.timestamp) === heute ? vorZeit(e.timestamp)
    : uhr.format(new Date(Number(e.timestamp) * 1000));
  const wer = (a: string | null | undefined) => name(a) ?? kurzAdresse(a, unb);

  const kopiere = async () => {
    if (!address) return;
    try { await navigator.clipboard.writeText(address); setKopiert(true); setTimeout(() => setKopiert(false), 1600); } catch { /* egal */ }
  };

  // "An …" / "Von …" mit der Adresse in Mono: Der Satz kommt aus der Sprache,
  // die Adresse wird an der Stelle des Platzhalters eingesetzt.
  const mitAdresse = (satz: (a: string) => string, adresse: string | null) => {
    const [vor, nach] = satz('\u0000').split('\u0000');
    return <>{vor}<span className="font-mono text-[14.5px] tracking-normal">{kurzAdresse(adresse, unb)}</span>{nach}</>;
  };
  const reihe = 'flex min-h-[62px] w-full items-center gap-3.5 border-b border-line py-[11px] text-left active:opacity-70';
  const oben = 'truncate text-[16px] font-medium leading-[1.3] tracking-[-.008em]';
  const unten = 'truncate text-[13.5px] leading-[1.4] text-dim';
  const zahlStil = 'tnum whitespace-nowrap font-mono text-[15px]';

  const zeile = (e: HistoryEintrag) => {
    const mining = istMining(e);
    const kontakt = mining ? null : name(e.counterparty);
    const notiz = mining ? '' : notizAusHex(e.memo);
    const grund = trefferGrund(e, q, suche, t);
    const satz = e.kind === 'out' ? t.wallet.an : t.wallet.von;
    return (
      <li key={schluessel(e)}>
        <button type="button" onClick={() => setOffen(e)} className={reihe}>
          <Punkt art={mining ? 'kette' : 'mensch'} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={oben}>
              {mining
                ? (e.kind === 'pool' ? t.wallet.poolBlock(zahl(e.height)) : t.wallet.rewardBlock(zahl(e.height)))
                : kontakt ? satz(kontakt) : mitAdresse(satz, e.counterparty)}
            </span>
            <span className={unten}>
              {grund ?? <>
                {wann(e)}
                {notiz && ` · ${t.wallet.zitat(notiz)}`}
                {e.kind === 'pool' && (e.shares ?? 0) > 1 && ` · ${t.wallet.aufgeteilt(e.shares!)}`}
              </>}
            </span>
          </span>
          <span className={`${zahlStil} ${e.kind === 'out' ? 'text-lese' : 'text-text'}`}>
            {e.kind === 'out' ? '−' : '+'}{zeigen(e.amount)}
          </span>
        </button>
      </li>
    );
  };

  const buendel = (z: Extract<Zeile<HistoryEintrag>, { art: 'mining' }>, tag: string) => {
    const auf = aufgeklappt.has(z.schluessel);
    const alle = ganz.has(z.schluessel);
    const teil = tag === teilTag;
    const sichtbar = alle ? z.eintraege : z.eintraege.slice(0, BUENDEL_ERSTE);
    const uebrig = z.eintraege.length - sichtbar.length;
    const art = z.pool > 0 && z.solo > 0 ? t.wallet.miningBeides : z.pool > 0 ? t.wallet.miningPool : t.wallet.miningSolo;
    return (
      <li key={z.schluessel}>
        <button type="button" aria-expanded={auf}
                onClick={() => setAufgeklappt(m => umschalten(m, z.schluessel))} className={reihe}>
          <Punkt art="kette" />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={oben}>{t.wallet.miningErtraege}</span>
            <span className={unten}>
              {teil ? t.wallet.miningLaedt(z.eintraege.length) : `${t.wallet.miningBloecke(z.eintraege.length)} · ${art}`}
            </span>
          </span>
          <span className={`${zahlStil} ${teil ? 'text-faint' : 'text-text'}`}>+{zeigen(z.summe)}</span>
          <span className="-mr-1 shrink-0 text-dim">{auf ? Zeichen.Unten() : Zeichen.Rechts()}</span>
        </button>
        {auf && (
          <ul className="ml-[28px] flex flex-col">
            {sichtbar.map(e => (
              <li key={schluessel(e)}>
                <button type="button" onClick={() => setOffen(e)}
                        className="flex min-h-[52px] w-full items-center justify-between gap-3 border-b border-line py-2 text-left active:opacity-70">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[14.5px] font-medium">
                      {e.kind === 'pool' ? t.wallet.poolBlock(zahl(e.height)) : t.wallet.rewardBlock(zahl(e.height))}
                    </span>
                    <span className="truncate text-[13px] text-dim">
                      {e.timestamp ? uhr.format(new Date(Number(e.timestamp) * 1000)) : ''}
                      {e.kind === 'pool' && (e.shares ?? 0) > 1 && ` · ${t.wallet.aufgeteilt(e.shares!)}`}
                    </span>
                  </span>
                  <span className="tnum whitespace-nowrap font-mono text-[14px] text-lese">+{zeigen(e.amount)}</span>
                </button>
              </li>
            ))}
            {(uebrig > 0 || alle) && z.eintraege.length > BUENDEL_ERSTE && (
              <li className="border-b border-line">
                <button type="button" onClick={() => setGanz(m => umschalten(m, z.schluessel))} className={VERWEIS}>
                  {alle ? t.wallet.weniger : t.wallet.weitere(uebrig)}
                </button>
              </li>
            )}
          </ul>
        )}
      </li>
    );
  };

  const chip = (an: boolean) => `h-9 shrink-0 rounded-full px-3.5 text-[14px] transition-colors ${
    an ? 'bg-text/[.14] font-semibold text-text' : 'font-medium text-lese shadow-[inset_0_0_0_1px_rgb(var(--line))]'}`;

  // Noch nie etwas bekommen: statt eines leeren Verlaufs steht da, wie die
  // ersten YSR in die Wallet kommen.
  let nichtsDa = false;
  try { nichtsDa = BigInt(account?.balance ?? 0) === 0n; } catch { /* dann wie gefuellt */ }
  const leer = !!account && nichtsDa && pending.length === 0 && (account.history?.length ?? 0) === 0
    && sicht === 'alle' && !filterAktiv && !suchOffen;

  return (
    <>
      <header className="relative flex h-11 items-center justify-between">
        <div className="flex items-center gap-2.5">
          <YZeichen g={26} />
          <span className="pt-px text-[14px] font-semibold tracking-[.2em]">YSKAR</span>
        </div>
        <button onClick={onEinstellungen} aria-label={t.allgemein.einstellungen}
                className="flex h-11 w-11 items-center justify-center rounded-full text-text shadow-[inset_0_0_0_1px_rgb(238_244_255/.26)] active:scale-95">
          {Icon.Zahnrad}
        </button>
      </header>
      <h1 className="sr-only">{t.wallet.titel}</h1>

      {/* Guthaben: gross und linksbuendig. Darunter die Adresse, dann die Aktionen. */}
      <section aria-label={t.wallet.guthaben} className="rise relative mt-5 flex flex-col items-start">
        <div className="flex h-11 w-full items-center justify-between">
          <span className="label">{t.wallet.gesamt}</span>
          <button type="button" onClick={verbergen} aria-pressed={verborgen}
                  aria-label={verborgen ? t.wallet.zeigen : t.wallet.verbergen}
                  className="-mr-[11px] flex h-11 w-11 items-center justify-center text-lese active:scale-95">
            {verborgen ? Zeichen.AugeZu(20) : Zeichen.Auge(20)}
          </button>
        </div>
        <p className="flex max-w-full flex-wrap items-baseline gap-x-2.5 gap-y-1">
          {account && verborgen ? (
            // Gezeichnete Punkte: Das Zeichen "•" fehlt in der Schrift und kaeme eckig.
            <span aria-hidden="true" className="flex h-[77px] items-center gap-[11px]">
              {Array.from({ length: 6 }, (_, i) => <span key={i} className="h-[13px] w-[13px] rounded-full bg-text/80" />)}
            </span>
          ) : (
            <span className="betrag" style={{ fontSize: guthabenGroesse }}>
              {!account ? '—' : <>{g.ganz}<small>{g.trenner}{g.bruch}</small></>}
            </span>
          )}
          <span className="font-mono text-[15px] text-lese">{symbol}</span>
        </p>
        {address && (
          <button type="button" onClick={kopiere} aria-label={t.wallet.adresseKopieren}
                  className="mt-4 flex h-11 items-center gap-2.5 rounded-full pl-4 pr-3.5 text-lese shadow-[inset_0_0_0_1px_rgb(var(--line))] active:scale-[.98]">
            <span className="font-mono text-[13.5px]">{kopiert ? t.allgemein.kopiert : kurzAdresse(address, unb)}</span>
            {kopiert ? Zeichen.Haken(16, 2.2) : Zeichen.Kopieren(16)}
          </button>
        )}
      </section>

      {/* Senden ist die Handlung eines Menschen: warm. In der leeren Wallet
          fuehrt stattdessen Empfangen. */}
      <div className="rise rise-1 mt-[22px] flex gap-2.5">
        <button type="button" onClick={leer ? onEmpfangen : onSenden} className={`${KNOPF} min-w-0 flex-1 !px-3`}>
          <span className="truncate">{leer ? t.wallet.empfangen : t.wallet.senden}</span>
        </button>
        <button type="button" onClick={leer ? onSenden : onEmpfangen}
                className={`${UMRISS} min-w-0 flex-1 !px-3 ${leer ? 'opacity-50' : ''}`}>
          <span className="truncate">{leer ? t.wallet.senden : t.wallet.empfangen}</span>
        </button>
        <button type="button" onClick={onScannen} aria-label={t.rd.wallet.scannen}
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-text shadow-[inset_0_0_0_1px_rgb(238_244_255/.42)] active:scale-95">
          {Zeichen.Scan()}
        </button>
      </div>

      {onSichern && <div className="rise rise-1 mt-6"><SicherungsHinweis kurz onClick={onSichern} /></div>}

      {leer && (
        <section className="rise rise-2 mt-[34px]">
          <h2 className="text-[18px] font-medium leading-[1.25] tracking-[-.012em]">{t.licht.leerTitel(symbol)}</h2>
          <div className="mt-3.5 border-t border-line">
            {[
              { nr: '01', titel: t.nav.mining, text: t.licht.leerMinenText, f: onMinen },
              { nr: '02', titel: t.wallet.empfangen, text: t.licht.leerEmpfangenText, f: onEmpfangen },
            ].map(z => (
              <button key={z.nr} type="button" onClick={z.f}
                      className="flex min-h-[78px] w-full items-center gap-3.5 border-b border-line py-[11px] text-left active:opacity-70">
                <span aria-hidden="true" className="w-[26px] shrink-0 self-start pt-[3px] font-mono text-[13px] text-dim">{z.nr}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[16px] font-medium leading-[1.3]">{z.titel}</span>
                  <span className="text-[13.5px] leading-[1.4] text-dim">{z.text}</span>
                </span>
                <span className="-mr-1 shrink-0 text-dim">{Zeichen.Rechts(18)}</span>
              </button>
            ))}
          </div>
          {/* Ehrlich dazu: Einen anderen Weg gibt es noch nicht. */}
          <p className="mt-4 text-[13px] leading-[1.45] text-dim">{t.licht.leerKaufen(symbol)}</p>
        </section>
      )}

      {hatEinnahmen && einnahmen && (
        <Einnahmen tage={einnahmen} symbol={symbol} decimals={decimals} verborgen={verborgen} />
      )}

      {fest.length > 0 && onErhoehen && (
        <section aria-label={t.wallet.festTitel} className="rise rise-2 mt-7">
          <h2 className="flex items-center gap-2 text-[13.5px] font-medium text-lamp">
            <Punkt art="wartet" className="!ml-0" />{t.wallet.festTitel}
          </h2>
          {fest.some(z => !z.abgelehnt) && (
            <p className="mt-2 text-[14.5px] leading-[1.45] text-lese">{t.wallet.festText}</p>
          )}
          {fest.some(z => z.abgelehnt) && (
            <p className="mt-2 text-[14.5px] leading-[1.45] text-lese">{t.wallet.abgelehntText}</p>
          )}
          <div className="mt-3 border-t border-line">
            {fest.slice(0, 3).map(z => (
              <button key={z.txid} type="button" onClick={() => onErhoehen(z)}
                      className="flex min-h-[56px] w-full items-center justify-between gap-3 border-b border-line py-2 text-left active:opacity-70">
                <span className="tnum truncate text-[15px]">{t.wallet.unterwegsAn(zeigen(z.betrag), symbol, wer(z.an))}</span>
                <span className="shrink-0 text-[14.5px] font-medium text-lamp">{z.abgelehnt ? t.wallet.neuSenden : t.wallet.erhoehen}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {pending.length > 0 && (
        <section aria-label={t.wallet.unterwegsTitel(pending.length)} className="rise rise-2 mt-7">
          <h2 className="border-b border-line pb-2 text-[13.5px] font-medium text-dim">{t.wallet.unterwegsTitel(pending.length)}</h2>
          {pending.slice(0, 3).map(p => (
            <div key={p.txid} className="flex min-h-[60px] items-center gap-3.5 border-b border-line py-[11px]">
              <Punkt art="wartet" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="tnum truncate text-[15px] font-medium">
                  {p.kind === 'out'
                    ? t.wallet.unterwegsAn(zeigen(p.amount), symbol, wer(p.to))
                    : t.wallet.unterwegsVon(zeigen(p.amount), symbol, wer(p.from))}
                </span>
                {(pending.length === 1 || (p.block != null && p.block > 1)) && (
                  <span className="text-[13.5px] leading-[1.4] text-dim">{wannText(p, 1)}</span>
                )}
              </span>
            </div>
          ))}
          {pending.length > 1 && (
            <p className="pt-2.5 text-[13px] leading-[1.45] text-dim">
              {pending.length > 3 && `${t.wallet.unterwegsMehr(pending.length - 3)} · `}{t.wallet.unterwegsBlock(pending.length)}
            </p>
          )}
        </section>
      )}

      {!leer && (
      <section aria-label={t.wallet.verlauf} className="rise rise-2 mt-6">
        <div className="flex h-11 items-center justify-between gap-2">
          <h2 className="text-[18px] font-medium tracking-[-.012em]">{t.wallet.verlauf}</h2>
          <div className="-mr-3 flex items-center">
            <ExternLink href={address ? `${EXPLORER_URL}#adr-${address}` : EXPLORER_URL}
                        className="inline-flex h-11 items-center gap-1.5 px-2 text-[13.5px] text-lese">
              {t.wallet.explorer}{Zeichen.Extern()}
            </ExternLink>
            <SuchKnopf offen={suchOffen} aktiv={filterAktiv} onClick={() => setSuchOffen(o => !o)} />
          </div>
        </div>
        <div role="group" aria-label={t.wallet.filter}
             className="-mx-1 mt-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none]">
          {/* Filter und Legende in einem: Die Farbe des Punkts sagt, woher ein Eintrag kommt. */}
          {([['alle', t.wallet.alle, null], ['mining', t.licht.legendeMining, 'kette'], ['transfer', t.licht.legendeMenschen, 'mensch']] as const).map(([v, text, punkt]) => (
            <button key={v} type="button" aria-pressed={sicht === v} onClick={() => setSicht(v)}
                    className={`${chip(sicht === v)} ${punkt ? 'flex items-center gap-1.5 !pl-2.5' : ''}`}>
              {punkt && <Punkt art={punkt} />}{text}
            </button>
          ))}
        </div>

        {suchOffen ? (
          <SuchLeiste eingabe={eingabe} onEingabe={setEingabe}
                      zeitraum={zeitraum} onZeitraum={setZeitraum} onDatum={() => setBlattOffen(true)} />
        ) : (
          <FilterChips eingabe={suche ? eingabe : ''} zeitraum={zeitraum}
                       onSucheWeg={() => { setEingabe(''); setQ(''); }}
                       onZeitWeg={() => setZeitraum(IMMER)}
                       onOeffnen={() => setSuchOffen(true)} />
        )}

        {filterAktiv && trefferSeite && trefferSeite.eintraege.length > 0 && (
          <div className="flex items-center justify-between pt-1">
            <Kappe>{t.wallet.treffer(trefferSeite.eintraege.length, !!trefferSeite.weiter)}</Kappe>
            <button onClick={filterWeg} className={VERWEIS}>{t.wallet.zuruecksetzen}</button>
          </div>
        )}

        {filterAktiv && !trefferSeite ? (
          <p className={`py-7 text-[14.5px] ${trefferFehler ? 'text-risk' : 'text-dim'}`}>
            {trefferFehler ? t.wallet.ladenFehler : t.wallet.laedtMehr}
          </p>
        ) : filterAktiv && verlauf.length === 0 ? (
          <div className="pb-5 pt-7">
            <p className="text-[18px] font-medium tracking-[-.012em]">{t.wallet.keineTreffer}</p>
            <p className="mt-2 max-w-[320px] text-[14.5px] leading-[1.45] text-lese">{t.wallet.keineTrefferText}</p>
            <button onClick={filterWeg} className={`${VERWEIS} mt-2`}>{t.wallet.filterZuruecksetzen}</button>
          </div>
        ) : verlauf.length === 0 ? (
          // Leer, aber weiter hinten kann noch etwas sein: Dann sagt der Knopf unten, was los ist.
          cursor && sicht !== 'alle' ? <div className="h-3" /> : (
            <p className="py-7 text-[14.5px] leading-[1.45] text-lese">
              {vorlaeufig ? t.wallet.laedtMehr : sicht === 'transfer' ? t.wallet.keineTreffer : t.wallet.leer}
            </p>
          )
        ) : (
          <div>
            {tage.map((tag, i) => (
              // Blockzeiten laufen nicht streng aufwaerts: Um Mitternacht kann
              // ein Tag zweimal vorkommen. Die Position macht den Schluessel eindeutig.
              <section key={`${tag.schluessel}#${tage.length - i}`}>
                <h3 className={`border-b border-line pb-2 text-[13px] leading-[1.45] text-dim ${i === 0 ? 'mt-4' : 'mt-5'}`}>
                  {tagTitel(tag.schluessel)}
                </h3>
                <ul>
                  {tag.zeilen.map(z => z.art === 'mining' ? buendel(z, tag.schluessel) : zeile(z.eintrag))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {/* Weiterblaettern bis zum allerersten Eintrag. */}
        {cursor ? (
          <div>
            <button onClick={mehrLaden} disabled={laedt} className={`${VERWEIS} h-[54px] w-full justify-center disabled:opacity-60`}>
              {laedt ? t.wallet.laedtMehr : t.wallet.aeltereLaden}
            </button>
            {ladeFehler && (
              <p className="pb-2 text-center text-[13px] text-risk">{t.wallet.ladenFehler}</p>
            )}
          </div>
        ) : verlauf.length > 0 && (
          <p className="py-4 text-center text-[13px] text-faint">
            {vorlaeufig ? t.wallet.laedtMehr : filterAktiv ? t.wallet.alleTreffer : t.wallet.alleGeladen}
          </p>
        )}
      </section>
      )}

      <ZeitraumBlatt offen={blattOffen} zeitraum={zeitraum}
                     onSchliessen={() => setBlattOffen(false)}
                     onAnwenden={z => { setZeitraum(z); setBlattOffen(false); }} />

      <Detail eintrag={offen} decimals={decimals} symbol={symbol} hoehe={hoehe}
              onSchliessen={() => setOffen(null)} />
    </>
  );
}
