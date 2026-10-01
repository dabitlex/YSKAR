'use client';

import { useState } from 'react';
import { useWallet } from '@/lib/wallet/useWallet';
import { Title, Body, Button, Notice } from '@/components/ui/Primitives';
import AppSettings, { AppBiometrie } from '@/components/AppSettings';
import { Segment, Blatt } from '@/components/ui/Bausteine';
import type { Summary } from '@/hooks/useMining';
import { useT, fehlerText, SPRACHEN } from '@/i18n';
import { SPERRE_STUFEN, sperreLesen, sperreSetzen } from '@/hooks/useAutoSperre';
import { AppLaden } from '@/components/AppLaden';
import { useThema } from '@/lib/useThema';
import { THEMEN } from '@/lib/thema';
import { istNativ } from '@/lib/native/plattform';

/**
 * Einstellungen.
 *
 * Enthaelt die zwei Handlungen, bei denen Geld verloren gehen kann: die
 * Woerter erneut anzeigen und die Wallet vom Geraet entfernen. Beide sind
 * hinter der PIN beziehungsweise einer ausdruecklichen Bestaetigung.
 */
export default function Settings({ onZurueck, anteil, workers, summary }: {
  onZurueck: () => void; anteil: number; workers: number; summary: Summary | null;
}) {
  const wallet = useWallet();
  const [modus, setModus] = useState<'liste' | 'woerter' | 'entfernen'>('liste');
  const [pin, setPin] = useState('');
  const [woerter, setWoerter] = useState<string[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [bestaetigt, setBestaetigt] = useState(false);
  const { t, sprache, setSprache, zahl } = useT();
  // Auswahl-Blaetter: Sprache und Sperrzeit sind Listen, keine Chip-Reihen.
  const [blatt, setBlatt] = useState<null | 'sprache' | 'sperre'>(null);
  const [kopiert, setKopiert] = useState(false);
  const [sperre, setSperre] = useState<number>(() => sperreLesen());
  const [apkOffen, setApkOffen] = useState(false);
  const { thema, setThema } = useThema();

  if (modus === 'woerter') {
    return (
      <>
        <button onClick={() => { setModus('liste'); setWoerter(null); setPin(''); }}
                className="text-[13.5px] font-bold text-work">{t.einstellungen.zurueckZu}</button>
        <div className="mt-4"><Title>{t.einstellungen.woerterTitel}</Title></div>

        {!woerter ? (
          <>
            <Body>{t.einstellungen.woerterPin}</Body>
            <input
              inputMode="numeric" maxLength={6} value={pin} autoFocus
              onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setFehler(null); }}
              className="sunk tnum mt-4 w-full px-4 py-4
                         text-center font-mono text-xl tracking-[0.45em] outline-none
                         transition-colors focus:border-work"
            />
            {fehler && <div className="mt-4"><Notice tone="risk">{fehler}</Notice></div>}
            <div className="mt-5">
              <Button disabled={pin.length !== 6} onClick={async () => {
                const r = await wallet.revealMnemonic(pin);
                if (!r.ok || !r.mnemonic) { setFehler(fehlerText(r.reason, t)); return; }
                setWoerter(r.mnemonic.split(' '));
              }}>{t.einstellungen.anzeigen}</Button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-3">
              <Notice tone="risk">{t.einstellungen.keinFoto}</Notice>
            </div>
            <ol className="mt-5 grid grid-cols-2 gap-x-4 border-t border-line">
              {woerter.map((w, i) => (
                <li key={i} className="flex items-baseline gap-3 py-3 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-line">
                  <span className="tnum w-5 shrink-0 text-right text-xs text-dim">{i + 1}</span>
                  <span className="font-mono text-[15px]">{w}</span>
                </li>
              ))}
            </ol>
            <div className="mt-6">
              <Button variant="quiet" onClick={() => { setModus('liste'); setWoerter(null); setPin(''); }}>
                {t.allgemein.fertig}
              </Button>
            </div>
          </>
        )}
      </>
    );
  }

  if (modus === 'entfernen') {
    return (
      <>
        <button onClick={() => { setModus('liste'); setBestaetigt(false); }}
                className="text-[13.5px] font-bold text-work">{t.einstellungen.zurueckZu}</button>
        <div className="mt-4"><Title>{t.einstellungen.entfernenTitel}</Title></div>
        <Body>{t.einstellungen.entfernenText}</Body>
        <div className="mt-4">
          <Notice tone="risk">{t.einstellungen.entfernenWarnung}</Notice>
        </div>

        <label className="mt-6 flex cursor-pointer items-start gap-3 text-[15px]">
          <input type="checkbox" checked={bestaetigt}
                 onChange={e => setBestaetigt(e.target.checked)}
                 className="mt-1 h-4 w-4 shrink-0 accent-[rgb(var(--risk))]" />
          <span>{t.einstellungen.notiert}</span>
        </label>

        <div className="mt-6 space-y-3">
          <Button variant="risk" disabled={!bestaetigt} onClick={() => wallet.forget()}>
            {t.einstellungen.entfernen}
          </Button>
          <Button variant="quiet" onClick={() => { setModus('liste'); setBestaetigt(false); }}>
            {t.allgemein.abbrechen}
          </Button>
        </div>
      </>
    );
  }

  const online = !!summary?.height;
  const sperreText = (ms: number) =>
    ms === 0 ? t.einstellungen.sperreSofort : ms < 0 ? t.einstellungen.sperreNie : t.einstellungen.sperreMin(ms / 60_000);
  const adresse = wallet.address ?? '';
  const adresseKurz = adresse.length > 18 ? `${adresse.slice(0, 10)}…${adresse.slice(-4)}` : adresse;
  const kopiere = async () => {
    if (!adresse) return;
    try { await navigator.clipboard.writeText(adresse); setKopiert(true); setTimeout(() => setKopiert(false), 1600); } catch { /* egal */ }
  };

  return (
    <>
      <div className="schein pointer-events-none absolute inset-x-0 top-0 h-72" />
      <header className="relative mb-2 flex items-center gap-3">
        <button onClick={onZurueck} aria-label={t.allgemein.zurueck}
                className="panel flex h-9 w-9 items-center justify-center !rounded-full text-text active:scale-95">
          <svg viewBox="0 0 22 22" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 5l-6 6 6 6" /></svg>
        </button>
        <h1 className="text-[24px] font-extrabold tracking-[-0.02em]">{t.einstellungen.titel}</h1>
      </header>

      {/* Netz-Status -- stand frueher als Pille oben rechts auf Home. */}
      <div className="panel relative mt-5 flex items-center gap-3 !rounded-[20px] px-4 py-3.5" role="status">
        <span className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[13px] ${online ? 'bg-proof/10' : 'bg-raised'}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${online ? 'bg-proof shadow-[0_0_0_5px_rgb(var(--proof)/.18)]' : 'bg-faint'}`} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-[14.5px] font-extrabold">{online ? t.home.synchron : t.home.verbinde}</span>
          {online && (
            <span className="truncate text-[12px] font-semibold text-dim">
              {t.einstellungen.netzStand(zahl(summary!.height!), summary?.activeMiners ?? 0)}
            </span>
          )}
        </span>
      </div>

      <p className="label mb-2 mt-7 px-0.5">{t.einstellungen.gruppeAllgemein}</p>
      <ul className="panel mt-2 !py-0.5 px-4">
        <Eintrag onClick={() => setBlatt('sprache')}
                 wert={<span lang={sprache}>{SPRACHEN.find(x => x.code === sprache)?.name ?? sprache}</span>}>
          {t.einstellungen.sprache}
        </Eintrag>
        <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5">
          <span className="text-[13.5px] font-bold">{t.einstellungen.thema}</span>
          <Segment label={t.einstellungen.thema} wert={thema} onChange={setThema}
                   werte={THEMEN.map(th => ({ v: th, text: th === 'system' ? t.einstellungen.themaSystem
                     : th === 'hell' ? t.einstellungen.themaHell : t.einstellungen.themaDunkel }))} />
        </li>
      </ul>

      <p className="label mb-2 mt-7 px-0.5">{t.app.sicherheit}</p>
      <ul className="panel mt-2 !py-0.5 px-4">
        <Eintrag onClick={() => setModus('woerter')}>{t.einstellungen.woerterZeigen}</Eintrag>
        <Eintrag onClick={() => setBlatt('sperre')} wert={sperreText(sperre)} unter={t.einstellungen.sperreKurz}>
          {t.einstellungen.sperre}
        </Eintrag>
        <AppBiometrie />
      </ul>

      <p className="label mb-2 mt-7 px-0.5">{t.einstellungen.wallet}</p>
      <ul className="panel mt-2 !py-0.5 px-4">
        <li>
          <button onClick={kopiere} aria-label={`${t.einstellungen.adresse} ${t.allgemein.kopieren}`}
                  className="flex w-full items-center justify-between gap-3 py-3 text-left active:opacity-70">
            <span className="text-[13.5px] font-bold">{t.einstellungen.adresse}</span>
            <span className="flex min-w-0 items-center gap-2 text-dim">
              <span className="truncate font-mono text-[12px]">{kopiert ? t.allgemein.kopiert : adresseKurz}</span>
              <svg viewBox="0 0 22 22" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9"
                   strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-work" aria-hidden="true">
                <rect x="7" y="7" width="11" height="11" rx="2" /><path d="M4 14V5a1 1 0 0 1 1-1h9" />
              </svg>
            </span>
          </button>
        </li>
      </ul>

      <p className="label mb-2 mt-7 px-0.5">{t.einstellungen.mining}</p>
      <ul className="panel mt-2 !py-0.5 px-4">
        <li className="flex items-center justify-between py-3 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-line">
          <span className="text-[13.5px] font-bold">{t.einstellungen.anteil}</span>
          <span className="tnum text-[13.5px] font-semibold text-dim">{anteil} %</span>
        </li>
        <li className="flex items-center justify-between py-3 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-line">
          <span className="text-[13.5px] font-bold">{t.einstellungen.worker}</span>
          <span className="tnum text-[13.5px] font-semibold text-dim">{workers}</span>
        </li>
      </ul>

      {!istNativ() && (
        <>
          <p className="label mb-2 mt-7 px-0.5">{t.apk.titel}</p>
          <ul className="panel mt-2 !py-0.5 px-4">
            <Eintrag onClick={() => setApkOffen(true)}>{t.apk.einstellung}</Eintrag>
          </ul>
          <p className="mt-2 text-[12px] font-medium leading-relaxed text-faint">{t.apk.einstellungText}</p>
          {apkOffen && <AppLaden onSchliessen={() => setApkOffen(false)} />}
        </>
      )}

      <AppSettings />

      <p className="label mb-2 mt-7 px-0.5">{t.einstellungen.geraet}</p>
      <ul className="panel mt-2 !py-0.5 px-4">
        <Eintrag onClick={() => setModus('entfernen')} rot>{t.einstellungen.entfernen}</Eintrag>
      </ul>

      <Blatt offen={blatt === 'sprache'} onSchliessen={() => setBlatt(null)} titel={t.einstellungen.sprache}>
        <ul role="listbox" aria-label={t.einstellungen.sprache}>
          {SPRACHEN.map(sp => (
            <li key={sp.code} className="[&:not(:last-child)]:border-b [&:not(:last-child)]:border-line">
              <button onClick={() => { setSprache(sp.code); setBlatt(null); }} lang={sp.code}
                      role="option" aria-selected={sprache === sp.code}
                      className={`flex w-full items-center justify-between py-3 text-left text-[14.5px] font-bold active:opacity-70 ${
                        sprache === sp.code ? 'text-work' : 'text-text'}`}>
                {sp.name}{sprache === sp.code && <Haken />}
              </button>
            </li>
          ))}
        </ul>
      </Blatt>

      <Blatt offen={blatt === 'sperre'} onSchliessen={() => setBlatt(null)} titel={t.einstellungen.sperre}>
        <p className="-mt-1 mb-2 text-[12.5px] font-medium leading-relaxed text-dim">{t.einstellungen.sperreText}</p>
        <ul role="listbox" aria-label={t.einstellungen.sperre}>
          {SPERRE_STUFEN.map(ms => (
            <li key={ms} className="[&:not(:last-child)]:border-b [&:not(:last-child)]:border-line">
              <button onClick={() => { sperreSetzen(ms); setSperre(ms); setBlatt(null); }}
                      role="option" aria-selected={sperre === ms}
                      className={`flex w-full items-center justify-between py-3 text-left text-[14.5px] font-bold active:opacity-70 ${
                        sperre === ms ? 'text-work' : 'text-text'}`}>
                {sperreText(ms)}{sperre === ms && <Haken />}
              </button>
            </li>
          ))}
        </ul>
      </Blatt>
    </>
  );
}

const Haken = () => (
  <svg viewBox="0 0 22 22" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 11.5l4 4 8-9" /></svg>
);

/** Eine Zeile, die etwas oeffnet: Titel, optional Untertitel, rechts der aktuelle Wert. */
function Eintrag({ onClick, children, wert, unter, rot }: {
  onClick: () => void; children: React.ReactNode;
  wert?: React.ReactNode; unter?: string; rot?: boolean;
}) {
  return (
    <li className="[&:not(:last-child)]:border-b [&:not(:last-child)]:border-line">
      <button onClick={onClick}
              className={`flex w-full items-center justify-between gap-3 py-3 text-left text-[13.5px] font-bold active:opacity-70 ${
                rot ? 'text-risk' : ''}`}>
        <span className="flex min-w-0 flex-col">
          <span>{children}</span>
          {unter && <span className="text-[12px] font-semibold text-faint">{unter}</span>}
        </span>
        <span className={`flex shrink-0 items-center gap-1.5 text-[13px] font-semibold ${rot ? 'text-risk' : 'text-dim'}`}>
          {wert}<span className={rot ? '' : 'text-faint'}>›</span>
        </span>
      </button>
    </li>
  );
}
