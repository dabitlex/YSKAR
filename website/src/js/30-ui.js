/* Bedienung: Menü, Kopfleiste, Umschalter, Kopieren. */
var UI = (function () {
  'use strict';
  var menu, btn, bar, lastY = 0, lastFocus = null;

  function setMenu(open, quiet) {
    if (!menu) return;
    if (menu.hidden === !open) return;
    menu.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('menu-open', open);
    U.$('.menu-btn__t', btn).textContent = t(open ? 'nav.close' : 'nav.menu');
    if (open) { lastFocus = document.activeElement; menu.scrollTop = 0; var a = U.$('.menu__a', menu); if (a) a.focus({ preventScroll: true }); }
    else if (!quiet && lastFocus && lastFocus.focus) btn.focus({ preventScroll: true });
  }
  function nav() {
    menu = document.getElementById('menu'); btn = document.getElementById('menu-btn'); bar = document.getElementById('bar');
    btn.addEventListener('click', function () { setMenu(btn.getAttribute('aria-expanded') !== 'true'); });
    // Ein Klick auf einen Link im Menü, der zur schon offenen Seite führt, löst keinen Seitenwechsel aus: trotzdem schließen.
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false, true); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) setMenu(false);
      if (e.key === 'Tab' && !menu.hidden) {           // Fokus im Menü halten (samt Menüknopf)
        var f = [btn].concat(U.$$('a,button', menu));
        var i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
    U.on('lang', function () { U.$('.menu-btn__t', btn).textContent = t(menu.hidden ? 'nav.menu' : 'nav.close'); });

    function scrolled() {
      var y = window.scrollY, down = y > lastY + 4, up = y < lastY - 4;
      bar.classList.toggle('is-solid', y > 24);
      if (y < 120 || up) bar.classList.remove('is-away');
      else if (down && y > 320 && menu.hidden) bar.classList.add('is-away');
      if (down || up) lastY = y;
    }
    window.addEventListener('scroll', scrolled, { passive: true }); scrolled();
    bar.addEventListener('focusin', function () { bar.classList.remove('is-away'); });
    U.on('route', function () { lastY = 0; bar.classList.remove('is-away'); scrolled(); });
  }

  /** Mitmachen-Leiste (schmale Bildschirme): erscheint, sobald der Seitenanfang aus dem Bild ist; weicht dem Seitenende. */
  function dock() {
    var d = document.getElementById('dock'); if (!d) return;
    d.hidden = false; d.classList.add('is-off');
    function upd() {
      var y = window.scrollY, vh = window.innerHeight, page = Router.current();
      var doc = document.documentElement.scrollHeight, foot = document.getElementById('foot');
      var nearEnd = foot ? (foot.getBoundingClientRect().top - vh) < vh * 0.9 : (y + vh > doc - vh);
      var quiet = page === 'start' || page === 'explorer';
      d.classList.toggle('is-off', quiet || y < vh * 0.9 || nearEnd);
    }
    var raf = 0;
    window.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(function () { raf = 0; upd(); }); }, { passive: true });
    U.on('route', function () { setTimeout(upd, 60); });
    upd();
  }

  /** <div data-tabs> mit <button data-tab="x"> und <div data-panel="x"> */
  function tabs() {
    U.$$('[data-tabs]').forEach(function (root) {
      var btns = U.$$('[data-tab]', root), panels = U.$$('[data-panel]', root);
      function show(id) {
        btns.forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-tab') === id ? 'true' : 'false'); });
        panels.forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== id; });
        U.emit('tab', { root: root, id: id });
      }
      btns.forEach(function (b) { b.addEventListener('click', function () { show(b.getAttribute('data-tab')); }); });
      var first = btns.filter(function (b) { return b.getAttribute('aria-selected') === 'true'; })[0] || btns[0];
      if (first) show(first.getAttribute('data-tab'));
    });
  }

  /** <button data-copy> kopiert den Text des vorangehenden .code-Blocks oder von data-copy="#id" */
  function copy() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-copy]'); if (!b) return;
      var sel = b.getAttribute('data-copy'), src = sel ? U.$(sel) : (b.parentNode.querySelector('.code') || b.previousElementSibling);
      if (src) U.copyText(src.getAttribute('data-raw') || src.textContent.trim(), b, t('ui.copied'));
    });
  }

  /** "Zum Inhalt springen": der Anker #main ist keine Seite, deshalb hier abfangen statt den Wegweiser zu rufen. */
  function skip() {
    var a = U.$('.skip'), m = document.getElementById('main');
    if (!a || !m) return;
    a.addEventListener('click', function (e) { e.preventDefault(); m.focus({ preventScroll: true }); m.scrollIntoView({ block: 'start' }); });
  }

  /** Aufklappbare Abschnitte: <button data-more="#id"> zeigt oder verbirgt das Ziel. */
  function more() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-more]'); if (!b) return;
      var target = U.$(b.getAttribute('data-more')); if (!target) return;
      var open = target.hidden;
      target.hidden = !open; b.setAttribute('aria-expanded', open ? 'true' : 'false');
      U.emit('layout');
    });
  }

  /** Gestapelte Tabellen (Telefon): jede Zelle trägt den Namen ihrer Spalte. */
  function labelTables(root) {
    var tables = root && root.matches && root.matches('table') ? [root] : U.$$('table.stack-s', root || document);
    tables.forEach(function (tb) {
      var heads = U.$$('thead th', tb).map(function (th) { return th.textContent.trim(); });
      U.$$('tbody tr', tb).forEach(function (tr) {
        U.$$('td', tr).forEach(function (td, i) { if (heads[i]) td.setAttribute('data-label', heads[i]); });
      });
    });
  }

  function init() { nav(); dock(); tabs(); copy(); skip(); more(); labelTables(); U.on('lang', function () { labelTables(); }); }
  return { init: init, labelTables: labelTables, closeMenu: function (quiet) { setMenu(false, quiet); } };
})();
