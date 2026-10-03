/* Erster Start: den Knoten einrichten und starten. */
import { sende, el, fuelle, knopf, melde, kristall, zeichen, zeile, netzName } from './kern.js';
import { t } from './i18n.js';

export function baue(ctx) {
  const s = ctx.stand();
  const f = {
    ordner: el('input.feld.mono', { id: 'a-ordner', type: 'text', value: s.dataDir, spellcheck: 'false', style: 'font-size:13px' }),
    api: el('input.feld.mono', { id: 'a-api', type: 'number', value: s.nodePort, min: 1024, max: 65535 }),
    p2p: el('input.feld.mono', { id: 'a-p2p', type: 'number', value: s.p2pPort, min: 1024, max: 65535 }),
    seed: el('input.feld.mono', { id: 'a-seed', type: 'text', value: s.seed || '', spellcheck: 'false' }),
  };
  const fehler = el('div.fehler', { hidden: true, role: 'alert' });
  const schritte = el('ol.schritte', { 'aria-label': t('einr.schritte') });
  const karte = el('section.karte');
  const NAMEN = ['einr.s1', 'einr.s3'];

  function zeigeSchritte(nr) {
    fuelle(schritte, NAMEN.map((n, i) => i < nr
      ? el('li.fertig', zeichen('haken', 14), t(n))
      : el('li', i === nr ? { 'aria-current': 'step' } : null, (i + 1) + ' · ' + t(n))));
  }

  function schritt1() {
    zeigeSchritte(0);
    fehler.hidden = true;
    fuelle(karte,
      el('div.stapel', { style: 'gap:8px' }, el('h1', t('einr.titel')), el('p.einleitung', t('einr.einleitung'))),
      el('div.feldgruppe', el('label', { for: 'a-ordner' }, t('einst.ordner')), f.ordner, el('p.hinweis', t('einr.ordnerHinweis'))),
      el('div.reihe.umbrechen', { style: 'align-items:flex-start;gap:14px' },
        el('div.feldgruppe', { style: 'flex:1 1 200px' }, el('label', { for: 'a-api' }, t('einst.apiPort')), f.api, el('p.hinweis', t('einst.apiHinweis'))),
        el('div.feldgruppe', { style: 'flex:1 1 200px' }, el('label', { for: 'a-p2p' }, t('einst.p2pPort')), f.p2p, el('p.hinweis', t('einst.p2pHinweis')))),
      el('div.feldgruppe', el('label', { for: 'a-seed' }, 'Seed'), f.seed, el('p.hinweis', t('einst.seedHinweis'))),
      el('div.notiz', zeichen('info', 18), el('span', t('einr.firewall'))),
      fehler,
      el('div.reihe', { style: 'justify-content:flex-end' }, knopf(t('allg.weiter'), speichere, 'haupt')));
  }

  async function speichere() {
    fehler.hidden = true;
    try {
      await sende('/api/configure', { dataDir: f.ordner.value.trim(), nodePort: Number(f.api.value), p2pPort: Number(f.p2p.value), seed: f.seed.value.trim(), nurPruefen: true });
      schritt2();
    } catch (e) { fehler.textContent = e.message; fehler.hidden = false; }
  }

  function schritt2() {
    zeigeSchritte(1);
    fehler.hidden = true;
    const los = knopf(t('einr.starten'), async () => {
      los.disabled = true; fehler.hidden = true;
      try {
        await sende('/api/configure', { dataDir: f.ordner.value.trim(), nodePort: Number(f.api.value), p2pPort: Number(f.p2p.value), seed: f.seed.value.trim() });
        try { await sende('/api/start'); }
        catch (e) { melde(t('fehler.knotenStart', e.message), true); }
        await ctx.eingerichtet();
      } catch (e) { fehler.textContent = e.message; fehler.hidden = false; los.disabled = false; }
    }, 'haupt');
    fuelle(karte,
      el('div.stapel', { style: 'gap:8px' }, el('h1', t('einr.bereit')), el('p.einleitung', t('einr.bereitText', netzName(s.network)))),
      el('div.box.zeilen', { style: 'padding:4px 14px' },
        zeile(t('einst.ordner'), el('span.mono.umbruch', f.ordner.value.trim())),
        zeile(t('einst.p2pPort'), f.p2p.value, true),
        zeile('Seed', f.seed.value.trim() || '—', true)),
      fehler,
      el('div.reihe', { style: 'justify-content:space-between' }, knopf(t('allg.zurueck'), schritt1), los));
  }

  const wurzel = el('div.einrichtung', el('div',
    el('div.karte-kopf',
      el('div.marke', { style: 'padding:0' }, kristall(), el('div', el('b', 'YSKAR'), el('span', 'Node Core ' + s.version))),
      schritte),
    karte));
  schritt1();
  return { wurzel };
}
