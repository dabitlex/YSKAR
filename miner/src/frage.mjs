/**
 * Eingaben im Terminal.
 *
 * EINE Schnittstelle fuer alle Fragen, nicht eine je Frage. Wer sie pro
 * Frage oeffnet und schliesst, verliert alles, was der Nutzer schon
 * vorausgetippt hat -- und was ein Skript per Pipe hineinreicht, ohnehin.
 *
 * Gefragt wird nur, wenn wirklich ein Terminal da ist. Laeuft der Miner als
 * Dienst oder in einer Pipeline, gibt es niemanden, der antworten koennte;
 * dort muss er mit den uebergebenen Angaben auskommen statt ewig zu warten.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export const interaktiv = () => Boolean(stdin.isTTY && stdout.isTTY);

let rl = null;
function schnittstelle() {
  if (!rl) rl = createInterface({ input: stdin, output: stdout });
  return rl;
}

/** Schliesst die Eingabe. Danach laeuft nur noch das Mining. */
export function schliessen() {
  if (rl) { rl.close(); rl = null; }
}

/**
 * Eine Zeile erfragen.
 *
 * Bricht der Nutzer mit Strg+D oder Strg+C ab, ist das eine Entscheidung
 * und kein Absturz -- also null zurueckgeben statt eine Ausnahme mit
 * Stapelverfolgung auszuwerfen.
 */
export async function frage(text, { vorgabe } = {}) {
  try {
    const antwort = (await schnittstelle().question(text)).trim();
    return antwort || vorgabe || '';
  } catch {
    return null;
  }
}

export async function jaNein(text, vorgabeJa = true) {
  const antwort = await frage(`${text} ${vorgabeJa ? '[J/n]' : '[j/N]'} `);
  if (antwort === null) return false;
  if (!antwort) return vorgabeJa;
  const a = antwort.toLowerCase();
  return a.startsWith('j') || a.startsWith('y');
}

/**
 * Fenster offen halten.
 *
 * Wird die Datei per Doppelklick gestartet und bricht sofort ab, schliesst
 * sich das Fenster mitsamt der Fehlermeldung. Fuer den Nutzer sieht das aus,
 * als waere gar nichts passiert.
 */
export async function warteAufTaste() {
  if (!interaktiv()) return;
  await frage('\nZum Schließen Eingabetaste drücken… ');
  schliessen();
}
