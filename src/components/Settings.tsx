'use client';

import { useState } from 'react';
import { useWallet } from '@/lib/wallet/useWallet';
import { Title, Body, Button, Notice } from '@/components/ui/Primitives';

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

  if (modus === 'woerter') {
    return (
      <>
        <button onClick={() => { setModus('liste'); setWoerter(null); setPin(''); }}
                className="text-sm text-dim">← Einstellungen</button>
        <div className="mt-4"><Title>Deine zwölf Wörter</Title></div>

        {!woerter ? (
          <>
            <Body>
              Zum Anzeigen wird die PIN gebraucht — die Wörter liegen
              verschlüsselt im Gerät und werden nie im Speicher mitgeführt.
            </Body>
            <input
              inputMode="numeric" maxLength={6} value={pin} autoFocus
              onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setFehler(null); }}
              className="tnum mt-4 w-full rounded-lg border border-line bg-surface px-4
                         py-3 text-center font-mono text-lg tracking-[0.4em] outline-none
                         focus:border-work"
            />
            {fehler && <div className="mt-4"><Notice tone="risk">{fehler}</Notice></div>}
            <div className="mt-5">
              <Button disabled={pin.length !== 6} onClick={async () => {
                const r = await wallet.revealMnemonic(pin);
                if (!r.ok || !r.mnemonic) { setFehler(r.reason ?? 'Fehlgeschlagen.'); return; }
                setWoerter(r.mnemonic.split(' '));
              }}>Anzeigen</Button>
            </div>
          </>
        ) : (
          <>
            <div className="mt-3">
              <Notice tone="risk">
                Nicht abfotografieren. Ein Screenshot landet in der Galerie und
                in deiner Cloud-Sicherung.
              </Notice>
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
                Fertig
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
                className="text-sm text-dim">← Einstellungen</button>
        <div className="mt-4"><Title>Wallet entfernen</Title></div>
        <Body>
          Die verschlüsselten Wörter werden von diesem Gerät gelöscht. Dein
          Guthaben bleibt in der Kette — aber du kommst nur mit deinen zwölf
          Wörtern wieder heran.
        </Body>
        <div className="mt-4">
          <Notice tone="risk">
            Ohne die Wörter ist das Guthaben unwiederbringlich verloren. Es gibt
            keine Wiederherstellung über uns.
          </Notice>
        </div>

        <label className="mt-6 flex cursor-pointer items-start gap-3 text-[15px]">
          <input type="checkbox" checked={bestaetigt}
                 onChange={e => setBestaetigt(e.target.checked)}
                 className="mt-1 h-4 w-4 shrink-0 accent-[rgb(var(--risk))]" />
          <span>Ich habe meine zwölf Wörter sicher notiert.</span>
        </label>

        <div className="mt-6 space-y-3">
          <Button variant="risk" disabled={!bestaetigt} onClick={() => wallet.forget()}>
            Wallet von diesem Gerät entfernen
          </Button>
          <Button variant="quiet" onClick={() => { setModus('liste'); setBestaetigt(false); }}>
            Abbrechen
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <button onClick={onZurueck} className="text-sm text-dim">← Info</button>
      <div className="mt-4"><Title>Einstellungen</Title></div>

      <p className="mt-6 text-sm text-dim">Wallet</p>
      <ul className="mt-2 border-t border-line">
        <Eintrag onClick={() => setModus('woerter')}>Zwölf Wörter anzeigen</Eintrag>
        <li className="flex items-center justify-between border-b border-line py-3">
          <span className="text-[13.5px]">Adresse</span>
          <span className="max-w-[55%] truncate font-mono text-xs text-dim">
            {wallet.address}
          </span>
        </li>
      </ul>

      <p className="mt-6 text-sm text-dim">Mining</p>
      <ul className="mt-2 border-t border-line">
        <li className="flex items-center justify-between border-b border-line py-3">
          <span className="text-[13.5px]">Rechenanteil</span>
          <span className="tnum text-[13.5px] text-dim">{anteil}%</span>
        </li>
        <li className="flex items-center justify-between border-b border-line py-3">
          <span className="text-[13.5px]">Worker</span>
          <span className="tnum text-[13.5px] text-dim">{workers}</span>
        </li>
      </ul>

      <p className="mt-6 text-sm text-dim">Gerät</p>
      <div className="mt-2">
        <Button variant="risk" onClick={() => setModus('entfernen')}>
          Wallet von diesem Gerät entfernen
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
