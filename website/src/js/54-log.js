/*
 * Knoten-Seite: das Logbuch der Kette. Jede Zeile ist ein Tag seit Block 0 (UTC), jeder Strich ein Block an seiner Uhrzeit;
 * warme Striche trugen Überweisungen. Die Daten sind dieselben wie im Band der Startseite (siehe 43-walk.js).
 * Beim Erscheinen läuft die Prüfung einmal von Block 0 bis zur Spitze durch, danach kommt jeder neue Block live dazu.
 */
var Log = (function () {
  'use strict';
  var root, canvas, ctx, tip, elN, elD, elCap;
  var W = 0, H = 0, dpr = 1, L = 46, TOP = 20, inner = 1, rowSpan = 86400, perRow = 1, rows = 1, pitch = 5, byRow = [];
  var k = 0, raf = 0, calm = false, ran = false, hover = -1, picked = -1, a0 = 0, aFrom = 0, aTo = 0, aDur = 0, head = null, fontOk = false;

  function C() { return Chain.get(); }
  function X(c, i) { return L + ((c.T[i] % rowSpan + rowSpan) % rowSpan) / rowSpan * inner; }
  function Y(c, i) { return TOP + Math.max(0, Math.floor(c.T[i] / rowSpan)) * pitch; }
  function glow() {
    var g = document.createElement('canvas'); g.width = g.height = 48;
    var x = g.getContext('2d'), grd = x.createRadialGradient(24, 24, 0, 24, 24, 24);
    grd.addColorStop(0, 'rgba(255,255,255,.95)'); grd.addColorStop(0.22, 'rgba(190,225,255,.5)'); grd.addColorStop(1, 'rgba(120,180,255,0)');
    x.fillStyle = grd; x.fillRect(0, 0, 48, 48);
    return g;
  }

  function layout() {
    var c = C(); if (!root || root.offsetParent === null || !c.n) return;
    W = Math.max(1, Math.round(canvas.parentNode.clientWidth));
    L = W < 520 ? 40 : 50; inner = W - L - 2;
    var span = c.T[c.n - 1] + 1, days = Math.ceil(span / 86400), maxH = W < 520 ? 330 : 396, minP = 3;
    perRow = Math.max(1, Math.ceil(days / Math.floor(maxH / minP)));
    rowSpan = 86400 * perRow; rows = Math.ceil(span / rowSpan);
    pitch = Math.max(minP, Math.min(7, Math.floor(maxH / rows * 2) / 2));
    H = Math.round(TOP + rows * pitch + 2);
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.style.height = H + 'px';
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    index();
    caption();
    draw();
  }
  function index() {
    var c = C(), i, r;
    byRow = [];
    for (r = 0; r < rows; r++) byRow.push([]);
    for (i = 0; i < c.n; i++) { r = Math.min(rows - 1, Math.max(0, Math.floor(c.T[i] / rowSpan))); byRow[r].push(i); }
  }
  function caption() {
    if (elCap) elCap.textContent = perRow === 1 ? t('log.cap') : tn('log.cap.n', perRow, { d: U.num(perRow) });
  }

  function marks(c, from, to, w, hgt, warm) {
    var i, x, y, f;
    ctx.beginPath();
    for (i = from; i < to; i++) {
      f = c.F[i] & 4;
      if (warm !== null && !!f !== warm) continue;
      x = Math.round((X(c, i) - w / 2) * dpr) / dpr; y = Y(c, i);
      ctx.rect(x, y, w, hgt);
    }
    ctx.fill();
  }
  function draw() {
    if (!ctx || !W) return;
    var c = C(), n = c.n, lit = Math.max(0, Math.min(n, Math.floor(k))), w = W < 520 ? 1.2 : 1.6, hgt = Math.max(1.5, pitch - 1.5), i, r;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // Achsen: Uhrzeit oben, Datum links (erste Zeile und jeder Monatsanfang)
    ctx.font = '500 10px ' + (fontOk ? '"Geist Mono",' : '') + 'ui-monospace,Menlo,Consolas,monospace';
    ctx.fillStyle = 'rgba(212,226,255,.5)'; ctx.textBaseline = 'alphabetic';
    [0, 6, 12, 18, 24].forEach(function (hh) {
      ctx.textAlign = hh === 0 ? 'left' : hh === 24 ? 'right' : 'center';
      ctx.fillText(hh + (hh === 24 ? ' h UTC' : ''), L + inner * hh / 24, 11);
    });
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (r = 0; r < rows; r++) {
      var d = new Date((c.t0 + r * rowSpan) * 1000);
      if (r === 0 || (perRow === 1 && d.getUTCDate() === 1)) ctx.fillText(shortDate(d), 0, TOP + r * pitch + hgt / 2 + 0.5);
    }
    // noch nicht geprüft: gedämpft
    ctx.fillStyle = 'rgba(170,198,255,.15)';
    marks(c, lit, n, w, hgt, null);
    // geprüft: kalt, von hellem Eisblau (Anfang) zu kräftigem Blau (heute)
    var g = ctx.createLinearGradient(0, TOP, 0, H);
    g.addColorStop(0, '#8FE3FF'); g.addColorStop(0.55, '#5AA2FF'); g.addColorStop(1, '#4A7DF5');
    ctx.fillStyle = g;
    marks(c, 0, lit, w, hgt, false);
    // mit Überweisungen: warm und etwas breiter
    ctx.fillStyle = '#FFC47A';
    marks(c, 0, lit, w * 1.7, hgt, true);
    // die Stelle, an der gerade geprüft wird
    if (raf && lit > 0 && lit < n) {
      ctx.globalCompositeOperation = 'lighter';
      for (i = Math.max(0, lit - 22); i < lit; i++) {
        var a = 1 - (lit - i) / 22, s = 7 + a * 9;
        ctx.globalAlpha = a * a;
        ctx.drawImage(head, X(c, i) - s, Y(c, i) + hgt / 2 - s, s * 2, s * 2);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    // gewählter Block
    var sel = picked >= 0 ? picked : hover;
    if (sel >= 0 && sel < lit) {
      ctx.strokeStyle = (c.F[sel] & 4) ? '#FFE2B8' : '#EEF4FF'; ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(X(c, sel) - w / 2 - 3) + 0.5, Y(c, sel) - 2.5, Math.round(w + 6), Math.round(hgt + 5));
    }
  }
  function shortDate(d) {
    try { return d.toLocaleDateString(U.loc(), { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(/\.$/, ''); }
    catch (e) { return d.getUTCDate() + '.' + (d.getUTCMonth() + 1) + '.'; }
  }
  function readout() {
    var c = C(), i = Math.max(0, Math.min(c.n - 1, Math.round(k) - 1));
    elN.textContent = U.num(i);
    elD.textContent = U.date(c.t0 + c.T[i]);
  }

  /* ---------- Ablauf ---------- */
  function animate(from, to, dur) {
    aFrom = from; aTo = to; aDur = dur; a0 = performance.now();
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick(now) {
    var q = Math.min(1, (now - a0) / aDur), e = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
    k = aFrom + (aTo - aFrom) * e;
    if (q >= 1) { k = aTo; raf = 0; readout(); draw(); return; }
    readout(); draw();
    raf = requestAnimationFrame(tick);
  }
  function run() {
    if (ran) return; ran = true;
    var n = C().n;
    if (calm) { k = n; readout(); draw(); return; }
    animate(0, n, 3000);
  }
  function grown() {
    var c = C();
    if (!W) return;
    var span = c.T[c.n - 1] + 1;
    if (Math.ceil(span / rowSpan) !== rows) layout(); else index();
    if (!ran) { draw(); return; }
    if (calm) { k = c.n; readout(); draw(); return; }
    if (!raf && Math.floor(k) < c.n) animate(Math.floor(k), c.n, 1100);
  }

  /* ---------- Zeigen und Antippen ---------- */
  function at(px, py) {
    var c = C(), r = Math.floor((py - TOP) / pitch), best = -1, bd = 12 * 12, rr, list, j, i, dx, dy, d, hgt = Math.max(1.5, pitch - 1.5);
    for (rr = Math.max(0, r - 1); rr <= Math.min(rows - 1, r + 1); rr++) {
      list = byRow[rr]; if (!list) continue;
      for (j = 0; j < list.length; j++) {
        i = list[j]; if (i >= Math.floor(k)) continue;
        dx = X(c, i) - px; dy = (Y(c, i) + hgt / 2 - py) * 1.6; d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
    }
    return best;
  }
  function showTip(i) {
    var c = C(), f = c.F[i];
    picked = i;
    U.$('[data-f="h"]', tip).textContent = t('walk.tip.block', { h: U.num(i) });
    U.$('[data-f="t"]', tip).textContent = (f & 8) ? t('walk.tip.approx') : U.date(c.t0 + c.T[i], true);
    U.$('[data-f="who"]', tip).textContent = (f & 8) ? '' : ((f & 3) === 0 ? t('walk.tip.solo') : t('walk.tip.pool')) + ((f & 4) ? ' · ' + t('walk.tip.tx') : '');
    U.$('a', tip).setAttribute('href', Router.href('#explorer-block-' + i));
    tip.hidden = false;
    var bw = tip.offsetWidth, bh = tip.offsetHeight, x = Math.max(0, Math.min(W - bw, X(c, i) - bw / 2)), y = Y(c, i) - bh - 12;
    if (y < -bh * 0.6) y = Y(c, i) + pitch + 12;
    tip.style.transform = 'translate3d(' + x.toFixed(0) + 'px,' + y.toFixed(0) + 'px,0)';
    draw();
  }
  function hideTip() { if (tip) tip.hidden = true; picked = -1; draw(); }
  function pointer() {
    canvas.addEventListener('click', function (e) {
      var r = canvas.getBoundingClientRect(), i = at(e.clientX - r.left, e.clientY - r.top);
      if (i < 0) hideTip(); else showTip(i);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var r = canvas.getBoundingClientRect(), i = at(e.clientX - r.left, e.clientY - r.top);
      if (i !== hover) { hover = i; canvas.style.cursor = i < 0 ? '' : 'pointer'; if (!raf) draw(); }
    });
    canvas.addEventListener('pointerleave', function () { if (hover !== -1) { hover = -1; if (!raf) draw(); } });
    document.addEventListener('click', function (e) { if (picked >= 0 && !root.contains(e.target)) hideTip(); });
  }

  function init() {
    root = document.getElementById('logbook'); if (!root) return;
    canvas = document.getElementById('log'); ctx = canvas.getContext('2d'); tip = document.getElementById('log-tip');
    elN = document.getElementById('log-n'); elD = document.getElementById('log-d'); elCap = document.getElementById('log-cap');
    calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    head = glow();
    Chain.want();
    layout(); readout();
    if (window.ResizeObserver) new ResizeObserver(function () { if (canvas.parentNode.clientWidth !== W) layout(); }).observe(canvas.parentNode);
    else window.addEventListener('resize', layout);
    U.on('route', function (r) { if (r.page === 'node') setTimeout(function () { layout(); if (ran) { k = C().n; readout(); draw(); } }, 40); else hideTip(); });
    U.on('lang', function () { caption(); readout(); draw(); if (picked >= 0) showTip(picked); });
    U.on('data', grown);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fontOk = true; draw(); });
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (l) { if (l[0].isIntersecting) { run(); io.disconnect(); } }, { threshold: 0.3 });
      io.observe(canvas);
    } else run();
    pointer();
  }
  return { init: init };
})();
