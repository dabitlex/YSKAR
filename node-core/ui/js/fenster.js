/*
 * Fenster über dem Inhalt für einen Block, eine Adresse und eine Überweisung.
 * Gleich auf Übersicht und Blockchain: Der Hintergrund wird abgedunkelt und
 * weichgezeichnet, man bleibt auf seiner Seite.
 */
import { hole, el, fuelle, chip, knopf, zahl, ysr, kurzAdresse, kurzHash, kurzHash8, datumZeit, vor, finder, zeichen, kopiere, dialog, melde, mz } from './kern.js';
import { t } from './i18n.js';

/** Würfel für die Kachel im Kopf eines Blockfensters. */
function wuerfel() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '-20 -2 40 46'); s.setAttribute('width', '22'); s.setAttribute('height', '26'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<path d="M0 0L17 9.9L0 19.7L-17 9.9Z" fill="#4C93FF"/><path d="M-17 9.9L0 19.7L0 36.7L-17 26.9Z" fill="#1F5BE0"/><path d="M17 9.9L0 19.7L0 36.7L17 26.9Z" fill="#143E9E"/>';
  return s;
}

const kz3 = (...k) => el('div.m-kz', k.map(([name, wert, unter]) => el('div', el('span', name), el('b', wert), el('span', unter ?? ''))));
const abschnitt = (titel, ...inhalt) => el('div.m-ab', el('span.cap', titel), el('div.m-box', inhalt));

/** Adresse kurz, mit „du“, ein Klick öffnet das Fenster der Adresse. */
function adresse(ctx, a, schliesse) {
  if (!a) return el('span.blass', '—');
  const link = el('a.mono', { href: '#', title: a, onclick: e => { e.preventDefault(); schliesse?.(); kontoFenster(ctx, a); } }, kurzAdresse(a));
  return a === ctx.stand()?.wallet?.adresse ? el('span', link, el('span.du', t('kette.du'))) : link;
}

/**
 * Block in einem Fenster. ←/→ blättern zum älteren/neueren Block, Esc schließt.
 * `aufBlockchain`: Auf der Blockchain-Seite entfällt „In Blockchain öffnen“.
 */
