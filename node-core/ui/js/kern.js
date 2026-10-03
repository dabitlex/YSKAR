/*
 * Kern der Oberfläche: Schnittstelle, Bausteine fürs DOM, Zahlenformate.
 *
 * Bewusst ohne Rahmenwerk. Die Oberfläche ist klein, läuft nur im eigenen
 * Fenster und lädt nichts von außen.
 */
import { t, sprache } from './i18n.js';

// ------------------------------------------------------------ Schnittstelle

const ZUGANG = document.querySelector('meta[name="yskar-zugang"]')?.content ?? '';

/**
 * Text zu einem Kürzel des Knotens, in der Sprache der Oberfläche.
 * Kennt die Oberfläche das Kürzel nicht, bleibt der Text des Knotens.
 */
export function knotenText(code, werte, sonst) {
  if (!code) return sonst;
  const schluessel = 'srv.' + code;
  const eigen = t(schluessel, ...(Array.isArray(werte) ? werte : []));
  return eigen !== schluessel ? eigen : sonst;
}

/** Fehler des Knotens -- mit Text in der Sprache der Oberfläche, wenn sie das Kürzel kennt. */
export class ApiFehler extends Error {
  constructor(text, status, code) { super(text); this.status = status; this.code = code ?? null; }
}

export async function api(pfad, opt = {}) {
  const kopf = Object.assign({}, opt.headers || {}, { 'x-yskar-token': ZUGANG });
  let antwort;
  try { antwort = await fetch(pfad, Object.assign({}, opt, { headers: kopf })); }
  catch { throw new ApiFehler(t('fehler.keineVerbindung'), 0); }
  let daten = null;
  try { daten = await antwort.json(); } catch { /* keine JSON-Antwort */ }
  if (!antwort.ok || (daten && daten.error)) {
    const text = (daten && daten.error) || t('fehler.allgemein');
    throw new ApiFehler(knotenText(daten && daten.code, daten && daten.werte, text), antwort.status, daten && daten.code);
  }
  return daten;
}

export const hole = pfad => api(pfad);
export const sende = (pfad, rumpf) => api(pfad, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(rumpf ?? {}),
});

// ------------------------------------------------------------------- DOM

/**
 * Ein Element bauen: el('div.karte', { id: 'x', onclick: f }, kind, ...).
 *
 * Text kommt immer als Textknoten hinein, nie als HTML. Was der Knoten oder
 * das Netz liefert (Namen in Blöcken, Adressen, Fehlermeldungen), kann so
 * kein Markup einschleusen.
 */
