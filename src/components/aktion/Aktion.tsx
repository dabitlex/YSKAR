'use client';

import { useEffect, useState } from 'react';
import { useT } from '@/i18n';
import { SubHeader, Button } from '@/components/ui/Primitives';
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
  wachsen: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  leute: <><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c.8-3.2 2.9-5 5.5-5s4.7 1.8 5.5 5" /><path d="M15.5 5.6a3 3 0 0 1 0 5.8M17.5 14.4c1.6.6 2.7 2.2 3 4.6" /></>,
  blatt: <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  pokal: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  pfeil: <path d="M9 6l6 6-6 6" />,
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
    <div className="relative mb-2 flex items-center gap-3 rounded-[16px] border border-line bg-surface py-2 pl-3.5 pr-1.5">
      <button type="button" onClick={onOeffnen} className="flex min-h-10 min-w-0 flex-1 items-center gap-3 text-left">
        <span className="text-cyan"><Sym d={gewinnUsd ? IC.pokal : IC.wachsen} /></span>
        <span className="flex min-w-0 flex-col">
          <span className="text-[14px] font-medium">{t.rd.aktion.titel}</span>
          <span className="truncate text-[12.5px] text-dim">
            {gewinnUsd ? t.rd.aktion.hinweisGewinn(gewinnUsd) : t.rd.aktion.hinweis}
          </span>
        </span>
      </button>
      <button type="button" onClick={() => { haptik('tipp'); onSchliessen(); }} aria-label={t.rd.aktion.schliessen}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-dim active:bg-raised">
        <Sym d={IC.x} size={16} w={2} />
      </button>
    </div>
  );
}

// -------------------------------------------------------------- Community-Reiter

