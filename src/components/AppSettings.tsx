'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@/lib/wallet/useWallet';
import { Title, Body, Button, Notice } from '@/components/ui/Primitives';
import { istNativ, fehlerMerken } from '@/lib/native/plattform';
import { biometrieStand, biometrieAktivieren, biometrieDeaktivieren, type BiometrieStand }
  from '@/lib/native/biometrie';
import { appVersion, updatePruefen, updateOeffnen, type Update } from '@/lib/native/update';
import { pushAktiv, pushEinschalten, pushAusschalten, type PushStand } from '@/lib/native/push';
import { diagnose, type Diagnose } from '@/lib/native/diagnose';
import { useT } from '@/i18n';

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
  const [push, setPush] = useState<PushStand | 'arbeitet'>('aus');
  const [diag, setDiag] = useState<Diagnose | 'laeuft' | null>(null);
  const { t, sprache } = useT();

  useEffect(() => {
    if (!istNativ()) return;
    setNativ(true);
    biometrieStand().then(setBio)
      .catch(e => { fehlerMerken('biometrieStand', e); setBio({ verfuegbar: false, grund: 'fehler', detail: String(e) }); });
    appVersion().then(setVersion);
    setPush(pushAktiv() ? 'an' : 'aus');
  }, []);

  const pushUmschalten = async () => {
    if (!wallet.address) return;
    setPush('arbeitet');
    if (pushAktiv()) { await pushAusschalten(); setPush('aus'); return; }
    setPush(await pushEinschalten(wallet.address, sprache, t.app));
  };

  if (!nativ) return null;

  const einschalten = async () => {
    setBusy(true); setFehler(null);
    // Die PIN wird gegen den Tresor geprueft, bevor sie hinterlegt wird --
    // eine falsche PIN im geschuetzten Speicher waere ein stiller Fehler.
    const probe = await wallet.revealMnemonic(pin);
    if (!probe.ok) { setFehler(t.fehler.pinFalsch); setPin(''); setBusy(false); return; }
    const ok = await biometrieAktivieren(pin, t.app.bioGrund);
    setPin(''); setPinFrage(false); setBusy(false);
    if (!ok) { setFehler(t.app.bioNicht); return; }
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
      <p className="label mb-2 mt-6">{t.app.sicherheit}</p>
      <ul className="mt-2 border-t border-line">
        <li className="flex items-center justify-between gap-3 border-b border-line py-3">
          <span className="flex flex-col">
            <span className="text-[13.5px] font-bold">{t.app.biometrie}</span>
            <span className="text-[12px] font-semibold text-faint">
              {bio === null ? '…'
                : !bio.verfuegbar
                  ? (bio.grund === 'kein_sensor' ? `${t.app.keinSensor}${bio.detail ? ` (${bio.detail})` : ''}`
                     : bio.grund === 'fehler' ? t.app.pluginFehler(bio.detail ?? t.allgemein.unbekannt)
                     : `${t.app.nichtEingerichtet}${bio.detail ? ` (${bio.detail})` : ''}`)
                  : bio.aktiv ? t.app.bioAktiv : t.app.bioAus}
            </span>
          </span>
          {bio === null && (
            <button onClick={() => biometrieStand().then(setBio)
                       .catch(e => setBio({ verfuegbar: false, grund: 'fehler', detail: String(e) }))}
                    className="text-[13px] font-bold text-work">{t.app.neuPruefen}</button>
          )}
          {bio?.verfuegbar && (
            bio.aktiv
              ? <button onClick={ausschalten} className="text-[13px] font-bold text-risk">{t.allgemein.ausschalten}</button>
              : <button onClick={() => setPinFrage(true)} className="text-[13px] font-bold text-work">{t.allgemein.einschalten}</button>
          )}
        </li>
      </ul>

      {pinFrage && (
        <div className="panel mt-3 p-4">
          <Body>{t.app.bioPinText}</Body>
          <input inputMode="numeric" maxLength={6} value={pin} autoFocus
                 onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setFehler(null); }}
                 className="tnum sunk mt-4 w-full px-4 py-4 text-center font-mono text-xl
                            tracking-[0.45em] outline-none transition-colors focus:border-work" />
          {fehler && <div className="mt-3"><Notice tone="risk">{fehler}</Notice></div>}
          <div className="mt-4 space-y-2">
            <Button onClick={einschalten} disabled={pin.length !== 6 || busy}>
              {busy ? t.app.bioEinrichten : t.app.bioEinschalten}
            </Button>
            <Button variant="quiet" onClick={() => { setPinFrage(false); setPin(''); setFehler(null); }}>{t.allgemein.abbrechen}</Button>
          </div>
        </div>
      )}
      {!pinFrage && fehler && <div className="mt-3"><Notice tone="risk">{fehler}</Notice></div>}

      <p className="label mb-2 mt-6">{t.app.benachrichtigungen}</p>
      <ul className="mt-2 border-t border-line">
        <li className="flex items-center justify-between gap-3 border-b border-line py-3">
          <span className="flex flex-col">
            <span className="text-[13.5px] font-bold">{t.app.pushTitel}</span>
            <span className="text-[12px] font-semibold text-faint">
              {push === 'an' ? t.app.pushAn
                : push === 'verweigert' ? t.app.pushVerweigert
                : push === 'arbeitet' ? '…'
                : t.app.pushAus}
            </span>
          </span>
          <button onClick={pushUmschalten} disabled={push === 'arbeitet'}
                  className={`text-[13px] font-bold ${push === 'an' ? 'text-risk' : 'text-work'}`}>
            {push === 'an' ? t.allgemein.ausschalten : t.allgemein.einschalten}
          </button>
        </li>
      </ul>

      <p className="label mb-2 mt-6">{t.app.app}</p>
      <ul className="mt-2 border-t border-line">
        <li className="flex items-center justify-between border-b border-line py-3">
          <span className="text-[13.5px] font-bold">{t.app.version}</span>
          <span className="tnum text-[13.5px] font-semibold text-dim">
            {version ? `${version.version} (${version.build})` : '—'}
          </span>
        </li>
        <li className="flex items-center justify-between border-b border-line py-3">
          <span className="text-[13.5px] font-bold">{t.app.updates}</span>
          {update === 'sucht' ? <span className="text-[13px] font-semibold text-faint">{t.app.sucht}</span>
            : update === 'keins' ? <span className="text-[13px] font-semibold text-proof">{t.app.aktuell}</span>
            : update && typeof update === 'object'
              ? <button onClick={() => updateOeffnen(update.url)} className="text-[13px] font-bold text-work">
                  {t.app.laden(update.version)}</button>
              : <button onClick={suchen} className="text-[13px] font-bold text-work">{t.app.jetztPruefen}</button>}
        </li>
      </ul>
      <p className="label mb-2 mt-6">{t.app.diagnose}</p>
      <ul className="mt-2 border-t border-line">
        <li className="flex items-center justify-between border-b border-line py-3">
          <span className="text-[13.5px] font-bold">{t.app.bruecke}</span>
          <button onClick={async () => { setDiag('laeuft'); try { setDiag(await diagnose()); } catch (e) { fehlerMerken('diagnose', e); setDiag(await diagnose().catch(() => null)); } }}
                  disabled={diag === 'laeuft'} className="text-[13px] font-bold text-work">
            {diag === 'laeuft' ? t.app.prueft : t.app.ausfuehren}
          </button>
        </li>
      </ul>
      {diag && diag !== 'laeuft' && (
        <pre className="mt-3 overflow-x-auto rounded-[14px] bg-raised p-3 font-mono text-[11px] leading-relaxed text-dim">
{`Plattform:   ${diag.plattform}  (Brücke: ${diag.bruecke ? 'ja' : 'nein'})
Plugins:     ${diag.plugins.join(', ') || '—'}
App:         ${diag.appInfo}
Biometrie:   ${diag.biometrie}
Speicher:    ${diag.speicher}
MiningDienst:${diag.miningDienst}
Fehler:      ${diag.fehler.length ? '\n  ' + diag.fehler.join('\n  ') : 'keine'}`}
        </pre>
      )}

      {update && typeof update === 'object' && update.notizen && (
        <p className="mt-3 whitespace-pre-line text-[12.5px] font-medium leading-relaxed text-dim">
          {update.notizen.slice(0, 600)}
        </p>
      )}
    </>
  );
}

