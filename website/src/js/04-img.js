/*
 * Bilder. Jedes <img> mit dem Attribut data-img bekommt seine Quelle aus dem Bildverzeichnis der Seite (tools/build.mjs).
 * Varianten: name-p / name-w (Hochformat / Querformat, nur mit data-orient) und name-en / name-de (Sprache).
 */
var Img = (function () {
  'use strict';
  var IMG = (window.YSKAR_SITE || {}).img || {}, mq = window.matchMedia ? window.matchMedia('(max-aspect-ratio: 4/5)') : null;

  function orient() { return mq && mq.matches ? 'p' : 'w'; }
  function pick(name, withOrient) {
    var lang = document.documentElement.lang === 'de' ? 'de' : 'en', o = withOrient ? orient() : null, c = [];
    if (o) c.push(name + '-' + o + '-' + lang, name + '-' + o);
    c.push(name + '-' + lang, name + '-en', name);
    if (o) c.push(name + '-w', name + '-p');
    for (var i = 0; i < c.length; i++) if (IMG[c[i]]) return IMG[c[i]];
    return null;
  }
  function apply(root) {
    U.$$('[data-img]', root || document).forEach(function (e) {
      var src = pick(e.getAttribute('data-img'), e.hasAttribute('data-orient'));
      if (!src || e.getAttribute('src') === src) return;
      if (!e.hasAttribute('data-lazy') || e._seen) set(e, src); else e._want = src;
    });
  }
  function set(e, src) {
    e.setAttribute('src', src);
    if (e.complete) e.classList.add('is-loaded'); else e.addEventListener('load', function () { e.classList.add('is-loaded'); }, { once: true });
  }
  function init() {
    if (mq) { var f = function () { apply(document); U.emit('orient', orient()); }; if (mq.addEventListener) mq.addEventListener('change', f); else if (mq.addListener) mq.addListener(f); }
    // Bilder mit data-lazy erst laden, wenn sie in die Nähe des Bildausschnitts kommen
    var lazy = U.$$('img[data-lazy]');
    if (!('IntersectionObserver' in window)) { lazy.forEach(function (e) { e._seen = true; }); apply(document); return; }
    var io = new IntersectionObserver(function (list) {
      list.forEach(function (en) {
        if (!en.isIntersecting) return;
        var e = en.target; e._seen = true; io.unobserve(e);
        if (e._want) { set(e, e._want); e._want = null; } else apply(e.parentNode);
      });
    }, { rootMargin: '900px 0px' });
    lazy.forEach(function (e) { io.observe(e); });
    // nach einem Seitenwechsel sind bisher verborgene Bilder erst messbar
    U.on('route', function () { lazy.forEach(function (e) { if (!e._seen) { io.unobserve(e); io.observe(e); } }); });
  }
  return { apply: apply, init: init, orient: orient, url: function (name) { return IMG[name] || null; } };
})();
