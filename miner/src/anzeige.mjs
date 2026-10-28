/**
 * Anzeige und Kennzahlen.
 *
 * Orientiert an dem, was etablierte Miner zeigen (XMRig und Verwandte), und
 * auf YSKAR uebertragen:
 *
 *   - Hashrate ueber MEHRERE Zeitfenster statt einer Momentaufnahme. Eine
 *     einzelne Zahl schwankt; drei Fenster zeigen, ob sie stabil ist.
 *   - Eine Zeile JE SHARE, nicht nur je Block. Das ist der wichtigste Punkt:
 *     Bisher passierte stundenlang sichtbar nichts.
 *   - Aufwand (englisch "effort"): geleistete Arbeit geteilt durch die
 *     statistisch erwartete, seit dem letzten gefundenen Block. Unter 100 %
 *     heisst Glueck, darueber Pech. Das ist die Kennzahl, die "arbeitet das
 *     Ding ueberhaupt" beantwortet, ohne etwas zu beschoenigen.
 *   - Gesamtzahl der Hashes und Laufzeit.
 *   - Erwartete Zeit bis zum naechsten Block.
 *
 * Bewusst NICHT uebernommen: eine Fortschrittsanzeige zum naechsten Block.
 * Mining ist gedaechtnislos -- die Wahrscheinlichkeit haengt nicht davon ab,
 * wie lange man schon sucht. Ein Balken, der sich fuellt, waere eine Luege.
 */

const FENSTER = 900;   // Sekunden, die im Ringpuffer gehalten werden

export class Kennzahlen {
  constructor() {
    this.start = Date.now();
    this.proben = [];            // Hashrate je Sekunde, juengste zuletzt
    this.hashesGesamt = 0n;
    this.hashesSeitBlock = 0n;
    this.angenommen = 0;
    this.abgelehnt = 0;
    this.bloecke = 0;
    this.letzterShare = null;    // Zeitpunkt
    this.shareZeiten = [];       // Abstaende zwischen Shares, fuer den Mittelwert
    this.netzDifficulty = null;
    this.hoehe = null;
    this.aufwandVerlauf = [];    // Aufwand je gefundenem Block
  }

  probe(rate) {
    this.proben.push(rate);
    if (this.proben.length > FENSTER) this.proben.shift();
  }

  hashes(n) {
    this.hashesGesamt += BigInt(n);
    this.hashesSeitBlock += BigInt(n);
  }

  /** Mittlere Hashrate der letzten n Sekunden. */
  rate(sekunden) {
    const teil = this.proben.slice(-sekunden);
    if (teil.length === 0) return 0;
    return teil.reduce((a, b) => a + b, 0) / teil.length;
  }

  shareAngenommen() {
    const jetzt = Date.now();
    if (this.letzterShare) {
      this.shareZeiten.push((jetzt - this.letzterShare) / 1000);
      if (this.shareZeiten.length > 50) this.shareZeiten.shift();
    }
    this.letzterShare = jetzt;
    this.angenommen++;
  }

  /** Mittlerer Abstand zwischen angenommenen Shares, in Sekunden. */
  shareAbstand() {
    if (this.shareZeiten.length === 0) return null;
    return this.shareZeiten.reduce((a, b) => a + b, 0) / this.shareZeiten.length;
  }

  /**
   * Aufwand seit dem letzten Block, in Prozent.
   *
   * Erwartet werden difficulty * 2^16 Hashes fuer einen Block. Was daraus
   * tatsaechlich geworden ist, sagt diese Zahl:
   *   unter 100 % -- schneller als erwartet, Glueck
   *   ueber 100 % -- laenger als erwartet, Pech
   *
   * Sie sagt NICHTS darueber, wie nah der naechste Block ist. Mining ist
   * gedaechtnislos.
   */
  aufwand() {
    if (!this.netzDifficulty) return null;
    const erwartet = BigInt(Math.round(this.netzDifficulty)) * 65536n;
    if (erwartet === 0n) return null;
    return Number(this.hashesSeitBlock * 10000n / erwartet) / 100;
  }

