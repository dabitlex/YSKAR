'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@/lib/wallet/useWallet';
import { Title, Body, Button, Notice } from '@/components/ui/Primitives';
import { istNativ, fehlerMerken } from '@/lib/native/plattform';
import { biometrieStand, biometrieAktivieren, biometrieDeaktivieren, type BiometrieStand }
  from '@/lib/native/biometrie';
import { appVersion, updatePruefen, updateOeffnen, updateLaden, type Update } from '@/lib/native/update';
import { pushAktiv, pushEinschalten, pushAusschalten, type PushStand } from '@/lib/native/push';
import { diagnose, type Diagnose } from '@/lib/native/diagnose';
import { widgetThemaLesen, widgetThemaSetzen, type WidgetThema } from '@/lib/native/widget';
import { Segment } from '@/components/ui/Bausteine';
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

const ZEILE = 'flex items-center justify-between gap-3 py-3';

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
    <li className="[&:not(:last-child)]:border-b [&:not(:last-child)]:border-line">
      <div className={ZEILE}>
        <span className="flex min-w-0 flex-col">
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
                  className="shrink-0 text-[13px] font-bold text-work">{t.app.neuPruefen}</button>
        )}
        {bio?.verfuegbar && (
          bio.aktiv
            ? <button onClick={ausschalten} className="shrink-0 text-[13px] font-bold text-risk">{t.allgemein.ausschalten}</button>
            : <button onClick={() => setPinFrage(true)} className="shrink-0 text-[13px] font-bold text-work">{t.allgemein.einschalten}</button>
        )}
      </div>

      {pinFrage && (
        <div className="pb-4">
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
  const [widgetThema, setWidgetThema] = useState<WidgetThema | null>(null);
  const { t, sprache } = useT();

  useEffect(() => {
    if (!istNativ()) return;
    setNativ(true);
    appVersion().then(setVersion);
    setPush(pushAktiv() ? 'an' : 'aus');
    widgetThemaLesen().then(setWidgetThema).catch(() => {});
  }, []);

  const pushUmschalten = async () => {
    if (!wallet.address) return;
    setPush('arbeitet');
    if (pushAktiv()) { await pushAusschalten(); setPush('aus'); return; }
    setPush(await pushEinschalten(wallet.address, sprache, t.app));
  };

  const widgetWaehlen = async (th: WidgetThema) => {
    setWidgetThema(th);
    // Was die App wirklich gespeichert hat, gilt -- nicht, was getippt wurde.
    const ist = await widgetThemaSetzen(th);
    if (ist) setWidgetThema(ist);
  };

  if (!nativ) return null;

  const suchen = async () => {
    setUpdate('sucht');
    const u = await updatePruefen();
    setUpdate(u ?? 'keins');
  };

  return (
    <>
      <p className="label mb-2 mt-7 px-0.5">{t.app.benachrichtigungen}</p>
      <ul className="panel mt-2 !py-0.5 px-4">
        <li className={ZEILE}>
          <span className="flex min-w-0 flex-col">
            <span className="text-[13.5px] font-bold">{t.app.pushTitel}</span>
            <span className="text-[12px] font-semibold text-faint">
              {push === 'an' ? t.app.pushAn
                : push === 'verweigert' ? t.app.pushVerweigert
                : push === 'arbeitet' ? '…'
                : t.app.pushAus}
            </span>
          </span>
          <button onClick={pushUmschalten} disabled={push === 'arbeitet'}
                  className={`shrink-0 text-[13px] font-bold ${push === 'an' ? 'text-risk' : 'text-work'}`}>
            {push === 'an' ? t.allgemein.ausschalten : t.allgemein.einschalten}
          </button>
        </li>
      </ul>

      <p className="label mb-2 mt-7 px-0.5">{t.app.app}</p>
      <ul className="panel mt-2 !py-0.5 px-4">
        <li className={`${ZEILE} border-b border-line`}>
          <span className="text-[13.5px] font-bold">{t.app.version}</span>
          <span className="tnum text-[13.5px] font-semibold text-dim">
            {version ? `${version.version} (${version.build})` : '—'}
          </span>
        </li>
        <li className={`${ZEILE} border-b border-line`}>
          <span className="text-[13.5px] font-bold">{t.app.updates}</span>
          {update === 'sucht' ? <span className="text-[13px] font-semibold text-faint">{t.app.sucht}</span>
            : update === 'keins' ? <span className="text-[13px] font-semibold text-proof">{t.app.aktuell}</span>
            : update && typeof update === 'object'
              ? <button onClick={async () => {
                    // Erst in der App laden; ohne Plugin oder bei Ablehnung der Browser.
                    const r = await updateLaden(update);
                    if (!r || r.status === 'erlaubnis') { if (!r) updateOeffnen(update.url); return; }
                  }} className="text-[13px] font-bold text-work">
                  {t.app.laden(update.version)}</button>
              : <button onClick={suchen} className="text-[13px] font-bold text-work">{t.app.jetztPruefen}</button>}
        </li>
        {widgetThema && (
          <li className={`${ZEILE} flex-wrap border-b border-line`}>
            <span className="text-[13.5px] font-bold">{t.app.widget}</span>
            <Segment label={t.app.widget} wert={widgetThema} onChange={widgetWaehlen}
                     werte={[
                       { v: 'hell' as const, text: t.einstellungen.themaHell },
                       { v: 'dunkel' as const, text: t.einstellungen.themaDunkel },
                     ]} />
          </li>
        )}
        <li className={ZEILE}>
          <span className="text-[13.5px] font-bold">{t.app.diagnose}</span>
          <button onClick={async () => { setDiag('laeuft'); try { setDiag(await diagnose()); } catch (e) { fehlerMerken('diagnose', e); setDiag(await diagnose().catch(() => null)); } }}
                  disabled={diag === 'laeuft'} className="text-[13px] font-bold text-work">
            {diag === 'laeuft' ? t.app.prueft : t.app.ausfuehren}
          </button>
        </li>
      </ul>
      {update && typeof update === 'object' && update.notizen && (
        <p className="mt-3 whitespace-pre-line text-[12.5px] font-medium leading-relaxed text-dim">
          {update.notizen.slice(0, 600)}
        </p>
      )}
      {diag && diag !== 'laeuft' && (
        <pre className="mt-3 overflow-x-auto rounded-[14px] bg-raised p-3 font-mono text-[11px] leading-relaxed text-dim">
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
