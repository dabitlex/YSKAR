/* Mining: mit Prozessor und Grafikkarte an neuen Blöcken rechnen -- solo oder im Pool. */
import { hole, sende, el, fuelle, text, zeile, chip, knopf, kopf, melde, zahl, ysr, leistung, dauer, tagOderZeit, zeichen, segment, kurzAdresse } from './kern.js';
import { t, sprache } from './i18n.js';

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

/** Die Pool-Liste wird so oft neu geholt, solange sie zu sehen ist. */
const POOL_TAKT_MS = 20_000;

/** Fehlertext in der Sprache der Oberfläche, wenn der Knoten ein Kürzel mitschickt. */
function fehlerText(e) {
  const schluessel = 'pool.fehler.' + (e.code || '');
  const eigen = e.code ? t(schluessel) : schluessel;
  return eigen !== schluessel ? eigen : e.message;
}

/** Kurze Spanne für die Beschriftung des Verlaufs: "45 s", "12 min", sonst wie überall. */
const spanneKurz = sekunden => (sekunden < 90 ? Math.round(sekunden) + ' s' : sekunden < 5400 ? Math.round(sekunden / 60) + ' min' : dauer(sekunden));

const prozent = bps => (bps / 100).toLocaleString(sprache() === 'en' ? 'en-GB' : 'de-DE', { maximumFractionDigits: 2 }) + ' %';

// ------------------------------------------------------------- Verlauf

const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attribute) => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attribute)) e.setAttribute(k, String(v));
  return e;
};

/** Runde Obergrenze: drei gleiche Schritte, die den höchsten Wert fassen. */
function skala(max) {
  const einheiten = [[1e9, 'GH/s'], [1e6, 'MH/s'], [1e3, 'kH/s'], [1, 'H/s']];
  const [teiler, einheit] = einheiten.find(([x]) => max >= x) ?? einheiten[3];
  const roh = Math.max(max / teiler, 1e-9) / 3;
  const zehner = 10 ** Math.floor(Math.log10(roh));
  const schritt = [1, 2, 2.5, 5, 10].map(f => f * zehner).find(x => x >= roh);
  return { teiler, einheit, schritt, oben: schritt * 3 * teiler };
}

/**
 * Leistung über die Zeit: eine Linie, darunter ein Fadenkreuz mit dem Wert
 * an der Stelle des Zeigers.
 */
