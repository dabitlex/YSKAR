/**
 * Fester Kopf im Terminal -- oben stehenbleiben, unten scrollen.
 *
 * WIE DAS GEHT
 *
 * Terminals kennen einen Scrollbereich (DECSTBM, `ESC [ oben ; unten r`).
 * Steht er auf Zeile 6 bis zum Ende, scrollt nur dieser Teil; die Zeilen 1
 * bis 5 bleiben stehen, bis jemand sie ueberschreibt. Genau das machen wir:
 * Der Kopf wird bei jeder Aktualisierung neu in die oberen Zeilen gemalt,
 * die Ereignisse laufen darunter durch.
 *
 * WAS DAS KOSTET, EHRLICH
 *
 * Zeilen, die oben aus dem Scrollbereich herauslaufen, landen bei den
 * meisten Terminals NICHT im Verlauf. Wer hochscrollen will, um zu sehen,
 * was vor zwanzig Minuten passierte, kann das nicht mehr. Deshalb gibt es
 * --einfach: dieselbe Ausgabe wie vorher, mit vollem Verlauf.
 *
 * WANN ES SICH SELBST ABSCHALTET
 *
 * Kein Terminal (Pipe, Datei, Dienst), zu wenige Zeilen, NO_COLOR gesetzt:
 * In all diesen Faellen faellt die Ausgabe auf den einfachen Weg zurueck.
 * Ein fester Kopf in einer Logdatei waere ein Haufen Steuerzeichen.
 *
 * DER WICHTIGSTE TEIL IST DAS AUFRAEUMEN
 *
 * Ein gesetzter Scrollbereich, den niemand zuruecksetzt, laesst das
 * Terminal kaputt zurueck -- die Eingabeaufforderung klebt dann in der
 * unteren Haelfte. Deshalb wird er bei jedem Ende zurueckgesetzt, auch bei
 * Strg+C und bei einem unbehandelten Fehler. Was bei SIGKILL nicht mehr
 * geht: Dagegen hilft nur `cls` beziehungsweise `reset`, und das steht
 * so auch in der Hilfe.
 */

/** Unter so vielen Zeilen lohnt der feste Kopf nicht. */
export const MIN_ZEILEN = 20;

const ESC = '\x1b[';

export class FesterKopf {
  /**
   * @param {object} opt
   * @param {number} opt.hoehe      Zeilen, die der Kopf belegt
   * @param {() => string[]} opt.zeichnen  Liefert die Kopfzeilen, oberste zuerst
   */
  constructor(opt) {
    this.hoehe = opt.hoehe;
    this.zeichnen = opt.zeichnen;
    this.aktiv = false;
    this._aufraeumer = [];
  }

  /**
   * Taugt dieses Terminal dafuer?
   *
   * Absichtlich streng: Im Zweifel nein. Eine kaputte Anzeige ist
   * schlimmer als eine schlichte.
   */
  static moeglich() {
    return Boolean(
      process.stdout.isTTY
      && !process.env.NO_COLOR
      && (process.stdout.rows ?? 0) >= MIN_ZEILEN,
    );
  }

