'use client';

import Image from 'next/image';

import { useState } from 'react';
import { useWallet } from '@/lib/wallet/useWallet';
import { Screen, Title, Body, Button, Notice } from '@/components/ui/Primitives';

/**
 * Entsperren.
 *
 * Der private Schluessel lebt nur im Arbeitsspeicher dieser Sitzung. Nach
 * einem Neuladen ist er weg -- deshalb erscheint dieser Bildschirm, und
 * deshalb ist er absichtlich kurz.
 */
export default function Unlock() {
  const wallet = useWallet();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [zeigeNotausgang, setZeigeNotausgang] = useState(false);

  const oeffnen = async () => {
    setBusy(true); setFehler(null);
    const r = await wallet.unlock(pin);
    if (!r.ok) { setFehler(r.reason ?? 'Fehlgeschlagen.'); setPin(''); setBusy(false); }
  };

  return (
    <Screen>
      <div className="mt-8">
        <Image src="/marke/kristall.png" alt="" width={120} height={88} priority
               className="zoom mx-auto mb-6" style={{ width: 120, height: 88, objectFit: 'contain' }} />
        <Title>PIN eingeben</Title>
        {wallet.address && (
          <p className="mb-6 mt-3 break-all font-mono text-[12.5px] text-faint">{wallet.address}</p>
        )}

        <input
          inputMode="numeric" maxLength={6} value={pin} autoFocus
          onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setFehler(null); }}
          onKeyDown={e => { if (e.key === 'Enter' && pin.length === 6) oeffnen(); }}
          className="tnum sunk w-full px-4 py-5 text-center font-mono text-[26px]
                     tracking-[0.5em] outline-none transition-colors focus:border-work"
        />

        {fehler && <div className="mt-4"><Notice tone="risk">{fehler}</Notice></div>}

        <div className="mt-6">
          <Button onClick={oeffnen} disabled={pin.length !== 6 || busy}>
            {busy ? 'Wird geöffnet…' : 'Öffnen'}
          </Button>
        </div>

        {!zeigeNotausgang ? (
          <button
            onClick={() => setZeigeNotausgang(true)}
            className="mt-8 w-full text-center text-[13.5px] font-bold text-dim"
          >
            PIN vergessen
          </button>
        ) : (
          <div className="mt-8 space-y-4">
            <Notice tone="risk">
              Die PIN lässt sich nicht zurücksetzen. Du kannst diesen Tresor
              nur löschen und die Wallet mit deinen zwölf Wörtern neu
              einrichten. Ohne die Wörter ist das Guthaben verloren.
            </Notice>
            <Button variant="risk" onClick={() => {
              if (confirm('Tresor auf diesem Gerät löschen? Ohne deine zwölf Wörter kommst du danach nicht mehr an dein Guthaben.')) {
                wallet.forget();
              }
            }}>
              Tresor löschen
            </Button>
          </div>
        )}
      </div>
    </Screen>
  );
}