  blockGefunden() {
    const a = this.aufwand();
    if (a !== null) this.aufwandVerlauf.push(a);
    this.hashesSeitBlock = 0n;
    this.bloecke++;
    return a;
  }

  /** Erwartete Zeit bis zum naechsten Block, in Sekunden. */
  erwarteteZeit() {
    const r = this.rate(60) || this.rate(10);
    if (!r || !this.netzDifficulty) return null;
    return (this.netzDifficulty * 65536) / r;
  }

  laufzeit() { return (Date.now() - this.start) / 1000; }
}

// --------------------------------------------------------------- Formate

/*
  Englische Schreibweise (en-US): Punkt als Dezimal-, Komma als
  Tausendertrennzeichen. Bis 0.1.0 war die Ausgabe deutsch; der Miner ist ab
  0.2.0 englisch, und eine Zahl darf nicht anders aussehen als der Text um
  sie herum.

  ACHTUNG HiveOS: hiveos/yskar-hiveos/yskar-log.sh liest die Hashrate aus der
  Minutenzeile. Eine Rate hat nie ein Tausendertrennzeichen -- ab 1000 springt
  die Einheit --, ein Komma darin heisst dort deshalb "altes deutsches Format".
*/
const fest = (n, stellen) => n.toLocaleString('en-US', {
  minimumFractionDigits: stellen, maximumFractionDigits: stellen });

const STUFEN = [[1e24, 'YH/s'], [1e21, 'ZH/s'], [1e18, 'EH/s'], [1e15, 'PH/s'], [1e12, 'TH/s']];

export function rate(h) {
  if (!h) return '0 H/s';
  if (h >= 1e27) return `${h.toExponential(2)} H/s`;
  for (const [ab, einheit] of STUFEN) if (h >= ab) return `${(h / ab).toFixed(2)} ${einheit}`;
  if (h >= 1e9) return `${(h / 1e9).toFixed(2)} GH/s`;
  if (h >= 1e6) return `${(h / 1e6).toFixed(2)} MH/s`;
  if (h >= 1e3) return `${(h / 1e3).toFixed(1)} kH/s`;
  return `${Math.round(h)} H/s`;
}

export function hashes(n) {
  const x = Number(n);
  if (x >= 1e15) return `${fest(x / 1e12, 1)} TH`;
  if (x >= 1e12) return `${(x / 1e12).toFixed(2)} TH`;
  if (x >= 1e9) return `${(x / 1e9).toFixed(1)} GH`;
  if (x >= 1e6) return `${(x / 1e6).toFixed(1)} MH`;
  if (x >= 1e3) return `${(x / 1e3).toFixed(0)} kH`;
  return `${Math.round(x)}`;
}

/** "45 s", "12 min", "2h 14m", "3d 4h". */
export function dauer(sek) {
  if (sek === null || !Number.isFinite(sek)) return '—';
  const s = Math.round(sek);
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

/** Ganze Zahl mit Tausenderkomma: 6,764. */
export const zahl = n => (n === null || n === undefined || !Number.isFinite(Number(n)))
  ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

/** Feste Nachkommastellen mit Tausenderkomma: 5,919,375.00 */
export const zahlFest = fest;

/**
 * Prozent, mit so vielen Stellen, dass etwas Sichtbares dasteht.
 *
 * Bis 0.1.0 stand hier toFixed(1) -- bei einer Netz-Difficulty von 300
 * Millionen ergab das fuer JEDEN Share "0.0 %". Ein Wert, der immer gleich
 * ist, sagt nichts.
 */
export function prozent(p) {
  if (p === null || !Number.isFinite(p)) return '—';
  if (p === 0) return '0%';
  if (p >= 10) return `${p.toFixed(0)}%`;
  if (p >= 1) return `${p.toFixed(1)}%`;
  if (p >= 0.1) return `${p.toFixed(2)}%`;
  if (p >= 0.001) return `${p.toFixed(3)}%`;
  return '<0.001%';
}

export const uhr = () => new Date().toTimeString().slice(0, 8);
