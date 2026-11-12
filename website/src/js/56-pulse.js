/*
 * Explorer: die Kette als Zeitachse. Jedes Licht ist ein Block, der Abstand zweier Lichter ist die Zeit zwischen ihnen,
 * warme Lichter trugen Überweisungen. Zwei Ansichten:
 *   tip    – die letzten Stunden bis jetzt; rechts wartet der nächste Block, die Uhr zählt die Zeit seit dem letzten.
 *   around – die Stunden rund um einen bestimmten Block (in der Blockansicht), dieser Block ist hervorgehoben.
 * Die Zeiten stammen aus denselben Daten wie das Band der Startseite (43-walk.js).
 */
var Pulse = (function () {
  'use strict';
  function C() { return Chain.get(); }
  function sprite(r, g, b) {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var x = c.getContext('2d'), grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.14, 'rgba(' + r + ',' + g + ',' + b + ',.9)');
    grd.addColorStop(0.45, 'rgba(' + r + ',' + g + ',' + b + ',.2)');
    grd.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    x.fillStyle = grd; x.fillRect(0, 0, 64, 64);
    return c;
  }
  function make() {
    Chain.want();
  var root, hEl, nowEl, stage, canvas, ctx, tip, next;
  var mode = 'tip', center = 0, W = 0, H = 112, dpr = 1, span = 21600, padR = 0, t0win = 0, t1win = 0;
  var pts = [], hover = -1, picked = -1, timer = 0, raf = 0, sprites = null, lastTip = -1, wasLive = false, born = {}, fontOk = false, calm = false;

  function build() {
    hEl = U.el('h2', { 'class': 'pulse__h' });
    nowEl = U.el('p', { 'class': 'pulse__now', role: 'status' });
    canvas = U.el('canvas', { role: 'img' });
    next = U.el('i', { 'class': 'pulse__next', 'aria-hidden': 'true' });
    tip = U.el('div', { 'class': 'walk-tip', hidden: '' }, [
      U.el('p', { 'class': 'walk-tip__h mono', 'data-f': 'h' }), U.el('p', { 'data-f': 't' }), U.el('p', { 'class': 'faint', 'data-f': 'who' }),
      U.el('a', { href: Router.href('#explorer') })]);
    stage = U.el('div', { 'class': 'pulse__stage' }, [canvas, next, tip]);
    root = U.el('div', { 'class': 'pulse' }, [U.el('div', { 'class': 'pulse__head' }, [hEl, nowEl]), stage]);
    ctx = canvas.getContext('2d');
    sprites = { cool: sprite(120, 190, 255), warm: sprite(255, 186, 110), here: sprite(255, 214, 160) };
    calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (window.ResizeObserver) new ResizeObserver(size).observe(stage); else window.addEventListener('resize', size);
    pointer();
    U.on('data', refresh);
    U.on('lang', refresh);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fontOk = true; draw(); });
    timer = setInterval(tick, 1000);
  }

  /* ---------- Maße und Fenster ---------- */
  function size() {
    var w = Math.round(stage.clientWidth);
    if (!w) return;
    W = w; H = W < 560 ? 104 : 128;
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.style.height = H + 'px';
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    refresh();
  }
  function hours() { return W >= 900 ? 6 : W >= 560 ? 4 : 3; }
  function X(ts) { return (ts - t0win) / (t1win - t0win) * (W - padR); }
  function windowNow() {
    var c = C();
    span = hours() * 3600;
    if (mode === 'tip') { t1win = Live.now(); t0win = t1win - span; padR = 26; }
    else { var tc = c.t0 + c.T[Math.min(c.n - 1, center)]; t0win = tc - span / 2; t1win = tc + span / 2; padR = 0; }
  }
  function collect() {
    var c = C(), i, ts, list = [], y0 = H * 0.44, lvl = 0, prev = -99;
    for (i = c.n - 1; i >= 0; i--) {
      ts = c.t0 + c.T[i];
      if (ts > t1win) continue;
      if (ts < t0win - 5400) break;                 // Zeitstempel dürfen leicht springen, deshalb etwas Luft
      if (ts >= t0win) list.push({ i: i, x: X(ts), y: y0, f: c.F[i] });
    }
    list.sort(function (a, b) { return a.x - b.x; });
    list.forEach(function (p) {                     // sehr dicht beieinander: abwechselnd leicht versetzen
      if (p.x - prev < 8) { lvl = (lvl + 1) % 3; p.y = y0 + [0, -8, 8][lvl]; } else lvl = 0;
      prev = p.x;
    });
    pts = list;
  }

  /* ---------- Zeichnen ---------- */
  function draw() {
    if (!ctx || !W) return;
    var y0 = Math.round(H * 0.44) + 0.5, hrs = hours(), k, x, i, p, s, now = performance.now(), busy = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // die Linie der Zeit: nach links hin verblassend
    var g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(170,198,255,0)'); g.addColorStop(0.1, 'rgba(170,198,255,.2)'); g.addColorStop(1, 'rgba(170,198,255,.26)');
    ctx.strokeStyle = g; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W - (mode === 'tip' ? padR - 8 : 0), y0); ctx.stroke();
    // Stundenmarken
    ctx.font = '500 10px ' + (fontOk ? '"Geist Mono",' : '') + 'ui-monospace,Menlo,Consolas,monospace';
    ctx.fillStyle = 'rgba(212,226,255,.5)'; ctx.strokeStyle = 'rgba(170,198,255,.3)'; ctx.textBaseline = 'alphabetic';
    var half = Math.floor(hrs / 2), mid = (t0win + t1win) / 2;
    for (k = mode === 'tip' ? 0 : -half; k <= (mode === 'tip' ? hrs : half); k++) {
      var rel = mode === 'tip' ? -k : k, ts = mode === 'tip' ? t1win - k * 3600 : mid + k * 3600, label;
      x = Math.round(X(ts)) + 0.5;
      if (mode === 'around' && rel === 0) continue;
      ctx.beginPath(); ctx.moveTo(x, y0 + 14); ctx.lineTo(x, y0 + 20); ctx.stroke();
      label = rel === 0 ? (Live.S.mode === 'live' ? t('pulse.now') : new Date(t1win * 1000).toISOString().slice(11, 16) + ' UTC') : (rel > 0 ? '+' : '−') + Math.abs(rel) + ' h';
      ctx.textAlign = x < 24 ? 'left' : x > W - 30 ? 'right' : 'center';
      ctx.fillText(label, x < 24 ? 0 : x > W - 30 ? W : x, H - 6);
    }
    // die Lichter
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < pts.length; i++) {
      p = pts[i];
      var here = mode === 'around' && p.i === center, sel = p.i === hover || p.i === picked;
      s = here ? 52 : sel ? 42 : 32;
      ctx.drawImage(here ? sprites.here : (p.f & 4) ? sprites.warm : sprites.cool, p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (i = 0; i < pts.length; i++) {
      p = pts[i];
      ctx.fillStyle = (mode === 'around' && p.i === center) ? '#FFE9C8' : (p.f & 4) ? '#FFD9A6' : '#DDEBFF';
      ctx.beginPath(); ctx.arc(p.x, p.y, mode === 'around' && p.i === center ? 3.4 : 2.4, 0, 6.2832); ctx.fill();
      // ein eben gefundener Block: ein Ring läuft nach außen
      if (born[p.i]) {
        var q = (now - born[p.i]) / 1600;
        if (q >= 1 || calm) delete born[p.i];
        else { busy = true; ctx.strokeStyle = 'rgba(255,214,160,' + (1 - q).toFixed(3) + ')'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.x, p.y, 4 + q * 22, 0, 6.2832); ctx.stroke(); }
      }
      if (p.i === hover || p.i === picked) { ctx.strokeStyle = 'rgba(238,244,255,.9)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, 6.2832); ctx.stroke(); }
    }
    // der gewählte Block der Blockansicht: Ring und Beschriftung
    if (mode === 'around') {
      for (i = 0; i < pts.length; i++) if (pts[i].i === center) {
        p = pts[i];
        ctx.strokeStyle = 'rgba(255,196,122,.9)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, 6.2832); ctx.stroke();
        ctx.fillStyle = '#FFC47A'; ctx.font = '500 11px ' + (fontOk ? '"Geist Mono",' : '') + 'ui-monospace,Menlo,Consolas,monospace';
        var lab = t('walk.tip.block', { h: U.num(center) }), lw = ctx.measureText(lab).width;
        ctx.textAlign = 'left'; ctx.fillText(lab, Math.max(0, Math.min(W - lw, p.x - lw / 2)), p.y - 22);
      }
    }
    if (busy && !raf) raf = requestAnimationFrame(function () { raf = 0; draw(); });
  }
  function text() {
    var c = C(), hrs = hours(), v = Live.values();
    if (mode === 'tip') {
      hEl.textContent = t('pulse.tip.h', { n: U.num(hrs) });
      if (Live.S.mode === 'live') {
        var d = Math.max(0, Live.now() - Number(Live.S.blocks[0].timestamp)), m = Math.floor(d / 60), s = d % 60;
        nowEl.textContent = t('pulse.next', { h: v.nextHeight, t: (m ? U.num(m) + ' min ' : '') + s + ' s' });
      } else nowEl.textContent = v.mode;
    } else {
      hEl.textContent = t('pulse.around.h', { h: U.num(center) });
      nowEl.textContent = tn('pulse.around.n', pts.length, { n: U.num(pts.length), k: U.num(hrs) });
    }
    next.hidden = !(mode === 'tip' && Live.S.mode === 'live');
    next.style.top = (Math.round(H * 0.44) - 6) + 'px';
    canvas.setAttribute('aria-label', t('pulse.alt'));
    if (c.n && picked >= c.n) hide();
  }
  function refresh() {
    if (!root || !W || !root.isConnected) return;
    var c = C(), tipH = c.n - 1;
    if (lastTip >= 0 && tipH > lastTip && tipH - lastTip < 4 && mode === 'tip' && wasLive) for (var h = lastTip + 1; h <= tipH; h++) born[h] = performance.now();
    lastTip = tipH; wasLive = Live.S.mode === 'live';
    windowNow(); collect(); text(); draw();
    if (picked >= 0) place(picked);
  }
  var beat = 0;
  function tick() {
    if (!root || !root.isConnected || document.hidden || mode !== 'tip' || Live.S.mode !== 'live') return;
    text();
    if (++beat % 10 === 0) { windowNow(); collect(); draw(); }      // die Lichter wandern langsam nach links
  }

  /* ---------- Zeigen und Antippen ---------- */
  function nearest(px, py, max) {
    var best = -1, bd = max * max, i, dx, dy, d;
    for (i = 0; i < pts.length; i++) { dx = pts[i].x - px; dy = pts[i].y - py; d = dx * dx + dy * dy; if (d < bd) { bd = d; best = pts[i].i; } }
    return best;
  }
  function who(f) {
    var cls = f & 3;
    return cls === 0 ? t('walk.tip.solo') : cls === 1 ? t('pulse.by', { who: 'YSKAR MAIN' }) : cls === 2 ? t('pulse.by', { who: 'Gozero' }) : t('walk.tip.pool');
  }
  function place(i) {
    var c = C(), p = null, k;
    for (k = 0; k < pts.length; k++) if (pts[k].i === i) p = pts[k];
    if (!p) { hide(); return; }
    var f = c.F[i];
    U.$('[data-f="h"]', tip).textContent = t('walk.tip.block', { h: U.num(i) });
    U.$('[data-f="t"]', tip).textContent = (f & 8) ? t('walk.tip.approx') : U.date(c.t0 + c.T[i], true);
    U.$('[data-f="who"]', tip).textContent = (f & 8) ? '' : who(f) + ((f & 4) ? ' · ' + t('walk.tip.tx') : '');
    var a = U.$('a', tip); a.setAttribute('href', Router.href('#explorer-block-' + i)); a.textContent = t('walk.open');
    a.hidden = mode === 'around' && i === center;
    tip.hidden = false;
    var bw = tip.offsetWidth, bh = tip.offsetHeight, x = Math.max(0, Math.min(W - bw, p.x - bw / 2));
    tip.style.transform = 'translate3d(' + x.toFixed(0) + 'px,' + (p.y - bh - 16).toFixed(0) + 'px,0)';
  }
  function hide() { if (tip) tip.hidden = true; picked = -1; }
  function pointer() {
    canvas.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var r = canvas.getBoundingClientRect(), i = nearest(e.clientX - r.left, e.clientY - r.top, 16);
      if (i === hover) return;
      hover = i; canvas.style.cursor = i < 0 ? '' : 'pointer';
      if (i >= 0) place(i); else if (picked < 0) tip.hidden = true;
      draw();
    });
    canvas.addEventListener('pointerleave', function () { if (hover !== -1) { hover = -1; if (picked < 0) tip.hidden = true; draw(); } });
    canvas.addEventListener('click', function (e) {
      var r = canvas.getBoundingClientRect(), i = nearest(e.clientX - r.left, e.clientY - r.top, 24);
      if (i < 0) { hide(); draw(); return; }
      if (hover === i && !(mode === 'around' && i === center)) { Router.go('#explorer-block-' + i); return; }   // mit der Maus: direkt öffnen
      picked = i; place(i); draw();
    });
    document.addEventListener('click', function (e) { if (picked >= 0 && !root.contains(e.target)) { hide(); draw(); } });
  }

  /** Ansicht setzen: { mode: 'tip' } oder { mode: 'around', h: Blockhöhe }. Gibt das Element zurück, das die Seite einhängt. */
  function set(o) {
    if (!root) build();
    var changed = o.mode !== mode || (o.mode === 'around' && o.h !== center);
    mode = o.mode; center = o.h || 0;
    if (changed) { hover = -1; hide(); born = {}; }
    // nach dem Einhängen neu messen (das Element ist jetzt vielleicht zum ersten Mal sichtbar)
    requestAnimationFrame(function () { if (root.isConnected) { if (Math.round(stage.clientWidth) !== W) size(); else refresh(); } });
    return root;
  }
    return { set: set };
  }
  var one = null;
  function has(h) { return h >= 0 && h < C().n; }
  /** set(): das Exemplar des Explorers; make(): ein weiteres, eigenes Exemplar (Netz-Seite). */
  return { set: function (o) { if (!one) one = make(); return one.set(o); }, has: has, make: make };
})();