function baueVerlauf() {
  const B = 600, H = 140, OBEN = 10, UNTEN = 130;
  const achse = el('div.verlauf-achse', { 'aria-hidden': 'true' });
  const bild = svg('svg', { viewBox: `0 0 ${B} ${H}`, preserveAspectRatio: 'none', role: 'img' });
  for (const y of [OBEN, 50, 90, UNTEN]) {
    bild.appendChild(svg('line', { x1: 0, y1: y, x2: B, y2: y, class: y === UNTEN ? 'grund' : 'gitter', 'vector-effect': 'non-scaling-stroke' }));
  }
  const linie = svg('polyline', { class: 'linie', 'vector-effect': 'non-scaling-stroke', points: '' });
  const faden = svg('line', { class: 'faden', y1: OBEN, y2: UNTEN, 'vector-effect': 'non-scaling-stroke' });
  bild.append(linie, faden);
  const punkt = el('span.verlauf-punkt', { hidden: true });
  const wert = el('div.verlauf-wert', { hidden: true, role: 'status' });
  const flaeche = el('div.verlauf-flaeche', bild, punkt, wert);
  const zeiten = el('div.verlauf-zeiten', { 'aria-hidden': 'true' });
  const leer = el('p.hinweis');
  const wurzel = el('div.stapel', { style: 'gap:8px' }, el('div.verlauf', achse, flaeche), zeiten, leer);

  let punkte = [], oben = 1, bildStand = '';
  let zeiger = null;           // Stelle des Zeigers, 0 bis 1; null = nicht über dem Bild
  const xVon = i => (punkte.length < 2 ? 0 : (i / (punkte.length - 1)) * B);
  const yVon = h => UNTEN - Math.min(1, h / oben) * (UNTEN - OBEN);

  function zeige(i) {
    const p = punkte[i];
    if (!p) return verstecke();
    const x = xVon(i) / B * 100, y = yVon(p.hashrate) / H * 100;
    faden.setAttribute('x1', xVon(i)); faden.setAttribute('x2', xVon(i)); faden.style.display = 'block';
    punkt.hidden = false; punkt.style.left = x + '%'; punkt.style.top = y + '%';
    wert.hidden = false;
    fuelle(wert, el('b', leistung(p.hashrate)), el('span', new Date(p.zeit).toLocaleTimeString(sprache() === 'en' ? 'en-GB' : 'de-DE')));
    // Am rechten Rand nach links klappen, sonst ragte der Wert aus der Karte.
    wert.style.left = x > 62 ? '' : `calc(${x}% + 10px)`;
    wert.style.right = x > 62 ? `calc(${100 - x}% + 10px)` : '';
  }
  function verstecke() { faden.style.display = 'none'; punkt.hidden = true; wert.hidden = true; }
  verstecke();
  flaeche.addEventListener('pointermove', e => {
    if (punkte.length < 2) return;
    const r = flaeche.getBoundingClientRect();
    zeiger = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    zeige(Math.round(zeiger * (punkte.length - 1)));
  });
  flaeche.addEventListener('pointerleave', () => { zeiger = null; verstecke(); });

  function setze(neu) {
    const stand = neu.length + ':' + (neu[neu.length - 1]?.zeit ?? 0);
    if (stand === bildStand) return;
    bildStand = stand;
    punkte = neu;
    verstecke();
    const genug = punkte.length >= 2;
    flaeche.parentNode.hidden = !genug; zeiten.hidden = !genug; leer.hidden = genug;
    if (!genug) { text(leer, t('pool.verlaufLeer')); return; }
    const werte = punkte.map(p => p.hashrate);
    const s = skala(Math.max(...werte));
    oben = s.oben;
    const f = x => new Intl.NumberFormat(sprache() === 'en' ? 'en-GB' : 'de-DE', { maximumFractionDigits: 2 }).format(x);
    fuelle(achse, [3, 2, 1, 0].map(i => el('span', i === 3 ? f(s.schritt * 3) + ' ' + s.einheit : f(s.schritt * i))));
    linie.setAttribute('points', punkte.map((p, i) => `${xVon(i).toFixed(1)},${yVon(p.hashrate).toFixed(1)}`).join(' '));
    const spanne = (punkte[punkte.length - 1].zeit - punkte[0].zeit) / 1000;
    bild.setAttribute('aria-label', t('pool.verlaufAlt', dauer(spanne), leistung(Math.min(...werte)), leistung(Math.max(...werte))));
    fuelle(zeiten, el('span', t('pool.vor', spanneKurz(spanne))), el('span', t('pool.vor', spanneKurz(spanne / 2))), el('span', t('pool.jetzt')));
    // Steht der Zeiger noch über dem Bild, bleibt das Fadenkreuz stehen.
    if (zeiger !== null) zeige(Math.round(zeiger * (punkte.length - 1)));
  }

  return { wurzel, setze };
}

// --------------------------------------------------------------- Ansicht

