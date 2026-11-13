'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@/lib/wallet/useWallet';
import { Body, Button, Notice } from '@/components/ui/Primitives';
import { ListenTitel } from '@/components/ui/Zeilen';
import { istNativ, fehlerMerken } from '@/lib/native/plattform';
import { biometrieStand, biometrieAktivieren, biometrieDeaktivieren, type BiometrieStand }
  from '@/lib/native/biometrie';
import { appVersion, updatePruefen, updateOeffnen, updateLaden, type Update } from '@/lib/native/update';
import { pushAktiv, pushEinschalten, pushAusschalten, type PushStand } from '@/lib/native/push';
import { diagnose, type Diagnose } from '@/lib/native/diagnose';
import { useT } from '@/i18n';

/**
 * Einstellungen der Android-App: Biometrie, Push, Version, Update-Suche,
 * Darstellung des Widgets, Diagnose.
 *
 * Eigene Datei, weil das alles ausserhalb der App nicht existiert. Im
 * Telegram-WebView rendern beide Komponenten nichts.
 *
 *   AppBiometrie  eine Zeile fuer die Gruppe "Sicherheit" (Settings.tsx)
 *   AppSettings   die Gruppen "Benachrichtigungen" und "App"
 */

const ZEILE = 'flex min-h-[52px] items-center justify-between gap-3 py-[11px]';
const TITEL = 'text-[16px] font-medium leading-[1.3]';
const UNTER = 'text-[13.5px] leading-[1.4] text-dim';
const WERT = 'tnum shrink-0 font-mono text-[13.5px] text-lese';
/** Schalter in einer Zeile: unterstrichenes Wort, 44 px hoch. */
const TUN = 'shrink-0 inline-flex min-h-11 items-center text-[14.5px] font-medium underline underline-offset-[.24em]';
const AN = `${TUN} text-text decoration-text/45`;
const AUS = `${TUN} text-risk decoration-risk/50`;

/** Fingerabdruck -- als Zeile (<li>) in der Gruppe "Sicherheit". */
export function AppBiometrie() {
  const wallet = useWallet();
  const [nativ, setNativ] = useState(false);
  const [bio, setBio] = useState<BiometrieStand | null>(null);
  const [pinFrage, setPinFrage] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const { t } = useT();

  useEffect(() => {
    if (!istNativ()) return;
    setNativ(true);
    biometrieStand().then(setBio)
      .catch(e => { fehlerMerken('biometrieStand', e); setBio({ verfuegbar: false, grund: 'fehler', detail: String(e) }); });
  }, []);

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

  return (
    <li className="border-b border-line">
      <div className={ZEILE}>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={TITEL}>{t.app.biometrie}</span>
          <span className={UNTER}>
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
                  className={AN}>{t.app.neuPruefen}</button>
        )}
        {bio?.verfuegbar && (
          bio.aktiv
            ? <button onClick={ausschalten} className={AUS}>{t.allgemein.ausschalten}</button>
            : <button onClick={() => setPinFrage(true)} className={AN}>{t.allgemein.einschalten}</button>
        )}
      </div>

      {pinFrage && (
        <div className="pb-4">
          <Body>{t.app.bioPinText}</Body>
          <input inputMode="numeric" maxLength={6} value={pin} autoFocus
                 onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setFehler(null); }}
                 className="tnum feld mt-4 h-14 w-full bg-transparent px-4 text-center font-mono text-[22px]
                            tracking-[0.45em] text-text outline-none" />
          {fehler && <div className="mt-3"><Notice tone="risk">{fehler}</Notice></div>}
          <div className="mt-4 space-y-2">
            <Button onClick={einschalten} disabled={pin.length !== 6 || busy}>
              {busy ? t.app.bioEinrichten : t.app.bioEinschalten}
            </Button>
            <Button variant="quiet" onClick={() => { setPinFrage(false); setPin(''); setFehler(null); }}>{t.allgemein.abbrechen}</Button>
          </div>
        </div>
      )}
      {!pinFrage && fehler && <div className="pb-3"><Notice tone="risk">{fehler}</Notice></div>}
    </li>
  );
}