export function blockFenster(ctx, hoehe, aufBlockchain = false) {
  const zurueck = el('button.kn', { type: 'button', 'aria-label': t('fen.aelter') }, zeichen('pfeil', 14));
  zurueck.firstChild.style.transform = 'rotate(180deg)';
  const weiter = el('button.kn', { type: 'button', 'aria-label': t('fen.neuer') }, zeichen('pfeil', 14));
  const geprueft = el('span');
  const d = dialog({ titel: t('kette.block', zahl(hoehe)), unter: '…', kachel: wuerfel(), chips: geprueft, rechts: [zurueck, weiter], breite: 720 });
  let jetzt = hoehe;
  const lade = async h => {
    jetzt = h;
    const kopfHoehe = ctx.stand()?.height ?? h;
    zurueck.disabled = h <= 0; weiter.disabled = h >= kopfHoehe;
    try {
      const b = await hole('/api/lesen/blocks/' + h);
      if (jetzt !== h) return;
      zeigeBlock(b, kopfHoehe);
    } catch (e) { fuelle(d.inhalt, el('p.hinweis.schlecht', e.message)); }
  };
  zurueck.onclick = () => jetzt > 0 && lade(jetzt - 1);
  weiter.onclick = () => jetzt < (ctx.stand()?.height ?? jetzt) && lade(jetzt + 1);
  d.taste(e => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === 'ArrowLeft' && !zurueck.disabled) zurueck.onclick();
    if (e.key === 'ArrowRight' && !weiter.disabled) weiter.onclick();
  });

  function zeigeBlock(b, kopfHoehe) {
    const cb = b.txs.find(x => x.type === 'coinbase');
    const ueberw = b.txs.filter(x => x.type === 'transfer' || x.type === 'script_spend');
    const sammel = b.txs.filter(x => x.type === 'batch');
    const gebuehren = [...ueberw, ...sammel].reduce((s, x) => s + BigInt(x.fee), 0n);
    const empf = cb?.recipients ?? (cb ? [{ address: cb.to, amount: cb.amount }] : []);
    d.box.setzeTitel(t('kette.block', zahl(b.height)), null);
    fuelle(d.box.unter, vor(b.timestamp * 1000), ' · ', t('fen.gefundenVon'), ' ', finder(b));
    fuelle(geprueft, chip('gruen', t('fen.geprueft')), b.height === kopfHoehe ? chip('', t('kette.neuester')) : null);
    fuelle(d.inhalt,
      kz3([t('kette.belohnung'), [ysr(BigInt(b.reward) - gebuehren, 0).replace(/[,.]0+$/, ''), el('small', ' YSR')], gebuehren > 0n ? '+ ' + ysr(gebuehren, 0) + ' ' + t('kette.gebuehren') : t('fen.keineGebuehren')],
        [t('kette.ueberweisungen'), zahl(ueberw.length + sammel.length), sammel.length ? t('fen.davonSammel', sammel.length) : t('fen.inDiesemBlock')],
        [t('kette.groesse'), [zahl(b.sizeBytes), el('small', ' Byte')], t('fen.empfaenger', empf.length)]),
      abschnitt(empf.length === 1 ? t('kette.gehtAnEine') : t('kette.gehtAn', empf.length),
        empf.map(o => mz(adresse(ctx, o.address, d.schliesse), el('b', ysr(o.amount), el('small', ' YSR'))))),
      ueberw.length ? abschnitt(t('kette.nUeberweisungen', ueberw.length), ueberw.map(x => mz(
        el('span', adresse(ctx, x.from, d.schliesse), el('span.cyan', { style: 'margin:0 8px' }, '→'), adresse(ctx, x.to, d.schliesse)),
        el('b', ysr(x.amount), el('small', ' YSR'))))) : null,
      sammel.length ? abschnitt(t('fen.sammelzahlungen', sammel.length), sammel.map(x => mz(
        el('span', adresse(ctx, x.from, d.schliesse), el('span.blass', ' · ' + t('fen.empfaenger', x.recipients.length))),
        el('a', { href: '#', onclick: e => { e.preventDefault(); d.schliesse(); txFenster(ctx, x.txid); } }, ysr(x.amount), ' YSR')))) : null,
      el('details.m-ab', el('summary.cap', t('fen.technik')), el('div.m-box',
        mz('Hash', el('span.mono', { style: 'max-width:440px;text-align:right' }, b.hash)),
        mz(t('kette.vorgaenger'), b.height > 0 ? el('a.mono', { href: '#', onclick: e => { e.preventDefault(); lade(b.height - 1); } }, kurzHash(b.prevHash)) : '—'),
        mz(t('ueb.wurzel'), el('span.mono', kurzHash8(b.stateRoot))),
        mz(t('ueb.difficulty'), el('span.mono', zahl(BigInt(b.difficultyWert)))),
        mz('Nonce', el('span.mono', b.nonce + ' · ' + b.extranonce)),
        mz(t('kette.zeit'), datumZeit(b.timestamp)))));
    d.fuss.zeige(el('span.hinweis', el('kbd', '←'), ' ', el('kbd', '→'), ' ', t('fen.blaettern'), ' · ', el('kbd', 'Esc'), ' ', t('fen.schliessen')),
      el('div.reihe', knopf([zeichen('kopieren', 14), t('kette.hashKopieren')], () => kopiere(b.hash)),
        aufBlockchain ? null : knopf(t('fen.inBlockchain'), () => { d.schliesse(); ctx.gehe('blockchain/' + b.height); }, 'haupt')));
  }
  lade(hoehe);
  return d;
}

