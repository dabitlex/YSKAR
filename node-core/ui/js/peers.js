/* Peers: mit wem der Knoten verbunden ist. */
import { sende, el, fuelle, text, chip, knopf, kopf, melde, zahl, dauer, zeichen } from './kern.js';
import { t } from './i18n.js';

export function baue(ctx) {
  const erreichbar = el('span');
  const st = { verb: el('b', '—'), verbSub: el('span', ''), aus: el('b', '—'), ein: el('b', '—'), buch: el('b', '—') };
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
    el('section.kennzahlen', { 'aria-label': t('ueb.kennzahlen') },
      el('div.stat', el('span.cap', t('peers.verbunden')), st.verb, st.verbSub),
      el('div.stat', el('span.cap', t('peers.ausgehend')), st.aus, el('span', t('peers.ausSub'))),
      el('div.stat', el('span.cap', t('peers.eingehend')), st.ein, el('span', t('peers.einSub'))),
      el('div.stat', el('span.cap', t('peers.buch')), st.buch, el('span', t('peers.buchSub')))),
    el('section.karte', { 'aria-label': t('peers.liste') },
      el('div.karte-kopf', el('h2', t('peers.liste'))),
      el('div.tab-huelle', el('table.tab',
        el('thead', el('tr', el('th', t('peers.adresse')), el('th', t('peers.richtung')), el('th.r', t('kette.hoehe')),
          el('th', { style: 'padding-left:24px' }, t('peers.programm')), el('th', t('peers.seit')), el('th.r', el('span.nur-leser', t('peers.aktion'))))),
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
    text(st.verb, zahl(s.peerCount));
    const hoehen = s.peers.map(p => p.hoehe);
    text(st.verbSub, s.peerCount ? t('peers.hoechste', zahl(Math.max(...hoehen))) : t('peers.keiner'));
    text(st.aus, zahl(s.outboundPeers)); text(st.ein, zahl(s.inboundPeers)); text(st.buch, zahl(s.peerBook));
    text(seed, s.seed || t('peers.keinSeed'));
    const eingebaut = s.weitereSeeds || [];
    weitere.hidden = eingebaut.length === 0;
    text(weitere, eingebaut.length ? t('peers.weitereSeeds', eingebaut.join(', ')) : '');

    fuelle(erreichZeichen, zeichen(offen ? 'haken' : 'info', 18));
    erreichZeichen.className = offen ? 'gut' : 'blass';
    text(erreichText, offen ? t('peers.offen', s.inboundPeers, s.p2pPort) : t('peers.zu', s.p2pPort));

    // Nur neu aufbauen, wenn sich etwas geändert hat -- sonst springt die Tabelle.
    const neu = JSON.stringify(s.peers.map(p => [p.id, p.hoehe, Math.floor((Date.now() - p.seit) / 60000)]));
    if (neu === bild) return;
    bild = neu;
    fuelle(zeilen, s.peers.length ? s.peers.map(p => el('tr',
      el('td.mono', p.adresse, p.seed ? el('span.chip.blau', { style: 'height:22px;margin-left:8px;font-family:Manrope,sans-serif' }, 'Seed') : null),
      el('td', t('peers.' + (p.richtung === 'aus' ? 'aus' : 'ein'))),
      el('td.r.mono', zahl(p.hoehe)),
      el('td.mono.dim', { style: 'padding-left:24px' }, p.programm || '—'),
      el('td.dim', dauer((Date.now() - p.seit) / 1000)),
      el('td.r', knopf(t('peers.trennen'), () => trenne(p.id), 'klein'))))
      : el('tr', el('td.leer', { colspan: 6 }, s.running ? t('peers.keineVerbunden') : t('fehler.knotenAus'))));
  }

  return { wurzel, aktualisiere };
}
