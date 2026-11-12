/*
 * Bewegung. Drei Arten, sonst keine:
 *  1. Der Auftakt der Startseite (einmal): Titel, Himmel, Lichter.
 *  2. An das Scrollen gebundene Szenen (GSAP ScrollTrigger): Bühne, Wörter die „angehen“, Morgengrauen.
 *  3. Einblenden beim Erscheinen (IntersectionObserver): [data-rise], [data-unveil], Zahlen mit [data-count].
 * Wer „Bewegung reduzieren“ eingestellt hat, sieht alles sofort und unbewegt.
 */
var Scenes = (function () {
  'use strict';
  var calm = false, introDone = false, hasGsap = false, io = null;

  /* ---------- Wörter einzeln ansprechbar machen ---------- */
  function split(root) {
    U.$$('[data-lit]', root || document).forEach(function (el) {
      if (el._split && el.querySelector('.w')) return;
      var words = el.textContent.trim().split(/[ \n\t]+/);     // geschützte Leerzeichen halten Zahl und Wort zusammen
      el.textContent = '';
      words.forEach(function (w, i) {
        var s = document.createElement('span'); s.className = 'w'; s.textContent = w; el.appendChild(s);
        if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
      });
      el._split = true; el._n = words.length; el._k = -1;
      light(el, el._p || 0);
    });
  }
  function light(el, p) {
    el._p = p;
    var k = calm ? el._n : Math.min(el._n, Math.round(p * el._n * 1.1));
    if (k === el._k) return;
    var kids = el.children, i;
    for (i = 0; i < kids.length; i++) kids[i].classList.toggle('on', i < k);
    el._k = k;
  }

  /** Laternenweg: so viele Stufen leuchten, wie der Fortschritt hergibt; die Linie reicht bis zur letzten leuchtenden. */
  function path(ol, p) {
    var items = ol.children, k = Math.min(items.length, Math.round(p * items.length * 1.05)), i;
    if (k === ol._k) return;
    ol._k = k;
    for (i = 0; i < items.length; i++) items[i].classList.toggle('on', i < k);
    var last = items[Math.max(0, k - 1)], first = items[0], wide = last.offsetTop === first.offsetTop;
    ol.style.setProperty('--len', (k ? (wide ? last.offsetLeft - first.offsetLeft : last.offsetTop - first.offsetTop) : 0) + 'px');
  }

  /* ---------- Einblenden beim Erscheinen ---------- */
  function reveal() {
    var list = U.$$('[data-rise],[data-unveil],[data-count]');
    if (!('IntersectionObserver' in window) || calm) { list.forEach(show); return; }
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { show(en.target); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    list.forEach(function (e) { io.observe(e); });
  }
  function show(e) {
    var d = e.getAttribute('data-delay');
    if (d) e.style.transitionDelay = d + 'ms';
    e.classList.add('in');
    if (e.hasAttribute('data-count')) count(e);
  }
  /** Zahl hochzählen: Ziel ist der fertig formatierte Live-Wert, gezählt werden nur die Ziffern. */
  function count(e) {
    var key = e.getAttribute('data-count'), v = Live.values()[key];
    if (v === undefined) return;
    e._counted = true;
    var target = parseInt(String(v).replace(/[^\d]/g, ''), 10);
    if (calm || !hasGsap || !isFinite(target) || target < 3) { e.textContent = v; return; }
    var o = { n: 0 };
    gsap.to(o, { n: target, duration: 1.6, ease: 'power2.out', onUpdate: function () { e.textContent = U.num(Math.round(o.n)); }, onComplete: function () { e.textContent = Live.values()[key]; } });
  }
  function recount() { U.$$('[data-count]').forEach(function (e) { if (e._counted) { var v = Live.values()[e.getAttribute('data-count')]; if (v !== undefined) e.textContent = v; } }); }

  /* ---------- Auftakt ---------- */
  function intro() {
    if (introDone || Router.current() !== 'home') return;
    introDone = true;
    if (calm || !hasGsap) { Sky.state.power = 1; Sky.state.reveal = 1; Sky.lightUp(false); Sky.draw(true); return; }
    var tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.from('.hero__title .ln > span', { yPercent: 112, duration: 1.35, stagger: 0.13 }, 0.1)
      .from('.hero__lead', { opacity: 0, y: 20, duration: 1.1 }, 0.75)
      .from('.hero__cta > *', { opacity: 0, y: 16, duration: 0.9, stagger: 0.09 }, 0.95)
      .to(Sky.state, { power: 1, duration: 3.4, ease: 'power2.out' }, 0.15)
      .to(Sky.state, { reveal: 1, duration: 4.2, ease: 'power1.inOut' }, 0.15)
      .add(function () { Sky.lightUp(true); }, 1.1)
      .from('.hero__note', { opacity: 0, duration: 1.4 }, 2.3);
  }

  /* ---------- An das Scrollen gebundene Szenen ---------- */
  function scrub() {
    if (!hasGsap) return;
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
    var mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', function () {
      // Bühne: langsam näher, dunkler, sobald der Text darüber läuft
      if (document.getElementById('opening')) {
        gsap.timeline({ scrollTrigger: { trigger: '#opening', start: 'top top', end: 'bottom bottom', scrub: 0.6 } })
          .to({}, { duration: 1 }, 0)
          .to('.stage__inner', { scale: 1.16, ease: 'none', duration: 1 }, 0)
          .to('.hero__in', { opacity: 0, y: -70, ease: 'none', duration: 0.14 }, 0.03)
          .to('.hero__note', { opacity: 0, ease: 'none', duration: 0.06 }, 0)
          .to('.stage__scrim', { opacity: 1, ease: 'none', duration: 0.2 }, 0.1);
      }
      // Wörter gehen an
      U.$$('[data-lit]').forEach(function (el) {
        ScrollTrigger.create({ trigger: el, start: 'top 82%', end: 'bottom 46%', onUpdate: function (self) { light(el, self.progress); },
          onLeave: function () { light(el, 1); }, onLeaveBack: function () { light(el, 0); } });
      });
      // Morgengrauen: die Nacht blendet in die Dämmerung über
      U.$$('[data-dawn]').forEach(function (sec) {
        var dawn = U.$('.dawn__day', sec), txt = U.$('.dawn__txt', sec);
        if (!dawn) return;
        var tl = gsap.timeline({ scrollTrigger: { trigger: sec, start: 'top 75%', end: 'bottom bottom', scrub: 0.5 } });
        tl.fromTo(dawn, { opacity: 0 }, { opacity: 1, ease: 'none', duration: 0.7 }, 0)
          .fromTo(U.$('.dawn__stage', sec), { scale: 1.12 }, { scale: 1, ease: 'none', duration: 1 }, 0);
        if (txt) tl.fromTo(txt, { opacity: 0, y: 40 }, { opacity: 1, y: 0, ease: 'none', duration: 0.3 }, 0.55);
      });
      // Menschen: die Laternen gehen an, während der Abschnitt ins Bild kommt
      U.$$('.people__on').forEach(function (img) {
        gsap.fromTo(img, { opacity: 0 }, { opacity: 1, ease: 'none', scrollTrigger: { trigger: img.parentNode, start: 'top 70%', end: 'top -5%', scrub: 0.5 } });
      });
      // Laternenweg (Lab): Stufe für Stufe geht an
      U.$$('[data-path]').forEach(function (ol) {
        ScrollTrigger.create({ trigger: ol, start: 'top 80%', end: 'bottom 52%', onUpdate: function (self) { path(ol, self.progress); },
          onLeave: function () { path(ol, 1); }, onLeaveBack: function () { path(ol, 0); } });
      });
      // Wege: das überdeckte Bild tritt zurück
      U.$$('.ways').forEach(function (group) {
        U.$$('.door', group).forEach(function (w, i, all) {
          if (i === all.length - 1) return;
          gsap.to(U.$('.door__in', w), { scale: 0.94, opacity: 0.35, ease: 'none',
            scrollTrigger: { trigger: all[i + 1], start: 'top bottom', end: 'top top', scrub: true } });
        });
      });
      // Bilder mit leichter Tiefe
      U.$$('[data-drift] img').forEach(function (img) {
        gsap.fromTo(img, { yPercent: -6 }, { yPercent: 6, ease: 'none', scrollTrigger: { trigger: img.parentNode, start: 'top bottom', end: 'bottom top', scrub: true } });
      });
    });
    mm.add('(prefers-reduced-motion: reduce)', function () { U.$$('[data-lit]').forEach(function (el) { light(el, 1); }); });
  }
  function refresh() { if (hasGsap && window.ScrollTrigger) ScrollTrigger.refresh(); }

  function init() {
    calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    hasGsap = !!(window.gsap && window.ScrollTrigger);
    split(document);
    scrub();
    reveal();
    U.on('lang', function () { split(document); setTimeout(refresh, 60); });
    U.on('route', function (r) { requestAnimationFrame(function () { refresh(); if (r.page === 'home') intro(); }); });
    U.on('layout', function () { setTimeout(refresh, 60); });
    U.on('data', recount);
    window.addEventListener('load', function () { refresh(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
    intro();
  }
  return { init: init, refresh: refresh, split: split };
})();