export function baue(ctx) {
  const zustand = el('span');
  const start = knopf('', schalte, 'haupt');

  // Ziel: solo oder Pool
  let ziel = 'solo';
  const zielWahl = segment(t('min.ziel'), [['solo', t('min.solo')], ['pool', t('pool.pool')]], ziel, w => { ziel = w; zeigeZiel(); });
  const zielHinweis = el('p.hinweis');

  // Pool wählen
  let poolHost = '';           // der gewählte Pool
  let eigenHost = '';          // von Hand eingetragene Adresse, als weitere Karte
  let pools = null;            // letzte Liste; null = noch nicht geholt
  let listeLaeuft = false;
  let listeTakt = null;
  let laeuft = false;
  const poolKarten = el('div.stapel', { style: 'gap:10px', role: 'radiogroup', 'aria-label': t('pool.waehlen') });
  const eigen = el('input.feld.mono', { id: 'm-pool-eigen', type: 'text', placeholder: `pool.example.org`, spellcheck: 'false', autocomplete: 'off', style: 'font-size:13px' });
  const eigenFehler = el('p.hinweis.schlecht', { hidden: true });
  const eigenKnopf = knopf(t('pool.pruefen'), pruefeEigen);
  eigen.addEventListener('keydown', e => { if (e.key === 'Enter') pruefeEigen(); });
  const poolFeld = el('div.feldgruppe',
    el('div.karte-kopf', el('span.feldname', t('pool.waehlen')), el('span.hinweis', t('pool.listeHinweis'))),
    poolKarten,
    el('div.box.stapel', { style: 'gap:8px' },
      el('label', { for: 'm-pool-eigen', style: 'font-size:13.5px;font-weight:700' }, t('pool.eigen')),
      el('div.reihe', { style: 'gap:10px' }, eigen, eigenKnopf),
      eigenFehler));

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
  const walletAdr = el('span.mono.dim', { style: 'font-size:12.5px' });
  const rWallet = el('input', { type: 'radio', name: 'm-ziel', id: 'm-ziel-wallet' });
  const rAndere = el('input', { type: 'radio', name: 'm-ziel', id: 'm-ziel-andere' });
  const wahlWallet = el('label.box.wahl', rWallet, el('span.stapel', { style: 'gap:2px' }, el('span', { style: 'font-size:13.5px;font-weight:700' }, t('min.meineWallet')), walletAdr));
  const wahlAndere = el('label.box.wahl', rAndere, el('span', { style: 'font-size:13.5px;font-weight:700' }, t('min.andere')));
  const setzeEmpfaenger = an => {
    zielWallet = an; rWallet.checked = an; rAndere.checked = !an;
    wahlWallet.classList.toggle('gewaehlt', an); wahlAndere.classList.toggle('gewaehlt', !an);
    adresse.hidden = an;
  };
  rWallet.addEventListener('change', () => setzeEmpfaenger(true));
  rAndere.addEventListener('change', () => { setzeEmpfaenger(false); adresse.focus(); });
  const name = el('input.feld', { id: 'm-name', type: 'text', maxlength: 32, spellcheck: 'false', autocomplete: 'off' });
  const nameHinweis = el('p.hinweis');
  const nameFeld = el('div.feldgruppe', el('label', { for: 'm-name' }, t('min.name'), ' ', el('small', '· ' + t('allg.freiwillig'))), name, nameHinweis);
  const gesperrt = el('p.hinweis', { hidden: true }, t('min.gesperrt'));

  // Rechte Spalte, solo
  const eigene = el('b', '—'), netz = el('b', '—'), eigeneSub = el('span', '');
  const schaetzung = el('span');
  const mess = el('tbody');
  const funde = el('div.zeilen');
  const fundeKopf = el('span.hinweis');
  const z = { hoehe: el('span.mono'), seit: el('span') };

  // Rechte Spalte, Pool
  const ende = el('div.warnung', { hidden: true, role: 'alert' });
  const lGesamt = el('span.gross', '—'), lSeit = el('span.hinweis'), lCpu = el('span.mono', '—'), lGpu = el('span.mono', '—');
  const verlauf = baueVerlauf();
  const vChip = el('span');
  const v = { pool: el('span'), miner: el('span.mono'), gut: el('span.mono'), schlecht: el('span.mono'), anteil: el('span.mono'), auszahlung: el('span') };
  const vFehler = el('p.hinweis.schlecht', { hidden: true });

  let gefuellt = false;
  let beschaeftigt = false;
  let zielWallet = false;      // Belohnung an die eigene Wallet?
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

  /** Solo oder Pool: was davon zu sehen ist. */
  function zeigeZiel() {
    const pool = ziel === 'pool';
    text(zielHinweis, pool ? t('pool.hinweis') : t('min.gehtAnHinweis'));
    poolFeld.hidden = !pool;
    nameFeld.hidden = pool;      // Im Pool trägt der Block den Namen des Pools.
    spalteSolo.hidden = pool; spaltePool.hidden = !pool;
    if (pool) { if (!listeTakt) listeTakt = setInterval(ladeListe, POOL_TAKT_MS); if (pools === null) ladeListe(); }
    else if (listeTakt) { clearInterval(listeTakt); listeTakt = null; }
    const s = ctx.stand();
    if (s) aktualisiere(s);
  }

  // ------------------------------------------------------------- Pools

  async function ladeListe() {
    if (listeLaeuft || document.hidden) return;
    listeLaeuft = true;
    try {
      const r = await hole('/api/pool/liste' + (eigenHost ? '?eigen=' + encodeURIComponent(eigenHost) : ''));
      pools = r.pools;
      // Noch nichts gewählt: der erste offene der Liste.
      if (!poolHost) poolHost = (pools.find(p => p.status === 'offen') ?? pools.find(p => p.status === 'unbekannt'))?.host ?? '';
    } catch { if (pools === null) pools = []; }
    listeLaeuft = false;
    zeigePools();
  }

  /** Ob man mit diesem Pool anfangen kann. Ob ein voller noch einen Platz für diese Adresse hat, sagt erst der Start. */
  const waehlbar = p => p.status !== 'aus' && p.status !== 'keinPool';

  function poolKarte(p) {
    const gewaehlt = p.host === poolHost;
    const farbe = p.status === 'offen' ? 'gruen' : p.status === 'voll' ? 'gelb' : '';
    const wahl = el('input', { type: 'radio', name: 'm-pool', value: p.host, checked: gewaehlt, disabled: laeuft || !waehlbar(p), class: 'nur-leser' });
    wahl.addEventListener('change', () => { poolHost = p.host; zeigePools(); });
    const chips = [
      p.status === 'voll' ? chip('gelb', t('pool.voll')) : null,
      p.status === 'aus' ? chip('', t('pool.aus')) : null,
      p.status === 'keinPool' ? chip('rot', t('pool.keinPool')) : null,
      gewaehlt ? chip('gruen', [zeichen('haken', 14), t('pool.gewaehlt')]) : null,
    ];
    const angabe = (nameText, wert) => el('span', el('span.dim', nameText), ' ', el('span.mono', wert));
    const zahlen = p.plaetze !== null ? el('div.pool-zahlen',
      angabe(t('pool.miner'), zahl(p.belegt) + ' / ' + zahl(p.plaetze)),
      angabe(t('min.leistung'), p.hashrate !== null ? leistung(p.hashrate) : '—'),
      angabe(t('pool.bloecke'), p.bloecke !== null ? zahl(p.bloecke) : '—'),
      angabe(t('pool.gebuehr'), p.feeBps !== null ? prozent(p.feeBps) : '—'))
      : el('p.hinweis', p.status === 'unbekannt' ? t('pool.ohneZahlen') : p.status === 'keinPool' ? t('pool.keinPoolText') : t('pool.ausText'));
    const balken = p.plaetze !== null
      ? el('div.balken.duenn' + (p.status === 'voll' ? '.gelb' : ''), { role: 'img', 'aria-label': t('pool.belegtAlt', p.belegt, p.plaetze) },
          el('i', { style: 'width:' + Math.round(p.belegt / p.plaetze * 100) + '%' }))
      : null;
    return el('label.box.pool' + (gewaehlt ? '.gewaehlt' : '') + (waehlbar(p) ? '' : '.aus'),
      wahl,
      el('div.karte-kopf',
        el('span.pool-name', el('span', { class: ('punkt ' + farbe).trim() }), p.anzeige),
        el('span.reihe', { style: 'gap:6px' }, chips)),
      // Eine eigene Adresse nennt sich selbst -- deshalb steht sie immer dabei.
      p.eigen ? el('span.hinweis', t('pool.eigenKurz'), p.anzeige !== p.host ? [' · ', el('span.mono', p.host)] : null) : null,
      p.hier ? el('span.hinweis', t('pool.hier')) : null,
      zahlen, balken);
  }

  function zeigePools() {
    if (pools === null) return fuelle(poolKarten, el('p.hinweis', t('pool.laedt')));
    if (pools.length === 0) return fuelle(poolKarten, el('p.hinweis', t('pool.listeLeer')));
    fuelle(poolKarten, pools.map(poolKarte));
  }

  async function pruefeEigen() {
    eigenFehler.hidden = true;
    const roh = eigen.value.trim();
    eigenKnopf.disabled = true;
    try {
      const r = await hole('/api/pool/liste?eigen=' + encodeURIComponent(roh));
      if (r.eigenFehler) { text(eigenFehler, t('pool.eigenUngueltig')); eigenFehler.hidden = false; return; }
      pools = r.pools;
      const neu = pools.find(p => p.eigen);
      eigenHost = neu?.host ?? '';
      if (neu && waehlbar(neu)) poolHost = neu.host;
      else if (neu) { text(eigenFehler, neu.status === 'keinPool' ? t('pool.keinPoolText') : t('pool.ausText')); eigenFehler.hidden = false; }
      if (!pools.some(p => p.host === poolHost)) poolHost = pools.find(waehlbar)?.host ?? '';
      zeigePools();
    } catch (e) { text(eigenFehler, e.message); eigenFehler.hidden = false; }
    finally { eigenKnopf.disabled = false; }
  }

  // -------------------------------------------------------------- Start

  async function schalte() {
    const an = ctx.stand()?.mining?.running;
    beschaeftigt = true; start.disabled = true;
    try {
      if (an) { await sende('/api/mining/stop'); }
      else {
        const r = await sende('/api/mining/start', {
          address: zielWallet ? ctx.stand().wallet.adresse : adresse.value.trim(), mode: modus,
          ziel, ...(ziel === 'pool' ? { poolHost } : {}),
          cpuWorkers: Number(kerne.value), cpuIntensity: Number(last.value),
          gpuDevice: Number(gpuWahl.value || 0), blockName: name.value.trim(),
        });
        if (r.hinweise?.length) melde(r.hinweise.join(' '));
      }
      await ctx.neuLaden();
    } catch (e) { melde(fehlerText(e), true); if (ziel === 'pool') { pools = null; ladeListe(); } }
    beschaeftigt = false; start.disabled = false;
  }

  const spalteSolo = el('div.stapel',
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
      funde));

  const spaltePool = el('div.stapel',
    ende,
    el('section.karte', { 'aria-label': t('min.leistung') },
      el('div.karte-kopf', el('h2', t('min.leistung')), lSeit),
      el('div.reihe.umbrechen', { style: 'align-items:baseline;gap:8px 22px' },
        lGesamt,
        el('span', { style: 'font-size:13px' }, el('span.dim', t('min.cpu')), ' ', lCpu),
        el('span', { style: 'font-size:13px' }, el('span.dim', t('min.gpu')), ' ', lGpu)),
      verlauf.wurzel),
    el('section.karte', { 'aria-label': t('pool.verbindung') },
      el('div.karte-kopf', el('h2', t('pool.verbindung')), vChip),
      el('div.zeilen',
        zeile(t('pool.pool'), v.pool), zeile(t('pool.minerImPool'), v.miner),
        zeile(t('pool.angenommen'), v.gut), zeile(t('pool.abgelehnt'), v.schlecht),
        zeile(t('pool.anteil'), v.anteil), zeile(t('pool.auszahlung'), v.auszahlung)),
      vFehler,
      el('p.hinweis', t('pool.nieSolo'))));

  const wurzel = el('div.stapel',
    kopf(t('min.titel'), t('min.sub'), zustand, start),
    el('div.spalten',
      el('section.karte', { style: 'flex:1 1 440px;gap:18px', 'aria-label': t('min.einstellungen') },
        el('div.feldgruppe', el('span.feldname', t('min.ziel')), zielWahl, zielHinweis),
        poolFeld,
        el('fieldset.feldgruppe', { style: 'border:0;margin:0;padding:0' }, el('legend.feldname', { style: 'padding:0;margin-bottom:6px' }, t('min.gehtAn')),
          wahlWallet, wahlAndere, adresse),
        el('div.feldgruppe', el('span.feldname', t('min.geraet')), geraet),
        cpuKasten, gpuKasten,
        nameFeld,
        gesperrt),
      el('div', { style: 'flex:1 1 400px;min-width:0' }, spalteSolo, spaltePool)));

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

  function zeigePool(s) {
    const m = s.mining, p = m.pool;
    const c = m.cpu, g = m.gpu;

    // Warum das Mining im Pool von selbst geendet hat -- bleibt bis zum nächsten Start stehen.
    const e = m.poolEnde;
    ende.hidden = !e || m.running;
    if (e && !m.running) {
      const schluessel = 'pool.ende.' + e.code;
      const grund = t(schluessel);
      fuelle(ende, zeichen('warnung', 18), el('span', el('strong', t('pool.endeTitel', e.pool)), ' ', grund !== schluessel ? grund : e.text));
    }

    const seit = Math.max(c?.uptimeSeconds ?? 0, g?.uptimeSeconds ?? 0);
    text(lGesamt, m.running ? leistung(m.totalHashrate) : '—');
    text(lSeit, m.running ? t('pool.gesamtSeit', dauer(seit)) : t('min.nochNicht'));
    text(lCpu, c?.running ? leistung(c.hashrate) : '—');
    text(lGpu, g?.running ? leistung(g.hashrate) : '—');
    verlauf.setze(m.running && p ? m.verlauf : []);

    // Vor dem Start stehen hier die Angaben des gewählten Pools aus der Liste.
    const wahl = p ? { ...p.stand, anzeige: p.name } : pools?.find(x => x.host === poolHost) ?? null;
    fuelle(vChip, p ? (p.verbunden ? chip('gruen', t('pool.verbunden'), true) : chip('gelb', t('pool.gestoert'), true)) : chip('', t('pool.getrennt')));
    text(v.pool, p?.name ?? wahl?.anzeige ?? '—');
    text(v.miner, wahl && wahl.plaetze !== null ? zahl(wahl.belegt) + ' / ' + zahl(wahl.plaetze) : '—');
    text(v.gut, p ? zahl(p.angenommen) : '—');
    text(v.schlecht, p ? zahl(p.abgelehnt) : '—');
    // Geschätzt aus zwei Messungen: der eigenen und der des Pools.
    const anteil = p && m.totalHashrate > 0 && p.stand.hashrate > 0 ? Math.min(1, m.totalHashrate / p.stand.hashrate) : null;
    text(v.anteil, anteil !== null ? t('pool.rund', Math.max(1, Math.round(anteil * 100))) : '—');
    const a = p?.auszahlung;
    fuelle(v.auszahlung, a
      ? [el('span.mono.gut', '+' + ysr(a.betrag)), el('span.blass', ' · '), el('a', { href: '#/blockchain/' + a.hoehe }, t('kette.block', zahl(a.hoehe)))]
      : '—');
    vFehler.hidden = !(p && p.fehler);
    if (p && p.fehler) text(vFehler, t('pool.fehlerZuletzt', p.fehler));
  }

  function aktualisiere(s) {
    const m = s.mining;
    if (!gefuellt) {
      adresse.value = m.config.address || '';
      // Mit eigener Wallet ist sie die Vorgabe -- außer es wurde bewusst eine andere Adresse eingetragen.
      setzeEmpfaenger(!!s.wallet.adresse && (!m.config.address || m.config.address === s.wallet.adresse));
      modus = m.config.mode; geraet.setze(modus);
      kerne.max = m.cores; kerne.value = Math.min(m.cores, m.config.cpuWorkers);
      last.value = m.config.cpuIntensity;
      name.value = m.config.blockName || '';
      text(kerneText, t('min.kerneVon', kerne.value, kerne.max)); text(lastText, last.value + ' %');
      ziel = m.config.ziel === 'pool' ? 'pool' : 'solo'; zielWahl.setze(ziel);
      poolHost = m.config.poolHost || '';
      // Ein Pool, der nicht in der Liste steht, wurde von Hand eingetragen.
      if (poolHost && m.poolListe && !m.poolListe.includes(poolHost)) { eigenHost = poolHost; eigen.value = poolHost; }
      zeigeName(); zeigeKaesten();
      gefuellt = true;
      zeigeZiel();
    }
    // Läuft das Mining, gilt, was läuft -- nicht, was gerade angeklickt ist.
    if (m.running) {
      const jetzt = m.pool ? 'pool' : 'solo';
      if (jetzt !== ziel) { ziel = jetzt; zielWahl.setze(ziel); zeigeZiel(); return; }
      if (m.pool && m.pool.host !== poolHost) { poolHost = m.pool.host; zeigePools(); }
    }
    if (laeuft !== m.running) { laeuft = m.running; zeigePools(); }

    const pool = ziel === 'pool';
    const bereit = pool ? true : m.startklar?.bereit;
    const poolFehlt = pool && !poolHost;
    fuelle(zustand, m.running ? chip('blau hoch', t('min.laeuftSeitChip', dauer(Math.max(m.cpu?.uptimeSeconds ?? 0, m.gpu?.uptimeSeconds ?? 0))), true)
      : !s.running ? chip('hoch', t('ueb.gestoppt'))
      : bereit && !poolFehlt ? chip('hoch', t('min.bereit')) : chip('gelb hoch', t('min.nichtBereit')));
    fuelle(start, m.running ? t('min.stoppen') : [zeichen('blitz'), t('min.starten')]);
    start.className = 'knopf' + (m.running ? '' : ' haupt');
    start.disabled = beschaeftigt || (!s.running && !m.running) || (!m.running && poolFehlt);
    start.title = m.running || !s.running ? '' : poolFehlt ? t('pool.fehler.pool_fehlt') : !bereit && m.startklar?.grund ? m.startklar.grund : '';

    // Während das Mining läuft, bleiben die Einstellungen stehen.
    for (const f of [adresse, kerne, last, name, gpuWahl, rWallet, rAndere, eigen]) f.disabled = m.running;
    eigenKnopf.disabled = m.running;
    for (const b of zielWahl.children) b.disabled = m.running;
    // Ohne Wallet gibt es nur das Adressfeld.
    wahlWallet.hidden = !s.wallet.adresse; wahlAndere.hidden = !s.wallet.adresse;
    if (!s.wallet.adresse && zielWallet) setzeEmpfaenger(false);
    text(walletAdr, kurzAdresse(s.wallet.adresse));
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

    if (pool) return zeigePool(s);

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

  function verlasse() { if (listeTakt) clearInterval(listeTakt); listeTakt = null; }

  return { wurzel, aktualisiere, verlasse };
}
