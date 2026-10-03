/* Blockchain: Blöcke, Blockdetails, Suche, wartende Überweisungen. */
import { hole, el, fuelle, text, zeile, chip, knopf, kopf, melde, zahl, ysr, kurzAdresse, kurzHash, kurzHash8, uhrzeit, tagOderZeit, datumZeit, vor, finder, zeichen, kopiere } from './kern.js';
import { t } from './i18n.js';

const JE_SEITE = 10;

export function baue(ctx) {
  const eingabe = el('input.feld', { id: 'suche', type: 'search', placeholder: t('kette.suchfeld') });
  const zeilen = el('tbody');
  const bereich = el('span.hinweis');
  const detail = el('section.karte', { style: 'flex:2 1 340px', 'aria-live': 'polite' });
  const wartend = el('tbody');
  const wartendText = el('span.hinweis');
  const neuer = knopf(t('kette.neuere'), () => blaettere(-1));
  const aelter = knopf(t('kette.aeltere'), () => blaettere(1));

  let oben = null;        // höchste Höhe der gezeigten Seite; null = Kopf der Kette
  let gewaehlt = null;    // Höhe des gezeigten Blocks
  let kopfHoehe = -1;
  let mempoolTakt = null;

  const wurzel = el('div.stapel',
    kopf(t('kette.titel'), t('kette.sub'),
      el('form', { style: 'display:flex;gap:10px;flex:1 1 320px;max-width:520px', onsubmit: e => { e.preventDefault(); suche(); } },
        el('label.nur-leser', { for: 'suche' }, t('kette.suche')), eingabe,
        el('button.knopf', { type: 'submit' }, zeichen('suche'), t('kette.suchen')))),
    el('div.spalten',
      el('section.karte', { style: 'flex:3 1 620px', 'aria-label': t('kette.bloecke') },
        el('div.karte-kopf', el('h2', t('kette.bloecke'))),
        el('div.tab-huelle', el('table.tab',
          el('thead', el('tr', el('th', t('kette.hoehe')), el('th', t('kette.zeit')), el('th', t('kette.gefunden')),
            el('th.r', t('kette.ueberwKurz')), el('th.r', t('ueb.difficulty')), el('th.r', 'Hash'))),
          zeilen)),
        el('div.karte-kopf', bereich, el('div.reihe', neuer, aelter))),
      detail),
    el('section.karte', { 'aria-label': t('kette.wartend') },
      el('div.karte-kopf', el('h2', t('kette.wartend')), wartendText),
      el('div.tab-huelle', el('table.tab',
        el('thead', el('tr', el('th', t('kette.von')), el('th', t('kette.an')), el('th.r', t('kette.betrag')), el('th.r', t('kette.gebuehr')), el('th.r', t('kette.wartetSeit')))),
        wartend))));

  async function ladeSeite() {
    try {
      const r = await hole('/api/lesen/blocks?limit=' + JE_SEITE + (oben === null ? '' : '&before=' + (oben + 1)));
      const bl = r.blocks;
      fuelle(zeilen, bl.length ? bl.map(b => el('tr.wahl' + (b.height === gewaehlt ? '.gewaehlt' : ''), { 'data-h': b.height, onclick: () => waehle(b.height) },
        el('td.mono', zahl(b.height)), el('td.dim', tagOderZeit(b.timestamp)), el('td', finder(b)),
        el('td.r.mono', zahl(Math.max(0, b.txCount - 1))), el('td.r.mono', zahl(BigInt(b.difficultyWert))), el('td.r.mono.dim', kurzHash(b.hash))))
        : el('tr', el('td.leer', { colspan: 6 }, t('kette.keine'))));
      text(bereich, bl.length ? t('kette.bereich', zahl(bl[bl.length - 1].height), zahl(bl[0].height), zahl(kopfHoehe + 1)) : '');
      neuer.disabled = oben === null || oben >= kopfHoehe;
      aelter.disabled = !bl.length || bl[bl.length - 1].height <= 0;
      if (gewaehlt === null && bl.length) waehle(bl[0].height, false);
    } catch (e) { fuelle(zeilen, el('tr', el('td.leer', { colspan: 6 }, e.message))); }
  }

  function blaettere(richtung) {
    const jetzt = oben === null ? kopfHoehe : oben;
    const neu = jetzt - richtung * JE_SEITE;
    oben = neu >= kopfHoehe ? null : Math.max(JE_SEITE - 1, neu);
    ladeSeite();
  }

  function markiere() {
    for (const z of zeilen.children) z.classList.toggle('gewaehlt', Number(z.dataset.h) === gewaehlt);
  }

  async function waehle(hoehe, merken = true) {
    gewaehlt = hoehe; markiere();
    try {
      const b = await hole('/api/lesen/blocks/' + hoehe);
      if (gewaehlt !== hoehe) return;
      zeigeBlock(b);
      if (merken && ctx.ort()[1] !== String(hoehe)) history.replaceState(null, '', '#/blockchain/' + hoehe);
    } catch (e) { fuelle(detail, el('h2', t('kette.block', zahl(hoehe))), el('p.hinweis.schlecht', e.message)); }
  }

  function zeigeBlock(b) {
    const cb = b.txs.find(x => x.type === 'coinbase');
    const ueberw = b.txs.filter(x => x.type === 'transfer');
    const gebuehren = ueberw.reduce((s, x) => s + BigInt(x.fee), 0n);
    const empf = cb?.recipients ?? (cb ? [{ address: cb.to, amount: cb.amount }] : []);
    fuelle(detail,
      el('div.karte-kopf', el('h2', t('kette.block', zahl(b.height))), b.height === kopfHoehe ? chip('', t('kette.neuester')) : null),
      el('div.feldgruppe', el('span.cap', 'Hash'),
        el('div.reihe', { style: 'align-items:flex-start' }, el('span.mono.umbruch', { style: 'font-size:13px;line-height:1.5' }, b.hash),
          el('button.knopf.symbol', { type: 'button', 'aria-label': t('kette.hashKopieren'), onclick: () => kopiere(b.hash) }, zeichen('kopieren')))),
      el('div.zeilen',
        zeile(t('kette.vorgaenger'), b.height > 0 ? el('a.mono', { href: '#/blockchain/' + (b.height - 1) }, kurzHash(b.prevHash)) : '—'),
        zeile(t('ueb.wurzel'), kurzHash8(b.stateRoot), true),
        zeile(t('kette.zeit'), datumZeit(b.timestamp)),
        zeile(t('ueb.difficulty'), zahl(BigInt(b.difficultyWert)), true),
        zeile(t('kette.groesse'), t('kette.byte', zahl(b.sizeBytes)), true),
        zeile(t('kette.gefunden'), finder(b)),
        zeile(t('kette.belohnung'), ysr(BigInt(b.reward) - gebuehren, 0) + ' YSR' + (gebuehren > 0n ? ' + ' + ysr(gebuehren, 0) + ' ' + t('kette.gebuehren') : ''), true)),
      el('div.feldgruppe', el('span.cap', empf.length === 1 ? t('kette.gehtAnEine') : t('kette.gehtAn', empf.length)),
        el('div.box.zeilen', { style: 'padding:4px 14px' }, empf.map(o => el('div.zeile', adresse(o.address), el('span.mono', ysr(o.amount)))))),
      ueberw.length ? el('div.feldgruppe', el('span.cap', t('kette.nUeberweisungen', ueberw.length)),
        el('div.box.zeilen', { style: 'padding:4px 14px' }, ueberw.map(x => el('div.zeile',
          el('span.mono', adresse(x.from), ' → ', adresse(x.to)), el('span.mono', ysr(x.amount)))))) : null);
  }

  /** Eine Adresse, kurz, mit Sprung zur Kontoansicht. */
  function adresse(a) {
    return el('a.mono', { href: '#/blockchain', title: a, onclick: e => { e.preventDefault(); zeigeKonto(a); } }, kurzAdresse(a));
  }

  async function zeigeKonto(a) {
    try {
      const k = await hole('/api/lesen/account/' + a);
      gewaehlt = null; markiere();
      fuelle(detail,
        el('div.karte-kopf', el('h2', t('kette.adresse')), chip('', t('kette.konto'))),
        el('div.feldgruppe', el('span.cap', t('kette.adresse')),
          el('div.reihe', { style: 'align-items:flex-start' }, el('span.mono.umbruch', { style: 'font-size:13px;line-height:1.5' }, k.address),
            el('button.knopf.symbol', { type: 'button', 'aria-label': t('kette.adresseKopieren'), onclick: () => kopiere(k.address) }, zeichen('kopieren')))),
        el('div.zeilen',
          zeile(t('kette.guthaben'), ysr(k.balance) + ' YSR', true),
          zeile(t('kette.gesendet'), zahl(Number(k.nonce)), true),
          zeile(t('kette.soloBloecke'), zahl(k.blocksFound), true),
          zeile(t('kette.poolAnteile'), zahl(k.poolRewards), true)),
        el('div.feldgruppe', el('span.cap', t('kette.verlauf')),
          k.history.length ? el('div.box.zeilen', { style: 'padding:4px 14px' }, k.history.slice(0, 12).map(h => el('div.zeile',
            el('span', el('a.mono', { href: '#/blockchain/' + h.height, onclick: e => { e.preventDefault(); springe(h.height); } }, zahl(h.height)),
              ' · ', t('kette.art.' + h.kind), h.counterparty ? [' · ', el('span.mono.blass', kurzAdresse(h.counterparty))] : null),
            el('span.mono' + (h.kind === 'out' ? '' : '.gut'), (h.kind === 'out' ? '−' : '+') + ysr(h.amount)))))
            : el('p.hinweis', t('kette.keinVerlauf'))));
    } catch (e) { melde(e.message, true); }
  }

  async function zeigeTx(id) {
    try {
      const x = await hole('/api/lesen/tx/' + id);
      gewaehlt = null; markiere();
      fuelle(detail,
        el('div.karte-kopf', el('h2', t('kette.ueberweisung')), x.status === 'pending' ? chip('gelb', t('kette.unterwegs')) : chip('gruen', t('kette.bestaetigt'))),
        el('div.feldgruppe', el('span.cap', 'ID'), el('span.mono.umbruch', { style: 'font-size:13px;line-height:1.5' }, x.txid)),
        el('div.zeilen',
          x.height !== null ? zeile(t('kette.imBlock'), el('a.mono', { href: '#/blockchain/' + x.height, onclick: e => { e.preventDefault(); springe(x.height); } }, zahl(x.height))) : null,
          x.from ? zeile(t('kette.von'), adresse(x.from)) : null,
          x.to ? zeile(t('kette.an'), adresse(x.to)) : null,
          zeile(t('kette.betrag'), ysr(x.amount) + ' YSR', true),
          x.type === 'transfer' ? zeile(t('kette.gebuehr'), ysr(x.fee, 0) + ' YSR', true) : null,
          x.timestamp ? zeile(t('kette.zeit'), datumZeit(x.timestamp)) : null));
    } catch (e) { melde(e.message, true); }
  }

  /** Zu einer Höhe springen: Seite so legen, dass der Block oben steht. */
  function springe(hoehe) {
    oben = hoehe >= kopfHoehe ? null : Math.max(JE_SEITE - 1, hoehe);
    gewaehlt = hoehe;
    ladeSeite(); waehle(hoehe);
  }

  async function suche() {
    const q = eingabe.value.trim();
    if (!q) return;
    try {
      const r = await hole('/api/lesen/search?q=' + encodeURIComponent(q));
      if (r.kind === 'block') springe(r.height);
      else if (r.kind === 'address') zeigeKonto(r.address);
      else if (r.kind === 'tx') zeigeTx(r.txid);
      else melde(t('kette.nichtsGefunden'), true);
    } catch (e) { melde(e.message, true); }
  }

  async function ladeMempool() {
    try {
      const r = await hole('/api/kette/mempool');
      const w = r.wartend;
      text(wartendText, w.length ? t('kette.wartendText', w.length) : t('kette.wartendLeer'));
      fuelle(wartend, w.length ? w.map(x => el('tr', el('td.mono', adresse(x.from)), el('td.mono', adresse(x.to)),
        el('td.r.mono', ysr(x.amount)), el('td.r.mono', ysr(x.fee, 0)), el('td.r.dim', vor(x.seit))))
        : el('tr', el('td.leer', { colspan: 5 }, t('kette.wartendKeine'))));
    } catch { /* nächster Takt */ }
  }

  function aktualisiere(s) {
    const neu = s.running ? (s.height ?? -1) : -1;
    if (!s.running) {
      fuelle(zeilen, el('tr', el('td.leer', { colspan: 6 }, t('fehler.knotenAus'))));
      return;
    }
    if (neu !== kopfHoehe) {
      const warAmKopf = oben === null;
      kopfHoehe = neu;
      if (warAmKopf || zeilen.children.length === 0) ladeSeite();
      else { neuer.disabled = false; }
    }
  }

  // Einstieg über die Adresszeile: #/blockchain/3244
  const start = ctx.ort()[1];
  if (start && /^\d+$/.test(start)) { gewaehlt = Number(start); oben = gewaehlt; }
  const s0 = ctx.stand();
  if (s0?.running) {
    kopfHoehe = s0.height ?? -1;
    if (gewaehlt !== null) { const h = gewaehlt; springe(Math.min(h, Math.max(0, kopfHoehe))); }
    else ladeSeite();
  }
  ladeMempool();
  mempoolTakt = setInterval(ladeMempool, 4000);

  return { wurzel, aktualisiere, verlasse: () => clearInterval(mempoolTakt) };
}