export function AktionZeile({ onOeffnen }: { onOeffnen: () => void }) {
  const { t } = useT();
  return (
    <li className="border-b border-line">
      <button type="button" onClick={onOeffnen} className="flex w-full items-center gap-3.5 py-[14px] text-left active:bg-surface">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-work/40 text-cyan">
          <Sym d={IC.wachsen} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-medium">{t.rd.aktion.titel}</span>
          <span className="truncate text-[12.5px] text-dim">{t.rd.aktion.hinweis}</span>
        </span>
        <span className="text-faint"><Sym d={IC.pfeil} size={16} w={2} /></span>
      </button>
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
    <div className="relative flex items-center gap-3 rounded-[16px] border border-line bg-surface px-3.5 py-3">
      <span className="shrink-0 text-cyan"><Sym d={IC.wachsen} /></span>
      <span className="text-[13px] leading-[1.45] text-dim">
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
  return <p className="py-6 text-center text-[13.5px] text-dim">{fehler ? t.rd.aktion.fehler : t.rd.aktion.laden}</p>;
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
        <button type="button" onClick={onErgebnis}
                className="flex items-center gap-3 rounded-[16px] border border-line bg-surface px-3.5 py-3 text-left">
          <span className="text-cyan"><Sym d={IC.pokal} /></span>
          <span className="flex-1 text-[14px] font-medium">{t.rd.aktion.hinweisGewinn(stand.gewinn.betrag_usd)}</span>
          <span className="text-faint"><Sym d={IC.pfeil} size={16} w={2} /></span>
        </button>
      )}

      <div className="aktion-held">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12.5px] text-dim">{t.rd.aktion.topf}</span>
          <span className={`aktion-badge ${aktiv ? 'lauf' : 'nein'}`}>{aktiv ? t.rd.aktion.aktiv : t.rd.aktion.beendet}</span>
        </div>
        <span className="zahl-gross text-[52px]">
          {zahl(TOPF_USD)}<span className="ml-2 text-[18px] font-normal tracking-normal text-dim">USD</span>
        </span>
        <div className="flex flex-col gap-2">
          <div className="h-1 overflow-hidden rounded-sm bg-[rgb(140_170_255/.22)]">
            <i className="block h-full rounded-sm" style={{ width: `${(aktiv ? anteil : 1) * 100}%`,
              background: 'linear-gradient(90deg,#2F7BFF,#63D8FF)' }} />
          </div>
          <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
            <span className="text-dim">{t.rd.aktion.ende}</span>
            {aktiv && <span className="text-lese">{t.rd.aktion.tageRest(rest)}</span>}
          </div>
        </div>
      </div>

      <p className="text-[14.5px] leading-[1.55] text-dim">{t.rd.aktion.text}</p>

      <div className="flex flex-col gap-3">
        <span className="text-[12.5px] text-dim">{t.rd.aktion.deinStand}</span>
        {stand ? (
          <div className="grid grid-cols-3">
            {[[stand.lose, t.rd.aktion.lose], [bestaetigt, t.rd.aktion.bestaetigt], [offen, t.rd.aktion.pruefung]].map(([w, n], i) => (
              <div key={String(n)} className={`flex flex-col gap-1 pr-2.5 ${i ? 'border-l border-line pl-3.5' : ''}`}>
                <b className="tnum text-[22px] font-normal tracking-[-0.03em]">{zahl(Number(w))}</b>
                <span className="text-[12.5px] text-dim">{n}</span>
              </div>
            ))}
          </div>
        ) : <Laden fehler={fehler} />}
      </div>

      {aktiv && code && (
        <div className="flex items-center gap-2.5 rounded-full border border-[rgb(140_170_255/.22)] py-1.5 pl-4 pr-1.5">
          <span className="shrink-0 text-dim"><Sym d={IC.link} size={16} /></span>
          <span className="min-w-0 flex-1 truncate text-[13.5px] text-lese">t.me/YSKAR_bot · ref_{code}</span>
          <button type="button" onClick={() => { haptik('tipp'); onTeilen(); }}
                  className="h-10 shrink-0 rounded-full bg-text px-[18px] text-[14px] font-semibold text-ink active:scale-95">
            {t.rd.aktion.teilen}
          </button>
        </div>
      )}

      <ul className="overflow-hidden rounded-[18px] border border-line bg-surface">
        <Eintrag icon={IC.leute} titel={t.rd.aktion.empfehlungen}
                 text={t.rd.aktion.empfehlungenUnter(bestaetigt, offen)} onClick={onEmpfehlungen} />
        <Eintrag icon={IC.blatt} titel={t.rd.aktion.preise} text={t.rd.aktion.preiseUnter} onClick={onRegeln} />
      </ul>
    </div>
  );
}

