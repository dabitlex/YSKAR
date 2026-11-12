/*
 * Wegweiser. Jede Seite ist ein eigenes Dokument mit eigener Adresse (/mining, /chain, /explorer …);
 * welche es ist, steht am <html data-page>. Verweise zwischen Seiten sind gewöhnliche Links.
 *
 * Hier liegt, was darüber hinausgeht:
 *   - href('#mine') / href('#explorer-block-12') macht aus der Schreibweise der Quellen die Adresse
 *     ("/mining", "/explorer#block-12"), für Links, die ein Skript baut
 *   - das Ereignis "route": beim Start und immer, wenn sich der Anker ändert (der Explorer liest ihn aus)
 *   - ein Klick auf die Seite, die schon offen ist, lädt sie nicht neu, sondern führt an ihren Anfang
 *   - der Seitentitel in der gewählten Sprache
 */
var Router = (function () {
  'use strict';
  var SITE = window.YSKAR_SITE || { pages: {} }, PATHS = SITE.pages;
  var page = document.documentElement.getAttribute('data-page') || 'home', last = null;

  function href(ref) {
    var h = String(ref).replace(/^#/, ''), i = h.indexOf('-'), p = i < 0 ? h : h.slice(0, i);
    if (!PATHS.hasOwnProperty(p)) return '#' + h;
    if (i < 0) return PATHS[p];
    return (p === page ? '' : PATHS[p]) + '#' + h.slice(i + 1);
  }
  function parse() {
    var h = (location.hash || '').replace(/^#/, '');
    try { h = decodeURIComponent(h); } catch (e) { /* so lassen */ }
    return { page: page, rest: h };
  }
  /** Zu einer Seite oder einem Anker gehen, in der Schreibweise der Quellen: go('#explorer-block-12'). */
  function go(ref) {
    var url = href(ref);
    if (url.charAt(0) === '#') { if (location.hash === url) changed(true); else location.hash = url; return; }
    if (url === location.pathname && PATHS[page] === url) { if (location.hash) history.pushState(null, '', url); window.scrollTo(0, 0); changed(true); return; }
    location.href = url;
  }
  function title() {
    if (!I18n.has('title.' + page)) return;
    document.title = (page === 'home' ? 'YSKAR – ' + t('title.home') : t('title.' + page) + ' – YSKAR').replace(/<[^>]+>/g, '');
  }
  function changed(force) {
    var now = location.pathname + location.search + location.hash;
    if (now === last && !force) return;
    last = now;
    if (window.UI && UI.closeMenu) UI.closeMenu(true);
    U.emit('route', parse());
  }
  function sameDocument(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href]'), u;
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    try { u = new URL(a.href, location.href); } catch (x) { return; }
    if (u.origin !== location.origin || u.pathname !== location.pathname || u.search !== location.search || u.hash) return;
    // dieselbe Seite ohne Anker: nicht neu laden, sondern an den Anfang
    e.preventDefault();
    if (location.hash) history.pushState(null, '', u.pathname + u.search);
    window.scrollTo(0, 0);
    var m = document.getElementById('main'); if (m && m.focus) m.focus({ preventScroll: true });
    changed();
  }
  function init() {
    last = location.pathname + location.search + location.hash;
    document.addEventListener('click', sameDocument);
    window.addEventListener('hashchange', function () { changed(); });
    window.addEventListener('popstate', function () { changed(); });
    U.on('lang', title);
    title();
    // Ein Anker aus der Adresse: Der Browser springt hin, bevor die Seite ihre endgültige Höhe hat. Solange der Besucher
    // nicht selbst gescrollt hat, noch einmal hinspringen, wenn alles steht.
    var r = parse(), el = r.rest ? document.getElementById(r.rest) : null;
    if (el) {
      var moved = false, jump = function () { if (!moved) el.scrollIntoView({ block: 'start' }); };
      ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (n) { window.addEventListener(n, function () { moved = true; }, { once: true, passive: true }); });
      setTimeout(jump, 80);
      if (document.readyState === 'complete') setTimeout(jump, 400); else window.addEventListener('load', function () { setTimeout(jump, 250); });
    }
    U.emit('route', r);
  }
  return { init: init, parse: parse, href: href, go: go, current: function () { return page; }, PAGES: Object.keys(PATHS) };
})();
