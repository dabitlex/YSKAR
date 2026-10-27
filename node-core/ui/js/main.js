/*
 * Einstieg der Oberfläche: Fenster, Navigation, Takt.
 *
 * Eine Ansicht ist ein Modul mit `baue(ctx)`. Es liefert
 *   { wurzel, aktualisiere(stand), verlasse() }
 * `aktualisiere` kommt alle zwei Sekunden mit dem Stand des Knotens.
 *
 * Das Fenster: oben die eigene Titelleiste (nur wenn das Programm sie
 * zeichnet -- im installierten Programm unter Windows und, wenn nicht
 * abgeschaltet, unter Linux), links die Seitenleiste, unten die
 * Statusleiste. Nur der Inhalt in der Mitte scrollt.
 */
import { hole, sende, el, fuelle, zeichen, kristall, melde, meldeEreignis, text, zahl, ysr, leistung, netzName, dialog } from './kern.js';
import { t, setzeSprache, setzePlattform } from './i18n.js';
import * as einrichtung from './einrichtung.js';
import * as uebersicht from './uebersicht.js';
import * as wallet from './wallet.js';
import * as mining from './mining.js';
import * as poolBetrieb from './poolBetrieb.js';
import * as blockchain from './blockchain.js';
import * as peers from './peers.js';
import * as einstellungen from './einstellungen.js';
import { zeigeStart } from './start.js';

const ANSICHTEN = [
  { id: 'uebersicht', zeichen: 'uebersicht', modul: uebersicht, gruppe: 'knoten' },
  { id: 'blockchain', zeichen: 'wuerfel', modul: blockchain, gruppe: 'knoten' },
  { id: 'peers', zeichen: 'netz', modul: peers, gruppe: 'knoten' },
  { id: 'wallet', zeichen: 'wallet', modul: wallet, gruppe: 'konto' },
  { id: 'mining', zeichen: 'blitz', modul: mining, gruppe: 'konto' },
  { id: 'pool', zeichen: 'leute', modul: poolBetrieb, gruppe: 'konto' },
  { id: 'einstellungen', zeichen: 'regler', modul: einstellungen, gruppe: null },
];

const wurzel = document.getElementById('wurzel');
let stand = null;          // letzte Antwort von /api/status
let aktiv = null;          // { id, ansicht }
let takt = null;
let geruest = null;        // Teile des Fensters, die sich mit dem Stand ändern

/** Zeichnet das Programm die Titelleiste selbst? (Fenster ohne Rahmen) */
const eigeneTitelleiste = () => !!navigator.windowControlsOverlay?.visible;

/** Wohin die Adresszeile zeigt: "#/blockchain/3244" -> ['blockchain', '3244'] */
function ort() {
  const teile = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return teile.length ? teile : ['uebersicht'];
}

const ctx = {
  stand: () => stand,
  gehe: ziel => { location.hash = '#/' + ziel; },
  neuLaden: () => lies(),
  /** Alles neu aufbauen -- nach einem Sprachwechsel. */
  neuAufbauen: () => { geruest = null; aktiv = null; zeige(); },
  /** Die aktuelle Ansicht neu aufbauen -- etwa wenn die Wallet gesperrt wurde. */
  zeigeNeu: () => zeige(),
  ort,
  suche: () => oeffneSuche(),
};

/*
 * Ereignisse beim Mining: ein eigener Block (solo) oder eine Pool-Auszahlung
 * in der Kette. Gemeldet wird nur, was seit dem Öffnen neu ist.
 */