export function el(was, attribute, ...kinder) {
  const [tag, ...klassen] = was.split('.');
  const e = document.createElement(tag || 'div');
  if (klassen.length) e.className = klassen.join(' ');
  if (attribute && (typeof attribute !== 'object' || attribute instanceof Node || Array.isArray(attribute))) {
    kinder.unshift(attribute); attribute = null;
  }
  for (const [k, v] of Object.entries(attribute || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = (e.className ? e.className + ' ' : '') + v;
    else if (k === 'text') e.textContent = v;
    // Ueber das Objektmodell, nicht als Attribut: Ein style-Attribut wuerde
    // die Content-Security-Policy der Seite abweisen.
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') e[k] = !!v;
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  haenge(e, kinder);
  return e;
}

export function haenge(eltern, kinder) {
  for (const k of [kinder].flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    eltern.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return eltern;
}

/** Inhalt ersetzen. */
export function fuelle(eltern, ...kinder) {
  eltern.replaceChildren();
  return haenge(eltern, kinder);
}

/** Text setzen, aber nur wenn er sich geändert hat -- schont die Auswahl. */
export function text(e, wert) {
  const s = wert === null || wert === undefined ? '—' : String(wert);
  if (e && e.textContent !== s) e.textContent = s;
}

const ZEICHEN = {
  uebersicht: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M16 12.5h2"/><path d="M3 10h18"/>',
  blitz: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  leute: '<circle cx="9" cy="9" r="3.2"/><path d="M3 20c.6-3.4 3-5 6-5s5.4 1.6 6 5"/><circle cx="17.5" cy="8" r="2.4"/><path d="M17 13.5c2.4.2 3.7 1.7 4.2 4.2"/>',
  wuerfel: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5"/><path d="M12 12v9"/>',
  netz: '<circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="m7.3 11 9.4-4"/><path d="m7.3 13 9.4 4"/>',
  regler: '<path d="M4 7h10"/><path d="M18 7h2"/><circle cx="16" cy="7" r="2"/><path d="M4 17h2"/><path d="M10 17h10"/><circle cx="8" cy="17" r="2"/>',
  kopieren: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  schloss: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  offen: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>',
  haken: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  kreuz: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>',
  warnung: '<path d="M12 4 2.5 20h19L12 4Z"/><path d="M12 10v4.5"/><path d="M12 17.3v.2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><path d="M12 7.6v.2"/>',
  suche: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  hoch: '<path d="M12 19V6"/><path d="m6.5 11.5 5.500-5.500 5.500 5.500"/>',
  runter: '<path d="M12 5v13"/><path d="m6.5 12.5 5.500 5.500 5.500-5.500"/>',
  ordner: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  schild: '<path d="M12 3 5 6v5.5c0 4.3 2.9 7.7 7 9 4.1-1.3 7-4.7 7-9V6l-7-3Z"/><path d="m9 12 2.2 2.2L15.2 10"/>',
  auge: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>',
  uhr: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2"/>',
  welt: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.8 3 2.8 15 0 18"/><path d="M12 3c-2.800 3-2.800 15 0 18"/>',
  haus: '<path d="m4 11 8-7 8 7"/><path d="M6 10v9.5h12V10"/>',
  pc: '<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M9 20h6"/><path d="M12 16.5V20"/>',
  laden: '<path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>',
};

const SVG = 'http://www.w3.org/2000/svg';

/** Strichzeichnung. Die Pfade stehen fest im Programm, kommen nie von außen. */
export function zeichen(name, groesse = 16) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('width', groesse); s.setAttribute('height', groesse);
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  s.style.flex = 'none';
  s.innerHTML = ZEICHEN[name] || '';
  return s;
}

/**
 * Das Zeichen der Marke: der YSKAR-Kristall, ohne Hintergrund -- dasselbe
 * Bild wie in App, Explorer und auf der Webseite. `breite` in Pixeln; die
 * Hoehe folgt aus dem Seitenverhaeltnis des Bildes (160 x 104).
 */
export function kristall(breite = 40) {
  const b = document.createElement('img');
  b.src = '/ui/kristall.png';
  b.alt = '';
  b.width = breite; b.height = Math.round(breite * 104 / 160);
  b.decoding = 'async';
  b.draggable = false;
  b.style.flex = 'none';
  return b;
}

// ---------------------------------------------------------------- Bausteine

/** Farbe: gruen | gelb | blau | rot | '' -- dazu optional "hoch". */
export const chip = (farbe, inhalt, punkt = false) =>
  el('span', { class: ('chip ' + farbe).trim() }, punkt ? el('span', { class: ('punkt ' + farbe.replace('hoch', '')).trim() }) : null, inhalt);

export const zeile = (name, wert, mono = false) =>
  el('div.zeile', el('span', name), wert instanceof Node ? wert : el('span' + (mono ? '.mono' : ''), wert));

export function knopf(inhalt, klick, art = '') {
  return el('button.knopf' + (art ? '.' + art.split(' ').join('.') : ''), { type: 'button', onclick: klick }, inhalt);
}

/** Schalter. `stelle(neu)` darf ein Versprechen liefern; scheitert es, springt er zurück. */
export function schalter(name, an, stelle) {
  const b = el('button.schalter', { type: 'button', role: 'switch', 'aria-checked': an ? 'true' : 'false', 'aria-label': name });
  b.addEventListener('click', async () => {
    const neu = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', neu ? 'true' : 'false');
    try { await stelle(neu); }
    catch (e) { b.setAttribute('aria-checked', neu ? 'false' : 'true'); melde(e.message, true); }
  });
  return b;
}

/** Auswahl aus wenigen Möglichkeiten. `wahl`: [[wert, text], ...] */
export function segment(name, wahl, aktuell, waehle, klein = false) {
  const g = el('div.seg' + (klein ? '.klein' : ''), { role: 'group', 'aria-label': name });
  const setze = wert => {
    for (const b of g.children) {
      const an = b.dataset.wert === String(wert);
      b.classList.toggle('an', an); b.setAttribute('aria-pressed', an ? 'true' : 'false');
    }
  };
  for (const [wert, beschriftung] of wahl) {
    g.appendChild(el('button', { type: 'button', 'data-wert': wert, onclick: () => { setze(wert); waehle(wert); } }, beschriftung));
  }
  setze(aktuell);
  g.setze = setze;
  return g;
}

let meldungWeg = null;
/** Kurze Meldung am unteren Rand. */
export function melde(inhalt, schlecht = false) {
  document.querySelector('.meldung')?.remove();
  clearTimeout(meldungWeg);
  const m = el('div.meldung' + (schlecht ? '.schlecht' : ''), { role: schlecht ? 'alert' : 'status' }, inhalt);
  document.body.appendChild(m);
  meldungWeg = setTimeout(() => m.remove(), schlecht ? 7000 : 3500);
}

export async function kopiere(wert, hinweis) {
  try { await navigator.clipboard.writeText(wert); melde(hinweis || t('allg.kopiert')); }
  catch { melde(t('fehler.kopieren'), true); }
}

// ------------------------------------------------------------------ Formate

const ort = () => (sprache() === 'en' ? 'en-GB' : 'de-DE');

export const zahl = n => (n === null || n === undefined ? '—' : new Intl.NumberFormat(ort()).format(n));

/** Betrag in YSR aus Grundeinheiten (Text oder BigInt). Mindestens vier Nachkommastellen. */
export function ysr(einheiten, mindestens = 4) {
  if (einheiten === null || einheiten === undefined) return '—';
  let v;
  try { v = BigInt(einheiten); } catch { return '—'; }
  const minus = v < 0n; if (minus) v = -v;
  const ganz = v / 100000000n;
  let bruch = (v % 100000000n).toString().padStart(8, '0').replace(/0+$/, '');
  if (bruch.length < mindestens) bruch = bruch.padEnd(mindestens, '0');
  const komma = sprache() === 'en' ? '.' : ',';
  return (minus ? '−' : '') + new Intl.NumberFormat(ort()).format(ganz) + (bruch ? komma + bruch : '');
}

/** Rechenleistung. */
export function leistung(h) {
  if (!h || !Number.isFinite(h)) return '0 H/s';
  const f = (x, s) => new Intl.NumberFormat(ort(), { minimumFractionDigits: s, maximumFractionDigits: s }).format(x);
  if (h >= 1e9) return f(h / 1e9, 2) + ' GH/s';
  if (h >= 1e6) return f(h / 1e6, 2) + ' MH/s';
  if (h >= 1e3) return f(h / 1e3, 1) + ' kH/s';
  return f(h, 0) + ' H/s';
}

export const kurzAdresse = a => (a && a.length > 16 ? a.slice(0, 8) + '…' + a.slice(-4) : a || '—');
export const kurzHash = h => (h && h.length > 20 ? h.slice(0, 12) + '…' + h.slice(-4) : h || '—');
export const kurzHash8 = h => (h && h.length > 20 ? h.slice(0, 8) + '…' + h.slice(-8) : h || '—');

/** Uhrzeit oder Datum aus Sekunden seit 1970. */
export function uhrzeit(sekunden) {
  const d = new Date(Number(sekunden) * 1000);
  return d.toLocaleTimeString(ort(), { hour: '2-digit', minute: '2-digit' });
}
export function datumZeit(sekunden) {
  const d = new Date(Number(sekunden) * 1000);
  return d.toLocaleString(ort(), { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
export function tagOderZeit(sekunden) {
  const d = new Date(Number(sekunden) * 1000), h = new Date();
  if (d.toDateString() === h.toDateString()) return uhrzeit(sekunden);
  return d.toLocaleDateString(ort(), { day: '2-digit', month: '2-digit' }) + ' ' + uhrzeit(sekunden);
}

/** Dauer in Worten: "2 Tage 6 Std." */
export function dauer(sekunden) {
  const s = Math.max(0, Math.floor(sekunden));
  const tage = Math.floor(s / 86400), std = Math.floor((s % 86400) / 3600), min = Math.floor((s % 3600) / 60);
  if (tage > 0) return t('zeit.tageStd', tage, std);
  if (std > 0) return t('zeit.stdMin', std, min);
  if (min > 0) return t('zeit.min', min);
  return t('zeit.unterMinute');
}

/** "vor 4 Minuten" aus Millisekunden-Zeitpunkt. */
export function vor(msZeitpunkt) {
  const s = Math.max(0, Math.floor((Date.now() - msZeitpunkt) / 1000));
  if (s < 60) return t('zeit.vorSek', s);
  if (s < 3600) return t('zeit.vorMin', Math.floor(s / 60));
  if (s < 86400) return t('zeit.vorStd', Math.floor(s / 3600));
  return t('zeit.vorTagen', Math.floor(s / 86400));
}

export const netzName = n => (n === 'yskar-main-1' ? 'Mainnet' : (n || '—'));

/**
 * Wer einen Block gefunden hat -- so, wie es in der Kette steht.
 * `b` ist ein Block aus der Leseschnittstelle (finder, minerAddress, recipients).
 */
export function finder(b) {
  const pool = b.recipients > 1;
  if (b.finder) return el('span', b.finder, pool ? el('span.blass', ' · ' + t('kette.pool')) : null);
  if (pool) return el('span', t('kette.pool'), el('span.blass', ' · ' + t('kette.empfaenger', b.recipients)));
  return el('span', t('kette.solo'), el('span.blass', ' · ', el('span.mono', kurzAdresse(b.minerAddress))));
}

/** Kopf einer Ansicht: Titel, Unterzeile, rechts Zustand und Knöpfe. */
export function kopf(titel, unterzeile, ...rechts) {
  return el('header.kopf',
    el('div.kopf-links', el('h1', titel), unterzeile ? el('p.sub', unterzeile) : null),
    rechts.length ? el('div.kopf-rechts', rechts) : null);
}

/** Adresse in Vierergruppen -- so vergleicht man sie Zeichen für Zeichen. */
export const vierer = a => (a.match(/.{1,4}/g) ?? []).join(' ');

/** Kalendertag "JJJJ-MM-TT" in der Zeitzone dieses PCs. */
export function tagSchluessel(sekunden) {
  const d = new Date(Number(sekunden) * 1000), z = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}

/** "Heute", "Gestern" oder das Datum. */
export function tagName(schluesselTag) {
  const jetzt = Date.now() / 1000;
  if (schluesselTag === tagSchluessel(jetzt)) return t('zeit.heute');
  if (schluesselTag === tagSchluessel(jetzt - 86400)) return t('zeit.gestern');
  const [j, m, d] = schluesselTag.split('-').map(Number);
  return new Date(j, m - 1, d).toLocaleDateString(ort(), { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Kurzer Wochentag zu einem Tagesschlüssel. */
export function wochentag(schluesselTag) {
  const [j, m, d] = schluesselTag.split('-').map(Number);
  return new Date(j, m - 1, d).toLocaleDateString(ort(), { weekday: 'short' });
}
