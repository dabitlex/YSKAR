'use client';

import { useEffect } from 'react';

/**
 * Seite festhalten, solange ein Blatt oder ein Dialog offen ist.
 *
 * Ohne das scrollt die Seite HINTER dem Blatt weiter, sobald der Finger
 * auf dem abgedunkelten Grund oder am Ende des Blatts zieht.
 *
 * Wie: Der body wird an seiner Stelle festgenagelt (position: fixed, um die
 * Scrollhoehe nach oben versetzt) und beim Schliessen wieder gelöst -- die
 * Seite steht danach genau dort, wo sie war. `overflow: hidden` auf html
 * oder body waere kuerzer, aber im WebView unzuverlaessig: dort wird sonst
 * der body zum Scroll-Container (siehe globals.css), und aeltere iOS-
 * Fassungen scrollen trotzdem.
 *
 * Mit Zaehler: Blaetter liegen uebereinander (Einzelheiten -> Kontakt).
 * Geloest wird erst, wenn das letzte zu ist.
 */

let offen = 0;
let hoehe = 0;
let vorher: Pick<CSSStyleDeclaration, 'position' | 'top' | 'left' | 'right' | 'width' | 'paddingRight'> | null = null;

export function scrollSperren(): () => void {
  if (typeof document === 'undefined') return () => {};
  const b = document.body;
  if (offen++ === 0) {
    hoehe = window.scrollY;
    // Am Rechner verschwindet mit dem Festhalten die Bildlaufleiste -- ihr
    // Platz bleibt frei, damit der Inhalt nicht zur Seite springt.
    const leiste = window.innerWidth - document.documentElement.clientWidth;
    const s = b.style;
    vorher = { position: s.position, top: s.top, left: s.left, right: s.right, width: s.width, paddingRight: s.paddingRight };
    s.position = 'fixed';
    s.top = `${-hoehe}px`;
    s.left = '0';
    s.right = '0';
    s.width = '100%';
    if (leiste > 0) s.paddingRight = `${leiste}px`;
  }
  let geloest = false;
  return () => {
    if (geloest) return;
    geloest = true;
    if (--offen > 0 || !vorher) return;
    Object.assign(b.style, vorher);
    vorher = null;
    // Sofort, ohne Gleiten: Die Seite soll nicht sichtbar zurueckfahren.
    window.scrollTo({ top: hoehe, left: 0, behavior: 'instant' as ScrollBehavior });
  };
}

/** Seite festhalten, solange `aktiv` wahr ist. */
export function useScrollSperre(aktiv: boolean) {
  useEffect(() => {
    if (!aktiv) return;
    return scrollSperren();
  }, [aktiv]);
}
