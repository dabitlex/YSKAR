/* Einstellungen: Knoten, Programm, Protokoll, Über. */
import { hole, sende, el, fuelle, text, zeile, knopf, kopf, melde, schalter, zeichen, kopiere, netzName, vor } from './kern.js';
import { t, setzeSprache, sprache } from './i18n.js';

/** Belegter Platz in Worten: "38 MB", "1,2 GB". */
function groesse(bytes) {
  if (bytes === null || bytes === undefined) return '—';
  const f = (x, s) => new Intl.NumberFormat(sprache() === 'en' ? 'en-GB' : 'de-DE', { maximumFractionDigits: s }).format(x);
  if (bytes >= 1024 ** 3) return f(bytes / 1024 ** 3, 1) + ' GB';
  if (bytes >= 1024 ** 2) return f(bytes / 1024 ** 2, 0) + ' MB';
  return f(bytes / 1024, 0) + ' kB';
}

const RELEASES = 'https://github.com/dabitlex/YSKAR/releases';

export function baue(ctx) {
  const f = {
    ordner: el('input.feld.mono', { id: 'e-ordner', type: 'text', spellcheck: 'false', style: 'font-size:13px' }),
    api: el('input.feld.mono', { id: 'e-api', type: 'number', min: 1024, max: 65535 }),
    p2p: el('input.feld.mono', { id: 'e-p2p', type: 'number', min: 1024, max: 65535 }),
    seed: el('input.feld.mono', { id: 'e-seed', type: 'text', spellcheck: 'false' }),
  };
  const neustart = el('div.warnung', { hidden: true }, zeichen('info', 18),
    el('span', { style: 'flex:1 1 auto' }, t('einst.neustartNoetig')),
    knopf(t('einst.neuStarten'), starteNeu, 'klein'));
  const protokoll = el('pre.protokoll', { tabindex: 0, 'aria-label': t('einst.protokoll') });
  const ueber = { programm: el('span.mono'), netz: el('span'), regeln: el('span') };
  const belegt = el('span');
  let gefuellt = false;
  let logTakt = null;

  // Was nur das installierte Programm kann, erscheint nur dort.
  const h0 = ctx.stand()?.huelle ?? { vorhanden: false };
  const waehlen = h0.vorhanden ? knopf([zeichen('ordner'), t('einst.waehlen')], async () => {
    try {
      const r = await sende('/api/huelle/ordner-waehlen', { start: f.ordner.value.trim() });
      if (r.pfad) f.ordner.value = r.pfad;
    } catch (e) { melde(e.message, true); }
  }) : null;
  const ordnerOeffnen = h0.vorhanden ? knopf([zeichen('ordner'), t('einst.ordnerOeffnen')], async () => {
    try { await sende('/api/huelle/ordner-oeffnen', { welcher: 'programm' }); } catch (e) { melde(e.message, true); }
  }, 'klein') : null;

  // Updates
  const u = { installiert: el('span.mono'), neueste: el('span'), stand: el('p.hinweis') };
  const suchen = knopf(t('einst.jetztSuchen'), async () => {
    suchen.disabled = true;
    try {
      const r = await sende('/api/update/suchen');
      const s = ctx.stand(); if (s) { s.update = r; zeigeUpdate(s); }
      if (r.fehler) melde(t('einst.suchFehler', r.fehler), true);
    } catch (e) { melde(e.message, true); }
    suchen.disabled = false;
  });
  function zeigeUpdate(s) {
    const up = s.update;
    text(u.installiert, s.version);
    fuelle(u.neueste, up.neuer
      ? [el('span.mono.gut', up.neueste), ' · ', el('a', { href: up.url, target: '_blank', rel: 'noreferrer' }, t('einst.herunterladen'))]
      : el('span.mono', up.neueste ?? '—'));
    text(u.stand, up.geprueft === null ? t('einst.nochNieGesucht')
      : up.fehler ? t('einst.suchFehler', up.fehler)
      : up.neuer ? t('einst.neuDa', up.neueste)
      : up.neueste ? t('einst.aktuell') + ' ' + t('einst.zuletztGesucht', vor(up.geprueft))
      : t('einst.keineGefunden'));
    u.stand.className = 'hinweis' + (up.neuer ? ' gut' : '');
  }

  // Beenden: zwei Klicks, damit es nicht aus Versehen geschieht.
  let beendenSicher = null;
  const beenden = knopf(t('einst.beenden'), async () => {
    if (!beendenSicher) {
      text(beenden, t('einst.beendenSicher')); beenden.classList.add('gefahr');
      beendenSicher = setTimeout(() => { beendenSicher = null; text(beenden, t('einst.beenden')); beenden.classList.remove('gefahr'); }, 4000);
      return;
    }
    clearTimeout(beendenSicher);
    beenden.disabled = true;
    try { await sende('/api/shutdown'); fuelle(wurzel, el('p.einleitung', t('einst.beendet'))); } catch (e) { melde(e.message, true); beenden.disabled = false; }
  }, 'klein');

  async function speichere() {
    try {
      await sende('/api/configure', { dataDir: f.ordner.value.trim(), nodePort: Number(f.api.value), p2pPort: Number(f.p2p.value), seed: f.seed.value.trim() });
      melde(t('einst.gespeichert'));
      neustart.hidden = !ctx.stand()?.running;
      await ctx.neuLaden();
    } catch (e) { melde(e.message, true); }
  }

  async function starteNeu() {
    try {
      await sende('/api/mining/stop');
      await sende('/api/stop'); await sende('/api/start');
      neustart.hidden = true; melde(t('einst.neuGestartet'));
      await ctx.neuLaden();
    } catch (e) { melde(e.message, true); }
  }

  const stelle = wert => sende('/api/einstellungen', wert);

  const e0 = ctx.stand()?.einstellungen ?? {};
  const sperre = el('select.feld.schmal', { id: 'e-sperre', onchange: async ev => {
    try { await stelle({ sperreMinuten: Number(ev.target.value) }); await ctx.neuLaden(); } catch (err) { melde(err.message, true); }
  } }, [[5, t('wal.minuten', 5)], [10, t('wal.minuten', 10)], [30, t('wal.minuten', 30)], [0, t('wal.nie')]]
    .map(([w, n]) => el('option', { value: w, selected: (e0.sperreMinuten ?? 10) === w }, n)));
  const autostart = h0.vorhanden ? schalter(t('einst.autostart'), h0.autostart === true, async an => { await sende('/api/huelle/autostart', { an }); await ctx.neuLaden(); }) : null;

  const sprachwahl = el('select.feld.schmal', { id: 'e-sprache', onchange: async ev => {
    try { await stelle({ sprache: ev.target.value }); setzeSprache(ev.target.value); await ctx.neuLaden(); ctx.neuAufbauen(); }
    catch (err) { melde(err.message, true); }
  } }, el('option', { value: 'de', selected: e0.sprache !== 'en' }, 'Deutsch'), el('option', { value: 'en', selected: e0.sprache === 'en' }, 'English'));

  const wurzel = el('div.stapel',
    kopf(t('einst.titel'), t('einst.sub')),
    el('div.spalten',
      el('div.stapel', { style: 'flex:1 1 420px' },
        el('section.karte', { 'aria-label': t('einst.knoten') },
          el('h2', t('einst.knoten')),
          el('div.feldgruppe', el('label', { for: 'e-ordner' }, t('einst.ordner')),
            waehlen ? el('div.reihe', f.ordner, waehlen) : f.ordner,
            el('p.hinweis', t('einst.ordnerHinweis'), ' ', belegt)),
          el('div.reihe.umbrechen', { style: 'align-items:flex-start;gap:12px' },
            el('div.feldgruppe', { style: 'flex:1 1 150px' }, el('label', { for: 'e-api' }, t('einst.apiPort')), f.api, el('p.hinweis', t('einst.apiHinweis'))),
            el('div.feldgruppe', { style: 'flex:1 1 150px' }, el('label', { for: 'e-p2p' }, t('einst.p2pPort')), f.p2p, el('p.hinweis', t('einst.p2pHinweis')))),
          el('div.feldgruppe', el('label', { for: 'e-seed' }, 'Seed'), f.seed, el('p.hinweis', t('einst.seedHinweis'))),
          neustart,
          el('div.karte-kopf', el('span.hinweis', t('einst.geltenNach')), knopf(t('allg.speichern'), speichere, 'haupt'))),
        el('section.karte', { 'aria-label': t('einst.sicherheit') },
          el('h2', t('einst.sicherheit')),
          el('div.notiz', zeichen('schild', 18), el('span', t('einst.sicherheitText'))),
          el('div.schaltzeile', el('label', { for: 'e-sperre' }, t('wal.sperreNach')), sperre),
          el('div.schaltzeile', el('span', t('einst.passwortSenden')), el('span.dim', { style: 'font-size:13px' }, t('einst.immerAn')))),
        el('section.karte', { 'aria-label': t('einst.ueber') },
          el('h2', t('einst.ueber')),
          el('div.zeilen',
            zeile(t('einst.programm'), ueber.programm), zeile(t('einst.netz'), ueber.netz), zeile(t('einst.regeln'), ueber.regeln),
            zeile(t('einst.quelltext'), el('a', { href: 'https://github.com/dabitlex/YSKAR', target: '_blank', rel: 'noreferrer' }, 'github.com/dabitlex/YSKAR'))))),
      el('div.stapel', { style: 'flex:1 1 420px' },
        el('section.karte', { style: 'gap:4px', 'aria-label': t('einst.programmTitel') },
          el('h2', { style: 'margin-bottom:6px' }, t('einst.programmTitel')),
          autostart ? el('div.schaltzeile', el('span', t('einst.autostart'), el('span.hinweis', t(h0.infobereich ? 'einst.autostartHinweis' : 'einst.autostartFenster'))), autostart) : null,
          h0.vorhanden && h0.infobereich ? el('div.schaltzeile', el('span', t('einst.imHintergrund'), el('span.hinweis', t('einst.imHintergrundHinweis'))),
            schalter(t('einst.imHintergrund'), e0.imHintergrund === true, an => stelle({ imHintergrund: an }))) : null,
          el('div.schaltzeile', el('span', t('einst.knotenSofort'), el('span.hinweis', t('einst.knotenSofortHinweis'))),
            schalter(t('einst.knotenSofort'), e0.knotenSofort !== false, an => stelle({ knotenSofort: an }))),
          el('div.schaltzeile', el('span', t('einst.miningFortsetzen'), el('span.hinweis', t('einst.miningFortsetzenHinweis'))),
            schalter(t('einst.miningFortsetzen'), e0.miningFortsetzen === true, an => stelle({ miningFortsetzen: an }))),
          el('div.schaltzeile', el('label', { for: 'e-sprache' }, t('einst.sprache')), sprachwahl),
          el('div.schaltzeile', el('span', t('einst.beendenText'), el('span.hinweis', t('einst.beendenHinweis'))), beenden)),
        el('section.karte', { 'aria-label': t('einst.updates') },
          el('h2', t('einst.updates')),
          el('div.zeilen',
            zeile(t('einst.installiert'), u.installiert), zeile(t('einst.neueste'), u.neueste),
            zeile(t('einst.quelle'), el('a', { href: RELEASES, target: '_blank', rel: 'noreferrer' }, 'GitHub Releases'))),
          u.stand,
          el('div.schaltzeile', el('span', t('einst.updatesSuchen'), el('span.hinweis', t('einst.updatesSuchenHinweis'))),
            schalter(t('einst.updatesSuchen'), e0.updatesSuchen !== false, an => stelle({ updatesSuchen: an }))),
          el('div.karte-kopf', el('span.hinweis', { style: 'flex:1 1 200px' }, t('einst.updateHinweis')), suchen)),
        el('section.karte', { 'aria-label': t('einst.protokoll') },
          el('div.karte-kopf', el('h2', t('einst.protokoll')),
            el('div.reihe', knopf([zeichen('kopieren'), t('allg.kopieren')], () => kopiere(protokoll.textContent), 'klein'), ordnerOeffnen)),
          protokoll))));

  async function ladeProtokoll() {
    try {
      const r = await hole('/api/logs');
      const unten = protokoll.scrollTop + protokoll.clientHeight >= protokoll.scrollHeight - 8;
      const neu = r.logs.join('\n');
      if (protokoll.textContent !== neu) { protokoll.textContent = neu; if (unten) protokoll.scrollTop = protokoll.scrollHeight; }
    } catch { /* nächster Takt */ }
  }

  function aktualisiere(s) {
    if (!gefuellt) {
      f.ordner.value = s.dataDir; f.api.value = s.nodePort; f.p2p.value = s.p2pPort; f.seed.value = s.seed || '';
      gefuellt = true;
    }
    text(ueber.programm, 'YSKAR Node Core ' + s.version);
    text(ueber.netz, netzName(s.network));
    text(ueber.regeln, t('einst.fassung', s.konsensfassung));
    text(belegt, s.dataDirBytes !== null && s.dataDirBytes !== undefined ? t('einst.ordnerBelegt', groesse(s.dataDirBytes)) : '');
    if (autostart && s.huelle.autostart !== null) autostart.setAttribute('aria-checked', s.huelle.autostart ? 'true' : 'false');
    zeigeUpdate(s);
  }

  ladeProtokoll();
  logTakt = setInterval(ladeProtokoll, 3000);
  return { wurzel, aktualisiere, verlasse: () => clearInterval(logTakt) };
}
