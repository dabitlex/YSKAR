/* Peers: mit wem der Knoten verbunden ist. */
import { sende, el, fuelle, text, chip, knopf, kopf, melde, zahl, dauer, zeichen, kopfKarte, kennzahl, platz } from './kern.js';
import { bild as illu } from './bilder.js';
import { t } from './i18n.js';

/**
 * IP-Adressen standardmäßig teilweise verdecken -- etwa für Bildschirmfotos.
 * Namen (wie der Seed) bleiben lesbar.
 */
function verdecke(adresse) {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}(:\d+)?$/.exec(adresse);
  if (v4) return `${v4[1]}.${v4[2]}.•••.•••${v4[3] ?? ''}`;
  const v6 = /^\[([0-9a-f]{1,4}):([0-9a-f]{1,4}):[^\]]*\](:\d+)?$/i.exec(adresse);
  if (v6) return `[${v6[1]}:${v6[2]}:•••]${v6[3] ?? ''}`;
  return adresse;
}
const SCHLUESSEL = 'yskar.peers.ipZeigen';

export function baue(ctx) {
  let zeigeIp = false;
  try { zeigeIp = localStorage.getItem(SCHLUESSEL) === '1'; } catch { /* ohne Speicher: verdeckt */ }
  const ipKnopf = knopf('', () => {
    zeigeIp = !zeigeIp;
    try { localStorage.setItem(SCHLUESSEL, zeigeIp ? '1' : '0'); } catch { /* nur für diese Sitzung */ }
    bild = ''; setzeIpKnopf(); aktualisiere(ctx.stand());
  });
  const setzeIpKnopf = () => fuelle(ipKnopf, zeichen('auge', 14), zeigeIp ? t('peers.ipVerdecken') : t('peers.ipZeigen'));
  setzeIpKnopf();
  const erreichbar = el('span');
  const held = { zahl: el('div.zahl', platz(3)), satz: el('p.held-satz'), bild: el('div'), bildName: '' };
  const kz = { aus: kennzahl(t('peers.ausgehend'), null, t('peers.ausSub')), ein: kennzahl(t('peers.eingehend'), null, t('peers.einSub')),
    buch: kennzahl(t('peers.buch'), null, t('peers.buchSub')), hoch: kennzahl(t('peers.hoechsterStand')) };
  const zeilen = el('tbody');
  const eingabe = el('input.feld', { id: 'peer', type: 'text', placeholder: 'knoten.example.org:8646', autocomplete: 'off', spellcheck: 'false' });
  const seed = el('div.box.mono', { style: 'font-size:13.5px' }, '—');
  const weitere = el('p.hinweis', { hidden: true });
  const erreichText = el('span');
  const erreichZeichen = el('span', { style: 'display:inline-flex;margin-top:2px' });
  let bild = '';

  async function verbinde(e) {
    e.preventDefault();
    const adresse = eingabe.value.trim();
    if (!adresse) return;
    try { await sende('/api/peers/verbinden', { adresse }); eingabe.value = ''; melde(t('peers.wirdVerbunden', adresse)); }
    catch (err) { melde(err.message, true); }
  }

  async function trenne(id) {
    try { await sende('/api/peers/trennen', { id }); await ctx.neuLaden(); }
    catch (err) { melde(err.message, true); }
  }

  const wurzel = el('div.stapel',
    kopf(t('peers.titel'), t('peers.sub'), erreichbar),
    kopfKarte([el('span.cap', t('peers.verbunden')), held.zahl, held.satz,
      el('div.held-knoepfe', knopf([zeichen('plus', 14), t('peers.hinzu')], () => { eingabe.scrollIntoView({ behavior: 'smooth', block: 'center' }); eingabe.focus(); }))],
      held.bild, Object.values(kz)),
    el('section.karte', { 'aria-label': t('peers.liste') },
      el('div.karte-kopf', el('h2', t('peers.liste')), ipKnopf),
      el('div.tab-huelle', el('table.tab',
        el('thead', el('tr', el('th', t('peers.adresse')), el('th', t('peers.richtung')), el('th.r', t('kette.hoehe')),
          el('th', { style: 'padding-left:24px' }, t('peers.programm')), el('th.r', t('peers.fassung')), el('th', t('peers.seit')), el('th.r', el('span.nur-leser', t('peers.aktion'))))),
        zeilen))),
    el('div.spalten.gleich',
      el('section.karte', { style: 'flex:1 1 340px', 'aria-label': t('peers.hinzu') },
        el('h2', t('peers.hinzu')),
        el('form.feldgruppe', { onsubmit: verbinde },
          el('label', { for: 'peer' }, t('peers.adressePort')),
          el('div.reihe', eingabe, el('button.knopf.haupt', { type: 'submit' }, t('peers.verbinden')))),
        el('p.hinweis', t('peers.hinzuHinweis'))),
      el('section.karte', { style: 'flex:1 1 340px', 'aria-label': 'Seed' },
        el('div.karte-kopf', el('h2', 'Seed'), el('a', { href: '#/einstellungen' }, t('allg.aendern'))),
        seed,
        weitere,
        el('p.hinweis', t('peers.seedHinweis'))),
      el('section.karte', { style: 'flex:1 1 340px', 'aria-label': t('peers.erreichbarkeit') },
        el('h2', t('peers.erreichbarkeit')),
        el('div', { style: 'display:flex;gap:10px;align-items:flex-start;font-size:13.5px;font-weight:600;line-height:1.45' }, erreichZeichen, erreichText),
        el('p.hinweis', t('peers.erreichHinweis')))));

  function aktualisiere(s) {
    const offen = s.inboundPeers > 0;
    fuelle(erreichbar, !s.running ? chip('hoch', t('ueb.gestoppt'), true)
      : offen ? chip('gruen hoch', t('peers.vonAussen'), true) : chip('hoch', t('peers.nurAus'), true));
    text(held.zahl, zahl(s.running ? s.peerCount : 0));
    text(held.satz, !s.running ? t('fehler.knotenAus') : s.peerCount ? t('peers.heldSatz', s.outboundPeers, s.inboundPeers, s.peerBook) : t('peers.keiner'));
    const name = s.running && s.peerCount ? 'peers' : 'keinPeer';
    if (name !== held.bildName) { held.bildName = name; fuelle(held.bild, illu(name, 260)); }
    text(kz.aus.wert, zahl(s.outboundPeers)); text(kz.ein.wert, zahl(s.inboundPeers)); text(kz.buch.wert, zahl(s.peerBook));
    const hoehen = s.peers.map(p => p.hoehe);
    text(kz.hoch.wert, hoehen.length ? zahl(Math.max(...hoehen)) : '—');
    text(kz.hoch.unter, hoehen.length && Math.max(...hoehen) <= (s.height ?? -1) ? t('peers.wieDeiner') : t('peers.deiner', zahl(s.height ?? 0)));
    text(seed, s.seed || t('peers.keinSeed'));
    const eingebaut = s.weitereSeeds || [];
    weitere.hidden = eingebaut.length === 0;
    text(weitere, eingebaut.length ? t('peers.weitereSeeds', eingebaut.join(', ')) : '');

    fuelle(erreichZeichen, zeichen(offen ? 'haken' : 'info', 18));
    erreichZeichen.className = offen ? 'gut' : 'blass';
    text(erreichText, offen ? t('peers.offen', s.inboundPeers, s.p2pPort) : t('peers.zu', s.p2pPort));

    // Nur neu aufbauen, wenn sich etwas geändert hat -- sonst springt die Tabelle.
    const neu = JSON.stringify(s.peers.map(p => [p.id, p.hoehe, p.fassung, Math.floor((Date.now() - p.seit) / 60000)]));
    if (neu === bild) return;
    bild = neu;
    fuelle(zeilen, s.peers.length ? s.peers.map(p => el('tr',
      el('td.mono', { title: zeigeIp ? null : t('peers.verdecktTitel') }, zeigeIp ? p.adresse : verdecke(p.adresse), p.seed ? el('span.chip.blau', { style: 'margin-left:8px;font-family:var(--sans)' }, 'Seed') : null),
      el('td', t('peers.' + (p.richtung === 'aus' ? 'aus' : 'ein'))),
      el('td.r.mono', zahl(p.hoehe)),
      el('td.mono.dim', { style: 'padding-left:24px' }, p.programm || '—'),
      // Konsensfassung, die der Peer im Handschlag meldet; 0 heisst: noch keiner.
      el('td.r.mono', p.fassung > 0 ? String(p.fassung) : '—'),
      el('td.dim', dauer((Date.now() - p.seit) / 1000)),
      el('td.r', knopf(t('peers.trennen'), () => trenne(p.id), 'klein beim-zeigen'))))
      : el('tr', el('td.leer', { colspan: 7 }, s.running ? t('peers.keineVerbunden') : t('fehler.knotenAus'))));
  }

  return { wurzel, aktualisiere };
}
