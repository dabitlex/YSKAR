'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/i18n';
import { SubHeader, Button } from '@/components/ui/Primitives';
import { Licht, Werte, Zeile } from '@/components/ui/Zeilen';
import { Blatt } from '@/components/ui/Bausteine';
import { externOeffnen } from '@/components/ui/ExternLink';
import { COMMUNITY } from '@/lib/community';
import { teilen, haptik, startParam } from '@/lib/telegram/webapp';
import {
  START, ENDE, PREISE_USD, TOPF_USD, MINING_TAGE, COMMUNITY_BOT, laeuft, codeAusStartParam,
} from '@/lib/aktion/regeln';
import { standLaden, type AktionStand } from '@/lib/aktion/useAktion';

/**
 * "Hilf YSKAR beim Wachsen" -- die Oberflaeche.
 *
 *  AktionHinweis    schmale Zeile im Mine-Reiter, dauerhaft schliessbar
 *  AktionZeile      fester Eintrag im Community-Reiter
 *  AktionEingeladen Hinweis auf dem ersten Willkommensbild (nur ueber Link)
 *  AktionSeite      Uebersicht, Empfehlungen, Preise/Regeln, Ergebnis
 */

const TAG = 86_400_000;

export function empfehlungsLink(code: string): string {
  return `${COMMUNITY.bot}?startapp=ref_${code}`;
}

export function botLink(gewinnCode: string): string {
  return `https://t.me/${COMMUNITY_BOT}?start=${gewinnCode}`;
}

const IC = {
  x: <path d="M6 6l12 12M18 6 6 18" />,
};

function Sym({ d, size = 18, w = 1.6 }: { d: React.ReactNode; size?: number; w?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={w}
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
  );
}

// -------------------------------------------------------------- Mine-Reiter

export function AktionHinweis({ gewinnUsd, onOeffnen, onSchliessen }: {
  gewinnUsd: number | null; onOeffnen: () => void; onSchliessen: () => void;
}) {
  const { t } = useT();
  return (
    <div className="glas relative mb-2 flex items-center gap-1 rounded-[22px] py-1 pl-4 pr-1">
      <button type="button" onClick={onOeffnen} className="flex min-h-11 min-w-0 flex-1 items-center gap-1 text-left">
        <Licht />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[14.5px] font-medium">{t.rd.aktion.titel}</span>
          <span className={`truncate text-[13px] ${gewinnUsd ? 'text-lamp' : 'text-lese'}`}>
            {gewinnUsd ? t.rd.aktion.hinweisGewinn(gewinnUsd) : t.rd.aktion.hinweis}
          </span>
        </span>
      </button>
      <button type="button" onClick={() => { haptik('tipp'); onSchliessen(); }} aria-label={t.rd.aktion.schliessen}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lese active:scale-95">
        <Sym d={IC.x} size={16} w={1.8} />
      </button>
    </div>
  );
}

// -------------------------------------------------------------- Community-Reiter

export function AktionZeile({ onOeffnen }: { onOeffnen: () => void }) {
  const { t } = useT();
  return (
    <li>
      <Zeile onClick={onOeffnen} vor={<Licht />} titel={t.rd.aktion.titel} text={t.rd.aktion.hinweis} />
    </li>
  );
}

// -------------------------------------------------------------- Einstieg

/** Kam jemand ueber einen Empfehlungslink, solange die Aktion laeuft? */
export function useEingeladen(): boolean {
  const [ja, setJa] = useState(false);
  useEffect(() => { setJa(laeuft() && !!codeAusStartParam(startParam())); }, []);
  return ja;
}

export function AktionEingeladen() {
  const { t } = useT();
  return (
    <div className="glas relative flex items-start gap-1 rounded-[22px] px-4 py-3">
      <span className="pt-[7px]"><Licht /></span>
      <span className="text-[13.5px] leading-[1.45] text-lese">
        <b className="font-medium text-text">{t.rd.aktion.eingeladenT}</b> {t.rd.aktion.eingeladen}
      </span>
    </div>
  );
}

// -------------------------------------------------------------- Seite

type Teil = 'start' | 'empfehlungen' | 'regeln' | 'ergebnis';

