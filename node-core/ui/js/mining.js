/* Mining: mit Prozessor und Grafikkarte an neuen Blöcken rechnen -- solo oder im Pool. */
import { hole, sende, el, fuelle, text, zeile, chip, knopf, kopf, melde, zahl, ysr, leistung, dauer, tagOderZeit, zeichen, segment, kurzAdresse, knotenText, kopfKarte, kennzahl } from './kern.js';
import { bild } from './bilder.js';
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
  /*
   * Die Grafikkarten zum Ankreuzen. Jede gewählte Karte rechnet mit eigenem
   * Programm und eigenem Nonce-Bereich (GpuGruppe im Kern).
   */
  const gpuListe = el('div.stapel', { id: 'm-gpu', style: 'gap:8px' });
  const gpuListeName = el('span.feldname', t('min.karte'));
  let gpuGewaehlt = null;   // Set der Kartennummern -- null, bis der Stand einmal da war
  const gpuGrund = el('p.hinweis');
  const gpuKasten = el('div.box.stapel', { style: 'gap:12px' },
    el('div.karte-kopf', el('h3', t('min.gpu')), gpuChip),
    el('div.feldgruppe', gpuListeName, gpuListe),
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
    spaltePool.hidden = !pool;
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
      // Nur wenn der Pool Geld haelt (Sammelauszahlung, CONSENSUS_V6.md 13).
      p.modus === 'batch' ? el('span.hinweis', t('pool.haeltGuthaben')) : null,
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

  /** Die angekreuzten Karten, in der Reihenfolge der Liste. */
  function gpuAuswahl() {
    return [...gpuListe.querySelectorAll('input[type=checkbox]')].filter(b => b.checked).map(b => Number(b.value));
  }

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
          gpuDevices: gpuAuswahl(), gpuDevice: gpuAuswahl()[0] ?? 0, blockName: name.value.trim(),
        });
        if (r.hinweise?.length) melde(r.hinweise.map((h, i) => knotenText(r.hinweisCodes?.[i]?.code, r.hinweisCodes?.[i]?.werte, h)).join(' '));
      }
      await ctx.neuLaden();
    } catch (e) { melde(fehlerText(e), true); if (ziel === 'pool') { pools = null; ladeListe(); } }
    beschaeftigt = false; start.disabled = false;
  }

  // ------------------------------------------------------------ Aufbau
  /*
   * Oben die Leistung gross und mittig, darunter die Ziel-Zeile. Die
   * Einstellungen liegen in einem Seitenfeld ("Ändern") -- gesperrt,
   * solange das Mining läuft.
   */
  const held = { zahl: el('div.zahl', '0', el('small', 'MH/s')), meta: el('p.held-satz'), bild: bild('mining', 260) };
  const kzGeraete = kennzahl(t('min.geraete'));
  const kzZiel = kennzahl(t('min.ziel')), kzEmpf = kennzahl(t('min.gehtAn')), kzName = kennzahl(t('min.name'));
  const zz = { ziel: kzZiel.wert, empf: kzEmpf.wert, name: kzName.wert, nameZelle: kzName.wurzel };
  const geraeteListe = el('div');
  const geraeteSumme = el('div.gr-summe');
  const erw = el('div.zeilen');
  const erwHinweis = el('p.hinweis');
  const verlaufKopf = el('span.mut.mono', { style: 'font-size:11px;letter-spacing:.06em;text-transform:uppercase' });

  const seitenfeld = el('aside.seitenfeld', { hidden: true, 'aria-label': t('min.einstellen') },
    el('div.dialog-kopf', el('h2', t('min.einstellen')), el('button.x', { type: 'button', 'aria-label': t('allg.schliessen'), onclick: () => { seitenfeld.hidden = true; } }, zeichen('kreuz', 14))),
    el('div.seitenfeld-inhalt',
      gesperrt,
      el('div.feldgruppe', el('span.feldname', t('min.ziel')), zielWahl, zielHinweis),
      poolFeld,
      el('fieldset.feldgruppe', { style: 'border:0;margin:0;padding:0' }, el('legend.feldname', { style: 'padding:0;margin-bottom:6px' }, t('min.gehtAn')),
        wahlWallet, wahlAndere, adresse, el('p.hinweis', t('min.nurNormale'))),
      el('div.feldgruppe', el('span.feldname', t('min.geraet')), geraet),
      cpuKasten, gpuKasten,
      nameFeld),
    el('div.dialog-fuss', el('span.hinweis', t('min.giltBeimStart')), knopf(t('min.fertig'), () => { seitenfeld.hidden = true; aktualisiere(ctx.stand()); }, 'haupt')));

  const spalteSolo = el('div');
  const spaltePool = el('section.karte', { 'aria-label': t('pool.verbindung') },
    el('div.karte-kopf', el('h2', t('pool.verbindung')), vChip),
    el('div.zeilen',
      zeile(t('pool.pool'), v.pool), zeile(t('pool.minerImPool'), v.miner),
      zeile(t('pool.angenommen'), v.gut), zeile(t('pool.abgelehnt'), v.schlecht),
      zeile(t('pool.anteil'), v.anteil), zeile(t('pool.auszahlung'), v.auszahlung)),
    vFehler,
    el('p.hinweis', t('pool.nieSolo')));

  const wurzel = el('div.stapel',
    kopf(t('min.titel'), t('min.sub'), zustand),
    ende,
    kopfKarte([el('span.cap', t('min.deineLeistung')), held.zahl, held.meta,
      el('div.held-knoepfe', start, knopf([zeichen('regler', 14), t('min.zielAendern')], () => { seitenfeld.hidden = false; }))],
      held.bild, [kzZiel, kzEmpf, kzGeraete, kzName]),
    el('div.mn-2',
      el('section.karte', { 'aria-label': t('min.geraete') },
        el('div.karte-kopf', el('h2', t('min.geraete')), el('span.blass', { style: 'font-size:12px' }, t('min.gemessen'))),
        geraeteListe, geraeteSumme),
      el('section.karte', { 'aria-label': t('min.erwartung') },
        el('div.karte-kopf', el('h2', t('min.erwartung')), chip('', t('min.schaetzungChip'))),
        erw, erwHinweis)),
    el('section.karte', { 'aria-label': t('min.leistung') },
      el('div.karte-kopf', el('h2', t('min.leistung')), verlaufKopf),
      verlauf.wurzel),
    spaltePool,
    el('section.karte', { 'aria-label': t('min.funde') },
      el('div.karte-kopf', el('h2', t('min.funde')), fundeKopf),
      funde),
    seitenfeld);

  // --------------------------------------------- Kopf, Ziel-Zeile, Geräte
  /** Modus aus den Schaltern: Prozessor an/aus, Karten an/aus. */
  function setzeModus(cpuAn, gpuAn) {
    if (!cpuAn && !gpuAn) return false;
    modus = cpuAn && gpuAn ? 'beide' : gpuAn ? 'gpu' : 'cpu';
    geraet.setze(modus); zeigeKaesten();
    for (const b of gpuListe.querySelectorAll('input[type=checkbox]')) b.checked = gpuGewaehlt?.has(Number(b.value)) ?? false;
    return true;
  }

  function zeigeKopf(s) {
    const m = s.mining, laeuftJetzt = m.running;
    const [wert, einheit] = (laeuftJetzt ? leistung(m.totalHashrate) : '0 MH/s').split(' ');
    fuelle(held.zahl, wert, el('small', einheit));
    held.zahl.className = 'zahl' + (laeuftJetzt ? '' : ' aus');
    held.bild.classList.toggle('still', !laeuftJetzt);
    const imPool = ziel === 'pool';
    const p = m.pool;
    const poolName = p?.name ?? pools?.find(x => x.host === poolHost)?.anzeige ?? poolHost ?? '—';
    const karten = m.gpuErkennung?.geraete ?? [];
    const nGpu = modus === 'cpu' ? 0 : karten.filter(k => gpuGewaehlt?.has(k.id)).length;
    const kerneZahl = modus === 'gpu' ? 0 : Number(kerne.value);
    const geraete = [nGpu ? t('min.nGrafik', nGpu) : null, kerneZahl ? t('min.nKerne', kerneZahl) : null].filter(Boolean).join(' + ');
    const anteil = laeuftJetzt && m.totalHashrate > 0
      ? (imPool && p?.stand?.hashrate > 0 ? Math.min(1, m.totalHashrate / p.stand.hashrate) : s.netzHashrate > 0 ? Math.min(1, m.totalHashrate / Math.max(m.totalHashrate, s.netzHashrate)) : null)
      : null;
    const pct = a => (a * 100).toLocaleString(sprache() === 'en' ? 'en-GB' : 'de-DE', { maximumFractionDigits: a < 0.1 ? 1 : 0 }) + ' %';
    const hoehe = m.cpu?.height ?? m.gpu?.height ?? null;
    const teile = [
      el('span', imPool ? [t('pool.pool') + ' ', el('b', poolName)] : el('b', t('min.solo'))),
      anteil !== null ? el('span', t('min.deinAnteil') + ' ', el('b', pct(anteil))) : null,
      geraete ? el('span', el('b', geraete)) : null,
      laeuftJetzt && hoehe !== null ? el('span', t('min.arbeitetAn') + ' ', el('b', t('kette.block', zahl(hoehe)))) : null,
    ].filter(Boolean);
    const mitTrenner = [];
    teile.forEach((x, i) => { if (i) mitTrenner.push(el('span.sep', '·')); mitTrenner.push(x); });
    fuelle(held.meta, mitTrenner);
    text(kzGeraete.wert, geraete || '—');
    text(kzGeraete.unter, laeuftJetzt ? t('min.gemessen') : t('min.giltBeimStart'));

    // Ziel-Zeile
    const fee = (p?.stand?.feeBps ?? pools?.find(x => x.host === poolHost)?.feeBps);
    text(zz.ziel, imPool ? poolName : t('min.solo'));
    text(kzZiel.unter, imPool ? t('pool.pool') + (fee != null ? ' · ' + t('min.gebuehrKurz', prozent(fee)) : '') : t('min.soloUnter'));
    text(kzEmpf.unter, zielWallet ? kurzAdresse(s.wallet.adresse) : '');
    fuelle(zz.empf, zielWallet ? t('min.meineWallet') : el('span.mono', kurzAdresse(adresse.value.trim()) || '—'));
    text(zz.name, name.value.trim() || '—');
    zz.nameZelle.hidden = imPool;
    text(kzName.unter, t('min.nameUnter'));
  }

  function geraetZeile(z, titel, unter, hashrate, summe, an, wennSchalter, warn = false) {
    const sch = el('button.schalter', { type: 'button', role: 'switch', 'aria-checked': an ? 'true' : 'false', 'aria-label': titel, disabled: laeuft });
    sch.addEventListener('click', () => { if (!laeuft) wennSchalter(sch.getAttribute('aria-checked') !== 'true'); });
    const anteil = summe > 0 ? Math.round(hashrate / summe * 100) : 0;
    return el('div.gr',
      el('span.ic' + (an ? '' : '.aus') + (warn ? '.warn' : ''), zeichen(z, 17)),
      el('div.mitte', el('b', titel), el('span', unter), el('div.anteil', el('i', { style: 'width:' + anteil + '%' }))),
      el('div.wert', laeuft && an ? leistung(hashrate) : '—'),
      sch);
  }

  function zeigeGeraete(s) {
    const m = s.mining, e = m.gpuErkennung;
    const karten = e?.geraete ?? [];
    const gk = m.gpu?.karten ?? [];
    const summe = m.running ? m.totalHashrate : 0;
    const zeilen = [];
    if (!e?.verfuegbar) {
      zeilen.push(el('div.warnung', { style: 'margin-bottom:6px' }, zeichen('warnung', 16),
        el('span', el('strong', t('min.keineKarteTitel')), ' ', t('min.gpuHinweis'), ' ',
          el('a', { href: '#', onclick: async ev => { ev.preventDefault(); try { await sende('/api/mining/detect'); await ctx.neuLaden(); } catch (err) { melde(err.message, true); } } }, t('min.gpuSuchen')))));
    } else {
      for (const k of karten) {
        const lauf = gk.find(x => x.id === k.id) ?? (gk.length === 0 && m.gpu?.running ? m.gpu : null);
        const an = modus !== 'cpu' && (gpuGewaehlt?.has(k.id) ?? false);
        const fehlerText = lauf && !lauf.running && lauf.lastError ? ' · ' + t('min.karteAus') : '';
        zeilen.push(geraetZeile('karte', k.name, t('min.cudaBereit') + (k.vram ? ' · ' + (k.vram / 1073741824).toFixed(0) + ' GB' : '') + (k.emulation ? ' · ' + t('min.nachbildung') : '') + fehlerText,
          lauf?.running ? lauf.hashrate : 0, summe, an, neu => {
            if (gpuGewaehlt === null) gpuGewaehlt = new Set();
            if (neu) gpuGewaehlt.add(k.id); else gpuGewaehlt.delete(k.id);
            const gpuAn = karten.some(x => gpuGewaehlt.has(x.id));
            if (!setzeModus(modus !== 'gpu', gpuAn)) { gpuGewaehlt.add(k.id); }
            aktualisiere(ctx.stand());
          }, !!fehlerText));
      }
    }
    const cpuAn = modus !== 'gpu';
    zeilen.push(geraetZeile('chip', t('min.cpu'), t('min.kerneVon', kerne.value, kerne.max) + ' · ' + t('min.lastHinweis'),
      m.cpu?.running ? m.cpu.hashrate : 0, summe, cpuAn, neu => {
        const gpuAn = modus !== 'cpu' && karten.some(x => gpuGewaehlt?.has(x.id));
        if (setzeModus(neu, gpuAn)) aktualisiere(ctx.stand());
      }));
    fuelle(geraeteListe, zeilen);
    fuelle(geraeteSumme, el('span', t('min.zusammen')), el('b', m.running ? leistung(summe) : '—'));
  }

  function zeigeErwartung(s) {
    const m = s.mining, p = m.pool, eig = m.running ? m.totalHashrate : 0;
    const imPool = ziel === 'pool';
    const anteilNetz = eig > 0 && s.netzHashrate > 0 ? Math.min(1, eig / Math.max(eig, s.netzHashrate)) : null;
    const zeilenListe = [];
    if (imPool) {
      const anteil = p && eig > 0 && p.stand?.hashrate > 0 ? Math.min(1, eig / p.stand.hashrate) : null;
      const lohn = BigInt(s.naechsteBelohnung ?? '0');
      const fee = BigInt(p?.stand?.feeBps ?? 0);
      const jeBlock = anteil !== null ? (lohn * (10000n - fee) / 10000n) * BigInt(Math.round(anteil * 1e6)) / 1000000n : null;
      zeilenListe.push(zeile(t('min.anteilPool'), anteil !== null ? t('pool.rund', Math.max(1, Math.round(anteil * 100))) : '—', true));
      zeilenListe.push(zeile(t('min.jePoolblock'), jeBlock !== null ? el('span.mono.gut', t('min.etwa', ysr(jeBlock, 2))) : '—'));
    } else {
      zeilenListe.push(zeile(t('min.deine'), eig > 0 ? leistung(eig) : '—', true));
      zeilenListe.push(zeile(t('ueb.netz'), s.netzHashrate ? leistung(s.netzHashrate) : '—', true));
    }
    zeilenListe.push(zeile(imPool ? t('min.soloVergleich') : t('min.soloBlock'), anteilNetz ? t('min.etwaAlle', dauer(s.zielBlockzeit / anteilNetz)) : '—'));
    fuelle(erw, zeilenListe);
    text(erwHinweis, eig > 0 ? t('min.erwartungHinweis', s.netzHashrate ? leistung(s.netzHashrate) : '—') : t('min.schaetzungOhne'));
    verlauf.setze(m.running ? m.verlauf : []);
    text(verlaufKopf, m.running && m.verlauf?.length > 1 ? t('min.verlaufSpanne', leistung(Math.min(...m.verlauf.map(x => x.hashrate))), leistung(Math.max(...m.verlauf.map(x => x.hashrate)))) : '');
  }

  async function ladeFunde(adr) {
    try {
      const k = await hole('/api/lesen/account/' + adr);
      text(fundeKopf, t('min.fundeZahl', k.blocksFound));
      const liste = k.history.filter(h => h.kind === 'reward').slice(0, 8);
      fuelle(funde, liste.length ? el('div.tab-huelle', el('table.tab',
        el('thead', el('tr', el('th', t('kette.hoehe')), el('th', t('kette.zeit')), el('th.r', t('kette.betrag')))),
        el('tbody', liste.map(h => el('tr.wahl', { onclick: () => ctx.gehe('blockchain/' + h.height) },
          el('td.mono', zahl(h.height)), el('td.blass', tagOderZeit(h.timestamp)), el('td.r.mono.gut', '+ ' + ysr(h.amount) + ' YSR'))))))
        : el('p.hinweis', t('min.fundeKeine')));
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
    // Mit mehreren Karten: wie viele davon rechnen.
    const gk = g?.karten ?? [];
    text(lGpu, g?.running ? leistung(g.hashrate) + (gk.length > 1 ? ' · ' + t('min.nKarten', gk.filter(k => k.running).length, gk.length) : '') : '—');

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
    start.title = m.running || !s.running ? '' : poolFehlt ? t('pool.fehler.pool_fehlt')
      : !bereit && m.startklar?.grund ? knotenText(m.startklar.code, m.startklar.werte, m.startklar.grund) : '';

    // Während das Mining läuft, bleiben die Einstellungen stehen.
    for (const f of [adresse, kerne, last, name, rWallet, rAndere, eigen, ...gpuListe.querySelectorAll('input')]) f.disabled = m.running;
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
    // Beim ersten Stand: die zuletzt gewählten Karten.
    if (gpuGewaehlt === null) gpuGewaehlt = new Set(m.config.gpuDevices ?? [m.config.gpuDevice ?? 0]);
    const wahl = JSON.stringify(karten.map(g => [g.id, g.name]));
    if (gpuListe.dataset.bild !== wahl) {
      gpuListe.dataset.bild = wahl;
      // Keine der gewählten Karten (mehr) da: die erste.
      if (karten.length && !karten.some(g => gpuGewaehlt.has(g.id))) gpuGewaehlt = new Set([karten[0].id]);
      text(gpuListeName, karten.length > 1 ? t('min.karten') : t('min.karte'));
      fuelle(gpuListe, karten.length ? karten.map(g => {
        const box = el('input', { type: 'checkbox', value: g.id, checked: gpuGewaehlt.has(g.id) });
        box.addEventListener('change', () => {
          if (box.checked) gpuGewaehlt.add(g.id); else gpuGewaehlt.delete(g.id);
          // Mindestens eine Karte bleibt gewählt.
          if (gpuGewaehlt.size === 0) { gpuGewaehlt.add(g.id); box.checked = true; }
        });
        return el('label.box.wahl', box, el('span', { style: 'font-size:13.5px' },
          g.name + (g.vram ? ' · ' + (g.vram / 1073741824).toFixed(0) + ' GB' : '') + (g.emulation ? ' · ' + t('min.nachbildung') : '')));
      }) : el('p.hinweis', t('min.keineKarte')));
      if (karten.length > 1) gpuListe.append(el('p.hinweis', t('min.kartenHinweis')));
    }
    text(gpuGrund, e && !e.verfuegbar && e.grund ? knotenText(e.grundCode, [], e.grund) : (m.gpu?.lastError ? t('min.letzterFehler', m.gpu.lastError) : t('min.gpuHinweis')));
    if (!e?.verfuegbar && modus !== 'cpu' && !m.running) { modus = 'cpu'; geraet.setze('cpu'); zeigeKaesten(); }

    zeigeKopf(s); zeigeGeraete(s); zeigeErwartung(s);
    spaltePool.hidden = !pool;
    if (pool) zeigePool(s);
    zeigeFunde(s);
    if (pool) return;

  }

  /** Funde und Auszahlungen: nur neu holen, wenn sich Adresse oder Höhe geändert haben. */
  function zeigeFunde(s) {
    const m = s.mining;
    const adr = (m.config.address || '').trim();
    if (s.running && adr && (adr !== fundeFuer || s.height !== fundeHoehe)) { fundeFuer = adr; fundeHoehe = s.height; ladeFunde(adr); }
    if (!adr) { text(fundeKopf, ''); fuelle(funde, el('p.hinweis', t('min.fundeOhneAdresse'))); }
  }

  /*
   * Zeilen der Grafikkarten in den Messwerten: mit mehreren Karten eine
   * Zeile je Karte und darüber die Summe, sonst wie bisher eine Zeile.
   */
  function gpuZeilen(g, karten) {
    const name = id => karten.find(k => k.id === id)?.name ?? ('GPU ' + id);
    const zeileFuer = (titel, x) => el('tr', el('td', ...titel),
      el('td.r.mono', x?.running ? leistung(x.hashrate) : '—'), el('td.r.mono', x ? zahl(x.hashes) : '—'), el('td.r.mono', x ? zahl(x.errors) : '—'));
    const einzeln = g?.karten ?? [];
    if (einzeln.length <= 1) {
      const k = einzeln[0];
      return [zeileFuer([t('min.gpu'), g?.running ? el('span.blass', ' · ' + (k ? name(k.id) : karten[0]?.name ?? '')) : null], g)];
    }
    return [
      zeileFuer([t('min.gpu'), el('span.blass', ' · ' + t('min.nKarten', einzeln.filter(k => k.running).length, einzeln.length))], g),
      ...einzeln.map(k => zeileFuer([el('span.blass', '└ '), name(k.id), !k.running && k.lastError ? el('span.blass', ' · ' + t('min.karteAus')) : null], k)),
    ];
  }

  function verlasse() { if (listeTakt) clearInterval(listeTakt); listeTakt = null; }

  return { wurzel, aktualisiere, verlasse };
}
