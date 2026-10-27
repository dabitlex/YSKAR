/* Übersicht: Stand des Knotens auf einen Blick. */
import { hole, sende, el, fuelle, text, chip, knopf, kopf, melde, zahl, ysr, leistung, uhrzeit, vor, finder, zeichen, dialog,
  kopfKarte, kennzahl, spark, rollZahl, platz, dezimal } from './kern.js';
import { bild } from './bilder.js';
import { blockFenster } from './fenster.js';
import { t } from './i18n.js';

const MIN_JE_BLOCK = 10;
const ZIEL_JE_STUNDE = 60 / MIN_JE_BLOCK;

export function baue(ctx) {
  const zustand = el('span');
  const schalt = knopf('', async () => {
    const laeuft = ctx.stand()?.running;
    schalt.disabled = true;
    try { await sende(laeuft ? '/api/stop' : '/api/start'); await ctx.neuLaden(); }
    catch (e) { melde(e.message, true); }
    schalt.disabled = false;
  });

  // ------------------------------------------------------------ Kopfkarte
  const held = {
    fassung: el('span'), cap: el('span.cap'), zahl: el('div.zahl', platz(5)), satz: el('p.held-satz'),
    knoepfe: el('div.held-knoepfe'), bild: el('div'), bildName: '',
  };
  const kz = {
    peers: kennzahl(t('ueb.peers')), netz: kennzahl(t('ueb.netz')),
    lohn: kennzahl(t('ueb.belohnung')), tag: kennzahl(t('ueb.tagBloecke24')),
  };
  const karte = kopfKarte([held.fassung, held.cap, held.zahl, held.satz, held.knoepfe], held.bild, Object.values(kz));

  // ------------------------------------------------------ Letzte 24 Stunden
  const tag = { saeulen: el('div.saeulen'), zeiten: el('div.achse'), ziel: el('span.mut', { style: 'font-size:12px' }, t('ueb.zielJeStunde', ZIEL_JE_STUNDE)) };

  // ------------------------------------------------- Blöcke und Zustand
  const bloecke = el('tbody');
  const pruef = el('div');
  const pruefChip = el('span');
  let letzteHoehe = -2, gezeigteHoehe = null, obersteZeile = null;

  const wurzel = el('div.stapel',
    kopf(t('ueb.titel'), t('ueb.sub'), zustand, schalt),
    karte,
    el('div.zwei',
      el('section.karte', { 'aria-label': t('ueb.tag'), style: 'display:flex;flex-direction:column;gap:14px' },
        el('div.karte-kopf', el('h2', t('ueb.tag')), tag.ziel),
        el('div', { style: 'display:flex;flex-direction:column;gap:8px;flex:1;min-height:150px' }, tag.saeulen, tag.zeiten)),
      el('section.karte', { 'aria-label': t('ueb.zustand') }, el('div.karte-kopf', el('h2', t('ueb.zustand')), pruefChip), pruef)),
    el('section.karte', { 'aria-label': t('ueb.letzte') },
      el('div.karte-kopf', el('h2', t('ueb.letzte')), el('a', { href: '#/blockchain' }, t('ueb.alle'), ' →')),
      el('div.tab-huelle', el('table.tab',
        el('thead', el('tr', el('th', t('kette.hoehe')), el('th', t('kette.zeit')), el('th', t('kette.gefunden')), el('th.r', t('kette.ueberwKurz')))),
        bloecke))));

  // ------------------------------------------------------------- Zustand
  function pruefzeile(gut, titel, unter) {
    return el('div.pruef',
      el('span.hk' + (gut === true ? '' : gut === false ? '.warn' : '.neutral'), zeichen(gut === true ? 'haken' : gut === false ? 'warnung' : 'info', 13)),
      el('div', { style: 'flex:1;min-width:0' }, el('b', titel), el('span.unter', unter)));
  }

  function zeigeZustand(s) {
    const laeuft = s.running;
    const zeilen = [];
    if (!laeuft) zeilen.push(pruefzeile(false, t('ueb.gestoppt'), t('ueb.knotenAusText')));
    else if (s.targetHeight === null) zeilen.push(pruefzeile(false, t('ueb.wartePeer'), t('ueb.wartePeerText')));
    else if (s.syncing) zeilen.push(pruefzeile(null, t('ueb.synct'), t('ueb.offen', zahl(Math.max(0, s.targetHeight - (s.height ?? -1))), s.syncProgress ?? 0)));
    else zeilen.push(pruefzeile(true, t('ueb.chkSynchron'), t('ueb.chkSynchronText', zahl(s.height))));
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
    if (s.update?.neuer) zeilen.push(pruefzeile(false, t('ueb.chkUpdate', s.update.neueste), el('a', { href: '#/einstellungen' }, t('ueb.chkUpdateText'))));
    fuelle(pruef, zeilen);
    const alleGut = laeuft && !s.syncing && s.targetHeight !== null && s.peerCount >= 3 && !s.update?.neuer && !(s.revision_status && s.revision_status !== 'current');
    fuelle(pruefChip, alleGut ? chip('gruen', t('ueb.allesGut')) : null);
  }

  // -------------------------------------------------------------- Blöcke
  async function ladeBloecke(s) {
    try {
      const r = await hole('/api/lesen/blocks?limit=7');
      const neu = obersteZeile !== null && r.blocks[0]?.height > obersteZeile;
      obersteZeile = r.blocks[0]?.height ?? null;
      fuelle(bloecke, r.blocks.length ? r.blocks.map((b, i) => el('tr.wahl' + (i === 0 && neu ? '.neu-zeile' : ''), { tabindex: '0', onclick: () => blockFenster(ctx, b.height), onkeydown: e => { if (e.key === 'Enter') blockFenster(ctx, b.height); } },
        el('td', el('b', { style: 'font-weight:600' }, zahl(b.height))), el('td.blass', vor(b.timestamp * 1000)), el('td', finder(b)), el('td.r', zahl(Math.max(0, b.txCount - 1)))))
        : el('tr', el('td.leer', { colspan: 4 }, t('kette.keine'))));
    } catch { fuelle(bloecke, el('tr', el('td.leer', { colspan: 4 }, t('kette.keine')))); }
    ladeTag(s);
  }

  /** Blöcke je Stunde der letzten 24 Stunden -- aus der eigenen Kette, mit Infokarte je Stunde. */
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
      const stunden = Array.from({ length: 24 }, () => []);
      for (const b of im) stunden[Math.min(23, Math.floor((b.timestamp - ab) / 3600))].push(b);
      const hoch = Math.max(10, ...stunden.map(x => x.length));
      fuelle(tag.saeulen, el('span.ziel', { style: 'bottom:' + (ZIEL_JE_STUNDE / hoch * 100) + '%' }),
        stunden.map((bl, i) => el('i' + (bl.length ? '' : '.leer') + (i > 17 ? '.r' : ''), { tabindex: '0', style: 'height:' + Math.max(2, bl.length / hoch * 100) + '%' }, tipp(bl, ab + i * 3600))));
      fuelle(tag.zeiten, [0, 6, 12, 18].map(h => el('span', uhrzeit(ab + h * 3600))), el('span', t('ueb.jetzt')));
      const schnitt = im.length > 1 ? (im[im.length - 1].timestamp - im[0].timestamp) / (im.length - 1) / 60 : null;
      text(kz.tag.wert, zahl(im.length));
      text(kz.tag.unter, schnitt === null ? t('ueb.tagZiel', 24 * ZIEL_JE_STUNDE) : t('ueb.tagSchnittKurz', dezimal(schnitt), MIN_JE_BLOCK));
      // Verlauf der Netzleistung, ehrlich aus der Difficulty der Blöcke je Stunde.
      const diff = stunden.filter(x => x.length).map(x => x.reduce((a, b) => a + Number(b.difficultyWert), 0) / x.length);
      fuelle(kz.netz.extra, diff.length > 3 ? spark(diff) : null);
    } catch { /* nächster Block */ }
  }

  /** Infokarte einer Stunde: Blöcke, Ø Blockzeit, Finder, längste Lücke. */
  function tipp(bl, von) {
    const n = bl.length;
    const finder = new Map();
    for (const b of bl) { const name = b.finder || (b.recipients > 1 ? t('kette.pool') : t('kette.solo')); finder.set(name, (finder.get(name) ?? 0) + 1); }
    let luecke = 0;
    for (let i = 1; i < n; i++) luecke = Math.max(luecke, bl[i].timestamp - bl[i - 1].timestamp);
    return el('span.tip', { role: 'tooltip' },
      el('span.tip-k', el('b', uhrzeit(von) + ' – ' + uhrzeit(von + 3600)), el('span', { class: n >= ZIEL_JE_STUNDE ? 'tz-ok' : 'tz-warn' }, n >= ZIEL_JE_STUNDE ? t('ueb.imZiel') : t('ueb.unterZiel'))),
      el('span.tip-z', el('b', zahl(n)), ' ', t('ueb.bloeckeWort'), n > 0 ? ' · Ø ' + dezimal(60 / n) + ' min' : ''),
      [...finder.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, k]) => el('span.tz', el('span', name), el('b', zahl(k)))),
      n > 1 ? el('span.tz', el('span', t('ueb.tagLuecke')), el('b', Math.round(luecke / 60) + ' min')) : null);
  }

  // ------------------------------------------------------------ Takt
  function zeigeHeld(s) {
    const laeuft = s.running;
    const next = s.nextActivationHeight, h = s.height ?? -1;
    const vorUpgrade = next && h < next && s.konsensfassung;
    const veraltet = s.revision_status && s.revision_status !== 'current';
    fuelle(held.fassung, vorUpgrade
      ? el('button', { type: 'button', class: 'chip ' + (veraltet ? 'gelb' : 'blau'), style: 'cursor:pointer', onclick: () => v6Dialog(ctx.stand()) },
        veraltet ? t('ueb.chkFassungAlt') : t('ueb.fassungIn', s.konsensfassung, zahl(next - Math.max(0, h))), ' →')
      : null);
    const name = !laeuft ? 'gestoppt' : s.targetHeight === null ? 'keinPeer' : s.syncing ? 'sync' : 'knoten';
    if (name !== held.bildName) { held.bildName = name; fuelle(held.bild, bild(name, 260)); }
    text(held.cap, !laeuft ? t('ueb.capGestoppt') : s.syncing ? t('ueb.capSync') : t('ueb.capLaeuft'));
    held.zahl.classList.toggle('aus', !laeuft);
    const neu = s.height === null ? '—' : zahl(s.height);
    if (neu !== gezeigteHoehe) { rollZahl(held.zahl, gezeigteHoehe, neu); gezeigteHoehe = neu; }
    text(held.satz, !laeuft ? t('ueb.satzGestoppt') : s.syncing ? t('ueb.offen', zahl(Math.max(0, s.targetHeight - h)), s.syncProgress ?? 0) : t('ueb.satzLaeuft', s.peerCount));
    const mi = s.mining;
    const knoepfeBild = JSON.stringify([laeuft, !!mi?.running]);
    if (held.knoepfe.dataset.bild !== knoepfeBild) {
      held.knoepfe.dataset.bild = knoepfeBild;
      fuelle(held.knoepfe, laeuft
        ? [el('a.knopf' + (mi?.running ? '' : '.haupt'), { href: '#/mining' }, zeichen('blitz', 15), mi?.running ? t('ueb.miningLaeuft', leistung(mi.totalHashrate)) : t('ueb.zumMining')),
          el('a', { href: '#/einstellungen/protokoll', style: 'font-size:13px' }, t('ueb.protokoll'))]
        : [knopf([zeichen('pfeil', 14), t('ueb.starten')], () => schalt.click(), 'haupt'), el('a', { href: '#/einstellungen/protokoll', style: 'font-size:13px' }, t('ueb.protokoll'))]);
    }

    text(kz.peers.wert, laeuft ? zahl(s.peerCount) : '0');
    text(kz.peers.unter, laeuft ? t('ueb.ausEin', s.outboundPeers, s.inboundPeers) : t('ueb.nichtVerbunden'));
    if (s.netzHashrate) { const [w, e] = leistung(s.netzHashrate).split(' '); fuelle(kz.netz.wert, w, el('small', e)); } else text(kz.netz.wert, '—');
    text(kz.netz.unter, t('ueb.netzSub'));
    fuelle(kz.lohn.wert, ysr(s.naechsteBelohnung, 0).replace(/[,.]0+$/, ''), el('small', 'YSR'));
    text(kz.lohn.unter, t('ueb.halbierung', zahl(s.halbierungBei)));
    if (s.halbierungBei && !kz.lohn.extra.firstChild) fuelle(kz.lohn.extra, el('span.halb', { title: t('ueb.bisHalbierung') }, el('i')));
    const i = kz.lohn.extra.querySelector('i');
    if (i && s.halbierungBei) i.style.width = Math.min(100, Math.max(0, h) / s.halbierungBei * 100).toFixed(1) + '%';
    if (!laeuft) { text(kz.tag.wert, '—'); text(kz.tag.unter, ''); }
  }

  function aktualisiere(s) {
    const laeuft = s.running;
    fuelle(zustand, !laeuft ? chip('hoch', t('ueb.gestoppt'), true)
      : s.targetHeight === null ? chip('gelb hoch', t('ueb.wartePeer'), true)
      : s.syncing ? chip('gelb hoch', t('ueb.synct'), true) : chip('gruen hoch', [el('span.punkt.gruen.atmen'), t('ueb.synchron')]));
    text(schalt, laeuft ? t('ueb.stoppen') : t('ueb.starten'));
    schalt.className = 'knopf' + (laeuft ? '' : ' haupt');
    zeigeHeld(s);
    zeigeZustand(s);
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
  const d = dialog({ titel: t('v6.dTitel', s.konsensfassung), unter: t('v6.dUnter', zahl(next)), kachel: bild('fassung', 40), chips: chip('blau', t('ueb.inBloecken', zahl(rest))), breite: 780 });
  const punkt = (titel, text, neu) => el('div', { style: 'display:flex;flex-direction:column;gap:2px;padding:9px 0 9px 14px;margin-left:2px;border-left:2px solid ' + (neu ? 'var(--acc)' : 'rgba(140,170,255,.18)') },
    el('b', { style: 'font-size:13px;font-weight:500' }, titel), el('span', { style: 'font-size:12px;color:var(--mut);line-height:1.5' }, text));
  const NEU = ['mehrfach', 'pool', 'platz', 'sammel', 'sperren'];
  const BLEIBT = ['adresse', 'mining', 'bedienung'];
  const veraltet = s.revision_status && s.revision_status !== 'current';
  fuelle(d.inhalt,
    el('div.m-kz',
      el('div', el('span', t('v6.aktivierung')), el('b', t('kette.block', zahl(next))), el('span', '')),
      el('div', el('span', t('v6.verbleibend')), el('b', zahl(rest), el('small', ' ' + t('ueb.bloeckeWort'))), el('span', t('v6.etwaTage', Math.max(1, Math.round(rest * MIN_JE_BLOCK / 1440))))),
      el('div', el('span', t('v6.deinKnoten')), el('b', { class: veraltet ? '' : 'plus' }, veraltet ? t('ueb.chkFassungAlt') : t('v6.bereitKurz')), el('span', 'Node Core ' + s.version))),
    el('div', { style: 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px' },
      el('div.m-ab', el('span.cap', t('v6.neuAb', zahl(next))), NEU.map(k => punkt(t('v6.n.' + k), t('v6.n.' + k + 'Text'), true))),
      el('div.m-ab', el('span.cap', t('v6.bleibt')), BLEIBT.map(k => punkt(t('v6.b.' + k), t('v6.b.' + k + 'Text'), false)))),
    el('div.notiz', zeichen('uhr', 16), el('span', el('b', t('v6.sendepause') + ': '), t('v6.sendepauseText', zahl(next)))),
    el('p.hinweis', t('v6.aeltereText', zahl(next))));
  d.fuss.zeige(el('a', { href: 'https://yskar.app/#v6', target: '_blank', rel: 'noopener' }, t('v6.mehr')), knopf(t('ueb.verstanden'), d.schliesse, 'haupt'));
}
