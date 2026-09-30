'use client';

import Image from 'next/image';

import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@/lib/wallet/useWallet';
import { Screen, Title, Body, Button, Notice } from '@/components/ui/Primitives';
import { biometrieAktiv, biometriePin, biometrieDeaktivieren } from '@/lib/native/biometrie';
import { useT, fehlerText } from '@/i18n';

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
  const [bio, setBio] = useState(false);
  const bioVersucht = useRef(false);
  const { t } = useT();

  const oeffnen = async () => {
    setBusy(true); setFehler(null);
    const r = await wallet.unlock(pin);
    if (!r.ok) { setFehler(fehlerText(r.reason, t)); setPin(''); setBusy(false); }
  };

  /*
    Biometrie (nur Android-App): Sensor sofort anbieten, PIN bleibt darunter.
    Stimmt die hinterlegte PIN nicht mehr zum Tresor -- etwa nach einer
    Wiederherstellung mit neuer PIN -- wird Biometrie abgeschaltet, statt bei
    jedem Start ins Leere zu laufen.
  */
  const mitBiometrie = async () => {
    setBusy(true); setFehler(null);
    const p = await biometriePin(t.unlock.bioGrund);
    if (!p) { setBusy(false); return; }
    const r = await wallet.unlock(p);
    if (!r.ok) {
      await biometrieDeaktivieren(); setBio(false);
      setFehler(t.unlock.bioWeg);
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!biometrieAktiv()) return;
    setBio(true);
    if (bioVersucht.current) return;
    bioVersucht.current = true;
    mitBiometrie();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen>
      <div className="mt-8">
        <Image src="/marke/kristall.png" alt="" width={120} height={78} priority
               className="zoom mx-auto mb-6" style={{ width: 120, height: 78, objectFit: 'contain' }} />
        <Title>{t.unlock.titel}</Title>
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

        <div className="mt-6 space-y-3">
          <Button onClick={oeffnen} disabled={pin.length !== 6 || busy}>
            {busy ? t.unlock.oeffnet : t.unlock.oeffnen}
          </Button>
          {bio && (
            <Button variant="quiet" onClick={mitBiometrie} disabled={busy}>
              <svg viewBox="0 0 22 22" width="18" height="18" fill="none" stroke="currentColor"
                   strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 6.5a8 8 0 0 1 12 0M3.5 10a10 10 0 0 1 15 0M7 13a5 5 0 0 1 8 0M11 11v6M8.5 16.5a4 4 0 0 0 5 0" />
              </svg>
              {t.unlock.biometrie}
            </Button>
          )}
        </div>

        {!zeigeNotausgang ? (
          <button
            onClick={() => setZeigeNotausgang(true)}
            className="mt-8 w-full text-center text-[13.5px] font-bold text-dim"
          >
            {t.unlock.vergessen}
          </button>
        ) : (
          <div className="mt-8 space-y-4">
            <Notice tone="risk">{t.unlock.notausgang}</Notice>
            <Button variant="risk" onClick={() => {
              if (confirm(t.unlock.loeschenFrage)) {
                wallet.forget();
              }
            }}>
              {t.unlock.loeschen}
            </Button>
          </div>
        )}
      </div>
    </Screen>
  );
}