let ereignis = { hoehe: null, auszahlung: null };
async function pruefeEreignisse(s) {
  const m = s.mining;
  const h = s.height ?? -1;
  const aus = m?.pool?.auszahlung ?? null;
  if (ereignis.hoehe === null) { ereignis = { hoehe: h, auszahlung: aus?.hoehe ?? null }; return; }
  if (aus && aus.hoehe !== ereignis.auszahlung) {
    ereignis.auszahlung = aus.hoehe;
    meldeEreignis(t('ereignis.auszahlung', ysr(aus.betrag)), t('ereignis.auszahlungUnter', zahl(aus.hoehe), aus.name ?? m.pool?.name ?? ''), 'leute');
  }
  if (h > ereignis.hoehe) {
    const von = ereignis.hoehe;
    ereignis.hoehe = h;
    const adr = m?.config?.address;
    if (!adr || m.pool) return;
    try {
      const r = await hole('/api/lesen/blocks?limit=' + Math.min(5, h - von));
      for (const b of r.blocks) {
        if (b.recipients <= 1 && b.minerAddress === adr) meldeEreignis(t('ereignis.block', zahl(b.height)), t('ereignis.blockUnter', ysr(b.reward)), 'blitz');
      }
    } catch { /* nächster Takt */ }
  }
}

async function lies() {
  try {
    stand = await hole('/api/status');
    pruefeEreignisse(stand);
    aktualisiereGeruest();
    aktiv?.ansicht.aktualisiere?.(stand);
  } catch (e) {
    if (geruest) {
      text(geruest.standName, t('leiste.keineAntwort'));
      geruest.standPunkt.className = 'punkt gelb';
    }
  }
}

/** Die Titelleiste: Zeichen, Name, Suche. Die Fensterknöpfe zeichnet das System. */
function titelleiste() {
  if (!eigeneTitelleiste()) return null;
  return el('div.titelleiste',
    kristall(14), el('span', 'YSKAR Node Core'),
    el('button.suche-knopf', { type: 'button', onclick: oeffneSuche }, zeichen('suche', 13), t('titel.suche'), el('span.mono', t('titel.kurz'))));
}

function baueGeruest() {
  const gruppe = (id, name) => el('div.nav-gruppe',
    name ? el('span.cap', name) : null,
    ANSICHTEN.filter(a => a.gruppe === id).map(a => el('a', { href: '#/' + a.id, 'data-id': a.id }, zeichen(a.zeichen, 16), el('span', t('nav.' + a.id)))));
  const nav = el('nav.nav', { 'aria-label': t('nav.bereiche') }, gruppe('knoten', t('nav.gKnoten')), gruppe('konto', t('nav.gKonto')));
  const standPunkt = el('span.punkt');
  const standName = el('span');
  const standZeile = el('span');
  const inhalt = el('main.inhalt');
  const neueVersion = el('a.leiste-neu', { href: '#/einstellungen', hidden: true });
  const unten = gruppe(null, null);
  const status = {
    punkt: el('span.punkt'), name: el('span'), netz: el('span'), hoehe: el('span'), peers: el('span'), leistung: el('span'),
    fassung: el('span.cyan'), version: el('span.version'),
  };
  fuelle(wurzel, el('div.fenster',
    titelleiste(),
    el('div.app',
      el('aside.leiste',
        el('div.marke', kristall(24), el('div', el('b', 'YSKAR'), el('span', 'Node Core'))),
        nav,
        el('div.leiste-fuss', unten, neueVersion, el('div.leiste-stand', el('b', standPunkt, standName), standZeile))),
      inhalt),
    el('div.statusleiste',
      el('span.an', status.punkt, status.name), status.netz, status.hoehe, status.peers, status.leistung,
      el('span.fl'), status.fassung, status.version)));
  geruest = { nav: [...nav.querySelectorAll('a'), ...unten.querySelectorAll('a')], inhalt, standPunkt, standName, standZeile, neueVersion, status };
  document.documentElement.style.setProperty('--oben', eigeneTitelleiste() ? 'var(--titel)' : '0px');
}

