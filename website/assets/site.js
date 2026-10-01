/*
 * yskar.app -- Sprache, Menue, Live-Werte.
 *
 * Kein Framework, kein Build: Die Seiten sind fertiges HTML mit englischem
 * Text. Dieses Skript ersetzt ihn durch die gewaehlte Sprache.
 *
 *   data-t="schluessel"      Text des Elements
 *   data-th="schluessel"     Inhalt als HTML (nur eigene Texte, nie fremde)
 *   data-ta="attr:schl;..."  Attribute, z.B. aria-label oder alt
 *
 * Woerterbuecher liegen in assets/i18n/<sprache>.js. Englisch ist immer
 * geladen und fuellt jede Luecke.
 */
(function () {
  'use strict';

  var SPRACHEN = [
    ['en', 'English'], ['de', 'Deutsch'], ['es', 'Español'], ['pt', 'Português'],
    ['fr', 'Français'], ['it', 'Italiano'], ['pl', 'Polski'], ['ru', 'Русский'],
    ['tr', 'Türkçe'], ['zh', '中文']
  ];
  var LOCALES = {
    en: 'en-US', de: 'de-DE', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR',
    it: 'it-IT', pl: 'pl-PL', ru: 'ru-RU', tr: 'tr-TR', zh: 'zh-CN'
  };
  var HTML_LANG = { zh: 'zh-CN' };
  var MERKER = 'yskar.sprache';
  var API = 'https://yskar.vercel.app/api/v2';
  var EPOCHE = 12000;

  var texte = window.YSKAR_TEXTE = window.YSKAR_TEXTE || {};
  var sprache = 'en';

  function bekannt(s) {
    for (var i = 0; i < SPRACHEN.length; i++) if (SPRACHEN[i][0] === s) return true;
    return false;
  }

  /** ?lang=, dann gemerkte Wahl, dann Browser, sonst Englisch. */
  function erkennen() {
    try {
      var p = new URLSearchParams(location.search).get('lang');
      if (p && bekannt(p)) return p;
    } catch (e) { /* alte Browser */ }
    try {
      var g = localStorage.getItem(MERKER);
      if (g && bekannt(g)) return g;
    } catch (e) { /* privater Modus */ }
    var k = [].concat(navigator.languages || [], navigator.language || []);
    for (var i = 0; i < k.length; i++) {
      var kurz = String(k[i]).toLowerCase().slice(0, 2);
      if (bekannt(kurz)) return kurz;
    }
    return 'en';
  }

  function t(schl) {
    var b = texte[sprache] || {};
    if (Object.prototype.hasOwnProperty.call(b, schl)) return b[schl];
    var e = texte.en || {};
    return Object.prototype.hasOwnProperty.call(e, schl) ? e[schl] : null;
  }

  function anwenden() {
    document.documentElement.lang = HTML_LANG[sprache] || sprache;
    var titel = t('seite.' + (document.body.getAttribute('data-seite') || 'start') + '.titel');
    if (titel) document.title = titel;
    var beschr = t('seite.' + (document.body.getAttribute('data-seite') || 'start') + '.beschreibung');
    var meta = document.querySelector('meta[name=description]');
    if (beschr && meta) meta.setAttribute('content', beschr);

    var els = document.querySelectorAll('[data-t]');
    for (var i = 0; i < els.length; i++) {
      var v = t(els[i].getAttribute('data-t'));
      if (v !== null) els[i].textContent = v;
    }
    els = document.querySelectorAll('[data-th]');
    for (i = 0; i < els.length; i++) {
      var h = t(els[i].getAttribute('data-th'));
      if (h !== null) els[i].innerHTML = h;
    }
    els = document.querySelectorAll('[data-ta]');
    for (i = 0; i < els.length; i++) {
      var paare = els[i].getAttribute('data-ta').split(';');
      for (var j = 0; j < paare.length; j++) {
        var teil = paare[j].split(':');
        var w = t(teil[1]);
        if (w !== null) els[i].setAttribute(teil[0], w);
      }
    }
    // Zahlen im Format der Sprache: 15,75 statt 15.75.
    els = document.querySelectorAll('[data-n]');
    for (i = 0; i < els.length; i++) {
      els[i].textContent = Number(els[i].getAttribute('data-n'))
        .toLocaleString(LOCALES[sprache], { maximumFractionDigits: 2 });
    }
    var sel = document.getElementById('sprache');
    if (sel) sel.value = sprache;
    whitepaperSprache();
    liveZeigen();
    document.documentElement.classList.remove('i18n-wartet');
  }

  function laden(s, fertig) {
    if (texte[s] || s === 'en') { fertig(); return; }
    var sk = document.createElement('script');
    sk.src = '/assets/i18n/' + s + '.js';
    sk.onload = fertig;
    sk.onerror = fertig;     // dann eben Englisch
    document.head.appendChild(sk);
  }

  function setzen(s, merken) {
    if (!bekannt(s)) s = 'en';
    if (merken) { try { localStorage.setItem(MERKER, s); } catch (e) { /* egal */ } }
    laden(s, function () { sprache = s; anwenden(); });
  }

  // ---------------------------------------------------------------- Auswahl
  function auswahlBauen() {
    var sel = document.getElementById('sprache');
    if (!sel) return;
    for (var i = 0; i < SPRACHEN.length; i++) {
      var o = document.createElement('option');
      o.value = SPRACHEN[i][0];
      o.textContent = SPRACHEN[i][1];
      o.lang = HTML_LANG[SPRACHEN[i][0]] || SPRACHEN[i][0];
      sel.appendChild(o);
    }
    sel.addEventListener('change', function () { setzen(sel.value, true); });
  }

  // ---------------------------------------------------------------- Menue
  function menue() {
    var k = document.getElementById('menue-knopf');
    var n = document.getElementById('nav');
    if (!k || !n) return;
    k.addEventListener('click', function () {
      var auf = n.classList.toggle('offen');
      k.setAttribute('aria-expanded', auf ? 'true' : 'false');
    });
    n.addEventListener('click', function (e) {
      if (e.target && e.target.tagName === 'A') {
        n.classList.remove('offen');
        k.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // ---------------------------------------------------------------- Whitepaper
  // Das Whitepaper gibt es auf Deutsch und Englisch. Deutsch fuer Deutsch,
  // sonst Englisch; der Leser kann umschalten.
  var wpWahl = null;
  function whitepaperSprache() {
    var de = document.getElementById('wp-de');
    var en = document.getElementById('wp-en');
    if (!de || !en) return;
    var zeige = wpWahl || (sprache === 'de' ? 'de' : 'en');
    de.hidden = zeige !== 'de';
    en.hidden = zeige !== 'en';
    var kn = document.querySelectorAll('[data-wp]');
    for (var i = 0; i < kn.length; i++) {
      kn[i].setAttribute('aria-pressed', kn[i].getAttribute('data-wp') === zeige ? 'true' : 'false');
    }
    var h = document.getElementById('wp-hinweis');
    if (h) h.hidden = sprache === 'de' || sprache === 'en';
    // Inhaltsverzeichnis aus den Ueberschriften der sichtbaren Fassung.
    var toc = document.getElementById('wp-toc');
    if (toc) {
      toc.textContent = '';
      var hs = (zeige === 'de' ? de : en).querySelectorAll('h2[id]');
      for (var j = 0; j < hs.length; j++) {
        var a = document.createElement('a');
        a.href = '#' + hs[j].id;
        a.textContent = hs[j].textContent;
        toc.appendChild(a);
      }
    }
  }
  function whitepaperKnoepfe() {
    var kn = document.querySelectorAll('[data-wp]');
    for (var i = 0; i < kn.length; i++) {
      kn[i].addEventListener('click', function (e) {
        wpWahl = e.currentTarget.getAttribute('data-wp');
        whitepaperSprache();
      });
    }
  }

  // ---------------------------------------------------------------- Live
  var live = null;     // letzte Antwort von /summary
  var liveFehler = false;

  function rate(h) {
    if (!(h > 0)) return '—';
    var stufen = [[1e21, 'ZH/s'], [1e18, 'EH/s'], [1e15, 'PH/s'], [1e12, 'TH/s'], [1e9, 'GH/s'], [1e6, 'MH/s'], [1e3, 'kH/s']];
    for (var i = 0; i < stufen.length; i++) {
      if (h >= stufen[i][0]) return (h / stufen[i][0]).toLocaleString(LOCALES[sprache], { maximumFractionDigits: 2 }) + ' ' + stufen[i][1];
    }
    return Math.round(h) + ' H/s';
  }

  function liveZeigen() {
    var feld = function (id, wert) { var e = document.getElementById(id); if (e) e.textContent = wert; };
    var loc = LOCALES[sprache];
    if (!live) {
      if (liveFehler) feld('live-status', t('live.fehler') || '');
      return;
    }
    var h = Number(live.height);
    feld('live-hoehe', isFinite(h) ? '#' + h.toLocaleString(loc) : '—');
    feld('live-rate', rate(Number(live.hashrate)));
    var umlauf = Number(BigInt(live.totalSupply || '0') / 100000000n);
    feld('live-umlauf', umlauf.toLocaleString(loc) + ' YSR');
    var naechste = (Math.floor(h / EPOCHE) + 1) * EPOCHE;
    var vorlage = t('live.blockN') || 'Block {n}';
    feld('live-halbierung', vorlage.replace('{n}', naechste.toLocaleString(loc)));
    feld('live-status', t('live.stand') || '');
  }

  function liveHolen() {
    if (!document.getElementById('live-hoehe')) return;
    fetch(API + '/summary', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { live = d; liveFehler = false; liveZeigen(); })
      .catch(function () { liveFehler = true; liveZeigen(); });
  }

  // ---------------------------------------------------------------- Start
  // Hoechstens 1,5 Sekunden unsichtbar -- danach lieber Englisch als nichts.
  setTimeout(function () { document.documentElement.classList.remove('i18n-wartet'); }, 1500);

  document.addEventListener('DOMContentLoaded', function () {
    auswahlBauen();
    menue();
    whitepaperKnoepfe();
    setzen(erkennen(), false);
    liveHolen();
    setInterval(liveHolen, 60000);
    var jahr = document.getElementById('jahr');
    if (jahr) jahr.textContent = String(new Date().getFullYear());
  });
})();
