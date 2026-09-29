'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@/lib/wallet/useWallet';
import { Title, Body, Button, Notice } from '@/components/ui/Primitives';
import { istNativ } from '@/lib/native/plattform';
import { biometrieStand, biometrieAktivieren, biometrieDeaktivieren, type BiometrieStand }
  from '@/lib/native/biometrie';
import { appVersion, updatePruefen, updateOeffnen, type Update } from '@/lib/native/update';

/**
 * Einstellungen der Android-App: Biometrie, Version, Update-Suche.
 *
 * Eigene Datei, weil das alles ausserhalb der App nicht existiert. Im
 * Telegram-WebView rendert die Komponente nichts.
 */
export default function AppSettings() {
  const wallet = useWallet();
  const [nativ, setNativ] = useState(false);
  const [bio, setBio] = useState<BiometrieStand | null>(null);
  const [pinFrage, setPinFrage] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [version, setVersion] = useState<{ version: string; build: string } | null>(null);
  const [update, setUpdate] = useState<Update | null | 'keins' | 'sucht'>(null);

  useEffect(() => {
    if (!istNativ()) return;
    setNativ(true);
    biometrieStand().then(setBio);
    appVersion().then(setVersion);
  }, []);

  if (!nativ) return null;

  const einschalten = async () => {
    setBusy(true); setFehler(null);
    // Die PIN wird gegen den Tresor geprueft, bevor sie hinterlegt wird --
    // eine falsche PIN im geschuetzten Speicher waere ein stiller Fehler.
    const probe = await wallet.revealMnemonic(pin);
    if (!probe.ok) { setFehler('PIN stimmt nicht.'); setPin(''); setBusy(false); return; }
    const ok = await biometrieAktivieren(pin);
    setPin(''); setPinFrage(false); setBusy(false);
    if (!ok) { setFehler('Biometrie wurde nicht bestätigt.'); return; }
    setBio(await biometrieStand());
  };

  const ausschalten = async () => {
    await biometrieDeaktivieren();
    setBio(await biometrieStand());
  };

  const suchen = async () => {
    setUpdate('sucht');
    const u = await updatePruefen();
    setUpdate(u ?? 'keins');
  };

  return (
    <>
      <p className="label mb-2 mt-6">Sicherheit</p>
      <ul className="mt-2 border-t border-line">
        <li className="flex items-center justify-between gap-3 border-b border-line py-3">
          <span className="flex flex-col">
            <span className="text-[13.5px] font-bold">Fingerabdruck / Gesicht</span>
            <span className="text-[12px] font-semibold text-faint">
              {bio === null ? '…'
                : !bio.verfuegbar
                  ? (bio.grund === 'kein_sensor' ? 'Dieses Gerät hat keinen Sensor.'
                     : 'Im Android-System nicht eingerichtet.')
                  : bio.aktiv ? 'Zum Entsperren und Senden aktiv.' : 'Aus — PIN wird verlangt.'}
            </span>
          </span>
          {bio?.verfuegbar && (
            bio.aktiv
              ? <button onClick={ausschalten} className="text-[13px] font-bold text-risk">Ausschalten</button>
              : <button onClick={() => setPinFrage(true)} className="text-[13px] font-bold text-work">Einschalten</button>
          )}
        </li>
      </ul>

      {pinFrage && (
        <div className="panel mt-3 p-4">
          <Body>Zum Einschalten einmal die PIN eingeben. Sie wird im geschützten Speicher des Geräts hinterlegt und nur nach bestätigter Biometrie gelesen.</Body>
          <input inputMode="numeric" maxLength={6} value={pin} autoFocus
                 onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setFehler(null); }}
                 className="tnum sunk mt-4 w-full px-4 py-4 text-center font-mono text-xl
                            tracking-[0.45em] outline-none transition-colors focus:border-work" />
          {fehler && <div className="mt-3"><Notice tone="risk">{fehler}</Notice></div>}
          <div className="mt-4 space-y-2">
            <Button onClick={einschalten} disabled={pin.length !== 6 || busy}>
              {busy ? 'Wird eingerichtet…' : 'Biometrie einschalten'}
            </Button>
            <Button variant="quiet" onClick={() => { setPinFrage(false); setPin(''); setFehler(null); }}>Abbrechen</Button>
          </div>
        </div>
      )}
      {!pinFrage && fehler && <div className="mt-3"><Notice tone="risk">{fehler}</Notice></div>}

      <p className="label mb-2 mt-6">App</p>
      <ul className="mt-2 border-t border-line">
        <li className="flex items-center justify-between border-b border-line py-3">
          <span className="text-[13.5px] font-bold">Version</span>
          <span className="tnum text-[13.5px] font-semibold text-dim">
            {version ? `${version.version} (${version.build})` : '—'}
          </span>
        </li>
        <li className="flex items-center justify-between border-b border-line py-3">
          <span className="text-[13.5px] font-bold">Updates</span>
          {update === 'sucht' ? <span className="text-[13px] font-semibold text-faint">sucht…</span>
            : update === 'keins' ? <span className="text-[13px] font-semibold text-proof">aktuell</span>
            : update && typeof update === 'object'
              ? <button onClick={() => updateOeffnen(update.url)} className="text-[13px] font-bold text-work">
                  {update.version} laden</button>
              : <button onClick={suchen} className="text-[13px] font-bold text-work">Jetzt prüfen</button>}
        </li>
      </ul>
      {update && typeof update === 'object' && update.notizen && (
        <p className="mt-3 whitespace-pre-line text-[12.5px] font-medium leading-relaxed text-dim">
          {update.notizen.slice(0, 600)}
        </p>
      )}
    </>
  );
}

