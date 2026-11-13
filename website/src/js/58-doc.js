/*
 * Dokumentseiten (Anleitungen, Protokoll, Whitepaper, Impressum, Datenschutz):
 * Inhaltsverzeichnis aus den Überschriften, Lesefortschritt, Zahlen in der Schreibweise der gewählten Sprache,
 * die laufende Epoche in der Tabelle, Druckknopf nur außerhalb eines Rahmens.
 */
var Doc = (function () {
  'use strict';
  var DOCS = ['guides', 'protocol', 'paper', 'imprint', 'privacy'], prog, wide, io = null, heads = [];
  var paperPick = null;                                 // vom Besucher gewählte Fassung des Whitepapers ('en' | 'de'), sonst folgt sie der Sprache der Seite

  function visible(e) { return !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length); }
  /** Zahlen wie auf der heutigen Seite: data-n = Wert, data-nd = höchste Zahl der Nachkommastellen. */
  function numbers() {
    U.$$('[data-n]').forEach(function (e) {
      var nd = Number(e.getAttribute('data-nd') || 2);
      e.textContent = Number(e.getAttribute('data-n')).toLocaleString(U.loc(), { maximumFractionDigits: nd });
    });
    var era = Math.floor(Number(Live.S.summary.height) / U.EPOCH);
    U.$$('[data-aera]').forEach(function (r) { r.classList.toggle('is-now', Number(r.getAttribute('data-aera')) === era); });
  }
  /** Überschriften der sichtbaren Sprachfassung einsammeln, Anker vergeben, Verzeichnis schreiben. */
  function toc(page) {
    var box = U.$('[data-doc="' + page + '"]'); if (!box) return;
    var links = U.$('.doc__links', box), list = U.$$('.doc__text h2', box).filter(visible), n = 0;
    heads = list;
    list.forEach(function (h) {
      n++;
      if (!h.id) h.id = page + '-s' + n;
      // Kapitelnummer absetzen ("7. Issuance")
      if (!h._num && !h.hasAttribute('data-t')) {
        var m = /^(\d+)\.\s+(.*)$/.exec(h.textContent);
        if (m) { h.textContent = ''; h.appendChild(U.el('span', { 'class': 'doc__num', text: m[1].length < 2 ? '0' + m[1] : m[1] })); h.appendChild(document.createTextNode(m[2])); h._label = m[2]; h._no = m[1]; }
        h._num = true;
      }
    });
    if (!links) return;
    links.textContent = '';
    list.forEach(function (h) {
      var a = U.el('a', { href: '#' + h.id });
      if (h._no) a.appendChild(U.el('i', { text: h._no }));
      a.appendChild(document.createTextNode(h._label || h.textContent));
      links.appendChild(a);
    });
    spy(box);
  }
  function spy(box) {
    if (io) { io.disconnect(); io = null; }
    if (!('IntersectionObserver' in window)) return;
    var links = U.$$('.doc__links a', box);
    io = new IntersectionObserver(function () {
      var best = -1, i, top;
      for (i = 0; i < heads.length; i++) { top = heads[i].getBoundingClientRect().top; if (top < window.innerHeight * 0.35) best = i; }
      links.forEach(function (a, k) { a.classList.toggle('is-here', k === best); });
    }, { rootMargin: '-10% 0px -60% 0px', threshold: [0, 1] });
    heads.forEach(function (h) { io.observe(h); });
  }
  function progress() {
    if (!prog) return;
    var page = Router.current(), on = DOCS.indexOf(page) >= 0 && page !== 'imprint' && page !== 'privacy';
    prog.hidden = !on;
    if (!on) return;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    prog.style.setProperty('--p', max > 0 ? Math.min(1, window.scrollY / max).toFixed(4) : 0);
  }
  function open() { U.$$('.doc__toc details').forEach(function (d) { if (wide.matches) d.open = true; else d.open = false; }); }
  /**
   * Das Whitepaper gibt es auf Englisch und Deutsch. Es folgt der Sprache der Seite (Deutsch, sonst Englisch);
   * die beiden Knöpfe wählen die andere Fassung, ohne die Sprache der Seite zu ändern.
   */
  function paper() {
    var box = U.$('[data-doc="paper"] .doc__text'); if (!box) return;
    var site = I18n.lang(), shown = paperPick || (site === 'de' ? 'de' : 'en');
    box.setAttribute('data-show-lang', shown);
    U.$$('[data-paper]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-paper') === shown ? 'true' : 'false'); });
    U.$$('[data-paper-pick]').forEach(function (e) { e.hidden = false; });
    U.$$('[data-paper-note]').forEach(function (e) { e.hidden = site === 'de' || site === 'en'; });
  }
  function show(page) {
    if (DOCS.indexOf(page) < 0) { progress(); return; }
    if (page === 'paper') paper();
    numbers(); toc(page); open(); progress();
  }
  function init() {
    prog = U.el('i', { 'class': 'doc__prog', 'aria-hidden': 'true', hidden: '' });
    document.body.appendChild(prog);
    wide = window.matchMedia('(min-width:1000px)');
    if (wide.addEventListener) wide.addEventListener('change', open);
    // im Verzeichnis antippen: auf dem Handy danach wieder zuklappen
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('.doc__links a');
      if (a && !wide.matches) { var d = a.closest('details'); if (d) d.open = false; }
    });
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-paper]');
      if (b) { paperPick = b.getAttribute('data-paper'); show('paper'); }
    });
    // Drucken gibt es nur, wenn die Seite nicht in einem Rahmen läuft
    var framed = true;
    try { framed = window.self !== window.top; } catch (e) { framed = true; }
    U.$$('[data-print]').forEach(function (box) {
      if (framed || !window.print) return;
      box.hidden = false;
      box.addEventListener('click', function (e) { if (e.target.closest('button')) window.print(); });
    });
    window.addEventListener('scroll', progress, { passive: true });
    U.on('route', function (r) { setTimeout(function () { show(r.page); }, 30); });
    U.on('lang', function () { setTimeout(function () { show(Router.current()); }, 30); });
    U.on('data', numbers);
    show(Router.current());
  }
  return { init: init };
})();
