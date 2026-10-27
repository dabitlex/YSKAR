/*
 * Erster Start: den Knoten einrichten und starten.
 *
 * Schritt 1 zeigt die Standardwerte als ruhige Liste -- fast niemand muss
 * sie ändern. Erst "Anpassen" klappt die Felder auf.
 */
import { sende, el, fuelle, knopf, melde, kristall, zeichen, zeile, netzName, kurzAdresse } from './kern.js';
import { t } from './i18n.js';
import { baueEinrichten } from './walletEinrichten.js';

export function baue(ctx) {
  const s = ctx.stand();
  const f = {
    ordner: el('input.feld.mono', { id: 'a-ordner', type: 'text', value: s.dataDir, spellcheck: 'false' }),
    api: el('input.feld.mono', { id: 'a-api', type: 'number', value: s.nodePort, min: 1024, max: 65535 }),
    p2p: el('input.feld.mono', { id: 'a-p2p', type: 'number', value: s.p2pPort, min: 1024, max: 65535 }),
    seed: el('input.feld.mono', { id: 'a-seed', type: 'text', value: s.seed || '', spellcheck: 'false' }),
  };
  const fehler = el('div.fehler', { hidden: true, role: 'alert', style: 'width:100%' });
  const schritte = el('ol.schritte', { 'aria-label': t('einr.schritte') });
  const mitte = el('section.einr-mitte');
  const NAMEN = ['einr.s1', 'einr.s2', 'einr.s3'];
  let anpassen = false;

  function zeigeSchritte(nr) {
    const teile = [];
    NAMEN.forEach((n, i) => {
      if (i) teile.push(el('li.strich', { 'aria-hidden': 'true' }));
      teile.push(el('li' + (i < nr ? '.fertig' : ''), i === nr ? { 'aria-current': 'step' } : null,
        el('i', i < nr ? zeichen('haken', 12) : String(i + 1)), t(n)));
    });
    fuelle(schritte, teile);
  }

  /** Eine Zeile der Standardwerte. */
  const wert = (z, name, w) => el('div.ek-zeile', el('span.ek-ic', zeichen(z, 15)), el('span.ek-l', name), el('span.ek-w.mono', { title: w }, w));

  function schritt1() {
    zeigeSchritte(0);
    fehler.hidden = true;
    mitte.className = 'einr-mitte';
    const liste = anpassen
      ? el('div.ek-form',
        el('div.feldgruppe', el('label', { for: 'a-ordner' }, t('einst.ordner')),
          el('div.reihe', f.ordner, s.huelle?.vorhanden ? knopf(t('einr.waehlen'), waehleOrdner) : null),
          el('p.hinweis', t('einr.ordnerHinweis'))),
        el('div.raster.r2',
          el('div.feldgruppe', el('label', { for: 'a-p2p' }, t('einst.p2pPort')), f.p2p, el('p.hinweis', t('einst.p2pHinweis'))),
          el('div.feldgruppe', el('label', { for: 'a-seed' }, t('einr.ersterKontaktSeed')), f.seed, el('p.hinweis', t('einst.seedHinweis')))),
        el('div.feldgruppe', el('label', { for: 'a-api' }, t('einst.apiPort')), f.api, el('p.hinweis', t('einst.apiHinweis'))))
      : [
        wert('ordner', t('einst.ordner'), f.ordner.value.trim()),
        wert('netz', t('einst.p2pPort'), f.p2p.value),
        wert('welt', t('einr.ersterKontakt'), f.seed.value.trim() || '—'),
      ];
    fuelle(mitte,
      el('div.einr-text',
        el('span.etikett', t('einr.etikett')),
        el('h1', t('einr.titelA'), ' ', el('span.lt', t('einr.titelB'))),
        el('p.einleitung', t('einr.einleitung'))),
      el('div.ek',
        liste,
        el('div.ek-fuss',
          el('span.hinweis', anpassen ? t('einr.nurAendern') : t('einr.standard')),
          knopf(anpassen ? t('einr.standardNehmen') : t('einr.anpassen'), () => {
            if (anpassen) { f.ordner.value = s.dataDir; f.api.value = s.nodePort; f.p2p.value = s.p2pPort; f.seed.value = s.seed || ''; }
            anpassen = !anpassen; schritt1();
          }, 'ruhig klein'))),
      el('p.ek-hinweis', zeichen('schild', 14), el('span', t('einr.firewall'))),
      fehler,
      knopf(t('allg.weiter'), speichere, 'haupt gross'));
  }

  async function waehleOrdner() {
    try {
      const r = await sende('/api/huelle/ordner-waehlen', { start: f.ordner.value.trim() });
      if (r?.pfad) f.ordner.value = r.pfad;
    } catch (e) { melde(e.message, true); }
  }

  async function speichere() {
    fehler.hidden = true;
    try {
      await sende('/api/configure', { dataDir: f.ordner.value.trim(), nodePort: Number(f.api.value), p2pPort: Number(f.p2p.value), seed: f.seed.value.trim(), nurPruefen: true });
      schrittWallet();
    } catch (e) { fehler.textContent = e.message; fehler.hidden = false; }
  }

  /** Schritt 2: Wallet anlegen, wiederherstellen oder später. */
  async function schrittWallet() {
    zeigeSchritte(1);
    fehler.hidden = true;
    mitte.className = 'einr-mitte breit';
    await ctx.neuLaden();
    const kopfText = el('div.einr-text',
      el('span.etikett', t('einr.etikett2')),
      el('h1', { style: 'font-size:34px' }, t('wal.einrichten')),
      el('p.einleitung', ctx.stand().wallet.vorhanden ? t('einr.walletDa') : t('wal.einrichtenText')));
    if (ctx.stand().wallet.vorhanden) {
      // Es gibt schon eine -- etwa aus einer früheren Installation.
      fuelle(mitte, kopfText,
        el('div.karte.zeilen', { style: 'padding:4px 18px' }, zeile(t('kette.adresse'), el('span.mono.umbruch', ctx.stand().wallet.adresse))),
        el('div.reihe', { style: 'justify-content:space-between' }, knopf(t('allg.zurueck'), schritt1), knopf(t('allg.weiter'), schritt2, 'haupt gross')));
      return;
    }
    const e = baueEinrichten({ fertig: async () => { await ctx.neuLaden(); schritt2(); }, spaeter: schritt2, zurueck: schritt1 });
    fuelle(mitte, kopfText, el('div.karte', { style: 'padding:22px 24px' }, e.wurzel));
  }

  function schritt2() {
    zeigeSchritte(2);
    fehler.hidden = true;
    mitte.className = 'einr-mitte';
    const st = ctx.stand();
    const los = knopf(t('einr.starten'), async () => {
      los.disabled = true; fehler.hidden = true;
      try {
        await sende('/api/configure', { dataDir: f.ordner.value.trim(), nodePort: Number(f.api.value), p2pPort: Number(f.p2p.value), seed: f.seed.value.trim() });
        try { await sende('/api/start'); }
        catch (e) { melde(t('fehler.knotenStart', e.message), true); }
        await ctx.eingerichtet();
      } catch (e) { fehler.textContent = e.message; fehler.hidden = false; los.disabled = false; }
    }, 'haupt gross');
    los.style.minWidth = '220px';
    const regeln = st.konsensfassung
      ? (st.nextActivationHeight ? t('einr.regelnAb', st.konsensfassung, st.nextActivationHeight.toLocaleString()) : t('einr.regeln', st.konsensfassung))
      : null;
    fuelle(mitte,
      el('div.einr-text',
        el('span.etikett', t('einr.bereit')),
        el('h1', t('einr.allesEingerichtet')),
        el('p.einleitung', t('einr.bereitText', netzName(s.network)))),
      el('div.karte.zeilen', { style: 'width:100%;padding:4px 18px' },
        zeile(t('einr.netz'), netzName(s.network)),
        regeln ? zeile(t('einr.regelnName'), regeln) : null,
        zeile(t('einst.ordner'), el('span.mono.umbruch', f.ordner.value.trim())),
        zeile(t('nav.wallet'), st.wallet.vorhanden ? el('span.mono', kurzAdresse(st.wallet.adresse)) : t('einr.walletSpaeter'))),
      fehler,
      el('div.reihe', { style: 'gap:12px;justify-content:center' }, knopf(t('allg.zurueck'), schrittWallet), los));
  }

  const wurzel = el('div.einrichtung',
    el('div.einr-kopf',
      el('div.marke', { style: 'padding:0' }, kristall(28), el('div', el('b', 'YSKAR'), el('span', 'Node Core ' + s.version))),
      schritte),
    mitte);
  schritt1();
  return { wurzel };
}
