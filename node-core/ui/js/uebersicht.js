/* Übersicht: Stand des Knotens auf einen Blick. */
import { hole, sende, el, fuelle, text, chip, knopf, kopf, melde, zahl, ysr, ysrGross, leistung, uhrzeit, vor, finder, zeichen, dialog } from './kern.js';
import { t } from './i18n.js';

const MIN_JE_BLOCK = 10;

export function baue(ctx) {
  const zustand = el('span');
  const schalt = knopf('', async () => {
    const laeuft = ctx.stand()?.running;
    schalt.disabled = true;
    try { await sende(laeuft ? '/api/stop' : '/api/start'); await ctx.neuLaden(); }
    catch (e) { melde(e.message, true); }
    schalt.disabled = false;
  });

  // ---------------------------------------------------------- Netz-Upgrade
  const band = {
    wurzel: el('section.banner', { hidden: true, 'aria-label': t('v6.band') }),
    titel: el('b'), text: el('span'), balken: el('i'), chip: el('span'),
  };
  fuelle(band.wurzel,
    el('div', { style: 'flex:1 1 360px;flex-direction:column;align-items:stretch;gap:6px' },
      el('span.cap.cyan', t('v6.band')), band.titel, band.text,
      el('div.balken', { style: 'margin-top:6px;max-width:520px' }, band.balken)),
    el('div', { style: 'gap:10px' }, band.chip, knopf(t('v6.wasAendert'), () => v6Dialog(ctx.stand()), 'ruhig klein')));

  // ------------------------------------------------------------ Kennzahlen
  const st = {};
  const kennzahl = (name, schluessel) => {
    st[schluessel] = el('b', '—'); st[schluessel + 'Sub'] = el('span', '');
    return el('div.stat', el('span.cap', name), st[schluessel], st[schluessel + 'Sub']);
  };

  // ------------------------------------------------------ Letzte 24 Stunden
  const tag = { saeulen: el('div', { style: 'display:flex;align-items:flex-end;gap:3px;height:96px;position:relative' }), zahlen: el('div', { style: 'display:flex;gap:22px;align-items:center;flex-wrap:wrap;font-size:12.5px' }), zeiten: el('div.verlauf-zeiten') };

  // ------------------------------------------------- Blöcke, Zustand, Wallet
  const bloecke = el('tbody');
  const pruef = el('div');
  const pruefChip = el('span');
  const wal = { karte: el('section.karte', { 'aria-label': t('nav.wallet') }), bild: '' };
  let letzteHoehe = -2;

  const wurzel = el('div.stapel',
    kopf(t('ueb.titel'), t('ueb.sub'), zustand, schalt),
    band.wurzel,
    el('section.kennzahlen', { 'aria-label': t('ueb.kennzahlen') },
      kennzahl(t('ueb.hoehe'), 'hoehe'), kennzahl(t('ueb.peers'), 'peers'),
      kennzahl(t('ueb.netz'), 'netz'), kennzahl(t('ueb.belohnung'), 'lohn')),
    el('section.karte', { 'aria-label': t('ueb.tag') },
      el('div.karte-kopf', el('h2', t('ueb.tag')), tag.zahlen),
      el('div', { style: 'display:flex;gap:14px;align-items:stretch' },
        el('div', { style: 'display:flex;flex-direction:column;justify-content:space-between;font-family:var(--mono);font-size:10.5px;color:var(--faint);padding-bottom:18px' }, el('span', '10'), el('span', '6'), el('span', '0')),
        el('div', { style: 'flex:1;display:flex;flex-direction:column;gap:6px;min-width:0' },
          el('div', { style: 'position:relative' },
            el('div', { style: 'position:absolute;left:0;right:0;top:40%;border-top:1px dashed rgba(99,216,255,.35)' }),
            tag.saeulen),
          tag.zeiten)),
      el('span.hinweis', t('ueb.tagHinweis'))),
    el('div.raster', { style: 'grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);align-items:start' },
      el('section.karte', { 'aria-label': t('ueb.letzte') },
        el('div.karte-kopf', el('h2', t('ueb.letzte')), el('a.knopf.ruhig.klein', { href: '#/blockchain' }, t('ueb.alle'), ' →')),
        el('div.tab-huelle', el('table.tab',
          el('thead', el('tr', el('th', t('kette.hoehe')), el('th', t('kette.zeit')), el('th', t('kette.gefunden')), el('th.r', t('kette.ueberwKurz')))),
          bloecke))),
      el('div.stapel', { style: 'gap:16px' },
        el('section.karte', { 'aria-label': t('ueb.zustand') }, el('div.karte-kopf', el('h2', t('ueb.zustand')), pruefChip), pruef),
        wal.karte)));

  // ------------------------------------------------------------- Zustand
  function pruefzeile(gut, titel, unter, extra = null) {
    const farbe = gut === true ? 'background:rgba(59,229,154,.12);color:var(--ok)' : gut === false ? 'background:rgba(255,180,84,.12);color:var(--warn)' : 'background:var(--panel2);color:var(--mut)';
    return el('div', { style: 'display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)' },
      el('i', { style: 'width:22px;height:22px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;flex:none;font-style:normal;' + farbe },
        zeichen(gut === true ? 'haken' : gut === false ? 'warnung' : 'info', 13)),
      el('div', { style: 'flex:1;min-width:0;display:flex;flex-direction:column;gap:1px' },
        el('b', { style: 'font-size:13px;font-weight:500' }, titel), el('span', { style: 'font-size:12px;color:var(--mut)' }, unter), extra));
  }

  function zeigeZustand(s) {
    const laeuft = s.running;
    const zeilen = [];
    if (!laeuft) zeilen.push(pruefzeile(false, t('ueb.gestoppt'), t('ueb.knotenAusText')));
    else if (s.targetHeight === null) zeilen.push(pruefzeile(false, t('ueb.wartePeer'), t('ueb.wartePeerText')));
    else if (s.syncing) {
      const b = el('div.balken', { style: 'margin-top:6px' }, el('i', { style: 'width:' + (s.syncProgress ?? 0) + '%' }));
      zeilen.push(pruefzeile(null, t('ueb.synct'), t('ueb.offen', zahl(Math.max(0, s.targetHeight - (s.height ?? -1))), s.syncProgress ?? 0), b));
    } else zeilen.push(pruefzeile(true, t('ueb.chkSynchron'), t('ueb.chkSynchronText', zahl(s.height))));
    if (laeuft) {
      zeilen.push(s.peerCount >= 3 ? pruefzeile(true, t('ueb.chkPeers', s.peerCount), t('ueb.chkPeersText'))
        : pruefzeile(false, t('ueb.chkPeers', s.peerCount), t('ueb.chkPeersWenig')));
      zeilen.push(s.inboundPeers > 0 ? pruefzeile(true, t('ueb.chkErreichbar'), t('ueb.chkErreichbarText', s.p2pPort, s.inboundPeers))
        : pruefzeile(null, t('ueb.chkNurAus'), t('ueb.chkNurAusText', s.p2pPort)));
    }
    if (s.konsensfassung) {
      const veraltet = s.revision_status && s.revision_status !== 'current';
      zeilen.push(veraltet ? pruefzeile(false, t('ueb.chkFassungAlt'), t('einst.fassungsstand.' + s.revision_status))
        : pruefzeile(true, t('ueb.chkFassung', s.konsensfassung), s.nextActivationHeight ? t('ueb.chkFassungAb', zahl(s.nextActivationHeight)) : t('ueb.chkFassungAktiv')));
    }
    const mi = s.mining;
    if (mi) {
      const imPool = mi.running ? !!mi.pool : mi.config?.ziel === 'pool';
      const ziel = imPool ? t('pool.pool') + ' ' + (mi.pool?.name ?? mi.poolName ?? '') : t('min.solo');
      zeilen.push(mi.running ? pruefzeile(true, t('ueb.chkMining', leistung(mi.totalHashrate)), ziel)
        : pruefzeile(null, t('ueb.chkMiningAus'), el('a', { href: '#/mining' }, t('ueb.zumMining'), ' →')));
    }
    if (s.update?.neuer) zeilen.push(pruefzeile(false, t('ueb.chkUpdate', s.update.neueste), el('a', { href: '#/einstellungen' }, t('ueb.chkUpdateText'))));
    if (zeilen.length) zeilen[zeilen.length - 1].style.borderBottom = '0';
    fuelle(pruef, zeilen);
    const alleGut = laeuft && !s.syncing && s.targetHeight !== null && s.peerCount >= 3 && !s.update?.neuer && !(s.revision_status && s.revision_status !== 'current');
    fuelle(pruefChip, alleGut ? chip('gruen', t('ueb.allesGut')) : null);
  }

  // -------------------------------------------------------------- Wallet
  async function zeigeWallet(s) {
    const w = s.wallet;
    const neu = JSON.stringify([w.vorhanden, w.gesperrt, s.height, s.mempool, s.running]);
    if (neu === wal.bild) return;
    wal.bild = neu;
    if (!w.vorhanden) {
      fuelle(wal.karte, el('div.karte-kopf', el('h2', t('nav.wallet'))), el('p.p', t('ueb.walletFehlt')),
        el('a.knopf.haupt', { href: '#/wallet' }, t('wal.einrichten')));
      return;
    }
    const kopfzeile = el('div.karte-kopf', el('h2', t('nav.wallet')), w.gesperrt ? chip('gelb', [zeichen('schloss', 12), t('wal.gesperrt')]) : chip('', t('wal.entsperrt')));
    if (w.gesperrt) {
      fuelle(wal.karte, kopfzeile, el('p.p', t('ueb.walletGesperrt')), el('a.knopf', { href: '#/wallet' }, t('wal.entsperren')));
      return;
    }
    try {
      const d = await hole('/api/wallet/uebersicht');
      fuelle(wal.karte, kopfzeile,
        el('div.gross', ysrGross(d.guthaben), el('small', { style: 'font-size:.45em;font-weight:500;color:var(--mut);margin-left:6px' }, 'YSR')),
        BigInt(d.heute) > 0n ? el('span.hinweis.gut', t('ueb.heutePlus', ysr(d.heute))) : null,
        el('div.reihe',
          el('a.knopf.haupt.klein', { href: '#/wallet/senden', style: 'flex:1' }, t('wal.rSenden')),
          el('a.knopf.klein', { href: '#/wallet/empfangen', style: 'flex:1' }, t('wal.empfangen'))));
    } catch { wal.bild = ''; }
  }

  // -------------------------------------------------------------- Blöcke
  async function ladeBloecke(s) {
    try {
      const r = await hole('/api/lesen/blocks?limit=7');
      fuelle(bloecke, r.blocks.length ? r.blocks.map(b => el('tr.wahl', { onclick: () => ctx.gehe('blockchain/' + b.height) },
        el('td.mono', zahl(b.height)), el('td.blass', vor(b.timestamp * 1000)), el('td', finder(b)), el('td.r.mono', zahl(Math.max(0, b.txCount - 1)))))
        : el('tr', el('td.leer', { colspan: 4 }, t('kette.keine'))));
    } catch { fuelle(bloecke, el('tr', el('td.leer', { colspan: 4 }, t('kette.keine')))); }
    ladeTag(s);
  }

  /** Blöcke je Stunde der letzten 24 Stunden -- aus der eigenen Kette. */
  async function ladeTag(s) {
    try {
      const jetzt = Math.floor(Date.now() / 1000), ab = jetzt - 86400;
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
      const stunden = Array.from({ length: 24 }, () => 0);
      for (const b of im) stunden[Math.min(23, Math.floor((b.timestamp - ab) / 3600))]++;
      const hoch = Math.max(10, ...stunden);
      fuelle(tag.saeulen, stunden.map((n, i) => el('i', {
        title: n + ' · ' + uhrzeit(ab + i * 3600),
        style: `flex:1;border-radius:3px 3px 1px 1px;height:${Math.max(2, Math.round(n / hoch * 96))}px;background:${n ? 'linear-gradient(180deg,var(--acc2),var(--acc))' : 'var(--panel2)'};opacity:${i === 23 ? 1 : .8}`,
      })));
      fuelle(tag.zeiten, [0, 6, 12, 18].map(h => el('span', uhrzeit(ab + h * 3600))), el('span', t('ueb.jetzt')));
      let luecke = 0;
      for (let i = 1; i < im.length; i++) luecke = Math.max(luecke, im[i].timestamp - im[i - 1].timestamp);
      const schnitt = im.length > 1 ? (im[im.length - 1].timestamp - im[0].timestamp) / (im.length - 1) / 60 : null;
      const wert = (name, w, ziel) => el('span', el('span.blass', name), ' ', el('b.mono', { style: 'font-weight:500' }, w), ziel ? el('span.blass', ' ' + ziel) : null);
      fuelle(tag.zahlen,
        wert(t('ueb.tagBloecke'), zahl(im.length), t('ueb.tagZiel', 24 * 60 / MIN_JE_BLOCK)),
        wert(t('ueb.tagSchnitt'), schnitt === null ? '—' : schnitt.toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' min', t('ueb.tagZielMin', MIN_JE_BLOCK)),
        wert(t('ueb.tagLuecke'), im.length > 1 ? Math.round(luecke / 60) + ' min' : '—'));
    } catch { /* nächster Block */ }
  }

  // ------------------------------------------------------------ Takt
  function aktualisiere(s) {
    const laeuft = s.running;
    fuelle(zustand, !laeuft ? chip('hoch', t('ueb.gestoppt'), true)
      : s.targetHeight === null ? chip('gelb hoch', t('ueb.wartePeer'), true)
      : s.syncing ? chip('gelb hoch', t('ueb.synct'), true) : chip('gruen hoch', t('ueb.synchron'), true));
    text(schalt, laeuft ? t('ueb.stoppen') : t('ueb.starten'));
    schalt.className = 'knopf' + (laeuft ? '' : ' haupt');

    // Netz-Upgrade: nur vor der Aktivierungshöhe.
    const next = s.nextActivationHeight, h = s.height ?? -1;
    band.wurzel.hidden = !(next && h < next && s.konsensfassung);
    if (!band.wurzel.hidden) {
      const rest = next - Math.max(0, h);
      text(band.titel, t('v6.titel', s.konsensfassung, zahl(next)));
      text(band.text, t('v6.text', zahl(rest), Math.max(1, Math.round(rest * MIN_JE_BLOCK / 1440))));
      band.balken.style.width = Math.min(100, Math.max(0, h) / next * 100).toFixed(1) + '%';
      const veraltet = s.revision_status && s.revision_status !== 'current';
      fuelle(band.chip, veraltet ? chip('gelb', t('ueb.chkFassungAlt')) : chip('blau', t('v6.bereit', s.version)));
    }

    text(st.hoehe, s.height === null ? '—' : zahl(s.height));
    text(st.hoeheSub, s.letzterBlock ? t('ueb.letzterBlock', vor(s.letzterBlock * 1000)) : t('ueb.nochKeiner'));
    text(st.peers, zahl(s.peerCount));
    text(st.peersSub, t('ueb.ausEin', s.outboundPeers, s.inboundPeers));
    if (s.netzHashrate) { const [w, e] = leistung(s.netzHashrate).split(' '); fuelle(st.netz, w, el('small', e)); } else text(st.netz, '—');
    text(st.netzSub, t('ueb.netzSub'));
    fuelle(st.lohn, ysr(s.naechsteBelohnung, 0).replace(/[,.]0+$/, ''), el('small', 'YSR'));
    text(st.lohnSub, t('ueb.halbierung', zahl(s.halbierungBei)));

    zeigeZustand(s);
    zeigeWallet(s);

    if (s.height !== letzteHoehe || !laeuft) {
      letzteHoehe = laeuft ? s.height : -2;
      if (laeuft) ladeBloecke(s); else fuelle(bloecke, el('tr', el('td.leer', { colspan: 4 }, t('kette.keine'))));
    }
  }

  return { wurzel, aktualisiere };
}

