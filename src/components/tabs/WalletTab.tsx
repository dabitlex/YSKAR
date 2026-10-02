'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, Button } from '@/components/ui/Primitives';
import { Zahl, Etikett, Karte, Segment, Identicon } from '@/components/ui/Bausteine';
import type { Account, Wartend } from '@/hooks/useMining';
import { useT } from '@/i18n';
import { sucheAus } from '@/lib/api/suche';
import { type Zeitraum, IMMER, grenzen } from '@/lib/wallet/zeitraum';
import { SuchKnopf, SuchLeiste, FilterChips, ZeitraumBlatt, trefferGrund } from '@/components/wallet/VerlaufSuche';
import { ExternLink, EXPLORER_URL } from '@/components/ui/ExternLink';

/**
 * Wallet.
 *
 * Aufbau wie in Bank- und Wallet-Apps ueblich, und das aus gutem Grund:
 * Guthaben als Hauptflaeche ganz oben, Aktionen direkt daran, darunter der
 * Verlauf. Wer die App oeffnet, will genau in dieser Reihenfolge wissen,
 * was los ist.
 *
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

/** Zusammenfuehren ohne Doppel, neueste zuerst -- nach Block, dann Position im Block. */
function zusammen(...listen: HistoryEintrag[][]): HistoryEintrag[] {
  const m = new Map<string, HistoryEintrag>();
  for (const l of listen) for (const e of l) if (!m.has(schluessel(e))) m.set(schluessel(e), e);
  return [...m.values()].sort((a, b) => b.height - a.height || (b.idx ?? 0) - (a.idx ?? 0));
}

const kurz = (a: string | null, sonst: string) => a ? `${a.slice(0, 10)}…${a.slice(-4)}` : sonst;