export default function AppSettings() {
  const wallet = useWallet();
  const [nativ, setNativ] = useState(false);
  const [version, setVersion] = useState<{ version: string; build: string } | null>(null);
  const [update, setUpdate] = useState<Update | null | 'keins' | 'sucht'>(null);
  const [push, setPush] = useState<PushStand | 'arbeitet'>('aus');
  const [diag, setDiag] = useState<Diagnose | 'laeuft' | null>(null);
  // null: Diese App-Version kennt die Auswahl nicht -- dann keine Zeile.
  const { t, sprache } = useT();

  useEffect(() => {
    if (!istNativ()) return;
    setNativ(true);
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

  const suchen = async () => {
    setUpdate('sucht');
    const u = await updatePruefen();
    setUpdate(u ?? 'keins');
  };

  return (
    <>
      <ListenTitel className="mt-6">{t.app.benachrichtigungen}</ListenTitel>
      <ul>
        <li className={`${ZEILE} border-b border-line`}>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className={TITEL}>{t.app.pushTitel}</span>
            <span className={UNTER}>
              {push === 'an' ? t.app.pushAn
                : push === 'verweigert' ? t.app.pushVerweigert
                : push === 'arbeitet' ? '…'
                : t.app.pushAus}
            </span>
          </span>
          <button onClick={pushUmschalten} disabled={push === 'arbeitet'}
                  className={push === 'an' ? AUS : AN}>
            {push === 'an' ? t.allgemein.ausschalten : t.allgemein.einschalten}
          </button>
        </li>
      </ul>

      <ListenTitel className="mt-6">{t.app.app}</ListenTitel>
      <ul>
        <li className={`${ZEILE} border-b border-line`}>
          <span className={TITEL}>{t.app.version}</span>
          <span className={WERT}>
            {version ? `${version.version} (${version.build})` : '—'}
          </span>
        </li>
        <li className={`${ZEILE} border-b border-line`}>
          <span className={TITEL}>{t.app.updates}</span>
          {update === 'sucht' ? <span className="text-[14px] text-dim">{t.app.sucht}</span>
            : update === 'keins' ? <span className="inline-flex items-center gap-[7px] text-[14px] text-text"><span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-proof" />{t.app.aktuell}</span>
            : update && typeof update === 'object'
              ? <button onClick={async () => {
                    // Erst in der App laden; ohne Plugin oder bei Ablehnung der Browser.
                    const r = await updateLaden(update);
                    if (!r || r.status === 'erlaubnis') { if (!r) updateOeffnen(update.url); return; }
                  }} className={`${TUN} text-lamp decoration-lamp/50`}>
                  {t.app.laden(update.version)}</button>
              : <button onClick={suchen} className={AN}>{t.app.jetztPruefen}</button>}
        </li>
        <li className={`${ZEILE} border-b border-line`}>
          <span className={TITEL}>{t.app.diagnose}</span>
          <button onClick={async () => { setDiag('laeuft'); try { setDiag(await diagnose()); } catch (e) { fehlerMerken('diagnose', e); setDiag(await diagnose().catch(() => null)); } }}
                  disabled={diag === 'laeuft'} className={AN}>
            {diag === 'laeuft' ? t.app.prueft : t.app.ausfuehren}
          </button>
        </li>
      </ul>
      {update && typeof update === 'object' && update.notizen && (
        <p className="mt-3 whitespace-pre-line text-[13.5px] leading-[1.45] text-lese">
          {update.notizen.slice(0, 600)}
        </p>
      )}
      {diag && diag !== 'laeuft' && (
        <pre className="terminal mt-3 overflow-x-auto font-mono text-[11.5px] leading-relaxed text-lese">
{`Plattform:   ${diag.plattform}  (Brücke: ${diag.bruecke ? 'ja' : 'nein'})
Plugins:     ${diag.plugins.join(', ') || '—'}
App:         ${diag.appInfo}
Biometrie:   ${diag.biometrie}
Speicher:    ${diag.speicher}
MiningDienst:${diag.miningDienst}
Fehler:      ${diag.fehler.length ? '\n  ' + diag.fehler.join('\n  ') : 'keine'}
Mining:      ${diag.mining.length ? '\n  ' + diag.mining.join('\n  ') : '—'}${diag.nativ.length ? '\nNativ:       \n  ' + diag.nativ.join('\n  ') : ''}`}
        </pre>
      )}
    </>
  );
}
