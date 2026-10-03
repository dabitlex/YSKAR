/* Übersicht: Stand des Knotens auf einen Blick. */
import { hole, sende, el, fuelle, text, zeile, chip, knopf, kopf, melde, zahl, ysr, leistung, kurzHash8, uhrzeit, dauer, vor, finder, zeichen } from './kern.js';
import { t } from './i18n.js';

export function baue(ctx) {
  const zustand = el('span');
  const schalt = knopf('', async () => {
    const laeuft = ctx.stand()?.running;
    schalt.disabled = true;
    try { await sende(laeuft ? '/api/stop' : '/api/start'); await ctx.neuLaden(); }
    catch (e) { melde(e.message, true); }
    schalt.disabled = false;
  });

  const st = {};
  const kennzahl = (name, schluessel) => {
    st[schluessel] = el('b', '—'); st[schluessel + 'Sub'] = el('span', '');
    return el('div.stat', el('span.cap', name), st[schluessel], st[schluessel + 'Sub']);
  };

  const balken = el('i');
  const syncText = el('span.hinweis');
  const z = { geprueft: el('span.mono'), wartend: el('span.mono'), diff: el('span.mono'), wurzel: el('span.mono'), seit: el('span') };

  const m = { leistung: el('span.gross', '—'), chip: el('span'), geraet: el('span'), ziel: el('span') };
  const bloecke = el('tbody');
  let letzteHoehe = -2;
  const wal = { karte: el('section.karte', { style: 'flex:1 1 320px', 'aria-label': t('nav.wallet') }), bild: '' };

  const wurzel = el('div.stapel',
    kopf(t('ueb.titel'), t('ueb.sub'), zustand, schalt),
    el('section.kennzahlen', { 'aria-label': t('ueb.kennzahlen') },
      kennzahl(t('ueb.hoehe'), 'hoehe'), kennzahl(t('ueb.peers'), 'peers'),
      kennzahl(t('ueb.netz'), 'netz'), kennzahl(t('ueb.belohnung'), 'lohn')),
    el('div.spalten.gleich',
      el('section.karte', { style: 'flex:2 1 480px', 'aria-label': t('ueb.sync') },
        el('div.karte-kopf', el('h2', t('ueb.sync')), syncText),
        el('div.balken', balken),
        el('div.zeilen',
          zeile(t('ueb.geprueft'), z.geprueft), zeile(t('ueb.wartend'), z.wartend),
          zeile(t('ueb.difficulty'), z.diff), zeile(t('ueb.wurzel'), z.wurzel), zeile(t('ueb.seit'), z.seit))),
      wal.karte),
    el('div.spalten.gleich',
      el('section.karte', { style: 'flex:1 1 320px', 'aria-label': t('nav.mining') },
        el('div.karte-kopf', el('h2', t('nav.mining')), m.chip),
        el('div.betrag', m.leistung),
        el('div.zeilen', zeile(t('min.geraet'), m.geraet), zeile(t('min.ziel'), m.ziel)),
        el('a.knopf', { href: '#/mining', style: 'margin-top:auto' }, t('ueb.zumMining'))),
      el('section.karte', { style: 'flex:2 1 480px', 'aria-label': t('ueb.letzte') },
      el('div.karte-kopf', el('h2', t('ueb.letzte')), el('a', { href: '#/blockchain' }, t('ueb.alle'))),
      el('div.tab-huelle', el('table.tab',
        el('thead', el('tr', el('th', t('kette.hoehe')), el('th', t('kette.zeit')), el('th', t('kette.gefunden')), el('th.r', t('kette.ueberweisungen')))),
        bloecke)))));

  /** Die Wallet-Karte: je nach Zustand etwas anderes. */
  async function zeigeWallet(s) {
    const w = s.wallet;
    const neu = JSON.stringify([w.vorhanden, w.gesperrt, s.height, s.mempool, s.running]);
    if (neu === wal.bild) return;
    wal.bild = neu;
    const kopfzeile = el('div.karte-kopf', el('h2', t('nav.wallet')), el('a', { href: '#/wallet' }, t('ueb.oeffnen')));
    if (!w.vorhanden) {
      fuelle(wal.karte, el('div.karte-kopf', el('h2', t('nav.wallet'))), el('p.p', t('ueb.walletFehlt')),
        el('a.knopf.haupt', { href: '#/wallet', style: 'margin-top:auto' }, t('wal.einrichten')));
      return;
    }
    if (w.gesperrt) {
      fuelle(wal.karte, kopfzeile, el('div', chip('gelb', [zeichen('schloss', 14), t('wal.gesperrt')])), el('p.p', t('ueb.walletGesperrt')),
        el('a.knopf', { href: '#/wallet', style: 'margin-top:auto' }, t('wal.entsperren')));
      return;
    }
    try {
      const d = await hole('/api/wallet/uebersicht');
      fuelle(wal.karte, kopfzeile,
        el('div.betrag', el('span.gross', ysr(d.guthaben)), el('small', 'YSR')),
        el('div.reihe.umbrechen', { style: 'gap:8px' },
          BigInt(d.heute) > 0n ? chip('gruen', '+' + ysr(d.heute, 2) + ' ' + t('wal.heute')) : null,
          BigInt(d.unterwegs) > 0n ? chip('gelb', ysr(d.unterwegs, 2) + ' ' + t('wal.unterwegs')) : null),
        el('div.reihe', { style: 'margin-top:auto' },
          el('a.knopf.haupt.voll', { href: '#/wallet/senden' }, t('wal.rSenden')),
          el('a.knopf.voll', { href: '#/wallet/empfangen' }, t('wal.empfangen'))));
    } catch { wal.bild = ''; }
  }

  async function ladeBloecke() {
    try {
      const r = await hole('/api/lesen/blocks?limit=5');
      fuelle(bloecke, r.blocks.length ? r.blocks.map(b => el('tr.wahl', { onclick: () => ctx.gehe('blockchain/' + b.height) },
        el('td.mono', zahl(b.height)), el('td.dim', uhrzeit(b.timestamp)), el('td', finder(b)), el('td.r.mono', zahl(Math.max(0, b.txCount - 1)))))
        : el('tr', el('td.leer', { colspan: 4 }, t('kette.keine'))));
    } catch { fuelle(bloecke, el('tr', el('td.leer', { colspan: 4 }, t('kette.keine')))); }
  }

  function aktualisiere(s) {
    const laeuft = s.running;
    fuelle(zustand, !laeuft ? chip('hoch', t('ueb.gestoppt'), true)
      : s.targetHeight === null ? chip('gelb hoch', t('ueb.wartePeer'), true)
      : s.syncing ? chip('gelb hoch', t('ueb.synct'), true) : chip('gruen hoch', t('ueb.synchron'), true));
    text(schalt, laeuft ? t('ueb.stoppen') : t('ueb.starten'));
    schalt.className = 'knopf' + (laeuft ? '' : ' haupt');

    text(st.hoehe, s.height === null ? '—' : zahl(s.height));
    text(st.hoeheSub, s.letzterBlock ? t('ueb.letzterBlock', vor(s.letzterBlock * 1000)) : t('ueb.nochKeiner'));
    text(st.peers, zahl(s.peerCount));
    text(st.peersSub, t('ueb.ausEin', s.outboundPeers, s.inboundPeers));
    text(st.netz, s.netzHashrate ? leistung(s.netzHashrate) : '—');
    text(st.netzSub, t('ueb.netzSub'));
    text(st.lohn, ysr(s.naechsteBelohnung, 0) + ' YSR');
    text(st.lohnSub, t('ueb.halbierung', zahl(s.halbierungBei)));

    const p = s.syncProgress;
    balken.style.width = (p === null ? 0 : p) + '%';
    text(syncText, !laeuft ? t('ueb.gestoppt')
      : s.targetHeight === null ? t('ueb.wartePeer')
      : s.syncing ? t('ueb.offen', zahl(Math.max(0, s.targetHeight - (s.height ?? -1))), p)
      : t('ueb.aktuell'));
    syncText.className = 'hinweis' + (laeuft && !s.syncing && s.targetHeight !== null ? ' gut' : '');
    text(z.geprueft, zahl(s.blocksStored));
    text(z.wartend, zahl(s.mempool));
    text(z.diff, s.difficulty ? zahl(BigInt(s.difficulty)) : '—');
    text(z.wurzel, kurzHash8(s.stateRoot));
    text(z.seit, laeuft ? dauer(s.uptimeSeconds) : '—');

    zeigeWallet(s);

    const mi = s.mining;
    fuelle(m.chip, mi.running ? chip('blau', t('min.laeuft'), true) : chip('', t('min.aus')));
    text(m.leistung, mi.running ? leistung(mi.totalHashrate) : '—');
    text(m.geraet, t('min.modus.' + mi.config.mode));
    const imPool = mi.running ? !!mi.pool : mi.config.ziel === 'pool';
    text(m.ziel, imPool ? t('pool.pool') + ' · ' + (mi.pool?.name ?? mi.poolName ?? '—') : t('min.solo'));

    if (s.height !== letzteHoehe || !laeuft) { letzteHoehe = laeuft ? s.height : -2; if (laeuft) ladeBloecke(); else fuelle(bloecke, el('tr', el('td.leer', { colspan: 4 }, t('kette.keine')))); }
  }

  return { wurzel, aktualisiere };
}
