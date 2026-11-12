/*
 * Sprache. Die Seiten tragen englischen Text; hier wird er durch die gewählte Sprache ersetzt.
 * Welche das ist, hat das Skript im Kopf der Seite schon entschieden (?lang=, gemerkte Wahl, Sprache des Browsers,
 * sonst Englisch) und ihre Texte angefordert. Die Wahl des Besuchers bleibt im Browser gespeichert (yskar.sprache).
 *
 *   data-t="schluessel"            Inhalt des Elements
 *   data-ta="attribut:schluessel"  ein Attribut (mehrere Paare mit ; getrennt)
 */
var I18n = (function () {
  'use strict';
  var SITE = window.YSKAR_SITE || {}, LANGS = SITE.langs || ['en'], VERSION = SITE.texts || {}, KEEP = 'yskar.sprache';
  var T = window.YSKAR_TEXTE = window.YSKAR_TEXTE || {};
  var lang = LANGS.indexOf(window.YSKAR_LANG) >= 0 ? window.YSKAR_LANG : 'en', waiting = [], reported = {}, failed = window.YSKAR_AUS || {};

  function has(key) { return !!T[lang] && T[lang][key] !== undefined; }
  function t(key, vars) {
    var s = T[lang] && T[lang][key], k;
    if (s === undefined) {
      if (!reported[key] && window.console) { reported[key] = true; console.error('[YSKAR] Text fehlt: ' + key); }
      return key;
    }
    if (vars) for (k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  }
  function apply(root) {
    U.$$('[data-t]', root).forEach(function (e) { e.innerHTML = t(e.getAttribute('data-t')); });
    U.$$('[data-ta]', root).forEach(function (e) {
      e.getAttribute('data-ta').split(';').forEach(function (pair) {
        var p = pair.split(':');
        e.setAttribute(p[0], t(p[1]).replace(/<[^>]+>/g, ''));
      });
    });
    if (window.Img) Img.apply(root);
  }
  /** Die Texte einer Sprache holen, falls sie noch nicht da sind. `done(true)`, sobald sie stehen; `done(false)`, wenn die Datei nicht kam. */
  function load(l, done) {
    if (T[l]) return void done(true);
    var old = document.querySelector('script[data-texts="' + l + '"]');
    if (old && failed[l]) { old.parentNode.removeChild(old); old = null; failed[l] = false; }
    waiting.push({ l: l, done: done });
    if (old) return;                                   // schon angefordert, vom Skript im Kopf der Seite oder von einem früheren Aufruf
    var s = document.createElement('script');
    s.async = true; s.setAttribute('data-texts', l); s.src = '/assets/i18n/' + l + '.js?v=' + (VERSION[l] || '');
    s.onerror = function () { window.YSKAR_TEXTE_AUS(l); };
    document.head.appendChild(s);
  }
  function arrived(l, ok) {
    var rest = [];
    waiting.forEach(function (w) { if (w.l === l) w.done(ok && !!T[l]); else rest.push(w); });
    waiting = rest;
  }
  window.YSKAR_TEXTE_DA = function (l) { arrived(l, true); };
  window.YSKAR_TEXTE_AUS = function (l) { failed[l] = true; arrived(l, false); };

  function show(l, quiet) {
    lang = l;
    document.documentElement.lang = lang;
    apply(document);
    U.$$('[data-lang]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang ? 'true' : 'false'); });
    document.documentElement.classList.remove('lang-wait');
    if (!quiet) U.emit('lang', lang);
  }
  /** Sprache wechseln (Knöpfe im Menü und im Fuß); die Wahl wird gemerkt. */
  function set(l) {
    if (LANGS.indexOf(l) < 0 || l === lang) return;
    load(l, function (ok) { if (!ok) return; U.store(KEEP, l); show(l, false); });
  }
  /**
   * Beim Start: wartet auf die Texte der gewählten Sprache und ruft dann `done`. Kommen sie nicht, bleibt es bei Englisch.
   * Kommen auch die englischen Texte nicht, startet das Programm nicht: Die Seite bleibt, wie sie geliefert wurde.
   */
  function ready(done) {
    load(lang, function (ok) {
      if (ok) return void done();
      document.documentElement.classList.remove('lang-wait');
      if (lang === 'en') return;
      lang = 'en'; document.documentElement.lang = 'en';
      load('en', function (ok2) { if (ok2) done(); });
    });
  }
  function init() {
    show(lang, true);
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-lang]');
      if (b) set(b.getAttribute('data-lang'));
    });
  }
  return { t: t, has: has, set: set, init: init, ready: ready, apply: apply, lang: function () { return lang; } };
})();
var t = I18n.t;
