/*
 * Der Verlauf der Kette: Zeit und Merkmale jedes Blocks seit Block 0. Daraus entstehen das Band der Startseite,
 * das Logbuch, die Zeitachsen und die Tageswerte der Netzseite.
 *
 * Grundstock ist assets/data/kette.js (Stand beim letzten Auffrischen, siehe tools/kette.mjs). Die 50 neuesten Blöcke
 * kommen mit jedem Stand der Kette dazu. Liegt dazwischen eine Lücke, liest eine Seite, die den Verlauf zeigt, die
 * fehlenden Blöcke aus der öffentlichen API nach: 50 je Abruf, höchstens MAX_PAGES Abrufe je Seitenaufruf.
 * Gespeichert wird davon im Browser nichts. Je frischer die Datei, desto weniger ist nachzuladen.
 *
 * Solange noch etwas fehlt, tragen diese Blöcke das Merkmal 8 ("Ort geschätzt"): Sie liegen gleichmäßig verteilt
 * zwischen dem letzten bekannten und dem ältesten der 50 neuesten. Tageswerte und Summen rechnen nur mit lückenlos
 * bekannten Blöcken; bis wohin das reicht, sagt exactTip().
 *
 * Je Block:  T[i]  Sekunden seit Block 0
 *            F[i]  Merkmale: Bit 0-1 Finder (0 allein, 1 YSKAR MAIN, 2 Gozero, 3 anderer Pool), 4 trägt Überweisungen, 8 Ort geschätzt
 */