  start() {
    if (this.aktiv) return;
    this.aktiv = true;

    /*
      Platz schaffen, BEVOR der Bereich gesetzt wird.

      Ohne das stuende der Kopf ueber dem, was schon auf dem Schirm ist --
      der Startkopf zum Beispiel. So viele Leerzeilen ausgeben, wie er
      belegt, und der Inhalt wandert nach oben aus dem Weg.
    */
    process.stdout.write('\n'.repeat(this.hoehe));

    // Scrollbereich: ab der ersten Zeile UNTER dem Kopf bis zum Ende.
    process.stdout.write(`${ESC}${this.hoehe + 1};${process.stdout.rows}r`);
    // Cursor in den Scrollbereich, sonst schreibt die erste Ausgabe in den Kopf.
    process.stdout.write(`${ESC}${process.stdout.rows};1H`);

    this.malen();

    const beiGroesse = () => {
      if (!this.aktiv) return;
      if ((process.stdout.rows ?? 0) < MIN_ZEILEN) { this.stop(); return; }
      process.stdout.write(`${ESC}${this.hoehe + 1};${process.stdout.rows}r`);
      this.malen();
    };
    process.stdout.on('resize', beiGroesse);
    this._aufraeumer.push(() => process.stdout.off('resize', beiGroesse));

    /*
      Notbremse.

      Der saubere Weg ist stop() beim Beenden. Aber es gibt Wege hinaus,
      die dort nicht vorbeikommen: ein unbehandelter Fehler, ein
      process.exit() an anderer Stelle, ein SIGTERM. Bliebe der
      Scrollbereich dann gesetzt, klebte die Eingabeaufforderung danach in
      der unteren Bildschirmhaelfte -- und der Nutzer haette ein kaputtes
      Terminal und keine Ahnung, warum.

      'exit' laeuft synchron und fasst alle geordneten Wege. Fuer die
      Signale je ein eigener Zeiger, weil sie 'exit' sonst gar nicht erst
      erreichen.

      Was hier NICHT hilft: SIGKILL und ein abgewuergtes Terminalfenster.
      Dagegen gibt es nur `cls` unter Windows und `reset` sonst -- das
      steht so auch in der Hilfe.
    */
    const notbremse = () => { try { this.stop(); } catch { /* egal, wir gehen */ } };
    process.once('exit', notbremse);
    const signale = ['SIGTERM', 'SIGHUP'];
    for (const sig of signale) process.once(sig, () => { notbremse(); process.exit(1); });
    this._aufraeumer.push(() => {
      process.off('exit', notbremse);
      for (const sig of signale) process.removeAllListeners(sig);
    });
  }

  /**
   * Den Kopf neu malen.
   *
   * Cursor merken, nach oben springen, Zeilen schreiben, Cursor zurueck.
   * Die Ereignisse darunter bleiben davon unberuehrt -- deshalb darf das
   * jede Sekunde passieren, ohne dass etwas flackert oder verrutscht.
   */
  malen() {
    if (!this.aktiv) return;
    const zeilen = this.zeichnen();
    const breite = process.stdout.columns ?? 80;

    let aus = `${ESC}s`;                    // Cursor merken
    for (let i = 0; i < this.hoehe; i++) {
      aus += `${ESC}${i + 1};1H${ESC}2K`;   // Zeile anfahren, leeren
      /*
        Auf Fensterbreite kuerzen.

        Eine zu lange Zeile bricht um -- und ein Umbruch im Kopf schiebt
        alles darunter um eine Zeile, bei jeder Aktualisierung neu. Das
        sieht nach einem Fehler aus und ist auch einer.

        Gekuerzt wird nach SICHTBAREN Zeichen: Farbcodes zaehlen nicht mit,
        sonst schnitte man mitten in eine Escape-Folge und der Rest der
        Ausgabe behielte die Farbe.
      */
      aus += kuerze(zeilen[i] ?? '', breite);
    }
    aus += `${ESC}u`;                       // Cursor zurueck
    process.stdout.write(aus);
  }

  /** Scrollbereich freigeben und den Kopf stehen lassen. */
  stop() {
    if (!this.aktiv) return;
    this.aktiv = false;
    for (const a of this._aufraeumer) a();
    this._aufraeumer = [];
    // Ganzen Schirm wieder scrollen lassen und unter den Kopf springen.
    process.stdout.write(`${ESC}r`);
    process.stdout.write(`${ESC}${process.stdout.rows ?? 24};1H\n`);
  }
}

/**
 * Text auf `breite` sichtbare Zeichen kuerzen, Farbcodes nicht mitzaehlen.
 *
 * Wird gekuerzt, haengt ein Reset hinten dran: Sonst liefe eine
 * angeschnittene Farbe in die naechste Zeile weiter.
 */
export function kuerze(text, breite) {
  let sichtbar = 0;
  let aus = '';
  let i = 0;
  let farbeOffen = false;

  while (i < text.length) {
    if (text[i] === '\x1b') {
      const ende = text.indexOf('m', i);
      if (ende === -1) break;
      const folge = text.slice(i, ende + 1);
      aus += folge;
      farbeOffen = folge !== '\x1b[0m';
      i = ende + 1;
      continue;
    }
    if (sichtbar >= breite) return aus + (farbeOffen ? '\x1b[0m' : '');
    aus += text[i];
    sichtbar++;
    i++;
  }
  return aus;
}