function Eintrag({ icon, titel, text, onClick }: {
  icon: React.ReactNode; titel: string; text: string; onClick: () => void;
}) {
  return (
    <li className="border-b border-line last:border-b-0">
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left active:bg-raised">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-raised text-text"><Sym d={icon} /></span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-medium">{titel}</span>
          <span className="truncate text-[12.5px] text-dim">{text}</span>
        </span>
        <span className="text-faint"><Sym d={IC.pfeil} size={16} w={2} /></span>
      </button>
    </li>
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
      <p className="text-[14px] leading-[1.55] text-dim">{t.rd.aktion.empfText}</p>
      {!stand ? <Laden fehler={fehler} /> : stand.empfehlungen.length === 0 ? (
        <p className="rounded-[18px] border border-line bg-surface px-4 py-5 text-center text-[13.5px] text-dim">{t.rd.aktion.keine}</p>
      ) : (
        <ul className="overflow-hidden rounded-[18px] border border-line bg-surface">
          {stand.empfehlungen.map(e => {
            const rest = Math.max(0, Math.ceil((e.frist - Date.now()) / TAG));
            return (
              <li key={e.adresse} className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5 last:border-b-0">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-mono text-[13px]">{kurzAdresse(e.adresse)}</span>
                  <span className="text-[12.5px] text-dim">
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
      <p className="text-[12.5px] leading-[1.5] text-dim">{t.rd.aktion.regelHinweis}</p>
    </div>
  );
}

function Regeln() {
  const { t, zahl } = useT();
  const usd = (n: number) => `${zahl(n)} USD`;
  const zeilen: [string, string, boolean][] = [
    [t.rd.aktion.platz1, usd(PREISE_USD[0]), true],
    [t.rd.aktion.platz2, usd(PREISE_USD[1]), true],
    [t.rd.aktion.platz3, usd(PREISE_USD[2]), true],
    [t.rd.aktion.platz410, t.rd.aktion.jeweils(PREISE_USD[3]), false],
  ];
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <span className="text-[12.5px] text-dim">{t.rd.aktion.preisStruktur}</span>
        <table className="w-full border-collapse text-[14px]">
          <tbody>
            {zeilen.map(([n, w, haupt]) => (
              <tr key={n} className="border-b border-line">
                <td className={`py-2 ${haupt ? 'text-text' : 'text-lese'}`}>{n}</td>
                <td className="tnum py-2 text-right">{w}</td>
              </tr>
            ))}
            <tr>
              <td className="py-2 text-[13px] text-dim">{t.rd.aktion.summe}</td>
              <td className="tnum py-2 text-right text-[13px] text-dim">{usd(TOPF_USD)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {([[t.rd.aktion.rTeilnahmeT, t.rd.aktion.rTeilnahme], [t.rd.aktion.rZeitT, t.rd.aktion.rZeit],
        [t.rd.aktion.rZiehungT, t.rd.aktion.rZiehung], [t.rd.aktion.rAuszahlungT, t.rd.aktion.rAuszahlung]] as const).map(([k, v]) => (
        <div key={k} className="flex flex-col gap-[3px] border-b border-line py-2.5">
          <b className="text-[14px] font-medium">{k}</b>
          <p className="text-[13px] leading-[1.5] text-dim">{v}</p>
        </div>
      ))}
      <p className="text-[12.5px] leading-[1.5] text-dim">{t.rd.aktion.regelHinweis}</p>
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
      <p className="text-[14px] leading-[1.55] text-dim">{t.rd.aktion.teilenText}</p>
      <div className="flex items-center justify-between gap-3 rounded-[16px] border border-line bg-surface px-4 py-3.5">
        <span className="min-w-0 truncate font-mono text-[12.5px]">{link.replace('https://', '')}</span>
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
  if (!g) return <p className="py-6 text-center text-[13.5px] text-dim">{t.rd.aktion.fehler}</p>;
  const schritte: [string, string][] = [[t.rd.aktion.s1t, t.rd.aktion.s1], [t.rd.aktion.s2t, t.rd.aktion.s2], [t.rd.aktion.s3t, t.rd.aktion.s3]];
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="aktion-held">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12.5px] text-dim">{t.rd.aktion.platz(g.platz)}</span>
          <span className="aktion-badge ok">{t.rd.aktion.gewinner}</span>
        </div>
        <span className="zahl-gross text-[46px]">
          {zahl(g.betrag_usd)}<span className="ml-2 text-[18px] font-normal tracking-normal text-dim">USD</span>
        </span>
        <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
          <span className="font-mono text-lese">{t.rd.aktion.code(g.code)}</span>
          <span className="text-dim">{t.rd.aktion.abholenBis}</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <span className="text-[12.5px] text-dim">{t.rd.aktion.wieAbholen}</span>
        <div className="aktion-schritte flex flex-col">
          {schritte.map(([k, v], i) => (
            <div key={k}>
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-medium ${
                i === 0 ? 'bg-text text-ink' : 'border border-[rgb(140_170_255/.22)] text-dim'}`}>{i + 1}</span>
              <span>
                <b className="block text-[14.5px] font-medium">{k}</b>
                <small className="text-[13px] leading-[1.45] text-dim">{v}</small>
              </span>
            </div>
          ))}
        </div>
      </div>

      <Button onClick={() => { haptik('tipp'); externOeffnen(botLink(g.code)); }}>{t.rd.aktion.imBot}</Button>
      <p className="text-[12.5px] leading-[1.5] text-dim">{t.rd.aktion.sicher}</p>
    </div>
  );
}