export default function AktionSeite({ code, onZurueck, ergebnisZuerst }: {
  code: string | null; onZurueck: () => void; ergebnisZuerst?: boolean;
}) {
  const { t } = useT();
  const [teil, setTeil] = useState<Teil>(ergebnisZuerst ? 'ergebnis' : 'start');
  const [stand, setStand] = useState<AktionStand | null>(null);
  const [fehler, setFehler] = useState(false);
  const [teilenOffen, setTeilenOffen] = useState(false);

  useEffect(() => {
    let weg = false;
    standLaden().then(s => { if (weg) return; if (s) setStand(s); else setFehler(true); });
    return () => { weg = true; };
  }, []);

  const meinCode = stand?.code ?? code;
  const zurueck = () => (teil === 'start' || (teil === 'ergebnis' && ergebnisZuerst) ? onZurueck() : setTeil('start'));
  const titel = teil === 'empfehlungen' ? t.rd.aktion.empfehlungen
    : teil === 'regeln' ? t.rd.aktion.preise
    : teil === 'ergebnis' ? t.rd.aktion.ergebnis : t.rd.aktion.titel;

  return (
    <div className="rise">
      <SubHeader titel={titel} onZurueck={zurueck} />
      {teil === 'start' && (
        <Uebersicht stand={stand} fehler={fehler} code={meinCode}
                    onTeilen={() => setTeilenOffen(true)}
                    onEmpfehlungen={() => setTeil('empfehlungen')}
                    onRegeln={() => setTeil('regeln')}
                    onErgebnis={() => setTeil('ergebnis')} />
      )}
      {teil === 'empfehlungen' && <Empfehlungen stand={stand} fehler={fehler} />}
      {teil === 'regeln' && <Regeln />}
      {teil === 'ergebnis' && <Ergebnis stand={stand} fehler={fehler} />}

      <Blatt offen={teilenOffen} onSchliessen={() => setTeilenOffen(false)} titel={t.rd.aktion.teilenTitel}>
        {meinCode && <Teilen code={meinCode} />}
      </Blatt>
    </div>
  );
}

function Laden({ fehler }: { fehler: boolean }) {
  const { t } = useT();
  return <p className="py-6 text-[14.5px] text-dim">{fehler ? t.rd.aktion.fehler : t.rd.aktion.laden}</p>;
}

function Uebersicht({ stand, fehler, code, onTeilen, onEmpfehlungen, onRegeln, onErgebnis }: {
  stand: AktionStand | null; fehler: boolean; code: string | null;
  onTeilen: () => void; onEmpfehlungen: () => void; onRegeln: () => void; onErgebnis: () => void;
}) {
  const { t, zahl } = useT();
  const jetzt = Date.now();
  const aktiv = laeuft(jetzt);
  const rest = Math.max(0, Math.ceil((ENDE - jetzt) / TAG));
  const anteil = Math.min(1, Math.max(0.02, (jetzt - START) / (ENDE - START)));
  const bestaetigt = stand?.empfehlungen.filter(e => e.status === 'bestaetigt').length ?? 0;
  const offen = stand?.empfehlungen.filter(e => e.status === 'offen').length ?? 0;

  return (
    <div className="flex flex-col gap-[18px]">
      {stand?.gewinn && (
        <Zeile erste onClick={onErgebnis} vor={<Licht />} ton="text-lamp" titel={t.rd.aktion.hinweisGewinn(stand.gewinn.betrag_usd)} />
      )}

      <div>
        <div className="flex items-center justify-between gap-3">
          <span className="label">{t.rd.aktion.topf}</span>
          <span className="flex shrink-0 items-center gap-[7px] text-[13.5px]">
            <span aria-hidden="true" className={`h-[7px] w-[7px] rounded-full ${aktiv ? 'bg-proof' : 'shadow-[inset_0_0_0_1.5px_rgb(var(--lese))]'}`} />
            {aktiv ? t.rd.aktion.aktiv : t.rd.aktion.beendet}
          </span>
        </div>
        <p className="mt-3 flex items-baseline gap-3">
          <span className="betrag text-[clamp(84px,27vw,104px)] !tracking-[-.06em]">{zahl(TOPF_USD, { useGrouping: false })}</span>
          <span className="font-mono text-[16px] text-lese">USD</span>
        </p>
        <p className="mt-3.5 font-mono text-[12.5px] leading-[1.5] text-lese">
          {t.rd.aktion.ende}{aktiv && ` · ${t.rd.aktion.tageRest(rest)}`}
        </p>
        <div className="faden mt-3.5" aria-hidden="true">
          <i style={{ width: `${(aktiv ? anteil : 1) * 100}%` }} /><b style={{ left: `${(aktiv ? anteil : 1) * 100}%` }} />
        </div>
      </div>

      <p className="text-[14.5px] leading-[1.45] text-lese">{t.rd.aktion.text}</p>

      <div>
        <span className="label">{t.rd.aktion.deinStand}</span>
        {stand ? (
          <Werte className="mt-2" werte={[
            { name: t.rd.aktion.lose, wert: zahl(stand.lose), ton: 'text-lamp' },
            { name: t.rd.aktion.bestaetigt, wert: zahl(bestaetigt) },
            { name: t.rd.aktion.pruefung, wert: zahl(offen) },
          ]} />
        ) : <Laden fehler={fehler} />}
      </div>

      {aktiv && code && (
        <div>
          <button type="button" onClick={() => { haptik('tipp'); onTeilen(); }}
                  className="flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-lamp px-6 text-[16px] font-semibold text-lamp-ink active:scale-[.985]">
            <svg viewBox="0 0 22 22" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9"
                 strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 3v11M11 3 7 7M11 3l4 4M4 12v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" /></svg>
            {t.rd.aktion.teilenTitel}
          </button>
          <p className="mt-2.5 truncate text-center font-mono text-[12.5px] text-dim">t.me/YSKAR_bot · ref_{code}</p>
        </div>
      )}

      <div>
        <Zeile erste onClick={onEmpfehlungen} hoch={60} titel={t.rd.aktion.empfehlungen}
               text={t.rd.aktion.empfehlungenUnter(bestaetigt, offen)} />
        <Zeile onClick={onRegeln} hoch={60} titel={t.rd.aktion.preise} text={t.rd.aktion.preiseUnter} />
      </div>
      <p className="text-[13px] leading-[1.45] text-dim">{t.rd.aktion.regelHinweis}</p>
    </div>
  );
}

