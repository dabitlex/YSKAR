/*
 * „Die Kette entlang“: Jeder Block seit Block 0 ist ein Licht, alle zusammen ein Band.
 * Beim Scrollen fährt die Kamera das Band entlang, an markanten Blöcken hält sie an.
 *
 * Die Daten sind echt: Abstand jedes Blocks zu seinem Vorgänger und ob er Überweisungen trug
 * (aus dem Verlauf der Kette, siehe 12-chain.js; neue Blöcke kommen live dazu). Der Abstand zweier
 * Lichter ist die Zeit zwischen zwei Blöcken.
 */
var Walk = (function () {
  'use strict';
  var K = 0.0035;                      // Pixel je Sekunde: ein Tag ist rund 300 Pixel lang
  var root, sticky, canvas, ctx, caps = [], hudH, hudD, tipBox;
  var T = [], F = [], Z = [], J = [], n = 0, t0 = 0, seen = -1;
  var W = 0, H = 0, dpr = 1, anchor = 0, cx = 0;
  var p = 0, cam = 0, camTo = 0, vel = 0, raf = 0, active = false, calm = false, started = false;
  var sprites = {}, vis = { x: [], y: [], i: [], n: 0 }, hover = -1, picked = -1, lastHud = '';
  var stops = [], tipSeen = false, fNow = 0, fTo = 0;     // { s: Ort am Band, el: Bildunterschrift }

  function rnd(i, salt) { var x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return x - Math.floor(x); }
  /**
   * Zeit und Merkmale jedes Blocks kommen aus dem Verlauf (12-chain.js). Hier kommt die Lage jedes Lichts dazu:
   * Tiefe (Z) und Abstand von der Mitte des Bandes (J); Blöcke mit Überweisungen liegen näher an der Mitte.
   * Liefert true, wenn sich seit dem letzten Aufruf etwas geändert hat.
   */
  function sync() {
    var c = Chain.get(), i;
    if (c.v === seen && c.n === n) return false;
    T = c.T; F = c.F; n = c.n; t0 = c.t0; seen = c.v;
    Z.length = J.length = n;
    for (i = 0; i < n; i++) {
      Z[i] = rnd(i, 1);
      J[i] = (rnd(i, 2) + rnd(i, 3) + rnd(i, 4) - 1.5) / 1.5 * ((F[i] & 4) ? 0.45 : 1);
    }
    return true;
  }
  function sAt(h) {                    // Ort eines Blocks am Band; jenseits der Spitze mit zehn Minuten je Block weitergedacht
    if (h <= n - 1) return T[Math.max(0, Math.round(h))] * K;
    return (T[n - 1] + (h - (n - 1)) * 600) * K;
  }
  function indexAt(s) {                // größter Block, dessen Ort <= s ist
    var t = s / K, lo = 0, hi = n - 1, mid;
    if (t <= 0) return 0;
    if (t >= T[n - 1]) return n - 1;
    while (lo < hi) { mid = (lo + hi + 1) >> 1; if (T[mid] <= t) lo = mid; else hi = mid - 1; }
    return lo;
  }
  function heightAtDate(ms) { var t = ms / 1000 - t0, i = indexAt(t * K); return i; }
  function wave(s) { var a = Math.min(W * 0.17, 210); return a * Math.sin(s / 1380) + a * 0.42 * Math.sin(s / 517 + 1.3); }
  function bandWidth(s) { return (W < 700 ? 30 : 46) * (0.75 + 0.5 * Math.sin(s / 2300 + 0.7) * Math.sin(s / 900)); }

  function sprite(r, g, b) {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var x = c.getContext('2d'), grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.13, 'rgba(' + r + ',' + g + ',' + b + ',.92)');
    grd.addColorStop(0.42, 'rgba(' + r + ',' + g + ',' + b + ',.24)');
    grd.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    x.fillStyle = grd; x.fillRect(0, 0, 64, 64);
    return c;
  }

  function glowSprite() {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d'), grd = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(70,135,255,.20)'); grd.addColorStop(0.45, 'rgba(50,110,255,.08)'); grd.addColorStop(1, 'rgba(40,100,255,0)');
    x.fillStyle = grd; x.fillRect(0, 0, 128, 128);
    return c;
  }

  /* ---------- Haltepunkte ---------- */
  function buildStops() {
    var tip = n - 1;
    stops = caps.map(function (el) {
      var at = el.getAttribute('data-at'), h;
      if (at === 'start') return { s: sAt(0) - H * 0.34, el: el, h: 0, start: true };
      if (at === 'now') h = tip;
      else if (at.indexOf('date:') === 0) h = heightAtDate(Date.parse(at.slice(5)));
      else h = Number(at);
      el._h = h;
      return { s: sAt(h), el: el, h: h, future: h > tip };
    });
    stops.forEach(function (st) {
      var k = U.$('[data-k]', st.el);
      if (k && !st.start) {
        var txt = k.getAttribute('data-k');
        if (txt === 'block') k.textContent = t('walk.k.block', { h: U.num(st.h), d: U.date(t0 + (st.h <= tip ? T[st.h] : T[tip] + (st.h - tip) * 600)) });
        else if (txt === 'date') k.textContent = U.date(t0 + T[st.h]);
        else if (txt === 'now') k.textContent = Live.values().nowLine;
        else if (txt === 'future') k.textContent = t('walk.k.future', { h: U.num(st.h) });
      }
      var open = U.$('[data-open]', st.el);
      if (open) open.setAttribute('href', Router.href('#explorer-block-' + st.h));
      // Texte für „schon geschehen“, sobald die Kette an einem künftigen Haltepunkt vorbei ist
      U.$$('[data-when]', st.el).forEach(function (x) { x.hidden = (x.getAttribute('data-when') === 'future') !== !!st.future; });
    });
  }
  function ease(x) { x = Math.max(0, Math.min(1, (x - 0.2) / 0.6)); return x * x * x * (x * (6 * x - 15) + 10); }
  function camAt(q) {                  // q in 0..1 über alle Haltepunkte
    if (stops.length < 2) return stops.length ? stops[0].s : 0;
    var m = stops.length - 1, f = Math.max(0, Math.min(m, q * m)), i = Math.min(m - 1, Math.floor(f));
    return stops[i].s + (stops[i + 1].s - stops[i].s) * ease(f - i);
  }

  /* ---------- Zeichnen ---------- */
  function size() {
    var r = sticky.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(sticky.clientHeight));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    anchor = H * (W < 700 ? 0.4 : 0.5); cx = W * (W < 900 ? 0.5 : 0.62);
  }
  function draw() {
    var tip = n - 1, sTip = T[tip] * K, top = cam - anchor / 0.82 - 60, bottom = cam + (H - anchor) / 0.82 + 60;
    var i0 = Math.max(0, indexAt(top) - 14), i1 = Math.min(tip, indexAt(bottom) + 14), i, z, s, x, y, r, a, k;
    var streak = Math.min(150, Math.abs(vel) * 0.9), unit = W < 700 ? 1.25 : 1.5;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    // der Schein des Bandes: weiche Lichtflecken entlang der Mitte, die ineinanderlaufen
    var from = Math.max(top, 60), to = Math.min(bottom, sTip), R = bandWidth(cam) * 3.6, stepG = 52;
    if (to > from) {
      ctx.globalAlpha = 0.34;
      for (s = Math.ceil(from / stepG) * stepG; s <= to; s += stepG) {
        ctx.drawImage(sprites.glow, cx + wave(s) - R, anchor + (s - cam) - R, R * 2, R * 2);
      }
      ctx.globalAlpha = 1;
    }
    // jenseits der Spitze: gestrichelte Bahn, wohin das Band noch wächst
    if (bottom > sTip) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath(); ctx.setLineDash([2, 9]);
      for (s = Math.max(sTip, top); s <= bottom; s += 20) { x = cx + wave(s); y = anchor + (s - cam); if (s === Math.max(sTip, top)) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.strokeStyle = 'rgba(190,212,255,.34)'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
      stops.forEach(function (st) {
        if (!st.future) return;
        x = cx + wave(st.s); y = anchor + (st.s - cam);
        if (y < -30 || y > H + 30) return;
        ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.2832); ctx.strokeStyle = 'rgba(255,196,122,.9)'; ctx.lineWidth = 1.4; ctx.stroke();
      });
      ctx.globalCompositeOperation = 'lighter';
    }

    vis.n = 0; tipSeen = false;
    for (i = i0; i <= i1; i++) {
      z = Z[i]; s = T[i] * K;
      y = anchor + (s - cam) * (0.82 + 0.36 * z);
      if (y < -30 || y > H + 30) continue;
      x = cx + wave(s) + J[i] * bandWidth(s) * (0.7 + z * 0.6);
      k = (F[i] & 4) ? 1 : 0;
      r = unit * (0.55 + z * 1.15) * (k ? 1.9 : 1);
      a = (0.3 + 0.7 * z) * Math.min(1, y / 70, (H - y) / 70);
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      ctx.drawImage(k ? sprites.warm : sprites.cool, x - r * 3, y - r * 3 - streak * (0.4 + z) * 0.5, r * 6, r * 6 + streak * (0.4 + z));
      vis.x[vis.n] = x; vis.y[vis.n] = y; vis.i[vis.n] = i; vis.n++;
    }
    ctx.globalAlpha = 1;

    // markante Blöcke
    stops.forEach(function (st) {
      if (st.start || st.future) return;
      var yy = anchor + (st.s - cam), xx = cx + wave(st.s);
      if (yy < -40 || yy > H + 40) return;
      var isTip = st.h === tip, pulse = isTip && !calm ? 0.5 + 0.5 * Math.sin(performance.now() / 520) : 0.6;
      if (isTip) tipSeen = true;
      ctx.globalAlpha = 0.9; ctx.drawImage(isTip ? sprites.head : sprites.mark, xx - 22 - pulse * 8, yy - 22 - pulse * 8, 44 + pulse * 16, 44 + pulse * 16);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath(); ctx.arc(xx, yy, 9 + pulse * 3, 0, 6.2832);
      ctx.strokeStyle = isTip ? 'rgba(255,214,160,.95)' : 'rgba(150,205,255,.85)'; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
    });
    // gewähltes Licht
    var sel = hover >= 0 ? hover : picked;
    if (sel >= 0 && sel <= tip) {
      z = Z[sel]; s = T[sel] * K; y = anchor + (s - cam) * (0.82 + 0.36 * z); x = cx + wave(s) + J[sel] * bandWidth(s) * (0.7 + z * 0.6);
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath(); ctx.arc(x, y, 8, 0, 6.2832); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function hud() {
    var tip = n - 1, sTip = T[tip] * K, txt, d;
    if (cam <= 0) { txt = t('walk.hud.block', { h: '0' }); d = U.date(t0); }
    else if (cam > sTip + 6) {
      var h = Math.round(tip + (cam - sTip) / K / 600);
      txt = t('walk.hud.ahead', { h: U.num(h) }); d = t('walk.hud.planned');
    } else {
      var i = indexAt(cam), day = Math.floor(T[i] / 86400) + 1;
      txt = t('walk.hud.block', { h: U.num(i) }); d = U.date(t0 + T[i]) + ' · ' + t('walk.hud.day', { n: U.num(day) });
    }
    if (txt + d === lastHud) return;
    lastHud = txt + d; hudH.textContent = txt; hudD.textContent = d;
  }
  function captions() {
    stops.forEach(function (st, i) {
      var dist = Math.abs(fNow - i), o = dist <= 0.2 ? 1 : dist >= 0.47 ? 0 : 1 - (dist - 0.2) / 0.27;
      o = o * o * (3 - 2 * o);
      if (st._o !== undefined && Math.abs(o - st._o) < 0.004) return;
      st._o = o;
      st.el.style.opacity = o.toFixed(3);
      st.el.style.transform = 'translate3d(0,' + ((i - fNow) * 46).toFixed(1) + 'px,0)';
      st.el.style.visibility = o < 0.02 ? 'hidden' : 'visible';
      st.el.classList.toggle('is-on', o > 0.5);
    });
  }
  function frame() {
    raf = 0;
    var d = camTo - cam, df = fTo - fNow;
    vel = Math.abs(d) < 0.3 ? 0 : d * 0.14;
    cam += vel === 0 ? d : vel;
    fNow += Math.abs(df) < 0.002 ? df : df * 0.14;
    if (vel === 0 && Math.abs(fTo - fNow) > 0.0001) vel = 0.0001;      // Bildunterschriften laufen noch nach
    draw(); hud(); if (!calm) captions();
    if (vel !== 0 && tipBox && !tipBox.hidden && picked >= 0) hideTip();
    if (active && (vel !== 0 || (tipSeen && !calm))) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  /* ---------- Antippen ---------- */
  function nearest(px, py, max) {
    var best = -1, bd = max * max, i, dx, dy, d;
    for (i = 0; i < vis.n; i++) { dx = vis.x[i] - px; dy = vis.y[i] - py; d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
    return best;
  }
  function showTip(v) {
    var i = vis.i[v], f = F[i];
    picked = i;
    U.$('[data-f="h"]', tipBox).textContent = t('walk.tip.block', { h: U.num(i) });
    U.$('[data-f="t"]', tipBox).textContent = (f & 8) ? t('walk.tip.approx') : U.date(t0 + T[i], true);
    U.$('[data-f="who"]', tipBox).textContent = (f & 8) ? '' : ((f & 3) === 0 ? t('walk.tip.solo') : t('walk.tip.pool')) + ((f & 4) ? ' · ' + t('walk.tip.tx') : '');
    U.$('a', tipBox).setAttribute('href', Router.href('#explorer-block-' + i));
    tipBox.hidden = false;
    var bw = tipBox.offsetWidth, bh = tipBox.offsetHeight, x = Math.max(12, Math.min(W - bw - 12, vis.x[v] - bw / 2)), y = vis.y[v] - bh - 16;
    if (y < 70) y = vis.y[v] + 18;
    tipBox.style.transform = 'translate3d(' + x.toFixed(0) + 'px,' + y.toFixed(0) + 'px,0)';
    kick();
  }
  function hideTip() { if (tipBox) tipBox.hidden = true; picked = -1; }
  function pointer() {
    canvas.addEventListener('click', function (e) {
      var r = canvas.getBoundingClientRect(), v = nearest(e.clientX - r.left, e.clientY - r.top, 26);
      if (v < 0) { hideTip(); kick(); return; }
      showTip(v);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var r = canvas.getBoundingClientRect(), v = nearest(e.clientX - r.left, e.clientY - r.top, 18), h = v < 0 ? -1 : vis.i[v];
      if (h !== hover) { hover = h; canvas.style.cursor = h < 0 ? '' : 'pointer'; kick(); }
    });
    canvas.addEventListener('pointerleave', function () { if (hover !== -1) { hover = -1; kick(); } });
  }

  function setProgress(q) {
    p = q; camTo = camAt(q); fTo = q * (stops.length - 1);
    kick();
  }
  /** Mit „Bewegung reduzieren“ steht das Band am heutigen Stand der Kette. */
  function calmAt() {
    var i, at = -1;
    for (i = 0; i < stops.length; i++) if (stops[i].el.getAttribute('data-at') === 'now') at = i;
    return at < 0 || stops.length < 2 ? 0 : at / (stops.length - 1);
  }
  function layout() {
    if (!root || root.offsetParent === null) return;     // Seite nicht sichtbar: beim Seitenwechsel noch einmal
    size(); buildStops();
    if (calm) p = calmAt();
    camTo = camAt(p); fTo = p * (stops.length - 1);
    if (!started || calm) { cam = camTo; fNow = fTo; started = true; }
    kick();
  }

  function init() {
    root = document.getElementById('chain'); if (!root) return;
    sticky = U.$('.chainwalk__sticky', root); canvas = document.getElementById('walk'); ctx = canvas.getContext('2d');
    caps = U.$$('.walk-cap', root); hudH = document.getElementById('walk-h'); hudD = document.getElementById('walk-d'); tipBox = document.getElementById('walk-tip');
    calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    sprites.glow = glowSprite(); sprites.cool = sprite(120, 190, 255); sprites.warm = sprite(255, 186, 110); sprites.mark = sprite(150, 215, 255); sprites.head = sprite(255, 226, 180);
    Chain.want(); sync();
    root.classList.toggle('is-calm', calm);
    layout();
    if (calm) { active = true; kick(); }
    else if (window.ScrollTrigger) {
      ScrollTrigger.create({ trigger: root, start: 'top top', end: 'bottom bottom', onUpdate: function (self) { setProgress(self.progress); } });
      ScrollTrigger.create({ trigger: root, start: 'top bottom', end: 'bottom top', onToggle: function (self) { active = self.isActive; if (active) kick(); } });
    } else { active = true; }
    pointer();
    var ro = window.ResizeObserver ? new ResizeObserver(layout) : null;
    if (ro) ro.observe(sticky); else window.addEventListener('resize', layout);
    U.on('route', function (r) { if (r.page === 'home') setTimeout(layout, 30); });
    U.on('lang', function () { lastHud = ''; buildStops(); kick(); });
    U.on('data', function () { if (sync()) { buildStops(); camTo = camAt(p); } else buildStops(); kick(); });
  }
  return { init: init };
})();
