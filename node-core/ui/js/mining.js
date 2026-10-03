/* Mining: mit Prozessor und Grafikkarte an neuen Blöcken rechnen. */
import { hole, sende, el, fuelle, text, zeile, chip, knopf, kopf, melde, zahl, ysr, leistung, dauer, tagOderZeit, zeichen, segment } from './kern.js';
import { t } from './i18n.js';

/** Dieselbe Regel wie im Knoten und im Explorer: druckbares ASCII, 3 bis 32 Zeichen. */
function pruefeName(v) {
  if (v === '') return { ok: true, text: t('min.nameLeer') };
  const zeichenListe = [...v].map(c => c.codePointAt(0));
  if (zeichenListe.some(c => c < 0x20 || c > 0x7e)) return { ok: false, text: t('min.nameZeichen') };
  if (zeichenListe.length > 32) return { ok: false, text: t('min.nameLang', zeichenListe.length) };
  if (zeichenListe.length < 3) return { ok: false, text: t('min.nameKurz') };
  if (!/[a-zA-Z0-9]/.test(v)) return { ok: false, text: t('min.nameBuchstabe') };
  return { ok: true, text: t('min.nameOk', v, zeichenListe.length) };
}

export function baue(ctx) {
  const zustand = el('span');
  const start = knopf('', schalte, 'haupt');

  const adresse = el('input.feld.mono', { id: 'm-adresse', type: 'text', placeholder: 'ysr1…', spellcheck: 'false', autocomplete: 'off', style: 'font-size:13px' });
  let modus = 'cpu';
  const geraet = segment(t('min.geraet'), [['cpu', t('min.cpu')], ['gpu', t('min.gpu')], ['beide', t('min.beides')]], modus, w => { modus = w; zeigeKaesten(); });
  const kerne = el('input', { id: 'm-kerne', type: 'range', min: 1, max: 1, step: 1, value: 1 });
  const kerneText = el('span.mono', { style: 'font-size:13px' });
  const last = el('input', { id: 'm-last', type: 'range', min: 10, max: 100, step: 10, value: 100 });
  const lastText = el('span.mono', { style: 'font-size:13px' });
  const cpuKasten = el('div.box.stapel', { style: 'gap:12px' },
    el('h3', t('min.cpu')),
    el('div.feldgruppe', el('div.karte-kopf', el('label', { for: 'm-kerne' }, t('min.kerne')), kerneText), kerne),
    el('div.feldgruppe', el('div.karte-kopf', el('label', { for: 'm-last' }, t('min.last')), lastText), last, el('p.hinweis', t('min.lastHinweis'))));
  const gpuChip = el('span');
  const gpuWahl = el('select.feld', { id: 'm-gpu' });
  const gpuGrund = el('p.hinweis');
  const gpuKasten = el('div.box.stapel', { style: 'gap:12px' },
    el('div.karte-kopf', el('h3', t('min.gpu')), gpuChip),
    el('div.feldgruppe', el('label', { for: 'm-gpu' }, t('min.karte')), gpuWahl),
    gpuGrund,
    el('div', knopf(t('min.gpuSuchen'), async () => { try { await sende('/api/mining/detect'); await ctx.neuLaden(); } catch (e) { melde(e.message, true); } }, 'klein')));
  const name = el('input.feld', { id: 'm-name', type: 'text', maxlength: 32, spellcheck: 'false', autocomplete: 'off' });
  const nameHinweis = el('p.hinweis');
  const gesperrt = el('p.hinweis', { hidden: true }, t('min.gesperrt'));

  const eigene = el('b', '—'), netz = el('b', '—'), eigeneSub = el('span', '');
  const schaetzung = el('span');
  const mess = el('tbody');
  const funde = el('div.zeilen');
  const fundeKopf = el('span.hinweis');
  const z = { hoehe: el('span.mono'), seit: el('span') };

  let gefuellt = false;
  let beschaeftigt = false;
  let fundeFuer = '';
  let fundeHoehe = -2;

  kerne.addEventListener('input', () => text(kerneText, t('min.kerneVon', kerne.value, kerne.max)));
  last.addEventListener('input', () => text(lastText, last.value + ' %'));
  name.addEventListener('input', zeigeName);

  function zeigeName() {
    const r = pruefeName(name.value.trim());
    nameHinweis.className = 'hinweis' + (r.ok ? '' : ' schlecht');
    text(nameHinweis, r.text);
  }
  function zeigeKaesten() {
    cpuKasten.hidden = modus === 'gpu';
    gpuKasten.hidden = modus === 'cpu';
  }

  async function schalte() {
    const laeuft = ctx.stand()?.mining?.running;
    beschaeftigt = true; start.disabled = true;
    try {
      if (laeuft) { await sende('/api/mining/stop'); }
      else {
        const r = await sende('/api/mining/start', {
          address: adresse.value.trim(), mode: modus,
          cpuWorkers: Number(kerne.value), cpuIntensity: Number(last.value),
          gpuDevice: Number(gpuWahl.value || 0), blockName: name.value.trim(),
        });
        if (r.hinweise?.length) melde(r.hinweise.join(' '));
      }
      await ctx.neuLaden();
    } catch (e) { melde(e.message, true); }
    beschaeftigt = false; start.disabled = false;
  }

  const wurzel = el('div.stapel',
    kopf(t('min.titel'), t('min.sub'), zustand, start),
    el('div.spalten',
      el('section.karte', { style: 'flex:1 1 440px;gap:18px', 'aria-label': t('min.einstellungen') },
        el('div.feldgruppe', el('label', { for: 'm-adresse' }, t('min.gehtAn')), adresse, el('p.hinweis', t('min.gehtAnHinweis'))),
        el('div.feldgruppe', el('span.feldname', t('min.geraet')), geraet),
        cpuKasten, gpuKasten,
        el('div.feldgruppe', el('label', { for: 'm-name' }, t('min.name'), ' ', el('small', '· ' + t('allg.freiwillig'))), name, nameHinweis),
        gesperrt),
      el('div.stapel', { style: 'flex:1 1 400px' },
        el('section.karte', { 'aria-label': t('min.erwartung') },
          el('h2', t('min.erwartung')),
          el('div.spalten',
            el('div.stapel', { style: 'flex:1 1 150px;gap:6px' }, el('span.cap', t('min.deine')), el('span.gross', { style: 'font-size:26px' }, eigene), el('span.hinweis', eigeneSub)),
            el('div.stapel', { style: 'flex:1 1 150px;gap:6px' }, el('span.cap', t('ueb.netz')), el('span.gross', { style: 'font-size:26px' }, netz), el('span.hinweis', t('ueb.netzSub')))),
          el('div.notiz', zeichen('info', 18), schaetzung)),
        el('section.karte', { 'aria-label': t('min.messwerte') },
          el('div.karte-kopf', el('h2', t('min.messwerte'))),
          el('div.tab-huelle', el('table.tab',
            el('thead', el('tr', el('th', t('min.geraet')), el('th.r', t('min.leistung')), el('th.r', 'Hashes'), el('th.r', t('min.fehler')))),
            mess)),
          el('div.zeilen', zeile(t('min.arbeitetAn'), z.hoehe), zeile(t('min.laeuftSeit'), z.seit))),
        el('section.karte', { 'aria-label': t('min.funde') },
          el('div.karte-kopf', el('h2', t('min.funde')), fundeKopf),
          funde))));

  async function ladeFunde(adr) {
    try {
      const k = await hole('/api/lesen/account/' + adr);
      text(fundeKopf, t('min.fundeZahl', k.blocksFound));
      const solo = k.history.filter(h => h.kind === 'reward').slice(0, 5);
      fuelle(funde, solo.length ? solo.map(h => el('div.zeile',
        el('span', el('a.mono', { href: '#/blockchain/' + h.height }, zahl(h.height)), el('span.dim', ' · ' + tagOderZeit(h.timestamp))),
        el('span.mono.gut', '+' + ysr(h.amount)))) : el('p.hinweis', t('min.fundeKeine')));
    } catch { fuelle(funde, el('p.hinweis', t('min.fundeKeine'))); text(fundeKopf, ''); }
  }

  function aktualisiere(s) {
    const m = s.mining;
    if (!gefuellt) {
      adresse.value = m.config.address || '';
      modus = m.config.mode; geraet.setze(modus);
      kerne.max = m.cores; kerne.value = Math.min(m.cores, m.config.cpuWorkers);
      last.value = m.config.cpuIntensity;
      name.value = m.config.blockName || '';
      text(kerneText, t('min.kerneVon', kerne.value, kerne.max)); text(lastText, last.value + ' %');
      zeigeName(); zeigeKaesten();
      gefuellt = true;
    }
    const bereit = m.startklar?.bereit;
    fuelle(zustand, m.running ? chip('blau hoch', t('min.laeuftSeitChip', dauer(Math.max(m.cpu?.uptimeSeconds ?? 0, m.gpu?.uptimeSeconds ?? 0))), true)
      : !s.running ? chip('hoch', t('ueb.gestoppt'))
      : bereit ? chip('hoch', t('min.bereit')) : chip('gelb hoch', t('min.nichtBereit')));
    fuelle(start, m.running ? t('min.stoppen') : [zeichen('blitz'), t('min.starten')]);
    start.className = 'knopf' + (m.running ? '' : ' haupt');
    start.disabled = beschaeftigt || (!s.running && !m.running);
    start.title = !m.running && s.running && !bereit && m.startklar?.grund ? m.startklar.grund : '';

    // Während das Mining läuft, bleiben die Einstellungen stehen.
    for (const f of [adresse, kerne, last, name, gpuWahl]) f.disabled = m.running;
    for (const b of geraet.children) b.disabled = m.running || (b.dataset.wert !== 'cpu' && !m.gpuErkennung?.verfuegbar);
    gesperrt.hidden = !m.running;

    const e = m.gpuErkennung;
    const karten = e?.geraete ?? [];
    fuelle(gpuChip, m.gpuSucheLaeuft ? chip('', t('min.gpuSucht')) : e?.verfuegbar ? chip('gruen', [zeichen('haken', 14), t('min.cudaBereit')]) : chip('', t('min.gpuFehlt')));
    const wahl = JSON.stringify(karten.map(g => [g.id, g.name]));
    if (gpuWahl.dataset.bild !== wahl) {
      gpuWahl.dataset.bild = wahl;
      fuelle(gpuWahl, karten.length ? karten.map(g => el('option', { value: g.id, selected: g.id === m.config.gpuDevice },
        g.name + (g.vram ? ' · ' + (g.vram / 1073741824).toFixed(0) + ' GB' : '') + (g.emulation ? ' · ' + t('min.nachbildung') : '')))
        : el('option', { value: 0 }, t('min.keineKarte')));
    }
    text(gpuGrund, e && !e.verfuegbar && e.grund ? e.grund : (m.gpu?.lastError ? t('min.letzterFehler', m.gpu.lastError) : t('min.gpuHinweis')));
    if (!e?.verfuegbar && modus !== 'cpu' && !m.running) { modus = 'cpu'; geraet.setze('cpu'); zeigeKaesten(); }

    // Erwartung
    const eig = m.running ? m.totalHashrate : 0;
    text(eigene, m.running ? leistung(eig) : '—');
    text(eigeneSub, m.running ? t('min.gemessen') : t('min.nochNicht'));
    text(netz, s.netzHashrate ? leistung(s.netzHashrate) : '—');
    if (m.running && eig > 0 && s.netzHashrate > 0) {
      const anteil = Math.min(1, eig / Math.max(eig, s.netzHashrate));
      text(schaetzung, t('min.schaetzung', dauer(s.zielBlockzeit / anteil)));
    } else text(schaetzung, t('min.schaetzungOhne'));

    // Messwerte
    const c = m.cpu, g = m.gpu;
    fuelle(mess,
      el('tr', el('td', t('min.cpu'), c?.running ? el('span.blass', ' · ' + t('min.nKerne', c.workers)) : null),
        el('td.r.mono', c?.running ? leistung(c.hashrate) : '—'), el('td.r.mono', c ? zahl(c.hashes) : '—'), el('td.r.mono', c ? zahl(c.errors) : '—')),
      el('tr', el('td', t('min.gpu'), karten[0] && g?.running ? el('span.blass', ' · ' + karten[0].name) : null),
        el('td.r.mono', g?.running ? leistung(g.hashrate) : '—'), el('td.r.mono', g ? zahl(g.hashes) : '—'), el('td.r.mono', g ? zahl(g.errors) : '—')));
    const hoehe = c?.height ?? g?.height ?? null;
    text(z.hoehe, m.running && hoehe !== null ? t('kette.block', zahl(hoehe)) : '—');
    text(z.seit, m.running ? dauer(Math.max(c?.uptimeSeconds ?? 0, g?.uptimeSeconds ?? 0)) : '—');

    // Funde: nur neu holen, wenn sich Adresse oder Höhe geändert haben.
    const adr = (m.config.address || '').trim();
    if (s.running && adr && (adr !== fundeFuer || s.height !== fundeHoehe)) { fundeFuer = adr; fundeHoehe = s.height; ladeFunde(adr); }
    if (!adr) { text(fundeKopf, ''); fuelle(funde, el('p.hinweis', t('min.fundeOhneAdresse'))); }
  }

  return { wurzel, aktualisiere };
}
