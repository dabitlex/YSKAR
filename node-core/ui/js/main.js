/*
 * Einstieg der Oberfläche: Gerüst, Navigation, Takt.
 *
 * Eine Ansicht ist ein Modul mit `baue(ctx)`. Es liefert
 *   { wurzel, aktualisiere(stand), verlasse() }
 * `aktualisiere` kommt alle zwei Sekunden mit dem Stand des Knotens.
 */
import { hole, sende, el, fuelle, zeichen, kristall, melde, text, zahl, netzName } from './kern.js';
import { t, setzeSprache } from './i18n.js';
import * as einrichtung from './einrichtung.js';
import * as uebersicht from './uebersicht.js';
import * as wallet from './wallet.js';
import * as mining from './mining.js';
import * as poolBetrieb from './poolBetrieb.js';
import * as blockchain from './blockchain.js';
import * as peers from './peers.js';
import * as einstellungen from './einstellungen.js';

const ANSICHTEN = [
  { id: 'uebersicht', zeichen: 'uebersicht', modul: uebersicht },
  { id: 'wallet', zeichen: 'wallet', modul: wallet },
  { id: 'mining', zeichen: 'blitz', modul: mining },
  { id: 'pool', zeichen: 'leute', modul: poolBetrieb },
  { id: 'blockchain', zeichen: 'wuerfel', modul: blockchain },
  { id: 'peers', zeichen: 'netz', modul: peers },
  { id: 'einstellungen', zeichen: 'regler', modul: einstellungen },
];

const wurzel = document.getElementById('wurzel');
let stand = null;          // letzte Antwort von /api/status
let aktiv = null;          // { id, ansicht }
let takt = null;
let geruest = null;        // { nav, inhalt, standName, standZeile, standPunkt }

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
};

async function lies() {
  try {
    stand = await hole('/api/status');
    aktualisiereGeruest();
    aktiv?.ansicht.aktualisiere?.(stand);
  } catch (e) {
    if (geruest) {
      text(geruest.standName, t('leiste.keineAntwort'));
      geruest.standPunkt.className = 'punkt gelb';
    }
  }
}

function baueGeruest() {
  const nav = el('nav.nav', { 'aria-label': t('nav.bereiche') },
    ANSICHTEN.map(a => el('a', { href: '#/' + a.id, 'data-id': a.id }, zeichen(a.zeichen, 18), el('span', t('nav.' + a.id)))));
  const standPunkt = el('span.punkt');
  const standName = el('span');
  const standZeile = el('span');
  const inhalt = el('main.inhalt');
  fuelle(wurzel, el('div.app',
    el('aside.leiste',
      el('div.marke', kristall(), el('div', el('b', 'YSKAR'), el('span', 'Node Core ' + (stand?.version ?? '')))),
      nav,
      el('div.leiste-stand', el('b', standPunkt, standName), standZeile)),
    inhalt));
  geruest = { nav, inhalt, standPunkt, standName, standZeile };
}

function aktualisiereGeruest() {
  if (!geruest || !stand) return;
  const laeuft = stand.running;
  geruest.standPunkt.className = 'punkt ' + (laeuft ? (stand.syncing ? 'gelb' : 'gruen') : '');
  text(geruest.standName, laeuft ? (stand.syncing ? t('leiste.sync') : t('leiste.laeuft')) : t('leiste.gestoppt'));
  text(geruest.standZeile, t('leiste.zeile', netzName(stand.network), stand.height === null ? '—' : zahl(stand.height), stand.peerCount));
}

function zeige() {
  if (!stand) return;
  // Vor dem ersten Start: der Assistent, ohne Seitenleiste.
  if (!stand.configured) {
    aktiv?.ansicht.verlasse?.(); aktiv = null; geruest = null;
    const a = einrichtung.baue(ctx);
    fuelle(wurzel, a.wurzel);
    return;
  }
  if (!geruest) baueGeruest();
  const [id] = ort();
  const eintrag = ANSICHTEN.find(a => a.id === id) ?? ANSICHTEN[0];
  for (const a of geruest.nav.children) {
    if (a.dataset.id === eintrag.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  aktiv?.ansicht.verlasse?.();
  const ansicht = eintrag.modul.baue(ctx);
  aktiv = { id: eintrag.id, ansicht };
  fuelle(geruest.inhalt, ansicht.wurzel);
  aktualisiereGeruest();
  ansicht.aktualisiere?.(stand);
  document.title = t('nav.' + eintrag.id) + ' · YSKAR Node Core';
  geruest.inhalt.scrollTop = 0; window.scrollTo(0, 0);
}

async function start() {
  try {
    stand = await hole('/api/status');
  } catch (e) {
    fuelle(wurzel, el('div.einrichtung', el('div', el('div.fehler', e.message))));
    return;
  }
  setzeSprache(stand.einstellungen?.sprache);

  // Eingerichtet, aber der Knoten steht noch: sofort starten, wenn gewünscht.
  if (stand.configured && !stand.running && stand.einstellungen?.knotenSofort !== false) {
    try { await sende('/api/start'); stand = await hole('/api/status'); }
    catch (e) { setTimeout(() => melde(t('fehler.knotenStart', e.message), true), 300); }
  }

  zeige();
  window.addEventListener('hashchange', zeige);
  clearInterval(takt);
  takt = setInterval(lies, 2000);
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

// Der Assistent ruft das, wenn er fertig ist.
ctx.eingerichtet = async () => { stand = await hole('/api/status'); location.hash = '#/uebersicht'; zeige(); };

start();
