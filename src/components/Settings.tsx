'use client';

import { useState } from 'react';
import { useWallet } from '@/lib/wallet/useWallet';
import { Title, Body, Button, Notice } from '@/components/ui/Primitives';
import AppSettings from '@/components/AppSettings';
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
export default function Settings({ onZurueck, anteil, workers }: {
  onZurueck: () => void; anteil: number; workers: number;
}) {
  const wallet = useWallet();
  const [modus, setModus] = useState<'liste' | 'woerter' | 'entfernen'>('liste');
  const [pin, setPin] = useState('');
  const [woerter, setWoerter] = useState<string[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [bestaetigt, setBestaetigt] = useState(false);
  const { t, sprache, setSprache } = useT();
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

      <p className="label mb-2 mt-7 px-0.5">{t.einstellungen.sprache}</p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t.einstellungen.sprache}>
        {SPRACHEN.map(s => (
          <button key={s.code} onClick={() => setSprache(s.code)} aria-pressed={sprache === s.code} lang={s.code}
                  className={`rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors ${
                    sprache === s.code ? 'border-work bg-work/10 text-work' : 'panel !rounded-full text-dim'}`}>
            {s.name}
          </button>
        ))}
      </div>

      <p className="label mb-2 mt-7 px-0.5">{t.einstellungen.thema}</p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t.einstellungen.thema}>
        {THEMEN.map(th => (
          <button key={th} onClick={() => setThema(th)} aria-pressed={thema === th}
                  className={`rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors ${
                    thema === th ? 'border-work bg-work/10 text-work' : 'panel !rounded-full text-dim'}`}>
            {th === 'system' ? t.einstellungen.themaSystem : th === 'hell' ? t.einstellungen.themaHell : t.einstellungen.themaDunkel}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[12px] font-medium leading-relaxed text-faint">{t.einstellungen.themaText}</p>

      <p className="label mb-2 mt-7 px-0.5">{t.einstellungen.wallet}</p>
      <ul className="panel mt-2 !py-0.5 px-4">
        <Eintrag onClick={() => setModus('woerter')}>{t.einstellungen.woerterZeigen}</Eintrag>
        <li className="flex items-center justify-between py-3 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-line">
          <span className="text-[13.5px]">{t.einstellungen.adresse}</span>
          <span className="max-w-[55%] truncate font-mono text-xs text-dim">
            {wallet.address}
          </span>
        </li>
      </ul>

      <p className="label mb-2 mt-7 px-0.5">{t.einstellungen.sperre}</p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t.einstellungen.sperre}>
        {SPERRE_STUFEN.map(ms => (
          <button key={ms} onClick={() => { sperreSetzen(ms); setSperre(ms); }} aria-pressed={sperre === ms}
                  className={`rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors ${
                    sperre === ms ? 'border-work bg-work/10 text-work' : 'panel !rounded-full text-dim'}`}>
            {ms === 0 ? t.einstellungen.sperreSofort : ms < 0 ? t.einstellungen.sperreNie : t.einstellungen.sperreMin(ms / 60_000)}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[12px] font-medium leading-relaxed text-faint">{t.einstellungen.sperreText}</p>

      <p className="label mb-2 mt-7 px-0.5">{t.einstellungen.mining}</p>
      <ul className="panel mt-2 !py-0.5 px-4">
        <li className="flex items-center justify-between py-3 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-line">
          <span className="text-[13.5px]">{t.einstellungen.anteil}</span>
          <span className="tnum text-[13.5px] text-dim">{anteil}%</span>
        </li>
        <li className="flex items-center justify-between py-3 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-line">
          <span className="text-[13.5px]">{t.einstellungen.worker}</span>
          <span className="tnum text-[13.5px] text-dim">{workers}</span>
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
      <div className="mt-2">
        <Button variant="risk" onClick={() => setModus('entfernen')}>
          {t.einstellungen.entfernen}
        </Button>
      </div>
    </>
  );
}

function Eintrag({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <li className="[&:not(:last-child)]:border-b [&:not(:last-child)]:border-line">
      <button onClick={onClick}
              className="flex w-full items-center justify-between py-3 text-left text-[13.5px] font-semibold active:opacity-70">
        {children} <span className="text-faint">›</span>
      </button>
    </li>
  );
}
