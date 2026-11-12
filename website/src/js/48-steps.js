/*
 * Scroll-Szene mit stehender Bühne: <section class="story"> … <div class="story__cap">…</div> … </section>
 * Beim Scrollen wechselt die Aussage; die Bühne bekommt den Stand als Zahl f (0 = erste Aussage, n-1 = letzte).
 * Mit „Bewegung reduzieren“ stehen alle Aussagen untereinander und die Bühne zeigt den Endzustand.
 */
var Steps = (function () {
  'use strict';
  function mount(root, onFrame, opt) {
    opt = opt || {};
    var caps = U.$$('.story__cap', root), n = caps.length, fNow = 0, fTo = 0, raf = 0, active = false;
    var calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var api = { f: 0, n: n, calm: calm, kick: kick, active: function () { return active; } };
    function paintCaps() {
      caps.forEach(function (el, i) {
        var d = Math.abs(fNow - i), o = d <= 0.2 ? 1 : d >= 0.47 ? 0 : 1 - (d - 0.2) / 0.27;
        o = o * o * (3 - 2 * o);
        if (el._o !== undefined && Math.abs(o - el._o) < 0.004) return;
        el._o = o; el.style.opacity = o.toFixed(3);
        el.style.transform = 'translate3d(0,' + ((i - fNow) * 46).toFixed(1) + 'px,0)';
        el.style.visibility = o < 0.02 ? 'hidden' : 'visible';
        el.classList.toggle('is-on', o > 0.5);
      });
    }
    function frame() {
      raf = 0;
      var d = fTo - fNow, moving = Math.abs(d) > 0.0015;
      fNow += moving ? d * 0.14 : d;
      api.f = fNow;
      if (!calm) paintCaps();
      var again = onFrame(fNow, api) === true;
      if (active && (moving || again)) raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf) raf = requestAnimationFrame(frame); }
    root.classList.toggle('is-calm', calm);
    if (calm) { fNow = fTo = opt.calmAt !== undefined ? opt.calmAt : n - 1; active = true; kick(); }
    else if (window.ScrollTrigger) {
      ScrollTrigger.create({ trigger: root, start: 'top top', end: 'bottom bottom', onUpdate: function (s) { fTo = s.progress * (n - 1); kick(); } });
      ScrollTrigger.create({ trigger: root, start: 'top bottom', end: 'bottom top', onToggle: function (s) { active = s.isActive; if (active) kick(); } });
    } else { active = true; kick(); }
    var sticky = U.$('.story__sticky', root);
    if (window.ResizeObserver && sticky) new ResizeObserver(function () { if (opt.onSize) opt.onSize(); kick(); }).observe(sticky);
    U.on('route', function () { setTimeout(function () { if (opt.onSize) opt.onSize(); kick(); }, 40); });
    U.on('lang', kick); U.on('data', kick);
    return api;
  }
  return { mount: mount };
})();