var Chain = (function () {
  'use strict';
  var H = window.YSKAR_SNAPSHOT.history, PAGE = 50, MAX_PAGES = 12, STEP = 24, RECENT = 6;
  var T = [], F = [], n = 0, t0 = H.t0;
  var exact = 0;                 // die Blöcke 0 … exact-1 sind lückenlos bekannt
  var D = {};                    // Difficulty je Block ab H.tail.from (Höhe -> Wert)
  var X = {};                    // Zahl der Überweisungen je Block, nur wo > 0 und nur für nachgeladene Blöcke
  var agg = null, busy = false, pages = 0, version = 0, wanted = false;

  function b64(s) { var bin = atob(s), a = new Uint8Array(bin.length), i; for (i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
  function cls(b) { return b.finder === 'Gozero' ? 2 : b.finder === 'YSKAR MAIN' ? 1 : ((b.recipients || 1) === 1 ? 0 : 3); }

  function load() {
    var dt = b64(H.dt), fl = b64(H.fl), i, t = 0, d;
    for (i = 0; i < H.n; i++) {
      d = dt[2 * i] | (dt[2 * i + 1] << 8); if (d & 0x8000) d -= 0x10000;
      t = i === 1 && H.t1 ? H.t1 - H.t0 : t + d;       // der Abstand von Block 0 zu Block 1 passt nicht in 16 Bit
      T.push(t); F.push(fl[i]);
    }
    n = exact = H.n;
    H.tail.d.forEach(function (v, k) { D[H.tail.from + k] = v; });
  }
  /** Einen Block mit allen Angaben (Antwort der API) an die lückenlose Reihe hängen. */
  function add(b) {
    var h = b.height, x = (b.txCount || 1) - 1, c = cls(b);
    T[h] = Number(b.timestamp) - t0; F[h] = c | (x > 0 ? 4 : 0);
    D[h] = Number(b.difficultyWert);
    if (x > 0) X[h] = x;
    exact = h + 1; if (n < exact) n = exact;
  }

  /** Einen schon bekannten Block durch den ersetzen, den die Kette jetzt an dieser Höhe führt. */
  function again(b) {
    var keep = exact;
    if (X[b.height]) delete X[b.height];
    add(b); exact = keep;
  }

  /* ---- die 50 neuesten Blöcke einarbeiten, Lücke dazwischen vorläufig schätzen ---- */
  function sync() {
    var b = Live.S.blocks, tip = b[0] && b[0].height, lo, i, h, before = n + ':' + exact, from, to, span, changed = false;
    if (typeof tip !== 'number' || tip + 1 < exact) return;
    lo = b[b.length - 1].height;
    if (lo <= exact) {
      // Die jüngsten Blöcke können noch ersetzt worden sein (ein anderer Zweig hat sich durchgesetzt): neu übernehmen
      for (i = b.length - 1; i >= 0; i--) {
        h = b[i].height;
        if (h >= H.n && h < exact && h >= exact - RECENT && (T[h] !== Number(b[i].timestamp) - t0 || D[h] !== Number(b[i].difficultyWert))) { again(b[i]); changed = true; }
      }
      for (i = b.length - 1; i >= 0; i--) if (b[i].height === exact) add(b[i]);
      n = exact;
    } else {
      // Lücke: Blöcke exact … lo-1 fehlen noch. Die neuesten stehen schon an ihrem echten Ort.
      from = T[exact - 1]; to = Number(b[b.length - 1].timestamp) - t0; span = lo - exact + 1;
      for (h = exact; h < lo; h++) { T[h] = from + (to - from) * (h - exact + 1) / span; F[h] = 8; }
      for (i = b.length - 1; i >= 0; i--) { h = b[i].height; T[h] = Number(b[i].timestamp) - t0; F[h] = cls(b[i]) | (b[i].txCount > 1 ? 4 : 0); }
      n = tip + 1; T.length = F.length = n;
      if (wanted) fill();
    }
    if (changed || n + ':' + exact !== before) { agg = null; version++; }
  }
  /** Die Lücke von unten her schließen: je Abruf 50 Blöcke, einer nach dem anderen, höchstens MAX_PAGES je Seitenaufruf. */
  function fill() {
    if (busy || !wanted || Live.S.mode !== 'live' || pages >= MAX_PAGES) return;
    var lo = Live.S.blocks[Live.S.blocks.length - 1].height;
    if (exact >= lo) return;
    busy = true; pages++;
    Live.get('/blocks?limit=' + PAGE + '&before=' + (exact + PAGE), 12000).then(function (r) {
      var list = (r && r.blocks) || [], i, got = 0;
      for (i = list.length - 1; i >= 0; i--) if (list[i].height === exact && list[i].timestamp !== undefined) { add(list[i]); got++; }
      busy = false;
      if (!got) return;                                           // unerwartete Antwort: nicht weiterfragen
      agg = null; version++;
      var lo2 = Live.S.blocks[Live.S.blocks.length - 1].height;
      if (exact >= lo2 || pages >= MAX_PAGES) { sync(); U.emit('chain'); }
      else setTimeout(fill, 120);
    }, function () { busy = false; });
  }

  /* ---- Tageswerte, Difficulty-Reihe, Summen: aus den lückenlos bekannten Blöcken ---- */
  function compute() {
    var days = [], cur = null, i, day, c, work, j, k, sum, cnt, tx = H.transfers, fa = { solo: 0, main: 0, gozero: 0, other: 0 }, f1 = { solo: 0, main: 0, gozero: 0, other: 0 };
    var NAME = ['solo', 'main', 'gozero', 'other'];
    for (i = 1; i < exact; i++) {
      // Tag in UTC. Ein Block darf eine frühere Zeit tragen als sein Vorgänger; er zählt dann zum laufenden Tag.
      day = Math.max(cur ? cur.day : 0, Math.floor((t0 + T[i]) / 86400));
      if (!cur || cur.day !== day) { cur = { day: day, h0: i, h1: i, n: 0, main: 0, gozero: 0, solo: 0, other: 0 }; days.push(cur); }
      c = NAME[F[i] & 3]; cur[c]++; cur.n++; cur.h1 = i; fa[c]++;
      if (i >= exact - 1000) f1[c]++;
    }
    days.forEach(function (d) {
      var span = T[d.h1] - T[d.h0 - 1];
      d.d = new Date(d.day * 86400000).toISOString().slice(0, 10);
      d.bt = Math.round(span / d.n * 10) / 10;
      if (d.h0 >= H.tail.from) { work = 0; for (j = d.h0; j <= d.h1; j++) work += D[j] || 0; }
      else work = H.work[d.day];
      d.hr = span > 0 && work ? Math.round(work * 65536 / span) : null;
    });
    // Difficulty: Mittel je 24 Blöcke; abgeschlossene Abschnitte aus dem Grundstock, der Rest aus den Einzelwerten
    var series = H.series.slice(), start = series.length ? series[series.length - 1][0] + 1 : 1;
    for (k = start; k < exact; k += STEP) {
      sum = 0; cnt = 0;
      for (j = k; j < k + STEP && j < exact; j++) { sum += D[j] || 0; cnt++; }
      if (cnt) series.push([k + cnt - 1, Math.round(sum / cnt)]);
    }
    for (i in X) if (+i < exact) tx += X[i];
    return {
      daily: days, series: series,
      totals: {
        blocks: exact, transfers: tx, finders: fa, finders1000: f1,
        avgBlockTime: exact > 2 ? Math.round((T[exact - 1] - T[1]) / (exact - 2) * 10) / 10 : 600
      }
    };
  }
  function A() { return agg || (agg = compute()); }

  function init() {
    sync();
    U.on('data', sync);
  }
  load();
  return {
    init: init,
    /** Eine Baugruppe zeigt den Verlauf: fehlende Blöcke nachladen (sonst bleibt es bei Grundstock und neuesten Blöcken). */
    want: function () { if (!wanted) { wanted = true; fill(); } },
    get: function () { return { T: T, F: F, n: n, t0: t0, v: version }; },
    daily: function () { return A().daily; }, series: function () { return A().series; }, totals: function () { return A().totals; },
    /** Höhe des letzten Blocks, bis zu dem der Verlauf lückenlos bekannt ist. */
    exactTip: function () { return exact - 1; },
    /** Zeitpunkt eines Blocks (Unix-Sekunden), sofern bekannt und nicht nur geschätzt. */
    timeOf: function (h) { return h >= 0 && h < n && !(F[h] & 8) ? t0 + T[h] : null; }
  };
})();