/** Das Fenster „Konsensfassung 6“: was sich an der Höhe ändert und was bleibt. */
function v6Dialog(s) {
  if (!s) return;
  const next = s.nextActivationHeight, h = Math.max(0, s.height ?? 0);
  const rest = Math.max(0, next - h);
  const d = dialog({ titel: t('v6.dTitel', s.konsensfassung), unter: t('v6.dUnter', zahl(next)), zeichenName: 'wuerfel', breite: 720 });
  const kachel = (name, wert) => el('div', { style: 'background:var(--panel);padding:12px 14px;display:flex;flex-direction:column;gap:4px' },
    el('span.cap', name), el('b', { style: 'font-size:15px;font-weight:600' }, wert));
  const punkt = (titel, text, neu) => el('div', { style: 'display:flex;flex-direction:column;gap:2px;padding:9px 0 9px 14px;margin-left:2px;border-left:2px solid ' + (neu ? 'var(--acc)' : 'rgba(140,170,255,.18)') },
    el('b', { style: 'font-size:13px;font-weight:500' }, titel), el('span', { style: 'font-size:12px;color:var(--mut);line-height:1.5' }, text));
  const NEU = ['mehrfach', 'pool', 'platz', 'sammel', 'sperren'];
  const BLEIBT = ['adresse', 'mining', 'bedienung'];
  fuelle(d.inhalt,
    el('div', { style: 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:10px;overflow:hidden' },
      kachel(t('v6.aktivierung'), t('kette.block', zahl(next))),
      kachel(t('v6.verbleibend'), t('v6.verbleibendWert', zahl(rest), Math.max(1, Math.round(rest * MIN_JE_BLOCK / 1440)))),
      kachel(t('v6.deinKnoten'), t('v6.deinKnotenWert', s.version))),
    el('div', { style: 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px' },
      el('div', { style: 'display:flex;flex-direction:column;gap:2px' }, el('span.cap', { style: 'margin-bottom:6px' }, t('v6.neuAb', zahl(next))), NEU.map(k => punkt(t('v6.n.' + k), t('v6.n.' + k + 'Text'), true))),
      el('div', { style: 'display:flex;flex-direction:column;gap:2px' }, el('span.cap', { style: 'margin-bottom:6px' }, t('v6.bleibt')), BLEIBT.map(k => punkt(t('v6.b.' + k), t('v6.b.' + k + 'Text'), false)))),
    el('div.zeilen',
      el('div.zeile', el('span', t('v6.sendepause')), el('span', t('v6.sendepauseText', zahl(next)))),
      el('div.zeile', el('span', t('v6.aeltere')), el('span', t('v6.aeltereText', zahl(next))))));
  d.fuss.zeige(el('a', { href: 'https://yskar.app/#v6', target: '_blank', rel: 'noopener' }, t('v6.mehr')), knopf(t('allg.schliessen'), d.schliesse));
}