/** Eine Adresse: Guthaben, Bewegungen, Kopieren, Senden. */
export async function kontoFenster(ctx, a) {
  let k;
  try { k = await hole('/api/lesen/account/' + a); } catch (e) { melde(e.message, true); return; }
  const eigen = a === ctx.stand()?.wallet?.adresse;
  const d = dialog({ titel: t('fen.adresseTitel', kurzAdresse(k.address)), unter: t('fen.ausKette'), zeichenName: 'wallet', chips: eigen ? chip('gruen', t('kette.du')) : null, breite: 720 });
  const verlauf = k.history.slice(0, 10).map(h => mz(
    el('span', el('a.mono', { href: '#', onclick: e => { e.preventDefault(); d.schliesse(); blockFenster(ctx, h.height); } }, zahl(h.height)),
      ' · ', t('kette.art.' + h.kind), h.counterparty ? [' · ', el('span.mono.blass', kurzAdresse(h.counterparty))] : null),
    el('b' + (h.kind === 'out' ? '' : '.plus'), (h.kind === 'out' ? '− ' : '+ ') + ysr(h.amount))));
  fuelle(d.inhalt,
    kz3([t('kette.guthaben'), [ysr(k.balance), el('small', ' YSR')], t('fen.nachBlock', zahl(ctx.stand()?.height ?? 0))],
      [t('kette.soloBloecke'), zahl(k.blocksFound), t('kette.poolAnteile') + ': ' + zahl(k.poolRewards)],
      [t('kette.gesendet'), zahl(Number(k.nonce)), '']),
    abschnitt(t('fen.letzteBewegungen'), verlauf.length ? verlauf : el('p.hinweis', { style: 'padding:10px 0' }, t('kette.keinVerlauf'))),
    abschnitt(t('kette.adresse'), mz(el('span.mono', { style: 'font-size:13px' }, k.address), knopf([zeichen('kopieren', 14), t('fen.kopieren')], () => kopiere(k.address)))));
  d.fuss.zeige(el('span.hinweis', el('kbd', 'Esc'), ' ', t('fen.schliessen')),
    eigen ? null : knopf(t('fen.sendenAn'), () => { d.schliesse(); ctx.gehe('wallet/senden?an=' + encodeURIComponent(k.address)); }, 'haupt'));
}

/** Eine Überweisung oder Sammelzahlung: bestätigt oder wartend. */
export async function txFenster(ctx, id) {
  let x;
  try { x = await hole('/api/lesen/tx/' + id); } catch (e) { melde(e.message, true); return; }
  const wartet = x.status === 'pending';
  const sammel = x.type === 'batch';
  const d = dialog({ titel: sammel ? t('fen.sammelzahlung') : t('kette.ueberweisung'), unter: t('fen.kennung', kurzHash8(x.txid)) + (wartet ? ' · ' + t('fen.nochKeinBlock') : ''),
    zeichenName: sammel ? 'leute' : 'aufwaerts', chips: wartet ? chip('gelb', t('fen.wartet')) : chip('gruen', t('kette.bestaetigt')), breite: 720 });
  const eigen = ctx.stand()?.wallet?.adresse;
  const meinAnteil = sammel && x.recipients ? x.recipients.filter(r => r.address === eigen).reduce((s, r) => s + BigInt(r.amount), 0n) : 0n;
  fuelle(d.inhalt,
    kz3([sammel ? t('fen.summe') : t('kette.betrag'), [ysr(x.amount), el('small', ' YSR')], sammel ? t('fen.empfaenger', x.recipients?.length ?? 0) : ''],
      [t('kette.gebuehr'), [ysr(x.fee, 0), el('small', ' YSR')], sammel ? t('fen.gebuehrEinmal') : ''],
      wartet ? [t('fen.status'), el('span', { style: 'color:var(--warn)' }, t('fen.wartet')), t('fen.imMempool')]
        : meinAnteil > 0n ? [t('fen.deinAnteil'), el('span.plus', '+ ' + ysr(meinAnteil)), t('fen.imBlock', zahl(x.height))]
        : [t('kette.imBlock'), x.height !== null ? zahl(x.height) : '—', x.timestamp ? datumZeit(x.timestamp) : '']),
    abschnitt(sammel ? t('kette.von') : t('fen.vonAn'), mz(adresse(ctx, x.from, d.schliesse),
      sammel ? el('span.blass', t('fen.empfaenger', x.recipients?.length ?? 0)) : el('span', el('span.cyan', { style: 'margin-right:8px' }, '→'), adresse(ctx, x.to, d.schliesse)))),
    sammel && x.recipients ? abschnitt(t('fen.empfaengerListe', Math.min(20, x.recipients.length), x.recipients.length),
      [...x.recipients].sort((p, q) => (q.address === eigen) - (p.address === eigen)).slice(0, 20).map(r => mz(adresse(ctx, r.address, d.schliesse), el('b', ysr(r.amount), el('small', ' YSR'))))) : null,
    wartet ? el('div.notiz', zeichen('info', 16), el('span', t('fen.wartetText'))) : null);
  d.fuss.zeige(el('span.hinweis', el('kbd', 'Esc'), ' ', t('fen.schliessen')),
    el('div.reihe', knopf([zeichen('kopieren', 14), t('fen.kennungKopieren')], () => kopiere(x.txid)),
      x.height !== null ? knopf(t('fen.blockOeffnen', zahl(x.height)), () => { d.schliesse(); blockFenster(ctx, x.height); }, 'haupt') : null));
}
