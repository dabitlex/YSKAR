/* Einstellungen: Knoten, Programm, Protokoll, Über. */
import { hole, sende, el, fuelle, text, zeile, knopf, kopf, melde, schalter, zeichen, kopiere, netzName } from './kern.js';
import { t, setzeSprache } from './i18n.js';

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
  let gefuellt = false;
  let logTakt = null;

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
          el('div.feldgruppe', el('label', { for: 'e-ordner' }, t('einst.ordner')), f.ordner, el('p.hinweis', t('einst.ordnerHinweis'))),
          el('div.reihe.umbrechen', { style: 'align-items:flex-start;gap:12px' },
            el('div.feldgruppe', { style: 'flex:1 1 150px' }, el('label', { for: 'e-api' }, t('einst.apiPort')), f.api, el('p.hinweis', t('einst.apiHinweis'))),
            el('div.feldgruppe', { style: 'flex:1 1 150px' }, el('label', { for: 'e-p2p' }, t('einst.p2pPort')), f.p2p, el('p.hinweis', t('einst.p2pHinweis')))),
          el('div.feldgruppe', el('label', { for: 'e-seed' }, 'Seed'), f.seed, el('p.hinweis', t('einst.seedHinweis'))),
          neustart,
          el('div.karte-kopf', el('span.hinweis', t('einst.geltenNach')), knopf(t('allg.speichern'), speichere, 'haupt'))),
        el('section.karte', { 'aria-label': t('einst.ueber') },
          el('h2', t('einst.ueber')),
          el('div.zeilen',
            zeile(t('einst.programm'), ueber.programm), zeile(t('einst.netz'), ueber.netz), zeile(t('einst.regeln'), ueber.regeln),
            zeile(t('einst.quelltext'), el('a', { href: 'https://github.com/dabitlex/YSKAR', target: '_blank', rel: 'noreferrer' }, 'github.com/dabitlex/YSKAR'))))),
      el('div.stapel', { style: 'flex:1 1 420px' },
        el('section.karte', { style: 'gap:4px', 'aria-label': t('einst.programmTitel') },
          el('h2', { style: 'margin-bottom:6px' }, t('einst.programmTitel')),
          el('div.schaltzeile', el('span', t('einst.knotenSofort'), el('span.hinweis', t('einst.knotenSofortHinweis'))),
            schalter(t('einst.knotenSofort'), e0.knotenSofort !== false, an => stelle({ knotenSofort: an }))),
          el('div.schaltzeile', el('label', { for: 'e-sprache' }, t('einst.sprache')), sprachwahl)),
        el('section.karte', { 'aria-label': t('einst.protokoll') },
          el('div.karte-kopf', el('h2', t('einst.protokoll')),
            knopf([zeichen('kopieren'), t('allg.kopieren')], () => kopiere(protokoll.textContent), 'klein')),
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
  }

  ladeProtokoll();
  logTakt = setInterval(ladeProtokoll, 3000);
  return { wurzel, aktualisiere, verlasse: () => clearInterval(logTakt) };
}
