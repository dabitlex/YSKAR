'use client';

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
import { useEinnahmen, heuteDazu } from '@/lib/wallet/useEinnahmen';
import Einnahmen from '@/components/wallet/Einnahmen';
import Detail from '@/components/wallet/Detail';
import { Gegenkachel, Kappe, MiningKachel, PUNKTE, Zeichen } from '@/components/wallet/Teile';

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
*/
type Richtung = 'alle' | 'ein' | 'aus';
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
                                    onSenden, onScannen, onEmpfangen, onEinstellungen }: {
  account: (Account & { history?: HistoryEintrag[]; historyWeiter?: string | null; pending?: Wartend[] }) | null;
  symbol: string; decimals: number; address: string | null;
  /** Aktuelle Hoehe der Kette -- fuer "n Bloecke danach" in den Einzelheiten. */
  hoehe: number | null;
  onSenden: () => void; onScannen: () => void; onEmpfangen: () => void;
  onEinstellungen: () => void;
}) {
  // Ausgewaehlte Transaktion. Als Blatt und nicht als eigene Seite: Man
  // will danach wieder in derselben Liste stehen, an derselben Stelle.
  const [offen, setOffen] = useState<HistoryEintrag | null>(null);
  const [filter, setFilter] = useState<'alle' | 'in' | 'out'>('alle');
  const [kopiert, setKopiert] = useState(false);
  const [verborgen, verbergen] = useGuthabenVerborgen();
  const { t, betrag, vorZeit, locale, zahl } = useT();
  const { name } = useKontakte();
  const unb = t.allgemein.unbekannt;

  const richtung: Richtung = filter === 'alle' ? 'alle' : filter === 'in' ? 'ein' : 'aus';
  // Erste Seite je Filter (nur "ein"/"aus"; "alle" kommt mit dem Konto).
  const [koepfe, setKoepfe] = useState<Record<'ein' | 'aus', Seite | null>>({ ein: null, aus: null });
  // Nachgeladene aeltere Seiten je Filter. null = noch nichts nachgeladen.
  const [aeltere, setAeltere] = useState<Record<Richtung, Seite | null>>({ alle: null, ein: null, aus: null });
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
  const filterKey = filterAktiv ? `${richtung}|${q}|${vonZeit ?? ''}|${bisZeit ?? ''}` : '';
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
    setKoepfe({ ein: null, aus: null });
    setAeltere({ alle: null, ein: null, aus: null });
    setTreffer(null); setRest(null);
    setAufgeklappt(new Set()); setGanz(new Set());
    setEingabe(''); setQ(''); setZeitraum(IMMER); setSuchOffen(false);
  }, [address]);

  // Erste Trefferseite, sobald sich ein Filter aendert.
  useEffect(() => {
    if (!address || !filterAktiv) return;
    let abgebrochen = false;
    setTrefferFehler(false);
    fetch(`/api/v2/account/${address}/verlauf?richtung=${richtung}&limit=40&${filterParameter()}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then((seite: Seite) => { if (!abgebrochen) setTreffer({ key: filterKey, seite }); })
      .catch(() => { if (!abgebrochen) setTrefferFehler(true); });
    return () => { abgebrochen = true; };
    // filterKey fasst richtung, q, von und bis zusammen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, filterKey]);
  const trefferSeite = filterAktiv && treffer?.key === filterKey ? treffer.seite : null;

  // Erste gefilterte Seite holen -- beim Umschalten und wenn neue Eintraege
  // dazukommen (der neueste Eintrag des Kontos aendert sich).
  const neuester = account?.history?.[0] ? schluessel(account.history[0]) : '';
  useEffect(() => {
    if (!address || richtung === 'alle') return;
    let abgebrochen = false;
    fetch(`/api/v2/account/${address}/verlauf?richtung=${richtung}&limit=40`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then((s: Seite) => { if (!abgebrochen) setKoepfe(k => ({ ...k, [richtung]: s })); })
      .catch(() => { /* bleibt bei der gefilterten Kontoliste */ });
    return () => { abgebrochen = true; };
  }, [address, richtung, neuester]);

  // Bis der Server antwortet, steht unter "Eingaenge"/"Ausgaenge" das
  // Passende aus der Kontoliste -- vorlaeufig: Es kann mehr geben.
  const vorlaeufig = !filterAktiv && richtung !== 'alle' && !koepfe[richtung];
  const kopf: Seite = richtung === 'alle'
    ? { eintraege: account?.history ?? [], weiter: account?.historyWeiter ?? null }
    : koepfe[richtung] ?? {
        // Ohne "Aeltere laden" -- der Cursor waere einer fuer alle Richtungen.
        eintraege: (account?.history ?? []).filter(e => richtung === 'aus' ? e.kind === 'out' : e.kind !== 'out'),
        weiter: null,
      };
  const nachgeladen = aeltere[richtung];
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
  const basis = `${address ?? ''}|${richtung}`;
  const letzter = !filterAktiv && !vorlaeufig && mehrDa && richtung !== 'aus'
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
    fetch(`/api/v2/account/${address}/verlauf?richtung=${richtung}&vor=${letzter.height}:${letzter.idx}` +
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
    // restKey fasst Adresse, Richtung und den letzten Eintrag zusammen.
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
      const r = await fetch(`/api/v2/account/${address}/verlauf?richtung=${richtung}&vor=${encodeURIComponent(cursor)}&limit=50${
        filterAktiv ? '&' + filterParameter() : ''}`);
      if (!r.ok) throw new Error(String(r.status));
      const s: Seite = await r.json();
      if (filterJetzt) {
        // Treffer anhaengen -- aber nur, wenn der Filter noch derselbe ist.
        setTreffer(tr => tr && tr.key === filterJetzt
          ? { key: tr.key, seite: { eintraege: zusammen(tr.seite.eintraege, s.eintraege), weiter: s.weiter } }
          : tr);
        return;
      }
      // Beim ersten Nachladen die erste Seite mit festhalten: Kommt spaeter
      // ein neuer Eintrag dazu, rutscht der bisher letzte aus der ersten
      // Seite -- er darf dann nicht zwischen beiden Seiten verloren gehen.
      setAeltere(a => ({ ...a, [richtung]: {
        eintraege: [...(a[richtung]?.eintraege ?? kopf.eintraege), ...s.eintraege],
        weiter: s.weiter,
      } }));
    } catch { setLadeFehler(true); }
    finally { setLaedt(false); }
  };

  // ------------------------------------------------------------- Zahlen
  const zeigen = (wert: bigint | string | number) => verborgen ? PUNKTE : betragText(wert, locale, decimals);
  // Abgeschnitten, nie gerundet: Die Karte verspricht nicht mehr, als da ist.
  const g = betrag(betragZahl(account?.balance ?? 0, decimals));
  const zeichen = g.ganz.length + g.bruch.length + g.trenner.length;
  const guthabenGroesse = Math.max(24, Math.min(46, Math.floor(270 / (zeichen * 0.58))));

  const pending = account?.pending ?? [];
  // Was gerade das Konto verlaesst -- die Betraege, wie sie auch in der Karte
  // darunter stehen. (Senden rechnet zusaetzlich die Gebuehren ab.)
  const unterwegs = pending.filter(p => p.kind === 'out')
    .reduce((s, p) => { try { return s + BigInt(p.amount); } catch { return s; } }, 0n);

  const einnahmen = useEinnahmen(address, neuester);
  const heute = tagSchluessel(Math.floor(Date.now() / 1000));
  // Heute dazugekommen: Mining und empfangene Ueberweisungen -- dieselbe
  // Zahl wie auf Home.
  const heuteWert = heuteDazu(einnahmen) ?? 0n;
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

  const zeile = (e: HistoryEintrag) => {
    const mining = istMining(e);
    const kontakt = mining ? null : name(e.counterparty);
    const notiz = mining ? '' : notizAusHex(e.memo);
    const grund = trefferGrund(e, q, suche, t);
    return (
      <li key={schluessel(e)}>
        <button type="button" onClick={() => setOffen(e)}
                className="flex min-h-[66px] w-full items-center gap-3 border-t border-line py-2.5 text-left active:opacity-70">
          {mining ? <MiningKachel /> : <Gegenkachel adresse={e.counterparty} richtung={e.kind === 'out' ? 'aus' : 'ein'} />}
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            {mining ? (
              <span className="truncate text-[14.5px] font-extrabold">
                {e.kind === 'pool' ? t.wallet.poolBlock(zahl(e.height)) : t.wallet.rewardBlock(zahl(e.height))}
              </span>
            ) : kontakt ? (
              <span className="truncate text-[14.5px] font-extrabold">{kontakt}</span>
            ) : (
              <span className="truncate font-mono text-[13.5px] font-medium">{kurzAdresse(e.counterparty, unb)}</span>
            )}
            <span className="truncate text-[12.5px] font-semibold text-dim">
              {grund ?? <>
                {wann(e)}
                {notiz && ` · ${t.wallet.zitat(notiz)}`}
                {e.kind === 'pool' && (e.shares ?? 0) > 1 && ` · ${t.wallet.aufgeteilt(e.shares!)}`}
              </>}
            </span>
          </span>
          <span className={`tnum whitespace-nowrap text-[15px] font-extrabold ${e.kind === 'out' ? 'text-text' : 'text-proof'}`}>
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
                onClick={() => setAufgeklappt(m => umschalten(m, z.schluessel))}
                className="flex min-h-[66px] w-full items-center gap-3 border-t border-line py-2.5 text-left active:opacity-70">
          <MiningKachel />
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="truncate text-[14.5px] font-extrabold">{t.wallet.miningErtraege}</span>
            <span className="truncate text-[12.5px] font-semibold text-dim">
              {teil ? t.wallet.miningLaedt(z.eintraege.length) : `${t.wallet.miningBloecke(z.eintraege.length)} · ${art}`}
            </span>
          </span>
          <span className={`tnum whitespace-nowrap text-[15px] font-extrabold ${teil ? 'text-faint' : 'text-proof'}`}>
            +{zeigen(z.summe)}
          </span>
          <span className="shrink-0 text-dim">{auf ? Zeichen.Unten() : Zeichen.Rechts()}</span>
        </button>
        {auf && (
          <ul className="mb-2.5 ml-[22px] flex flex-col border-l-2 border-line py-0.5 pl-4">
            {sichtbar.map(e => (
              <li key={schluessel(e)}>
                <button type="button" onClick={() => setOffen(e)}
                        className="flex min-h-[48px] w-full items-center justify-between gap-3 py-1.5 text-left active:opacity-70">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[13.5px] font-bold">
                      {e.kind === 'pool' ? t.wallet.poolBlock(zahl(e.height)) : t.wallet.rewardBlock(zahl(e.height))}
                    </span>
                    <span className="truncate text-[12px] font-semibold text-dim">
                      {e.timestamp ? uhr.format(new Date(Number(e.timestamp) * 1000)) : ''}
                      {e.kind === 'pool' && (e.shares ?? 0) > 1 && ` · ${t.wallet.aufgeteilt(e.shares!)}`}
                    </span>
                  </span>
                  <span className="tnum whitespace-nowrap text-[14px] font-extrabold text-proof">+{zeigen(e.amount)}</span>
                </button>
              </li>
            ))}
            {(uebrig > 0 || alle) && z.eintraege.length > BUENDEL_ERSTE && (
              <li>
                <button type="button" onClick={() => setGanz(m => umschalten(m, z.schluessel))}
                        className="min-h-[44px] w-full text-left text-[13px] font-extrabold text-work">
                  {alle ? t.wallet.weniger : t.wallet.weitere(uebrig)}
                </button>
              </li>
            )}
          </ul>
        )}
      </li>
    );
  };

  const chip = (an: boolean) => `h-10 shrink-0 rounded-[13px] px-4 text-[13px] font-extrabold transition-colors ${
    an ? 'bg-text text-surface' : 'bg-raised text-dim'}`;

  return (
    <>
      <div className="schein pointer-events-none absolute inset-x-0 top-0 h-72" />
      <header className="relative mb-3.5 flex items-center justify-between">
        <h1 className="text-[24px] font-extrabold tracking-[-0.02em]">{t.wallet.titel}</h1>
        <button onClick={onEinstellungen} aria-label={t.allgemein.einstellungen}
                className="panel flex h-9 w-9 items-center justify-center !rounded-full text-text">{Icon.Zahnrad}</button>
      </header>

      {/* Kristallkarte: das Guthaben, die Adresse und was gerade in Bewegung ist. */}
      <section aria-label={t.wallet.guthaben}
               className="hero rise relative overflow-hidden px-5 pb-5 pt-3.5 shadow-[0_22px_40px_-26px_rgba(20,48,95,.85)]"
               style={{ borderRadius: 28 }}>
        <div aria-hidden="true" className="absolute -bottom-6 -right-[38px] h-[172px] w-[264px]">
          <div className="absolute inset-0 bg-white/[.07]" style={{ clipPath: 'polygon(27% 33%, 39% 60%, 18% 99%, 0.5% 99%)' }} />
          <div className="absolute inset-0 bg-white/[.12]" style={{ clipPath: 'polygon(49.5% 1%, 64% 37%, 55.5% 54%, 43% 55%, 34.7% 37%)' }} />
          <div className="absolute inset-0 bg-white/[.05]" style={{ clipPath: 'polygon(49.5% 48%, 75% 99%, 23.5% 99%)' }} />
          <div className="absolute inset-0 bg-white/[.09]" style={{ clipPath: 'polygon(72.4% 31.5%, 99.5% 99%, 80% 99%, 59.4% 58.5%)' }} />
        </div>
        <div className="relative flex items-center justify-between gap-2.5">
          <div className="flex min-w-0 items-center gap-0.5">
            <span className="truncate text-[11.5px] font-bold uppercase tracking-[.08em] text-white/[.78]">{t.wallet.guthaben}</span>
            <button type="button" onClick={verbergen} aria-pressed={verborgen}
                    aria-label={verborgen ? t.wallet.zeigen : t.wallet.verbergen}
                    className="flex h-11 w-11 shrink-0 items-center justify-center text-white/[.78] active:scale-95">
              {verborgen ? Zeichen.AugeZu() : Zeichen.Auge()}
            </button>
          </div>
          {address && (
            <button type="button" onClick={kopiere} aria-label={t.wallet.adresseKopieren}
                    className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-white/[.14] pl-3.5 pr-3 text-white active:scale-[.98]">
              <span className="font-mono text-[12.5px]">{kopiert ? t.allgemein.kopiert : kurzAdresse(address, unb)}</span>
              {kopiert ? Zeichen.Haken(17, 2.2) : Zeichen.Kopieren()}
            </button>
          )}
        </div>
        <p className="tnum relative mt-1.5 flex flex-wrap items-baseline gap-x-2">
          <span className="font-extrabold leading-none tracking-[-0.04em]" style={{ fontSize: verborgen ? 40 : guthabenGroesse }}>
            {!account ? '—' : verborgen ? '••••••' : <>
              {g.ganz}<span className="font-bold text-white/[.62]">{g.trenner}{g.bruch}</span>
            </>}
          </span>
          <span className="text-[15px] font-extrabold text-white/[.78]">{symbol}</span>
        </p>
        {(heuteWert > 0n || unterwegs > 0n) && (
          <div className="relative mt-4 flex flex-wrap gap-2">
            {heuteWert > 0n && (
              <span className="tnum inline-flex h-[30px] items-center gap-1.5 rounded-full pl-[9px] pr-3 text-[12.5px] font-extrabold"
                    style={{ background: 'rgba(46, 190, 133, .24)', color: '#9BF3CF' }}>
                {Zeichen.Hoch()}{t.wallet.chipHeute(zeigen(heuteWert))}
              </span>
            )}
            {unterwegs > 0n && (
              <span className="tnum inline-flex h-[30px] items-center gap-1.5 rounded-full pl-[9px] pr-3 text-[12.5px] font-extrabold"
                    style={{ background: 'rgba(242, 178, 92, .24)', color: '#FFD596' }}>
                {Zeichen.Uhr()}{t.wallet.chipUnterwegs(zeigen(unterwegs))}
              </span>
            )}
          </div>
        )}
      </section>

      <div className="rise rise-1 mt-3.5 flex items-center gap-2.5">
        <button type="button" onClick={onSenden}
                className="flex h-[54px] min-w-0 flex-1 items-center justify-center gap-2 rounded-[18px] bg-work text-[15px] font-extrabold text-white shadow-[0_12px_24px_-14px_rgb(var(--work)/.8)] active:scale-[.985]">
          {Zeichen.Hoch(20, 2.1)}<span className="truncate">{t.wallet.senden}</span>
        </button>
        <button type="button" onClick={onScannen} aria-label={t.senden.scanAria}
                className="panel flex h-[54px] w-[54px] shrink-0 items-center justify-center !rounded-full text-work active:scale-95">
          {Zeichen.Scan()}
        </button>
        <button type="button" onClick={onEmpfangen}
                className="panel flex h-[54px] min-w-0 flex-1 items-center justify-center gap-2 !rounded-[18px] text-[15px] font-extrabold active:scale-[.985]">
          {Zeichen.Runter(20, 2.1)}<span className="truncate">{t.wallet.empfangen}</span>
        </button>
      </div>

      {hatEinnahmen && einnahmen && (
        <Einnahmen tage={einnahmen} symbol={symbol} decimals={decimals} verborgen={verborgen} />
      )}

      {pending.length > 0 && (
        <section aria-label={t.wallet.unterwegsTitel(pending.length)}
                 className="warte rise rise-2 mt-3.5 flex items-center gap-3 rounded-[20px] px-4 py-[13px]">
          <span aria-hidden="true" className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-surface">
            {Zeichen.Uhr(19, 2)}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[14px] font-extrabold">{t.wallet.unterwegsTitel(pending.length)}</span>
            {pending.slice(0, 3).map(p => (
              <span key={p.txid} className="tnum text-[12.5px] font-semibold leading-[1.4] text-text">
                {p.kind === 'out'
                  ? t.wallet.unterwegsAn(zeigen(p.amount), symbol, wer(p.to))
                  : t.wallet.unterwegsVon(zeigen(p.amount), symbol, wer(p.from))}
                {pending.length === 1 && ` · ${t.wallet.unterwegsBlock(1)}`}
              </span>
            ))}
            {pending.length > 1 && (
              <span className="text-[12.5px] font-semibold leading-[1.4] text-text">
                {pending.length > 3 && `${t.wallet.unterwegsMehr(pending.length - 3)} · `}{t.wallet.unterwegsBlock(pending.length)}
              </span>
            )}
          </div>
        </section>
      )}

      <section aria-label={t.wallet.verlauf} className="panel rise rise-2 mt-3.5 !rounded-[24px] px-[18px] pb-1.5 pt-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[17px] font-extrabold tracking-[-0.01em]">{t.wallet.verlauf}</h2>
          <div className="flex items-center gap-1">
            <ExternLink href={address ? `${EXPLORER_URL}#adr-${address}` : EXPLORER_URL}
                        className="inline-flex h-11 items-center gap-1.5 px-2 text-[13px] font-extrabold text-work">
              {t.wallet.explorer}{Zeichen.Extern()}
            </ExternLink>
            <SuchKnopf offen={suchOffen} aktiv={filterAktiv} onClick={() => setSuchOffen(o => !o)} />
          </div>
        </div>
        <div role="group" aria-label={t.wallet.filter}
             className="-mx-1 mt-2 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none]">
          {([['alle', t.wallet.alle], ['in', t.wallet.eingaenge], ['out', t.wallet.ausgaenge]] as const).map(([v, text]) => (
            <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)} className={chip(filter === v)}>
              {text}
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
          <div className="flex items-center justify-between pt-2">
            <Kappe>{t.wallet.treffer(trefferSeite.eintraege.length, !!trefferSeite.weiter)}</Kappe>
            <button onClick={filterWeg} className="text-[12px] font-extrabold text-work">{t.wallet.zuruecksetzen}</button>
          </div>
        )}

        {filterAktiv && !trefferSeite ? (
          <p className={`py-6 text-center text-[13px] font-semibold ${trefferFehler ? 'text-risk' : 'text-faint'}`}>
            {trefferFehler ? t.wallet.ladenFehler : t.wallet.laedtMehr}
          </p>
        ) : filterAktiv && verlauf.length === 0 ? (
          <div className="px-2 pb-5 pt-6 text-center">
            <span className="mb-2.5 inline-flex h-[46px] w-[46px] items-center justify-center rounded-[15px] bg-raised text-faint">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
            </span>
            <p className="text-[14.5px] font-extrabold">{t.wallet.keineTreffer}</p>
            <p className="mx-auto mb-3.5 mt-1 max-w-[280px] text-[12.5px] font-semibold leading-relaxed text-dim">{t.wallet.keineTrefferText}</p>
            <button onClick={filterWeg} className="rounded-[12px] bg-raised px-4 py-2 text-[13px] font-extrabold text-text">
              {t.wallet.filterZuruecksetzen}
            </button>
          </div>
        ) : verlauf.length === 0 ? (
          <p className="py-6 text-center text-[13.5px] font-semibold leading-relaxed text-dim">{t.wallet.leer}</p>
        ) : (
          <div>
            {tage.map((tag, i) => (
              // Blockzeiten laufen nicht streng aufwaerts: Um Mitternacht kann
              // ein Tag zweimal vorkommen. Die Position macht den Schluessel eindeutig.
              <section key={`${tag.schluessel}#${tage.length - i}`}>
                <Kappe als="h3" className={`mb-0.5 block ${i === 0 ? 'mt-[18px]' : 'mt-3.5'}`}>{tagTitel(tag.schluessel)}</Kappe>
                <ul>
                  {tag.zeilen.map(z => z.art === 'mining' ? buendel(z, tag.schluessel) : zeile(z.eintrag))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {/* Weiterblaettern bis zum allerersten Eintrag. */}
        {cursor ? (
          <div className="border-t border-line">
            <button onClick={mehrLaden} disabled={laedt}
                    className="h-[50px] w-full text-[13.5px] font-extrabold text-work disabled:opacity-60">
              {laedt ? t.wallet.laedtMehr : t.wallet.aeltereLaden}
            </button>
            {ladeFehler && (
              <p className="pb-2 text-center text-[12px] font-semibold text-risk">{t.wallet.ladenFehler}</p>
            )}
          </div>
        ) : verlauf.length > 0 && (
          <p className="border-t border-line py-3.5 text-center text-[12px] font-semibold text-faint">
            {vorlaeufig ? t.wallet.laedtMehr : filterAktiv ? t.wallet.alleTreffer : t.wallet.alleGeladen}
          </p>
        )}
      </section>

      <ZeitraumBlatt offen={blattOffen} zeitraum={zeitraum}
                     onSchliessen={() => setBlattOffen(false)}
                     onAnwenden={z => { setZeitraum(z); setBlattOffen(false); }} />

      <Detail eintrag={offen} decimals={decimals} symbol={symbol} hoehe={hoehe}
              onSchliessen={() => setOffen(null)} />
    </>
  );
}
