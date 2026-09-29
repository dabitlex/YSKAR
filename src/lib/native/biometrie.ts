'use client';

import { istNativ } from './plattform';

/**
 * Entsperren und Signieren mit Fingerabdruck oder Gesicht.
 *
 * WIE ES FUNKTIONIERT, EHRLICH
 *
 * Der Tresor bleibt mit der PIN verschluesselt -- daran aendert Biometrie
 * nichts. Wer Biometrie einschaltet, legt seine PIN im geschuetzten Speicher
 * der App ab (Android Keystore, EncryptedSharedPreferences). Beim Entsperren
 * oder Senden verlangt die App zuerst die biometrische Bestaetigung des
 * Systems und liest die PIN erst danach aus, um damit den Tresor zu oeffnen.
 *
 * Was das schuetzt: das entsperrte Telefon in fremder Hand. Was es nicht
 * schuetzt: ein Geraet mit Root-Zugriff -- dort liesse sich der Speicher
 * auslesen, ohne den Sensor zu beruehren. Dasselbe gilt fuer die PIN.
 * Wer das nicht will, laesst Biometrie aus.
 *
 * Nur in der nativen App. Im Telegram-WebView gibt es diese Funktionen
 * nicht; jede Funktion hier antwortet dann so, als gaebe es keinen Sensor.
 */

const SCHLUESSEL = 'yskar.tresor.pin';
const MERKER = 'yskar.biometrie';   // localStorage: eingeschaltet ja/nein

export type BiometrieStand =
  | { verfuegbar: false; grund: 'kein_sensor' | 'nicht_eingerichtet' | 'nicht_nativ' | 'fehler'; detail?: string }
  | { verfuegbar: true; art: string; aktiv: boolean };

async function bio() {
  const m = await import('@aparajita/capacitor-biometric-auth');
  return m.BiometricAuth;
}
async function speicher() {
  const m = await import('@aparajita/capacitor-secure-storage');
  return m.SecureStorage;
}

export function biometrieAktiv(): boolean {
  try { return localStorage.getItem(MERKER) === '1'; } catch { return false; }
}

export async function biometrieStand(): Promise<BiometrieStand> {
  if (!istNativ()) return { verfuegbar: false, grund: 'nicht_nativ' };
  try {
    const r = await (await bio()).checkBiometry();
    if (!r.isAvailable) {
      const detail = `${r.reason ?? ''} ${r.code ?? ''}`.trim() || undefined;
      return { verfuegbar: false,
               grund: r.biometryType === 0 ? 'kein_sensor' : 'nicht_eingerichtet', detail };
    }
    return { verfuegbar: true, art: String(r.biometryType), aktiv: biometrieAktiv() };
  } catch (e) {
    // Der Fehlertext gehoert in die Oberflaeche: "kein Sensor" waere eine
    // Vermutung, und genau die hat uns beim ersten Test in die Irre gefuehrt.
    return { verfuegbar: false, grund: 'fehler', detail: String((e as Error)?.message ?? e) };
  }
}

/** Systemdialog zeigen. true = bestaetigt, false = abgebrochen/gescheitert. */
export async function biometrieBestaetigen(grund: string): Promise<boolean> {
  if (!istNativ()) return false;
  try {
    await (await bio()).authenticate({
      reason: grund,
      androidTitle: 'YSKAR Wallet',
      androidSubtitle: grund,
      cancelTitle: 'Abbrechen',
      // Kein Geraete-Code als Ersatz: Der Ersatz ist unsere eigene PIN.
      allowDeviceCredential: false,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Biometrie einschalten. Die PIN muss vorher gegen den Tresor geprueft
 * worden sein -- hier wird nichts geprueft, nur abgelegt. Der Sensor wird
 * einmal verlangt, damit niemand die Funktion unbemerkt einschaltet.
 */
export async function biometrieAktivieren(pin: string): Promise<boolean> {
  if (!istNativ()) return false;
  const ok = await biometrieBestaetigen('Biometrie für YSKAR Wallet einschalten');
  if (!ok) return false;
  try {
    await (await speicher()).set(SCHLUESSEL, pin);
    localStorage.setItem(MERKER, '1');
    return true;
  } catch {
    return false;
  }
}

export async function biometrieDeaktivieren(): Promise<void> {
  try { await (await speicher()).remove(SCHLUESSEL); } catch { /* war nie da */ }
  try { localStorage.removeItem(MERKER); } catch { /* egal */ }
}

/**
 * Sensor verlangen und die PIN herausgeben. null, wenn der Nutzer abbricht,
 * die Biometrie fehlschlaegt oder nichts hinterlegt ist -- dann faellt die
 * Oberflaeche auf die PIN-Eingabe zurueck.
 */
export async function biometriePin(grund: string): Promise<string | null> {
  if (!istNativ() || !biometrieAktiv()) return null;
  const ok = await biometrieBestaetigen(grund);
  if (!ok) return null;
  try {
    const wert = await (await speicher()).get(SCHLUESSEL);
    return typeof wert === 'string' && /^\d{6}$/.test(wert) ? wert : null;
  } catch {
    return null;
  }
}
