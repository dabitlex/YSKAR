'use client';

import { useState } from 'react';
import { useWallet } from '@/lib/wallet/useWallet';
import { Title, Body, Button, Notice, SubHeader } from '@/components/ui/Primitives';
import { ListenTitel, Zeile } from '@/components/ui/Zeilen';
import AppSettings, { AppBiometrie } from '@/components/AppSettings';
import { Blatt } from '@/components/ui/Bausteine';
import type { Summary } from '@/hooks/useMining';
import { useT, fehlerText, SPRACHEN } from '@/i18n';
import { SPERRE_STUFEN, sperreLesen, sperreSetzen } from '@/hooks/useAutoSperre';
import { AppLaden } from '@/components/AppLaden';
import { COMMUNITY } from '@/lib/community';
import { istNativ } from '@/lib/native/plattform';

/**
 * Einstellungen.
 *
 * Enthaelt die zwei Handlungen, bei denen Geld verloren gehen kann: die
 * Woerter erneut anzeigen und die Wallet vom Geraet entfernen. Beide sind
 * hinter der PIN beziehungsweise einer ausdruecklichen Bestaetigung.
 */
export default function Settings({ onZurueck, anteil, workers, summary, onSichern }: {
  onZurueck: () => void; anteil: number; workers: number; summary: Summary | null;
  /** Gesetzt, solange die Woerter nicht gesichert sind: Die Zeile fuehrt zur Sicherung. */
  onSichern?: () => void;
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

  const verweis = 'inline-flex min-h-11 items-center gap-2 text-[14.5px] font-medium text-text underline decoration-text/45 underline-offset-[.24em]';
  const pinFeld = 'tnum feld mt-5 h-14 w-full bg-transparent px-4 text-center font-mono text-[22px] tracking-[0.45em] text-text outline-none';

  if (modus === 'woerter') {
    return (
      <>
        <button onClick={() => { setModus('liste'); setWoerter(null); setPin(''); }} className={verweis}>{t.einstellungen.zurueckZu}</button>
        <div className="mt-3"><Title>{t.einstellungen.woerterTitel}</Title></div>

        {!woerter ? (
          <>
            <Body>{t.einstellungen.woerterPin}</Body>
            <input
              inputMode="numeric" maxLength={6} value={pin} autoFocus
              onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setFehler(null); }}
              className={pinFeld}
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
            <div className="mt-4">
              <Notice tone="risk">{t.einstellungen.keinFoto}</Notice>
            </div>
            <ol className="mt-5 grid grid-cols-2 gap-x-[26px] border-t border-line">
              {woerter.map((w, i) => (
                <li key={i} className="flex items-baseline gap-3 border-b border-line py-[13px]">
                  <span className="tnum w-[22px] shrink-0 font-mono text-[12.5px] text-dim">{String(i + 1).padStart(2, '0')}</span>
                  <span className="text-[18px] font-medium tracking-[-.01em]">{w}</span>
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
        <button onClick={() => { setModus('liste'); setBestaetigt(false); }} className={verweis}>{t.einstellungen.zurueckZu}</button>
        <div className="mt-3"><Title>{t.einstellungen.entfernenTitel}</Title></div>
        <Body>{t.einstellungen.entfernenText}</Body>
        <div className="mt-4">
          <Notice tone="risk">{t.einstellungen.entfernenWarnung}</Notice>
        </div>

        <label className="mt-5 flex min-h-[56px] cursor-pointer items-center gap-3.5 border-y border-line py-3 text-[16px] font-medium leading-[1.3]">
          <input type="checkbox" checked={bestaetigt}
                 onChange={e => setBestaetigt(e.target.checked)}
                 className="h-5 w-5 shrink-0 accent-[rgb(var(--risk))]" />
          <span>{t.einstellungen.notiert}</span>
        </label>

        <div className="mt-6 space-y-2.5">
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
  const mono = (text: React.ReactNode) => <span className="tnum font-mono text-[13.5px]">{text}</span>;

  return (
    <>
      <SubHeader titel={t.einstellungen.titel} onZurueck={onZurueck} />

      {/* Netz-Status -- stand frueher als Pille oben rechts auf Home. */}
      <div role="status">
        <Zeile erste hoch={60}
               vor={<span aria-hidden="true" className={`mx-[3px] h-2 w-2 shrink-0 rounded-full ${online ? 'atmen bg-proof' : 'shadow-[inset_0_0_0_1.5px_rgb(var(--lese))]'}`} />}
               titel={online ? t.home.synchron : t.home.verbinde}
               text={online ? <span className="tnum">{t.einstellungen.netzStand(zahl(summary!.height!), summary?.activeMiners ?? 0)}</span> : undefined} />
      </div>

      <ListenTitel className="mt-6">{t.einstellungen.gruppeAllgemein}</ListenTitel>
      <Zeile onClick={() => setBlatt('sprache')} hoch={52} titel={t.einstellungen.sprache}
             rechts={<span lang={sprache}>{SPRACHEN.find(x => x.code === sprache)?.name ?? sprache}</span>} />

      <ListenTitel className="mt-6">{t.app.sicherheit}</ListenTitel>
      <ul>
        <li>
          {onSichern
            ? <Zeile onClick={onSichern} hoch={52} titel={t.sicherung.einstellungen}
                     rechts={<span className="inline-flex items-center gap-[7px] text-lamp"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-lamp" />{t.sicherung.offen}</span>} />
            : <Zeile onClick={() => setModus('woerter')} hoch={52} titel={t.einstellungen.woerterZeigen} />}
        </li>
        <li>
          <Zeile onClick={() => setBlatt('sperre')} hoch={60} titel={t.einstellungen.sperre} text={t.einstellungen.sperreKurz}
                 rechts={mono(sperreText(sperre))} />
        </li>
        <AppBiometrie />
      </ul>

      <ListenTitel className="mt-6">{t.einstellungen.wallet}</ListenTitel>
      <button onClick={kopiere} aria-label={`${t.einstellungen.adresse} ${t.allgemein.kopieren}`}
              className="flex min-h-[52px] w-full items-center justify-between gap-3 border-b border-line py-[11px] text-left active:opacity-70">
        <span className="text-[16px] font-medium leading-[1.3]">{t.einstellungen.adresse}</span>
        <span className="flex min-w-0 items-center gap-2.5 text-lese">
          <span className="truncate font-mono text-[13px]">{kopiert ? t.allgemein.kopiert : adresseKurz}</span>
          <svg viewBox="0 0 22 22" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7"
               strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
            <rect x="7" y="7" width="11" height="11" rx="2" /><path d="M4 14V5a1 1 0 0 1 1-1h9" />
          </svg>
        </span>
      </button>

      <ListenTitel className="mt-6">{t.einstellungen.mining}</ListenTitel>
      <Zeile hoch={52} titel={t.einstellungen.anteil} rechts={mono(`${anteil} %`)} />
      <Zeile hoch={52} titel={t.einstellungen.worker} rechts={mono(workers)} />

      {!istNativ() && (
        <>
          <ListenTitel className="mt-6">{t.apk.titel}</ListenTitel>
          <Zeile onClick={() => setApkOffen(true)} hoch={60} titel={t.apk.einstellung} text={t.apk.einstellungText} />
          {apkOffen && <AppLaden onSchliessen={() => setApkOffen(false)} />}
        </>
      )}

      <AppSettings />

      <ListenTitel className="mt-6">{t.rd.einst.ueber}</ListenTitel>
      {[[t.rd.einst.website, COMMUNITY.website], [t.rd.einst.whitepaper, COMMUNITY.whitepaper],
        [t.entdecken.explorer, COMMUNITY.explorer], [t.entdecken.github, COMMUNITY.github]].map(([titel, href]) => (
        <Zeile key={href} href={href} hoch={52} titel={titel} />
      ))}

      {/* Die eine Handlung, die sich nicht zuruecknehmen laesst: rot, ganz unten, mit Abstand. */}
      <button onClick={() => setModus('entfernen')}
              className="mt-8 inline-flex min-h-11 items-center text-[15.5px] font-medium text-risk underline decoration-risk/50 underline-offset-[.24em]">
        {t.einstellungen.entfernen}
      </button>

      <Blatt offen={blatt === 'sprache'} onSchliessen={() => setBlatt(null)} titel={t.einstellungen.sprache}>
        <ul role="listbox" aria-label={t.einstellungen.sprache} className="border-t border-line">
          {SPRACHEN.map(sp => (
            <li key={sp.code} className="border-b border-line">
              <button onClick={() => { setSprache(sp.code); setBlatt(null); }} lang={sp.code}
                      role="option" aria-selected={sprache === sp.code}
                      className={`flex min-h-[52px] w-full items-center justify-between text-left text-[16px] font-medium active:opacity-70 ${
                        sprache === sp.code ? 'text-lamp' : 'text-text'}`}>
                {sp.name}{sprache === sp.code && <Haken />}
              </button>
            </li>
          ))}
        </ul>
      </Blatt>

      <Blatt offen={blatt === 'sperre'} onSchliessen={() => setBlatt(null)} titel={t.einstellungen.sperre}>
        <p className="-mt-1 mb-3 text-[14.5px] leading-[1.45] text-lese">{t.einstellungen.sperreText}</p>
        <ul role="listbox" aria-label={t.einstellungen.sperre} className="border-t border-line">
          {SPERRE_STUFEN.map(ms => (
            <li key={ms} className="border-b border-line">
              <button onClick={() => { sperreSetzen(ms); setSperre(ms); setBlatt(null); }}
                      role="option" aria-selected={sperre === ms}
                      className={`flex min-h-[52px] w-full items-center justify-between text-left text-[16px] font-medium active:opacity-70 ${
                        sperre === ms ? 'text-lamp' : 'text-text'}`}>
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
  <svg viewBox="0 0 22 22" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 11.5l4 4 8-9" /></svg>
);