function aktualisiereGeruest() {
  if (!geruest || !stand) return;
  const laeuft = stand.running;
  const farbe = laeuft ? (stand.syncing || stand.targetHeight === null ? 'gelb' : 'gruen') : '';
  const name = laeuft ? (stand.syncing ? t('leiste.sync') : stand.targetHeight === null ? t('status.wartet') : t('status.synchron')) : t('leiste.gestoppt');
  geruest.standPunkt.className = 'punkt ' + farbe;
  text(geruest.standName, laeuft ? (stand.syncing ? t('leiste.sync') : t('leiste.laeuft')) : t('leiste.gestoppt'));
  text(geruest.standZeile, t('leiste.zeile', netzName(stand.network), stand.height === null ? '—' : zahl(stand.height), stand.peerCount));
  geruest.neueVersion.hidden = !stand.update?.neuer;
  if (stand.update?.neuer) text(geruest.neueVersion, t('leiste.neueVersion', stand.update.neueste));

  const st = geruest.status;
  st.punkt.className = 'punkt ' + farbe;
  text(st.name, name);
  text(st.netz, netzName(stand.network));
  text(st.hoehe, t('status.hoehe', stand.height === null ? '—' : zahl(stand.height)));
  text(st.peers, t('status.peers', stand.peerCount ?? 0));
  text(st.leistung, stand.netzHashrate ? t('status.netz', leistung(stand.netzHashrate)) : '');
  const vorAktivierung = stand.nextActivationHeight && (stand.height ?? -1) < stand.nextActivationHeight;
  text(st.fassung, stand.konsensfassung ? (vorAktivierung ? t('status.fassungAb', stand.konsensfassung, zahl(stand.nextActivationHeight)) : t('status.fassung', stand.konsensfassung)) : '');
  text(st.version, 'v' + (stand.versionAnzeige ?? stand.version));
}

function zeige() {
  if (!stand) return;
  // Vor dem ersten Start: der Assistent, ohne Seitenleiste.
  if (!stand.configured) {
    aktiv?.ansicht.verlasse?.(); aktiv = null; geruest = null;
    const a = einrichtung.baue(ctx);
    fuelle(wurzel, el('div.fenster', titelleiste(), el('div.app', a.wurzel)));
    return;
  }
  if (!geruest) baueGeruest();
  const [id] = ort();
  const eintrag = ANSICHTEN.find(a => a.id === id) ?? ANSICHTEN[0];
  for (const a of geruest.nav) {
    if (a.dataset.id === eintrag.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  aktiv?.ansicht.verlasse?.();
  const ansicht = eintrag.modul.baue(ctx);
  aktiv = { id: eintrag.id, ansicht };
  fuelle(geruest.inhalt, ansicht.wurzel);
  aktualisiereGeruest();
  ansicht.aktualisiere?.(stand);
  document.title = t('nav.' + eintrag.id) + ' · YSKAR Node Core';
  geruest.inhalt.scrollTop = 0;
}

// ------------------------------------------------------------------- Suche

/**
 * Suche über alles (Strg K): Höhe, Hash, Adresse -- gesucht wird in der
 * Blockchain-Ansicht -- und die wichtigsten Befehle.
 */
function oeffneSuche() {
  if (!stand?.configured || document.querySelector('.overlay.suche')) return;
  const feld = el('input.feld', { type: 'search', placeholder: t('titel.sucheFeld'), 'aria-label': t('titel.suche'), style: 'height:42px;font-size:14px' });
  const BEFEHLE = [
    ['wallet/senden', 'aufwaerts', t('suche.senden'), t('nav.wallet')],
    ['wallet/empfangen', 'abwaerts', t('suche.empfangen'), t('nav.wallet')],
    ['mining', 'blitz', t('suche.mining'), t('nav.mining')],
    ['blockchain', 'wuerfel', t('suche.bloecke'), t('nav.blockchain')],
    ['peers', 'netz', t('suche.peers'), t('nav.peers')],
    ['einstellungen', 'regler', t('nav.einstellungen'), ''],
    ['einstellungen/protokoll', 'liste', t('suche.protokoll'), t('nav.einstellungen')],
  ];
  const liste = el('div', { style: 'display:flex;flex-direction:column;gap:2px' });
  let wahl = 0, treffer = [];
  const d = dialog({ titel: t('titel.suche'), breite: 620, oben: true });
  d.wurzel.classList.add('suche');
  const geh = ziel => { d.schliesse(); ctx.gehe(ziel); };
  function zeigeListe() {
    const q = feld.value.trim();
    treffer = [];
    if (q) treffer.push(['blockchain/suche/' + encodeURIComponent(q), 'suche', t('suche.inKette', q), t('suche.hoeheHashAdresse')]);
    for (const b of BEFEHLE) if (!q || b[2].toLowerCase().includes(q.toLowerCase())) treffer.push(b);
    wahl = Math.min(wahl, Math.max(0, treffer.length - 1));
    fuelle(liste, treffer.map(([ziel, z, name, wo], i) => el('a', {
      href: '#/' + ziel, onclick: e => { e.preventDefault(); geh(ziel); },
      style: 'display:flex;align-items:center;gap:12px;height:38px;padding:0 10px;border-radius:8px;font-size:13px;font-weight:500;color:' + (i === wahl ? 'var(--fg);background:var(--panel2)' : 'var(--lese)'),
    }, zeichen(z, 15), el('span', { style: 'flex:1' }, name), el('span.blass', { style: 'font-size:12px;font-weight:400' }, wo))));
  }
  feld.addEventListener('input', () => { wahl = 0; zeigeListe(); });
  feld.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { wahl = Math.min(treffer.length - 1, wahl + 1); zeigeListe(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { wahl = Math.max(0, wahl - 1); zeigeListe(); e.preventDefault(); }
    if (e.key === 'Enter' && treffer[wahl]) { e.preventDefault(); geh(treffer[wahl][0]); }
  });
  fuelle(d.inhalt, feld, liste);
  d.fuss.zeige(el('span.hinweis', t('suche.tasten')));
  zeigeListe();
  setTimeout(() => feld.focus(), 0);
}

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); oeffneSuche(); }
});

