/* Blockchain: Blöcke, Suche, wartende Überweisungen. Details öffnen sich als Fenster. */
import { hole, el, fuelle, text, chip, knopf, kopf, melde, zahl, ysr, kurzAdresse, kurzHash, tagOderZeit, vor, finder, zeichen,
  kopfKarte, kennzahl, rollZahl, platz, dezimal } from './kern.js';
import { bild } from './bilder.js';
import { blockFenster, kontoFenster, txFenster } from './fenster.js';
import { t } from './i18n.js';

const JE_SEITE = 10;

export function baue(ctx) {
  const eingabe = el('input.feld', { id: 'suche', type: 'search', placeholder: t('kette.suchfeld'), style: 'height:36px;width:300px' });
  const zeilen = el('tbody');
  const bereich = el('span.hinweis');
  const wartend = el('tbody');
  const wartendText = el('span.hinweis');
  const neuer = knopf(t('kette.neuere'), () => blaettere(-1));
  const aelter = knopf(t('kette.aeltere'), () => blaettere(1));

  const held = { zahl: el('div.zahl', platz(5)), satz: el('p.held-satz') };
  const kz = { tag: kennzahl(t('ueb.tagBloecke24')), diff: kennzahl(t('ueb.difficulty')), wartend: kennzahl(t('kette.wartendKurz')), groesse: kennzahl(t('kette.aufDiesemPc')) };

  let oben = null;        // höchste Höhe der gezeigten Seite; null = Kopf der Kette
  let kopfHoehe = -1, gezeigt = null, letzteOben = null;
  let mempoolTakt = null;

  const wurzel = el('div.stapel',
    kopf(t('kette.titel'), t('kette.sub'), chip('gruen', t('kette.selbstGeprueft'))),
    kopfKarte([
      el('span.cap', t('kette.neuesterBlock')), held.zahl, held.satz,
      el('form.held-knoepfe', { onsubmit: e => { e.preventDefault(); suche(); } },
        el('label.nur-leser', { for: 'suche' }, t('kette.suche')), eingabe,
        el('button.knopf.haupt', { type: 'submit' }, zeichen('suche', 14), t('kette.suchen'))),
    ], bild('kette', 260), Object.values(kz)),
    el('section.karte', { 'aria-label': t('kette.bloecke') },
      el('div.karte-kopf', el('h2', t('kette.bloecke')), bereich),
      el('div.tab-huelle', el('table.tab',
        el('thead', el('tr', el('th', t('kette.hoehe')), el('th', t('kette.zeit')), el('th', t('kette.gefunden')),
          el('th.r', t('kette.ueberwKurz')), el('th.r', t('ueb.difficulty')), el('th.r', 'Hash'))),
        zeilen)),
      el('div.karte-kopf', el('span'), el('div.reihe', neuer, aelter))),
    el('section.karte', { 'aria-label': t('kette.wartend') },
      el('div.karte-kopf', el('h2', t('kette.wartend')), wartendText),
      el('div.tab-huelle', el('table.tab',
        el('thead', el('tr', el('th', t('kette.von')), el('th', t('kette.an')), el('th.r', t('kette.betrag')), el('th.r', t('kette.gebuehr')), el('th.r', t('kette.wartetSeit')))),
        wartend))));

  async function ladeSeite() {
    try {
      const r = await hole('/api/lesen/blocks?limit=' + JE_SEITE + (oben === null ? '' : '&before=' + (oben + 1)));
      const bl = r.blocks;
      const neu = oben === null && letzteOben !== null && bl[0]?.height > letzteOben;
      if (oben === null) letzteOben = bl[0]?.height ?? null;
      fuelle(zeilen, bl.length ? bl.map((b, i) => el('tr.wahl' + (neu && i === 0 ? '.neu-zeile' : ''), { tabindex: '0', onclick: () => blockFenster(ctx, b.height, true), onkeydown: e => { if (e.key === 'Enter') blockFenster(ctx, b.height, true); } },
        el('td', el('b', { style: 'font-weight:600' }, zahl(b.height))), el('td.dim', tagOderZeit(b.timestamp)), el('td', finder(b)),
        el('td.r', zahl(Math.max(0, b.txCount - 1))), el('td.r', zahl(BigInt(b.difficultyWert))), el('td.r.mono.dim', kurzHash(b.hash))))
        : el('tr', el('td.leer', { colspan: 6 }, t('kette.keine'))));
      text(bereich, bl.length ? t('kette.bereich', zahl(bl[bl.length - 1].height), zahl(bl[0].height), zahl(kopfHoehe + 1)) : '');
      neuer.disabled = oben === null || oben >= kopfHoehe;
      aelter.disabled = !bl.length || bl[bl.length - 1].height <= 0;
      if (oben === null && bl.length) {
        const b = bl[0];
        text(held.satz, t('kette.heldSatz', vor(b.timestamp * 1000), b.finder || (b.recipients > 1 ? t('kette.pool') : t('kette.solo')), zahl(b.recipients), zahl(Math.max(0, b.txCount - 1))));
        text(kz.diff.wert, zahl(BigInt(b.difficultyWert)));
        text(kz.diff.unter, t('kette.diffUnter'));
      }
    } catch (e) { fuelle(zeilen, el('tr', el('td.leer', { colspan: 6 }, e.message))); }
  }

  async function ladeTag() {
    try {
      const ab = Math.floor(Date.now() / 1000) - 86400;
      const alle = [];
      let vorHoehe = null;
      for (let i = 0; i < 4; i++) {
        const r = await hole('/api/lesen/blocks?limit=100' + (vorHoehe === null ? '' : '&before=' + vorHoehe));
        if (!r.blocks.length) break;
        alle.push(...r.blocks);
        vorHoehe = r.blocks[r.blocks.length - 1].height;
        if (r.blocks[r.blocks.length - 1].timestamp < ab || vorHoehe <= 0) break;
      }
      const im = alle.filter(b => b.timestamp >= ab).sort((a, b) => a.timestamp - b.timestamp);
      const schnitt = im.length > 1 ? (im[im.length - 1].timestamp - im[0].timestamp) / (im.length - 1) / 60 : null;
      text(kz.tag.wert, zahl(im.length));
      text(kz.tag.unter, schnitt === null ? '' : t('ueb.tagSchnittKurz', dezimal(schnitt), 10));
    } catch { /* nächster Block */ }
  }

  function blaettere(richtung) {
    const jetzt = oben === null ? kopfHoehe : oben;
    const neu = jetzt - richtung * JE_SEITE;
    oben = neu >= kopfHoehe ? null : Math.max(JE_SEITE - 1, neu);
    ladeSeite();
  }

  /** Zu einer Höhe springen: Seite so legen, dass der Block oben steht, und das Fenster öffnen. */
  function springe(hoehe) {
    oben = hoehe >= kopfHoehe ? null : Math.max(JE_SEITE - 1, hoehe);
    ladeSeite();
    blockFenster(ctx, hoehe, true);
  }

  async function suche() {
    const q = eingabe.value.trim();
    if (!q) return;
    try {
      const r = await hole('/api/lesen/search?q=' + encodeURIComponent(q));
      if (r.kind === 'block') springe(r.height);
      else if (r.kind === 'address') kontoFenster(ctx, r.address);
      else if (r.kind === 'tx') txFenster(ctx, r.txid);
      else melde(t('kette.nichtsGefunden'), true);
    } catch (e) { melde(e.message, true); }
  }

  async function ladeMempool() {
    try {
      const r = await hole('/api/kette/mempool');
      const w = r.wartend;
      const anzahl = r.anzahl ?? w.length;
      text(kz.wartend.wert, zahl(anzahl));
      text(kz.wartend.unter, anzahl ? t('kette.wartendUnter') : t('kette.wartendLeer'));
      text(wartendText, anzahl ? t('kette.wartendText', anzahl) : t('kette.wartendLeer'));
      const adr = a => el('a.mono', { href: '#', onclick: e => { e.preventDefault(); e.stopPropagation(); kontoFenster(ctx, a); } }, kurzAdresse(a));
      fuelle(wartend, w.length ? w.map(x => el('tr' + (x.txid ? '.wahl' : ''), { onclick: x.txid ? () => txFenster(ctx, x.txid) : null },
        el('td', adr(x.from)), el('td', adr(x.to)),
        el('td.r', ysr(x.amount)), el('td.r', ysr(x.fee, 0)), el('td.r.dim', vor(x.seit))))
        : el('tr', el('td.leer', { colspan: 5 }, t('kette.wartendKeine'))));
    } catch { /* nächster Takt */ }
  }

  function aktualisiere(s) {
    if (!s.running) {
      fuelle(zeilen, el('tr', el('td.leer', { colspan: 6 }, t('fehler.knotenAus'))));
      return;
    }
    const neu = s.height ?? -1;
    const anzeige = zahl(neu);
    if (anzeige !== gezeigt) { rollZahl(held.zahl, gezeigt, anzeige); gezeigt = anzeige; }
    text(kz.groesse.wert, s.dataDirBytes ? dezimal(s.dataDirBytes / 1e6) + ' MB' : '—');
    text(kz.groesse.unter, t('kette.groesseUnter'));
    if (neu !== kopfHoehe) {
      const warAmKopf = oben === null;
      kopfHoehe = neu;
      if (warAmKopf || zeilen.children.length === 0) ladeSeite();
      else neuer.disabled = false;
      ladeTag();
    }
  }

  // Einstieg über die Adresszeile: #/blockchain/3244 öffnet den Block als Fenster.
  const start = ctx.ort()[1];
  const s0 = ctx.stand();
  if (s0?.running) kopfHoehe = s0.height ?? -1;
  if (start && /^\d+$/.test(start)) {
    history.replaceState(null, '', '#/blockchain');
    const h = Math.min(Number(start), Math.max(0, kopfHoehe));
    setTimeout(() => springe(h), 0);
  } else if (s0?.running) ladeSeite();
  // Aus der Suche (Strg K): #/blockchain/suche/<Begriff>
  if (start === 'suche' && ctx.ort()[2]) {
    try { eingabe.value = decodeURIComponent(ctx.ort().slice(2).join('/')); } catch { eingabe.value = ''; }
    history.replaceState(null, '', '#/blockchain');
    setTimeout(suche, 0);
  }
  if (s0?.running) ladeTag();
  ladeMempool();
  mempoolTakt = setInterval(ladeMempool, 4000);

  return { wurzel, aktualisiere, verlasse: () => clearInterval(mempoolTakt) };
}
