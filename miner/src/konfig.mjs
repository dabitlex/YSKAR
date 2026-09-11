/**
 * Einstellungen neben dem Programm.
 *
 * Liegt als yskar-miner.json direkt neben der ausfuehrbaren Datei -- nicht
 * im Benutzerverzeichnis. Wer den Ordner kopiert oder weitergibt, nimmt
 * seine Einstellungen mit, und wer ihn loescht, laesst nichts zurueck.
 *
 * Gespeichert wird nur, was oeffentlich ist: eine Adresse und zwei Zahlen.
 * Der Miner kennt keine Schluessel und kann deshalb auch keine verlieren.
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DATEI = 'yskar-miner.json';

/**
 * Wo die Datei liegt.
 *
 * Eingepackt neben der Binaerdatei, im Ordnerbetrieb neben dem Quelltext.
 * process.execPath zeigt eingepackt auf die Binaerdatei selbst, sonst auf
 * node -- deshalb die Unterscheidung.
 */
export function konfigPfad(minerWurzel) {
  const eingepackt = Boolean(globalThis.__YSKAR_WASM_B64);
  return join(eingepackt ? dirname(process.execPath) : minerWurzel, DATEI);
}

export function laden(minerWurzel) {
  const pfad = konfigPfad(minerWurzel);
  if (!existsSync(pfad)) return null;
  try {
    const d = JSON.parse(readFileSync(pfad, 'utf8'));
    return typeof d?.address === 'string' ? d : null;
  } catch {
    return null;   // kaputte Datei ist wie keine Datei
  }
}

export function speichern(minerWurzel, werte) {
  const pfad = konfigPfad(minerWurzel);
  writeFileSync(pfad, JSON.stringify(werte, null, 2) + '\n');
  return pfad;
}

export function vergessen(minerWurzel) {
  const pfad = konfigPfad(minerWurzel);
  if (!existsSync(pfad)) return null;
  unlinkSync(pfad);
  return pfad;
}
