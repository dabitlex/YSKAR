/*
 * YSR-Seite: die Münze als Körper aus Glas. Vorn das Zeichen als Relief, hinten die Inschrift aus Block 0.
 * Sie liegt schräg im Raum, folgt dem Zeiger, neigt sich beim Scrollen und lässt sich mit dem Finger oder dem Knopf umdrehen.
 * Gerechnet wird sie in 57-coin-gl.js. Kann das Gerät kein WebGL, steht stattdessen die gezeichnete Münze (dunkle Scheibe
 * mit Ring), die sich genauso bedienen lässt. Mit „Bewegung reduzieren“ steht sie still; der Knopf wechselt die Seite ohne Drehung.
 */
var Coin = (function () {
  'use strict';
  var root, stage, body, btn, canvas, glc = null, tried = false, LAYERS = 22;
  var REST = { rx: -32, ry: -22, rz: 0, rzBack: 12 };   // Ruhelage der Glasmünze: Fläche nach links oben, Rand rechts unten sichtbar; hinten so gedreht, dass die Schrift waagrecht steht
  var ry = -34, rx = 9, base = 0, hx = 0, hy = 0, tilt = 0, drag = null, vel = 0, raf = 0, seen = false, visible = false, calm = false, t0 = 0, settled = false;
  var last = 0, skip = false, load = 0.016, frames = 0, backDone = false;

  function label() {
    var back = Math.round(base / 180) % 2 !== 0;
    btn.textContent = t(back ? 'coin.turn.back' : 'coin.turn');
    btn.setAttribute('aria-pressed', back ? 'true' : 'false');
  }
  function apply() {
    if (glc) {
      var turn = (1 - Math.cos(ry * Math.PI / 180)) / 2;                // 0 = Vorderseite, 1 = Rückseite
      glc.draw(REST.rx + rx, REST.ry + ry, REST.rz + (REST.rzBack - REST.rz) * turn);
      stage.style.setProperty('--sx', Math.max(0.3, Math.abs(Math.cos((REST.ry + ry) * Math.PI / 180))).toFixed(3));
      return;
    }
    body.style.setProperty('--ry', ry.toFixed(2) + 'deg');
    body.style.setProperty('--rx', rx.toFixed(2) + 'deg');
    var a = ((ry % 360) + 540) % 360 - 180;                       // -180..180, 0 = Vorderseite
    body.style.setProperty('--sh', (a * 2.3).toFixed(1));
    stage.style.setProperty('--sx', Math.max(0.16, Math.abs(Math.cos(ry * Math.PI / 180))).toFixed(3));
  }
  function frame(now) {
    raf = 0;
    if (!visible || document.hidden || Router.current() !== 'ysr') { last = 0; return; }
    var dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
    var ph = (now - t0) / 2600, sway = calm || drag ? 0 : Math.sin(ph) * 4.5, nod = calm || drag || !glc ? 0 : Math.cos(ph * 0.8) * 1.6;
    var tRy = base + (drag ? drag.off : hx * (glc ? 15 : 20) + tilt + sway), tRx = drag ? 0 : -hy * (glc ? 10 : 13) + nod;
    var idle = !drag && settled && Math.abs(tRy - ry) < 7;
    // in Ruhe (nur das leise Schwanken) genügt jedes zweite Bild: das schont den Akku
    if (glc && idle && (skip = !skip)) { raf = requestAnimationFrame(frame); return; }
    last = now;
    var k = 1 - Math.exp(-dt * (drag ? 42 : settled ? 3.7 : 2.8));       // nach Zeit, nicht nach Bildern: gleich schnell auf jedem Gerät
    ry += (tRy - ry) * k; rx += (tRx - rx) * k;
    if (!settled && Math.abs(tRy - ry) < 1) settled = true;
    // Rechenlast: dauern die Bilder zu lang, wird die Glasmünze kleiner gerechnet
    // (erst nach anhaltend weniger als etwa 22 Bildern je Sekunde; ein einzelner Ruckler beim Laden zählt nicht)
    if (glc && !idle) {
      load = load * 0.9 + dt * 0.1;
      if (++frames > 30 && load > 0.045 && glc.quality() > 0.46) { glc.quality(glc.quality() * 0.78); sizeGL(); frames = 0; load = 0.02; }
    }
    apply();
    raf = requestAnimationFrame(frame);
  }
  function wake() { if (!raf && !calm) raf = requestAnimationFrame(frame); }
  function flip(dir) {
    needBack();
    base += 180 * (dir || 1);
    label();
    if (calm) { ry = base; rx = 0; apply(); } else wake();
  }
  function onScroll() {
    if (!visible) return;
    var r = stage.getBoundingClientRect(), mid = (r.top + r.height / 2) / window.innerHeight;       // 0 = oben, 1 = unten
    tilt = (0.5 - mid) * (glc ? 26 : 46);
  }

  /* ---- Glas ---- */
  function backLines() { return [t('coin.back.k'), 'proof, not promise', t('coin.back.d')]; }
  function needBack() { if (glc && !backDone) { backDone = true; glc.back(backLines()); apply(); } }
  function sizeGL() { if (glc && stage.clientWidth) glc.resize(canvas.clientWidth || stage.clientWidth * 1.18); }
  /** Beim ersten Öffnen der Seite: WebGL versuchen und die Höhenkarten rechnen. Scheitert es, bleibt die gezeichnete Münze. */
  function glass() {
    if (tried) return;
    tried = true;
    var path = document.querySelector('#y-shape path');
    glc = canvas && path ? CoinGL.mount(canvas, function () { sizeGL(); apply(); }) : null;
    if (!glc) { root.classList.add('is-css'); return; }
    glc.front(path.getAttribute('d'));
    root.classList.add('is-gl');
    sizeGL();
    // die Rückseite liegt zuerst hinten: ihre Karte wird gerechnet, wenn die Schrift da ist und der Auftritt vorbei ist,
    // spätestens aber, sobald jemand die Münze wendet
    var later = function () { setTimeout(needBack, calm ? 0 : 1400); };
    if (document.fonts && document.fonts.load) document.fonts.load('500 40px "Geist Mono"').then(later, later); else later();
    if (calm) { ry = base; rx = 0; }
    apply();
  }

  function init() {
    root = document.getElementById('coin'); if (!root) return;
    stage = document.getElementById('coin-stage'); body = document.getElementById('coin-body'); btn = document.getElementById('coin-turn');
    canvas = document.getElementById('coin-gl');
    calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    // gezeichnete Fassung: der Rand aus dünnen Scheiben hintereinander
    var edge = U.$('.coinx__edge', root), i;
    for (i = 0; i < LAYERS; i++) {
      var l = document.createElement('i');
      l.setAttribute('data-z', (i / (LAYERS - 1) - 0.5).toFixed(4));
      edge.appendChild(l);
    }
    function sizeEdge() {
      var w = stage.clientWidth; if (!w) return;
      var th = w * 0.052;
      U.$$('i', edge).forEach(function (l) { l.style.transform = 'translateZ(' + (Number(l.getAttribute('data-z')) * (th - 1.2)).toFixed(2) + 'px)'; });
      sizeGL(); if (glc) apply();
    }
    sizeEdge();
    if (window.ResizeObserver) new ResizeObserver(sizeEdge).observe(stage);
    label();
    if (calm) { ry = 0; rx = 0; }
    if (Router.current() === 'ysr') glass();
    apply();
    btn.addEventListener('click', function () { flip(1); });
    U.on('lang', function () { label(); if (glc && backDone) { glc.back(backLines()); apply(); } });
    U.on('route', function (r) {
      if (r.page !== 'ysr') return;
      glass();                                    // sofort, damit die Seite gleich mit der richtigen Münze erscheint
      setTimeout(function () { sizeEdge(); onScroll(); apply(); wake(); }, 40);
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (l) {
        visible = l[0].isIntersecting;
        if (visible) { glass(); if (!seen) { seen = true; t0 = performance.now(); } onScroll(); apply(); wake(); }
      }, { threshold: 0.05 }).observe(stage);
    } else { visible = true; glass(); wake(); }
    window.addEventListener('scroll', function () { if (Router.current() === 'ysr') onScroll(); }, { passive: true });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) wake(); });
    if (calm) return;
    // dem Zeiger folgen (nur mit Maus)
    stage.addEventListener('pointermove', function (e) {
      if (drag) {
        var dx = e.clientX - drag.x;
        vel = e.clientX - drag.last; drag.last = e.clientX;
        drag.off = dx * 0.62;
        if (Math.abs(dx) > 6) drag.moved = true;
        return;
      }
      if (e.pointerType !== 'mouse') return;
      var r = stage.getBoundingClientRect();
      hx = (e.clientX - r.left) / r.width * 2 - 1; hy = (e.clientY - r.top) / r.height * 2 - 1;
    });
    stage.addEventListener('pointerleave', function () { hx = 0; hy = 0; });
    // mit Finger oder Maus drehen
    stage.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      needBack();
      drag = { x: e.clientX, last: e.clientX, off: 0, moved: false, id: e.pointerId };
      vel = 0; stage.classList.add('is-drag');
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
      wake();
    });
    function end() {
      if (!drag) return;
      var total = base + drag.off + vel * 9, snapped = Math.round(total / 180) * 180;
      ry = base + drag.off; base = snapped; drag = null; stage.classList.remove('is-drag');
      label(); wake();
    }
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
  }
  /** Nur für Prüfläufe und Bildausgabe: die Glasmünze in einer festen Lage zeichnen (Grad). */
  function pose(a, b, c) { if (glc) glc.draw(a, b, c); return !!glc; }
  return { init: init, pose: pose };
})();
