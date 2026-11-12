/*
 * Knoten-Seite: das Ufer aus dem Titelbild als eigene Szene, mit einem Licht je gemeldetem Knoten.
 * Der Knopf zeigt, wie es mit einem weiteren aussähe. Das ist nur eine Vorschau auf dem Bildschirm des Besuchers und zählt nichts hoch.
 * Dazu: die Laternenfotos der Community (aus → an).
 */
var Shore = (function () {
  'use strict';
  // Ausschnitte der beiden Bildfassungen im quadratischen Original (siehe tools/imgprep.py)
  var CROPS = { w: { x: 0, y: 396, w: 2048, h: 1366 }, p: { x: 448, y: 0, w: 1152, h: 2048 } }, SQ = 2048, SHORE_Y = 0.5805;
  var sec, stage, inner, photo, box, btn, note, lights = [], geo = { l: 0, t: 0, s: 1 }, mine = false, lit = false, calm = false;

  function measure() {
    var W = stage.clientWidth, H = stage.clientHeight; if (!W || !H) return;
    var c = CROPS[Img.orient()], s = Math.max(W / c.w, H / c.h), w = c.w * s, h = c.h * s;
    var l = Math.min(0, Math.max(W - w, W / 2 - (0.5 * SQ - c.x) * s));
    var t = Math.min(0, Math.max(H - h, H * 0.6 - (SHORE_Y * SQ - c.y) * s));       // Uferlinie auf 60 % der Höhe, soweit das Bild reicht
    geo.l = l - c.x * s; geo.t = t - c.y * s; geo.s = s;
    photo.style.width = w.toFixed(1) + 'px'; photo.style.height = h.toFixed(1) + 'px';
    photo.style.transform = 'translate3d(' + l.toFixed(1) + 'px,' + t.toFixed(1) + 'px,0)';
    inner.style.transformOrigin = '50% ' + ((geo.t + SHORE_Y * SQ * s) / H * 100).toFixed(1) + '%';
    place();
  }
  function place() {
    var unit = Math.max(2.7, Math.min(4.6, stage.clientWidth / 330));       // auf großen Schirmen etwas kräftiger: hier sind die Lichter das Motiv
    lights.forEach(function (el) {
      var sp = el._sp;
      el.style.left = (geo.l + sp.x * SQ * geo.s).toFixed(1) + 'px';
      el.style.top = (geo.t + sp.y * SQ * geo.s).toFixed(1) + 'px';
      el.style.setProperty('--s', (unit * sp.s * (el._mine ? 1.25 : 1)).toFixed(2) + 'px');
    });
  }
  function count() { return Math.max(0, Math.min(Sky.SPOTS.length - 2, Number(Live.S.summary.knoten || 0))); }
  function paint() {
    var n = count(), total = n + (mine ? 1 : 0), v = Live.values();
    while (lights.length > total) box.removeChild(lights.pop());
    while (lights.length < total) {
      var sp = Sky.SPOTS[lights.length], el = document.createElement('i');
      el.className = 'light'; el._sp = sp;
      el.style.setProperty('--d', sp.d.toFixed(2) + 's'); el.style.setProperty('--o', sp.o.toFixed(2));
      box.appendChild(el); lights.push(el);
      if (lit) el.classList.add('on');
    }
    lights.forEach(function (el, i) {
      var m = mine && i === total - 1;
      if (m === !!el._mine) return;
      el._mine = m; el.classList.toggle('is-mine', m);
      if (m) { el.classList.add('on'); var tag = document.createElement('b'); tag.className = 'light__tag'; el.appendChild(tag); }
      else { var old = el.querySelector('.light__tag'); if (old) el.removeChild(old); }
    });
    var tagEl = box.querySelector('.light__tag'); if (tagEl) tagEl.textContent = v.nodesNext;
    place();
    note.textContent = mine ? t('shore.note.on', { k: v.nodesNext }) : '';
    btn.textContent = t(mine ? 'shore.off' : 'shore.on');
    btn.setAttribute('aria-pressed', mine ? 'true' : 'false');
  }
  /** Die Lichter gehen an, sobald das Ufer ins Bild kommt: einzeln, in zufälliger Folge. */
  function lightUp() {
    if (lit) return; lit = true;
    lights.forEach(function (el) {
      if (calm) { el.classList.add('on'); return; }
      setTimeout(function () { el.classList.add('on'); }, 250 + Math.random() * 2300);
    });
  }
  function toggle() {
    mine = !mine; paint();
    if (!mine) return;
    // Ufer und Knopf sollen zugleich zu sehen sein
    var r = sec.getBoundingClientRect(), y = r.top + geo.t + SHORE_Y * SQ * geo.s;
    if (y < 70 || y > window.innerHeight - 90) window.scrollTo({ top: window.scrollY + r.top, behavior: calm ? 'auto' : 'smooth' });
  }

  /** Laternen: erst wenn beide Fotos geladen sind, blendet das helle ein. */
  function lanterns(page) {
    U.$$('[data-lanterns]').forEach(function (el) {
      if (el.getAttribute('data-lanterns') !== page) return;
      el.classList.remove('is-lit');
      var on = U.$('.lanterns__on', el);
      var go = function () { requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('is-lit'); }); }); };
      if (on && on.complete && on.naturalWidth) go(); else if (on) on.addEventListener('load', go, { once: true });
    });
  }
  function init() {
    calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    U.on('route', function (r) { lanterns(r.page); });
    lanterns(Router.current());
    sec = document.getElementById('shoreline'); if (!sec) return;
    stage = document.getElementById('shore'); inner = U.$('.shore__inner', stage); photo = U.$('.shore__photo', stage); box = U.$('.shore__lights', stage);
    btn = document.getElementById('shore-go'); note = document.getElementById('shore-note');
    measure(); paint();
    if (window.ResizeObserver) new ResizeObserver(measure).observe(stage); else window.addEventListener('resize', measure);
    U.on('orient', measure);
    U.on('route', function (r) { if (r.page === 'node') setTimeout(function () { measure(); paint(); }, 40); });
    U.on('data', paint); U.on('lang', paint);
    btn.addEventListener('click', toggle);
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (l) { if (l[0].isIntersecting) { lightUp(); io.disconnect(); } }, { threshold: 0.35 });
      io.observe(stage);
    } else lightUp();
    // die Szene rückt beim Hineinscrollen ein wenig zurück (Lichter und Foto gemeinsam)
    if (!calm && window.gsap && window.ScrollTrigger) {
      gsap.fromTo(inner, { scale: 1.12 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: sec, start: 'top bottom', end: 'top top', scrub: 0.5 } });
    }
  }
  return { init: init };
})();