function kurzAdresse(a: string): string {
  return `${a.slice(0, 8)}…${a.slice(-4)}`;
}

function Empfehlungen({ stand, fehler }: { stand: AktionStand | null; fehler: boolean }) {
  const { t, locale } = useT();
  const datum = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[14.5px] leading-[1.45] text-lese">{t.rd.aktion.empfText}</p>
      {!stand ? <Laden fehler={fehler} /> : stand.empfehlungen.length === 0 ? (
        <p className="border-y border-line py-6 text-[14.5px] leading-[1.45] text-lese">{t.rd.aktion.keine}</p>
      ) : (
        <ul className="border-t border-line">
          {stand.empfehlungen.map(e => {
            const rest = Math.max(0, Math.ceil((e.frist - Date.now()) / TAG));
            return (
              <li key={e.adresse} className="flex items-start justify-between gap-3 border-b border-line py-3.5">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-mono text-[14.5px]">{kurzAdresse(e.adresse)}</span>
                  <span className="text-[13.5px] leading-[1.4] text-dim">
                    {e.status === 'ungueltig'
                      ? (t.rd.aktion.grund[e.grund ?? ''] ?? t.rd.aktion.stUngueltig)
                      : e.status === 'offen' ? `${t.rd.aktion.angemeldet(datum(e.angemeldet))} · ${t.rd.aktion.tageUebrig(rest)}`
                      : t.rd.aktion.angemeldet(datum(e.angemeldet))}
                  </span>
                  {e.status === 'offen' && (
                    <span className="aktion-tage mt-1.5" aria-hidden="true">
                      {Array.from({ length: MINING_TAGE }, (_, i) => <i key={i} className={i < e.mining_tage ? 'an' : ''} />)}
                    </span>
                  )}
                </div>
                <span className={`aktion-badge ${e.status === 'bestaetigt' ? 'ok' : e.status === 'offen' ? 'lauf' : 'nein'}`}>
                  {e.status === 'bestaetigt' ? t.rd.aktion.stBestaetigt
                    : e.status === 'offen' ? t.rd.aktion.stTage(Math.min(MINING_TAGE, e.mining_tage))
                    : t.rd.aktion.stUngueltig}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[13px] leading-[1.45] text-dim">{t.rd.aktion.regelHinweis}</p>
    </div>
  );
}

function Regeln() {
  const { t, zahl } = useT();
  const usd = (n: number) => `${zahl(n, { useGrouping: false })} USD`;
  const zeilen: [string, string, boolean][] = [
    [t.rd.aktion.platz1, usd(PREISE_USD[0]), true],
    [t.rd.aktion.platz2, usd(PREISE_USD[1]), true],
    [t.rd.aktion.platz3, usd(PREISE_USD[2]), true],
    [t.rd.aktion.platz410, t.rd.aktion.jeweils(PREISE_USD[3]), false],
  ];
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <span className="label">{t.rd.aktion.preisStruktur}</span>
        <table className="mt-1 w-full border-collapse border-t border-line text-[15.5px]">
          <tbody>
            {zeilen.map(([n, w, haupt]) => (
              <tr key={n} className="border-b border-line">
                <td className={`py-3 ${haupt ? 'font-medium text-text' : 'text-lese'}`}>{n}</td>
                <td className="tnum py-3 text-right font-mono text-[15px]">{w}</td>
              </tr>
            ))}
            <tr>
              <td className="py-3 text-[13.5px] text-dim">{t.rd.aktion.summe}</td>
              <td className="tnum py-3 text-right font-mono text-[13.5px] text-dim">{usd(TOPF_USD)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {([[t.rd.aktion.rTeilnahmeT, t.rd.aktion.rTeilnahme], [t.rd.aktion.rZeitT, t.rd.aktion.rZeit],
        [t.rd.aktion.rZiehungT, t.rd.aktion.rZiehung], [t.rd.aktion.rAuszahlungT, t.rd.aktion.rAuszahlung]] as const).map(([k, v]) => (
        <div key={k} className="flex flex-col gap-1 border-b border-line pb-3.5">
          <b className="text-[16px] font-medium leading-[1.3]">{k}</b>
          <p className="text-[14.5px] leading-[1.45] text-lese">{v}</p>
        </div>
      ))}
      <p className="text-[13px] leading-[1.45] text-dim">{t.rd.aktion.regelHinweis}</p>
    </div>
  );
}

function Teilen({ code }: { code: string }) {
  const { t } = useT();
  const link = empfehlungsLink(code);
  const [kopiert, setKopiert] = useState(false);
  const kopieren = async () => {
    try { await navigator.clipboard.writeText(link); setKopiert(true); haptik('erfolg'); setTimeout(() => setKopiert(false), 2000); }
    catch { /* kein Zugriff */ }
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[14.5px] leading-[1.45] text-lese">{t.rd.aktion.teilenText}</p>
      <div className="terminal">
        <span className="block truncate font-mono text-[13px] text-lese">{link.replace('https://', '')}</span>
      </div>
      <div className="flex flex-col gap-2.5">
        <Button onClick={() => { haptik('tipp'); teilen(link, t.rd.aktion.teilenText); }}>{t.rd.aktion.teilen}</Button>
        <Button variant="quiet" onClick={kopieren}>{kopiert ? t.rd.aktion.kopiert : t.rd.aktion.kopieren}</Button>
      </div>
    </div>
  );
}

function Ergebnis({ stand, fehler }: { stand: AktionStand | null; fehler: boolean }) {
  const { t, zahl } = useT();
  if (!stand) return <Laden fehler={fehler} />;
  const g = stand.gewinn;
  if (!g) return <p className="py-6 text-[14.5px] text-dim">{t.rd.aktion.fehler}</p>;
  const schritte: [string, string][] = [[t.rd.aktion.s1t, t.rd.aktion.s1], [t.rd.aktion.s2t, t.rd.aktion.s2], [t.rd.aktion.s3t, t.rd.aktion.s3]];
  return (
    <div className="flex flex-col gap-[18px]">
      <div>
        <div className="flex items-center justify-between gap-3">
          <span className="label">{t.rd.aktion.platz(g.platz)}</span>
          <span className="aktion-badge ok">{t.rd.aktion.gewinner}</span>
        </div>
        <p className="mt-3 flex items-baseline gap-3">
          <span className="betrag text-[clamp(72px,23vw,92px)] text-lamp">{zahl(g.betrag_usd, { useGrouping: false })}</span>
          <span className="font-mono text-[16px] text-lese">USD</span>
        </p>
        <p className="mt-3.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[12.5px]">
          <span className="font-mono text-lese">{t.rd.aktion.code(g.code)}</span>
          <span className="text-dim">{t.rd.aktion.abholenBis}</span>
        </p>
      </div>

      <div>
        <span className="label">{t.rd.aktion.wieAbholen}</span>
        <ol className="mt-2 border-t border-line">
          {schritte.map(([k, v], i) => (
            <li key={k} className="flex items-start gap-3.5 border-b border-line py-3.5">
              <span className="tnum w-[26px] shrink-0 pt-[3px] font-mono text-[13px] text-cyan">{String(i + 1).padStart(2, '0')}</span>
              <span className="flex flex-col gap-0.5">
                <b className="text-[16px] font-medium leading-[1.3]">{k}</b>
                <span className="text-[13.5px] leading-[1.4] text-dim">{v}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <Button onClick={() => { haptik('tipp'); externOeffnen(botLink(g.code)); }}>{t.rd.aktion.imBot}</Button>
      <p className="text-[13px] leading-[1.45] text-dim">{t.rd.aktion.sicher}</p>
    </div>
  );
}
