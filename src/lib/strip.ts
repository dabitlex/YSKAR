/**
 * Masse des Leistungsstreifens.
 *
 * Eigenes Modul, damit der Hook sie nicht aus einer React-Komponente ziehen
 * muss -- ein Hook sollte keine Komponente importieren, nur um an zwei
 * Zahlen zu kommen.
 */
export const BUCKET_MS = 30_000;   // ein Balken je 30 Sekunden
export const MAX_BARS = 20;        // 10 Minuten Verlauf
