'use client';

import { useState } from 'react';
import { useWallet } from '@/lib/wallet/useWallet';
import { Title, Body, Button, Notice } from '@/components/ui/Primitives';
import AppSettings from '@/components/AppSettings';
import { useT, fehlerText, SPRACHEN } from '@/i18n';
import { SPERRE_STUFEN, sperreLesen, sperreSetzen } from '@/hooks/useAutoSperre';

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
                <li key={i} className="flex items-baseline gap-3 border-b border-line py-3">
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
      <button onClick={onZurueck} className="text-[13.5px] font-bold text-work">← {t.allgemein.zurueck}</button>
      <div className="mt-4"><Title>{t.einstellungen.titel}</Title></div>

      <p className="label mt-6 mb-2">{t.einstellungen.sprache}</p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t.einstellungen.sprache}>
        {SPRACHEN.map(s => (
          <button key={s.code} onClick={() => setSprache(s.code)} aria-pressed={sprache === s.code} lang={s.code}
                  className={`rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors ${
                    sprache === s.code ? 'border-work bg-work/10 text-work' : 'border-line bg-surface text-dim'}`}>
            {s.name}
          </button>
        ))}
      </div>

      <p className="label mt-6 mb-2">{t.einstellungen.wallet}</p>
      <ul className="mt-2 border-t border-line">
        <Eintrag onClick={() => setModus('woerter')}>{t.einstellungen.woerterZeigen}</Eintrag>
        <li className="flex items-center justify-between border-b border-line py-3">
          <span className="text-[13.5px]">{t.einstellungen.adresse}</span>
          <span className="max-w-[55%] truncate font-mono text-xs text-dim">
            {wallet.address}
          </span>
        </li>
      </ul>

      <p className="label mt-6 mb-2">{t.einstellungen.sperre}</p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={t.einstellungen.sperre}>
        {SPERRE_STUFEN.map(ms => (
          <button key={ms} onClick={() => { sperreSetzen(ms); setSperre(ms); }} aria-pressed={sperre === ms}
                  className={`rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors ${
                    sperre === ms ? 'border-work bg-work/10 text-work' : 'border-line bg-surface text-dim'}`}>
            {ms === 0 ? t.einstellungen.sperreSofort : ms < 0 ? t.einstellungen.sperreNie : t.einstellungen.sperreMin(ms / 60_000)}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[12px] font-medium leading-relaxed text-faint">{t.einstellungen.sperreText}</p>

      <p className="label mt-6 mb-2">{t.einstellungen.mining}</p>
      <ul className="mt-2 border-t border-line">
        <li className="flex items-center justify-between border-b border-line py-3">
          <span className="text-[13.5px]">{t.einstellungen.anteil}</span>
          <span className="tnum text-[13.5px] text-dim">{anteil}%</span>
        </li>
        <li className="flex items-center justify-between border-b border-line py-3">
          <span className="text-[13.5px]">{t.einstellungen.worker}</span>
          <span className="tnum text-[13.5px] text-dim">{workers}</span>
        </li>
      </ul>

      <AppSettings />

      <p className="label mt-6 mb-2">{t.einstellungen.geraet}</p>
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
    <li>
      <button onClick={onClick}
              className="flex w-full items-center justify-between border-b border-line
                         py-3 text-left text-[13.5px]">
        {children} <span className="text-dim">›</span>
      </button>
    </li>
  );
}
