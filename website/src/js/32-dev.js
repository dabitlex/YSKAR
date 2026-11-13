/*
 * API-Konsole der Entwicklerseite. Sie sendet die Anfrage wirklich (nur GET, nur lesend) und misst die Antwortzeit.
 * Gezeigt und kopiert wird die öffentliche Adresse der API; gefragt wird derselbe Rechner, der die Seite liefert.
 * Schlägt eine Anfrage fehl, zeigt sie die letzte Antwort, die die Seite dazu schon hat, und sagt das dazu.
 */
var Dev = (function () {
  'use strict';
  var ZERO = 'ysr1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqregwfw';
  var BURN = '7381a7bd87936682cf7daceaae077a2e5bba104d2629a43ec1df71d13275bca0';
  var EP, list, urlEl, metaEl, outEl, cur = 1 /* die Zusammenfassung zeigt schon der Seitenkopf */, token = 0, drawn = false;

  function endpoints() {
    var S = Live.S;
    return [
      { path: '/summary', d: 'dev.api.e.summary', last: function () { return S.summary; } },
      { path: '/blocks?limit=3', d: 'dev.api.e.blocks', last: function () { return { blocks: S.blocks.slice(0, 3) }; } },
      { path: '/blocks/0', d: 'dev.api.e.block' },
      { path: '/tx/' + BURN, short: '/tx/7381a7bd…', d: 'dev.api.e.tx' },
      { path: '/account/' + ZERO, short: '/account/ysr1qqqq…', d: 'dev.api.e.account' },
      { path: '/search?q=3974', d: 'dev.api.e.search' },
      { path: '/fees', d: 'dev.api.e.fees', last: function () { return S.fees; } },
      { path: '/pools', d: 'dev.api.e.pools', last: function () { return S.pools; } },
      { path: '/supply', d: 'dev.api.e.supply', last: function () { return S.supply; } },
      { path: '/supply/circulating', d: 'dev.api.e.circ', plain: true, last: function () { return String(S.supply.circulating); } }];
  }
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  /** JSON lesbar setzen: Schlüssel gedämpft, Zeichenketten und Zahlen unterscheidbar. */
  function pretty(v) {
    var s = esc(JSON.stringify(v, null, 2));
    return s.replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)\b/g, function (m, str, colon, lit) {
      if (str) return colon ? '<span class="jk">' + str + '</span>' + colon : '<span class="js">' + str + '</span>';
      return '<span class="jn">' + lit + '</span>';
    });
  }
  function show(body, plain) {
    if (plain) outEl.textContent = String(body); else outEl.innerHTML = pretty(body);
    outEl.scrollTop = 0;
  }
  function run() {
    var e = EP[cur], my = ++token, t0 = Date.now();
    urlEl.textContent = ''; urlEl.appendChild(U.el('span', { 'class': 'verb', text: 'GET' }));
    urlEl.appendChild(U.el('span', { 'class': 'base', text: ' ' + Live.PUBLIC }));
    urlEl.appendChild(U.el('span', { 'class': 'path', text: e.path }));
    U.$$('button', list).forEach(function (b, i) { b.setAttribute('aria-pressed', i === cur ? 'true' : 'false'); });
    metaEl.textContent = t('dev.api.busy'); metaEl.className = 'api-meta';
    fetch(Live.API + e.path, { cache: 'no-store' }).then(function (r) {
      if (r.status >= 500) throw new Error('HTTP ' + r.status);          // der Dienst selbst ist ausgefallen; 4xx ist eine Antwort der API
      return (e.plain ? r.text() : r.json()).then(function (body) {
        if (my !== token) return;
        show(body, e.plain);
        metaEl.textContent = t('dev.api.ok', { status: r.status + (r.ok ? ' OK' : ''), ms: U.num(Date.now() - t0) });
        metaEl.className = 'api-meta ok';
      });
    }).catch(function (err) {
      if (my !== token) return;
      var why = String((err && err.message) || err).slice(0, 60), last = e.last ? e.last() : null;
      if (last !== null && last !== undefined) { show(last, e.plain); metaEl.textContent = t('dev.api.fail', { why: why, date: U.date(Live.S.at, true) }); }
      else { outEl.textContent = ''; metaEl.textContent = t('dev.api.down', { why: why }); }
      metaEl.className = 'api-meta snap';
    });
  }
  function build() {
    list.textContent = '';
    EP.forEach(function (e, i) {
      var b = U.el('button', { type: 'button', 'aria-pressed': i === cur ? 'true' : 'false' }, [
        U.el('span', { 'class': 'p mono', text: e.short || e.path }), U.el('span', { 'class': 'd', text: t(e.d) })]);
      b.addEventListener('click', function () { cur = i; run(); });
      list.appendChild(b);
    });
  }
  function ensure() { if (Router.current() !== 'build') return; if (!drawn) { drawn = true; build(); run(); } }
  function init() {
    list = document.getElementById('api-list'); if (!list) return;
    urlEl = document.getElementById('api-url'); metaEl = document.getElementById('api-meta'); outEl = document.getElementById('api-out');
    EP = endpoints();
    document.getElementById('api-run').addEventListener('click', run);
    var curl = document.getElementById('api-curl');
    curl.addEventListener('click', function () { U.copyText('curl -s "' + Live.PUBLIC + EP[cur].path + '"', curl, t('ui.copied')); });
    U.on('lang', function () { if (drawn) { build(); run(); } });
    ensure();
  }
  return { init: init };
})();