// ------------------------------------------------------------------- Start

async function start() {
  const startBild = zeigeStart(eigeneTitelleiste());
  try {
    stand = await hole('/api/status');
  } catch (e) {
    startBild.fertig();
    fuelle(wurzel, el('div.einrichtung', el('div.fehler', e.message)));
    return;
  }
  setzeSprache(stand.einstellungen?.sprache);
  setzePlattform(stand.plattform);
  startBild.schritt(t('start.pruefen'), 0.35);

  // Eingerichtet, aber der Knoten steht noch: sofort starten, wenn gewünscht.
  if (stand.configured && !stand.running && stand.einstellungen?.knotenSofort !== false) {
    try { await sende('/api/start'); stand = await hole('/api/status'); }
    catch (e) { setTimeout(() => melde(t('fehler.knotenStart', e.message), true), 300); }
  }
  startBild.schritt(t('start.netz'), 0.7);

  zeige();
  window.addEventListener('hashchange', zeige);
  clearInterval(takt);
  takt = setInterval(lies, 2000);
  await startBild.fertig(() => (stand?.peerCount ?? 0) > 0 || !stand?.running);
}

/*
 * Die Wallet sperrt sich nach einer Weile ohne Regung von selbst. Als Regung
 * zählt, dass jemand das Programm bedient -- nicht, dass es offen ist.
 */
let letzteRegung = 0;
function regung() {
  if (!stand?.wallet?.vorhanden || stand.wallet.gesperrt) return;
  const jetzt = Date.now();
  if (jetzt - letzteRegung < 20000) return;
  letzteRegung = jetzt;
  sende('/api/wallet/regung').catch(() => {});
}
window.addEventListener('pointerdown', regung, { passive: true });
window.addEventListener('keydown', regung, { passive: true });

/*
 * Links nach draußen. Im installierten Programm öffnet sie der Browser des
 * Nutzers -- das Fenster selbst lädt nie eine fremde Seite.
 */
document.addEventListener('click', e => {
  const a = e.target instanceof Element ? e.target.closest('a[target=_blank]') : null;
  if (!a || !stand?.huelle?.vorhanden) return;
  e.preventDefault();
  sende('/api/huelle/link', { url: a.href }).catch(err => melde(err.message, true));
});

// Der Assistent ruft das, wenn er fertig ist.
ctx.eingerichtet = async () => { stand = await hole('/api/status'); location.hash = '#/uebersicht'; zeige(); };

start();
