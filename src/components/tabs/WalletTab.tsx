'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, Button } from '@/components/ui/Primitives';
import { Zahl, Etikett, Karte, Segment, Identicon } from '@/components/ui/Bausteine';
import type { Account, Wartend } from '@/hooks/useMining';
import { useT } from '@/i18n';

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
  txid: string; height: number; timestamp: string | null;
  kind: 'reward' | 'in' | 'out';
  counterparty: string | null; amount: string; fee: string;
  memo?: string | null;
}

const kurz = (a: string | null, sonst: string) => a ? `${a.slice(0, 10)}…${a.slice(-4)}` : sonst;

export default function WalletTab({ account, symbol, decimals, address,
                                    onSenden, onScannen, onEmpfangen, onEinstellungen, onExplorer }: {
  account: (Account & { history?: HistoryEintrag[]; pending?: Wartend[] }) | null;
  symbol: string; decimals: number; address: string | null;
  onSenden: () => void; onScannen: () => void; onEmpfangen: () => void;
  onEinstellungen: () => void; onExplorer: () => void;
}) {
  // Ausgewaehlte Transaktion. Als Ueberlagerung und nicht als eigene Seite:
  // Man will danach wieder in derselben Liste stehen, an derselben Stelle.
  const [offen, setOffen] = useState<HistoryEintrag | null>(null);
  const [filter, setFilter] = useState<'alle' | 'in' | 'out'>('alle');
  const [kopiert, setKopiert] = useState(false);
  const { t, betrag, vorZeit } = useT();
  const unb = t.allgemein.unbekannt;

  const g = betrag(Number(account?.balance ?? 0) / 10 ** decimals);
  const verlauf = (account?.history ?? []).filter(e =>
    filter === 'alle' || (filter === 'out' ? e.kind === 'out' : e.kind !== 'out'));
  const wartend = (account?.pending ?? []).filter(p => filter === 'alle' || p.kind === filter);
  const unterwegs = (account?.pending ?? []).filter(p => p.kind === 'out')
    .reduce((s, p) => s + Number(p.amount) + Number(p.fee), 0) / 10 ** decimals;

  // Nach Tagen gruppieren: Heute, Gestern, Frueher.
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const gestern = new Date(heute); gestern.setDate(gestern.getDate() - 1);
  const gruppe = (ts: string | null) => {
    if (!ts) return t.wallet.frueher;
    const d = new Date(Number(ts) * 1000);
    return d >= heute ? t.wallet.heute : d >= gestern ? t.wallet.gestern : t.wallet.frueher;
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
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[15px] font-extrabold">{t.wallet.verlauf}</span>
          <Segment label={t.wallet.verlauf} wert={filter} onChange={setFilter}
                   werte={[{ v: 'alle', text: t.wallet.alle }, { v: 'in', text: t.wallet.eingaenge }, { v: 'out', text: t.wallet.ausgaenge }]} />
        </div>

        {verlauf.length === 0 && wartend.length === 0 ? (
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
                    <Eintrag key={e.txid}
                      onClick={() => setOffen(e)}
                      art={e.kind === 'out' ? 'out' : 'in'}
                      adresse={e.kind === 'reward' ? `reward-${e.height}` : e.counterparty}
                      titel={e.kind === 'reward' ? t.wallet.blockreward(e.height)
                        : e.kind === 'in' ? t.wallet.von(kurz(e.counterparty, unb))
                        : t.wallet.an(kurz(e.counterparty, unb))}
                      unten={vorZeit(e.timestamp) +
                        (e.kind === 'out' && Number(e.fee) > 0
                          ? ` · ${t.wallet.gebuehr((Number(e.fee) / 10 ** decimals).toFixed(4))}` : '')}
                      betrag={`${e.kind === 'out' ? '−' : '+'}${
                        (Number(e.amount) / 10 ** decimals).toFixed(4)}`} symbol={symbol}
                      gut={e.kind !== 'out'} />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Karte>

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
          {eintrag.kind !== 'reward' && (
            <Feld label={eingang ? t.wallet.dVon : t.wallet.dAn} mono umbruch
                  wert={eintrag.counterparty ?? t.allgemein.unbekannt}
                  onKopieren={eintrag.counterparty
                    ? () => kopiere('adresse', eintrag.counterparty!) : undefined}
                  kopiert={kopiert === 'adresse'} />
          )}
          {eintrag.kind === 'out' && gebuehr > 0 && (
            <Feld label={t.wallet.netzgebuehr} wert={`${gebuehr.toFixed(4)} ${symbol}`} />
          )}
          {eintrag.memo && (
            <Feld label={t.wallet.notiz} wert={new TextDecoder().decode(
              Uint8Array.from(eintrag.memo.match(/../g) ?? [],
                              h => parseInt(h, 16)))} />
          )}
          <Feld label={t.wallet.transaktion} mono umbruch wert={eintrag.txid}
                onKopieren={() => kopiere('txid', eintrag.txid)}
                kopiert={kopiert === 'txid'} />
        </dl>

        <div className="mt-6 space-y-3">
          <a href={`/explorer.html#block-${eintrag.height}`}
             className="block rounded-[14px] border border-line bg-surface py-3.5
                        text-center text-[15px] font-bold">
            {t.wallet.imExplorer}
          </a>
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
  art: 'in' | 'out' | 'wait'; adresse: string | null; titel: string; unten: string;
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