export default function WalletTab({ account, symbol, decimals, address,
                                    onSenden, onScannen, onEmpfangen, onEinstellungen, onExplorer }: {
  account: (Account & { history?: HistoryEintrag[]; historyWeiter?: string | null; pending?: Wartend[] }) | null;
  symbol: string; decimals: number; address: string | null;
  onSenden: () => void; onScannen: () => void; onEmpfangen: () => void;
  onEinstellungen: () => void; onExplorer: () => void;
}) {
  // Ausgewaehlte Transaktion. Als Ueberlagerung und nicht als eigene Seite:
  // Man will danach wieder in derselben Liste stehen, an derselben Stelle.
  const [offen, setOffen] = useState<HistoryEintrag | null>(null);
  const [filter, setFilter] = useState<'alle' | 'in' | 'out'>('alle');
  const [kopiert, setKopiert] = useState(false);
  const { t, betrag, vorZeit, locale } = useT();
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

  // Andere Wallet: alles Nachgeladene gehoert nicht mehr hierher.
  useEffect(() => {
    setKoepfe({ ein: null, aus: null });
    setAeltere({ alle: null, ein: null, aus: null });
    setTreffer(null);
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

  const kopf: Seite = richtung === 'alle'
    ? { eintraege: account?.history ?? [], weiter: account?.historyWeiter ?? null }
    : koepfe[richtung] ?? {
        // Bis der Server antwortet: das Passende aus der Kontoliste, ohne
        // "Aeltere laden" -- der Cursor waere einer fuer alle Richtungen.
        eintraege: (account?.history ?? []).filter(e => richtung === 'aus' ? e.kind === 'out' : e.kind !== 'out'),
        weiter: null,
      };
  const nachgeladen = aeltere[richtung];
  const ungefiltert = useMemo(() => zusammen(kopf.eintraege, (nachgeladen ?? LEER).eintraege),
    [kopf.eintraege, nachgeladen]);
  const verlauf = filterAktiv ? (trefferSeite?.eintraege ?? []) : ungefiltert;
  // Weiterblaettern: ab der letzten nachgeladenen Seite, sonst ab der ersten.
  const cursor = filterAktiv ? (trefferSeite?.weiter ?? null)
    : nachgeladen ? nachgeladen.weiter : kopf.weiter;

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

  const g = betrag(Number(account?.balance ?? 0) / 10 ** decimals);
  // Wartende haben noch keinen Block und keine Blockzeit -- bei aktiver
  // Suche gehoeren sie nicht in die Trefferliste.
  const wartend = filterAktiv ? []
    : (account?.pending ?? []).filter(p => filter === 'alle' || p.kind === filter);
  const unterwegs = (account?.pending ?? []).filter(p => p.kind === 'out')
    .reduce((s, p) => s + Number(p.amount) + Number(p.fee), 0) / 10 ** decimals;

  // Nach Tagen gruppieren: Heute, Gestern, Frueher.
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const gestern = new Date(heute); gestern.setDate(gestern.getDate() - 1);
  // Aeltere Eintraege nach Datum, damit ein langer Verlauf lesbar bleibt.
  const tagFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  const gruppe = (ts: string | null) => {
    if (!ts) return t.wallet.frueher;
    const d = new Date(Number(ts) * 1000);
    return d >= heute ? t.wallet.heute : d >= gestern ? t.wallet.gestern : tagFormat.format(d);
  };
  const gruppen: { name: string; eintraege: HistoryEintrag[] }[] = [];
  for (const e of verlauf) {
    const n = gruppe(e.timestamp);
    const letzte = gruppen[gruppen.length - 1];
    if (letzte && letzte.name === n) letzte.eintraege.push(e); else gruppen.push({ name: n, eintraege: [e] });
  }

  const kopiere = async () => {
    if (!address) return;
    try { await navigator.clipboard.writeText(address); setKopiert(true); setTimeout(() => setKopiert(false), 1600); } catch { /* egal */ }
  };

  return (
    <>
      <div className="schein pointer-events-none absolute inset-x-0 top-0 h-72" />
      <header className="relative mb-5 flex items-center justify-between">
        <h1 className="text-[24px] font-extrabold tracking-[-0.02em]">{t.wallet.titel}</h1>
        <button onClick={onEinstellungen} aria-label={t.allgemein.einstellungen}
                className="panel flex h-9 w-9 items-center justify-center !rounded-full text-text">{Icon.Zahnrad}</button>
      </header>

      <section className="relative rise flex flex-col items-center gap-2.5 text-center">
        <Identicon adresse={address} size={64} />
        <div className="mt-1">
          {account
            ? <Zahl ganz={g.ganz} bruch={g.bruch} trenner={g.trenner} einheit={symbol} size={46} className="justify-center" />
            : <Zahl ganz="—" einheit={symbol} size={46} className="justify-center" />}
        </div>
        {address && (
          <button onClick={kopiere}
                  className="panel inline-flex items-center gap-2 !rounded-full py-[7px] pl-3.5 pr-3 text-dim">
            <span className="font-mono text-[12.5px]">{kopiert ? t.allgemein.kopiert : kurz(address, unb)}</span>
            <span className="text-work">{Icon.Kopieren}</span>
          </button>
        )}
        {unterwegs > 0 && (
          <p className="tnum text-[12px] font-bold warte-text">
            {t.wallet.unterwegs(unterwegs.toFixed(4), symbol)}
          </p>
        )}
      </section>

      <div className="rise rise-1 mt-5 grid grid-cols-2 gap-2.5">
        <Button onClick={onSenden}>{Icon.Senden}{t.wallet.senden}</Button>
        <Button variant="quiet" onClick={onEmpfangen}>{Icon.Empfangen}{t.wallet.empfangen}</Button>
      </div>
      <div className="rise rise-1 mt-2.5 grid grid-cols-2 gap-2.5">
        <button onClick={onScannen} className="panel flex items-center justify-center gap-2 !rounded-[16px] py-2.5 text-[13px] font-extrabold text-dim">{Icon.Scan}{t.wallet.scannen}</button>
        <button onClick={onExplorer} className="panel flex items-center justify-center gap-2 !rounded-[16px] py-2.5 text-[13px] font-extrabold text-dim">{Icon.Verlauf}{t.wallet.explorer}</button>
      </div>

      <Karte className="rise rise-2 mt-5 px-[18px] pt-4 pb-1">
        {/* Bei langen Beschriftungen (z. B. Polnisch) rutscht die Auswahl
            unter den Titel, statt aus der Karte zu ragen. */}
        <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
          <span className="text-[15px] font-extrabold">{t.wallet.verlauf}</span>
          <div className="flex items-center gap-1.5">
            <Segment label={t.wallet.verlauf} wert={filter} onChange={setFilter}
                     werte={[{ v: 'alle', text: t.wallet.alle }, { v: 'in', text: t.wallet.eingaenge }, { v: 'out', text: t.wallet.ausgaenge }]} />
            <SuchKnopf offen={suchOffen} aktiv={filterAktiv} onClick={() => setSuchOffen(o => !o)} />
          </div>
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
            <Etikett>{t.wallet.treffer(trefferSeite.eintraege.length, !!trefferSeite.weiter)}</Etikett>
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
        ) : verlauf.length === 0 && wartend.length === 0 ? (
          <p className="py-6 text-center text-[13.5px] font-semibold leading-relaxed text-dim">{t.wallet.leer}</p>
        ) : (
          <ul>
            {wartend.length > 0 && <Etikett className="block pb-1 pt-3">{t.wallet.wartet(wartend.length)}</Etikett>}
            {wartend.map(p => (
              <Eintrag key={p.txid} art="wait" adresse={p.kind === 'out' ? p.to : p.from}
                titel={p.kind === 'out' ? t.wallet.an(kurz(p.to, unb)) : t.wallet.von(kurz(p.from, unb))}
                unten={p.kind === 'out'
                  ? t.wallet.wartetGebuehr((Number(p.fee) / 10 ** decimals).toFixed(4))
                  : t.wallet.wartetBlock}
                betrag={`${p.kind === 'out' ? '−' : '+'}${(Number(p.amount) / 10 ** decimals).toFixed(4)}`} symbol={symbol} />
            ))}
            {gruppen.map(gr => (
              <li key={gr.name}>
                <Etikett className="block pb-1 pt-3">{gr.name}</Etikett>
                <ul>
                  {gr.eintraege.map(e => (
                    <Eintrag key={schluessel(e)}
                      onClick={() => setOffen(e)}
                      art={e.kind === 'out' ? 'out' : 'in'}
                      adresse={e.kind === 'reward' ? `reward-${e.height}`
                        : e.kind === 'pool' ? `pool-${e.height}` : e.counterparty}
                      titel={e.kind === 'reward' ? t.wallet.blockreward(e.height)
                        : e.kind === 'pool' ? t.wallet.poolAnteil(e.height)
                        : e.kind === 'in' ? t.wallet.von(kurz(e.counterparty, unb))
                        : t.wallet.an(kurz(e.counterparty, unb))}
                      unten={trefferGrund(e, q, suche, t) ?? (vorZeit(e.timestamp) +
                        (e.kind === 'out' && Number(e.fee) > 0
                          ? ` · ${t.wallet.gebuehr((Number(e.fee) / 10 ** decimals).toFixed(4))}` : ''))}
                      betrag={`${e.kind === 'out' ? '−' : '+'}${
                        (Number(e.amount) / 10 ** decimals).toFixed(4)}`} symbol={symbol}
                      gut={e.kind !== 'out'} />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}

        {/* Weiterblaettern bis zum allerersten Eintrag. */}
        {cursor ? (
          <div className="border-t border-line py-3">
            <button onClick={mehrLaden} disabled={laedt}
                    className="w-full rounded-[14px] py-2.5 text-[13.5px] font-extrabold text-work disabled:opacity-60">
              {laedt ? t.wallet.laedtMehr : t.wallet.aeltereLaden}
            </button>
            {ladeFehler && (
              <p className="pt-1 text-center text-[12px] font-semibold text-risk">{t.wallet.ladenFehler}</p>
            )}
          </div>
        ) : verlauf.length > 0 && (
          <p className="border-t border-line py-3 text-center text-[12px] font-semibold text-faint">
            {filterAktiv ? t.wallet.alleTreffer : t.wallet.alleGeladen}
          </p>
        )}
      </Karte>

      <ZeitraumBlatt offen={blattOffen} zeitraum={zeitraum}
                     onSchliessen={() => setBlattOffen(false)}
                     onAnwenden={z => { setZeitraum(z); setBlattOffen(false); }} />

      {offen && (
        <Detail eintrag={offen} decimals={decimals} symbol={symbol}
                onSchliessen={() => setOffen(null)} />
      )}
    </>
  );
}

/**
 * Einzelheiten zu einer Transaktion.
 *
 * Zeigt die vollstaendige Kennung und die vollstaendige Gegenadresse, nicht
 * die gekuerzte Fassung aus der Liste. Wer pruefen will, ob das Geld bei der
 * richtigen Adresse gelandet ist, muss alle Zeichen sehen -- gekuerzte
 * Adressen lassen sich faelschen, indem man Anfang und Ende trifft.
 */
function Detail({ eintrag, decimals, symbol, onSchliessen }: {
  eintrag: HistoryEintrag; decimals: number; symbol: string;
  onSchliessen: () => void;
}) {
  const [kopiert, setKopiert] = useState<string | null>(null);
  const { t, datum } = useT();
  const betrag = Number(eintrag.amount) / 10 ** decimals;
  const gebuehr = Number(eintrag.fee) / 10 ** decimals;
  const eingang = eintrag.kind !== 'out';

  const kopiere = async (was: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setKopiert(was);
      setTimeout(() => setKopiert(null), 1600);
    } catch { /* nicht ueberall erlaubt */ }
  };

  const titel = eintrag.kind === 'reward' ? t.wallet.dBlockreward
    : eintrag.kind === 'pool' ? t.wallet.dPoolAnteil
    : eintrag.kind === 'in' ? t.wallet.dEmpfangen : t.wallet.dGesendet;

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-text/40"
         onClick={onSchliessen}>
      <div className="rise max-h-[85dvh] overflow-y-auto rounded-t-[24px] bg-surface p-5
                      pb-[calc(20px+var(--unten))]"
           onClick={e => e.stopPropagation()}>
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-line" />

        <p className="label">{titel}</p>
        <div className="mt-1 flex items-baseline gap-2 leading-none">
          <span className={`tnum text-[32px] font-extrabold tracking-[-0.03em] ${
            eingang ? 'text-proof' : 'text-text'}`}>
            {eingang ? '+' : '−'}{betrag.toFixed(4)}
          </span>
          <span className="text-[15px] text-dim">{symbol}</span>
        </div>

        <dl className="mt-6">
          <Feld label={t.wallet.status} wert={
            <span className="text-proof">{t.wallet.bestaetigt(eintrag.height)}</span>} />
          <Feld label={t.wallet.zeitpunkt} wert={eintrag.timestamp ? datum(eintrag.timestamp) : '—'} />
          {(eintrag.kind === 'in' || eintrag.kind === 'out') && (
            <Feld label={eingang ? t.wallet.dVon : t.wallet.dAn} mono umbruch
                  wert={eintrag.counterparty ?? t.allgemein.unbekannt}
                  onKopieren={eintrag.counterparty
                    ? () => kopiere('adresse', eintrag.counterparty!) : undefined}
                  kopiert={kopiert === 'adresse'} />
          )}
          {eintrag.kind === 'out' && gebuehr > 0 && (
            <Feld label={t.wallet.netzgebuehr} wert={`${gebuehr.toFixed(4)} ${symbol}`} />
          )}
          {/* Nur bei Ueberweisungen: Bei einer Coinbase stehen im Notizfeld
              Bytes des Miners (Extranonce, Pool-Kennung), keine Notiz. */}
          {eintrag.memo && (eintrag.kind === 'in' || eintrag.kind === 'out') && (
            <Feld label={t.wallet.notiz} wert={new TextDecoder().decode(
              Uint8Array.from(eintrag.memo.match(/../g) ?? [],
                              h => parseInt(h, 16)))} />
          )}
          <Feld label={t.wallet.transaktion} mono umbruch wert={eintrag.txid}
                onKopieren={() => kopiere('txid', eintrag.txid)}
                kopiert={kopiert === 'txid'} />
        </dl>

        <div className="mt-6 space-y-3">
          <ExternLink href={`${EXPLORER_URL}#block-${eintrag.height}`}
             className="block rounded-[14px] border border-line bg-surface py-3.5
                        text-center text-[15px] font-bold">
            {t.wallet.imExplorer}
          </ExternLink>
          <Button variant="quiet" onClick={onSchliessen}>{t.allgemein.schliessen}</Button>
        </div>
      </div>
    </div>
  , document.body);
}

function Feld({ label, wert, mono, umbruch, onKopieren, kopiert }: {
  label: string; wert: React.ReactNode; mono?: boolean; umbruch?: boolean;
  onKopieren?: () => void; kopiert?: boolean;
}) {
  const { t } = useT();
  return (
    <div className="border-b border-line py-3 last:border-0">
      <dt className="flex items-baseline justify-between text-[12px] font-semibold text-faint">
        {label}
        {onKopieren && (
          <button onClick={onKopieren} className="font-bold text-work">
            {kopiert ? t.allgemein.kopiert : t.allgemein.kopieren}
          </button>
        )}
      </dt>
      <dd className={`mt-1 text-[13.5px] ${mono ? 'font-mono' : ''} ${
        umbruch ? 'break-all' : ''}`}>{wert}</dd>
    </div>
  );
}

function Eintrag({ art, adresse, titel, unten, betrag, symbol, gut, onClick }: {
  art: 'in' | 'out' | 'wait'; adresse: string | null; titel: string; unten: React.ReactNode;
  betrag: string; symbol: string; gut?: boolean; onClick?: () => void;
}) {
  const { t } = useT();
  const Zeile = onClick ? 'button' : 'div';
  return (
    <li>
    <Zeile onClick={onClick}
      className={`flex w-full items-center gap-3 border-t border-line py-3 text-left ${
        onClick ? 'active:opacity-70' : ''}`}>
      <Identicon adresse={adresse} size={40} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 truncate text-[14px] font-extrabold">
          {titel}
          {art === 'wait' && <span className="warte rounded-full px-1.5 py-0.5 text-[10px] font-extrabold">{t.wallet.wartetKurz}</span>}
        </span>
        <span className="truncate font-mono text-[11.5px] text-faint">{unten}</span>
      </span>
      <span className="flex flex-col items-end gap-0.5">
        <span className={`tnum whitespace-nowrap text-[14.5px] font-extrabold ${
          art === 'wait' ? 'text-faint' : gut ? 'text-proof' : 'text-text'}`}>{betrag}</span>
        <span className="text-[11px] font-bold text-faint">{symbol}</span>
      </span>
    </Zeile>
    </li>
  );
}
