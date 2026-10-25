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

  /*
    Stand der Dateien: das ?v=… aus der eigenen Adresse (im HTML gesetzt).
    Die Woerterbuecher werden mit demselben Stand geholt. So passen Seite,
    Skript und Texte immer zusammen -- auch wenn ein Browser noch eine
    aeltere Fassung einer Sprachdatei im Zwischenspeicher hat.
  */
  var STAND = (function () {
    try {
      var el = document.currentScript || document.querySelector('script[src*="/assets/site.js"]');
      var m = el && /[?&]v=([\w.-]+)/.exec(el.getAttribute('src') || '');
      return m ? m[1] : '';
    } catch (e) { return ''; }
  })();

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
      var nd = Number(els[i].getAttribute('data-nd') || 2);
      els[i].textContent = Number(els[i].getAttribute('data-n'))
        .toLocaleString(LOCALES[sprache], { minimumFractionDigits: els[i].hasAttribute('data-nd') ? 0 : 0, maximumFractionDigits: nd });
    }
    var sel = document.getElementById('sprache');
    if (sel) sel.value = sprache;
    whitepaperSprache();
    liveZeigen();
    document.documentElement.classList.remove('i18n-wartet');
    try { document.dispatchEvent(new CustomEvent('yskar:sprache', { detail: { sprache: sprache } })); } catch (e) { /* alte Browser */ }
  }

  function laden(s, fertig) {
    if (texte[s] || s === 'en') { fertig(); return; }
    var sk = document.createElement('script');
    sk.src = '/assets/i18n/' + s + '.js' + (STAND ? '?v=' + STAND : '');
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
  // Nullkonto: hat keinen Schluessel. Was dort liegt, ist verbrannt (875 YSR aus
  // Block 0 und die YSR, die zum Ausgleich des fruehen Vorsprungs verbrannt wurden).
  var NULLKONTO = 'ysr1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqregwfw';
  var verbrannt = null; // Einheiten (BigInt), aus /account
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
    var loc = LOCALES[sprache];
    // Jedes Feld kann mehrfach vorkommen (Laufband, Kennzahlen): data-live="name",
    // aeltere Seiten nutzen noch id="live-name".
    var feld = function (name, wert) {
      var e = document.getElementById('live-' + name);
      if (e) e.textContent = wert;
      var alle = document.querySelectorAll('[data-live="' + name + '"]');
      for (var i = 0; i < alle.length; i++) alle[i].textContent = wert;
    };
    if (!live) {
      if (liveFehler) feld('status', t('live.fehler') || '');
      return;
    }
    var h = Number(live.height);
    feld('hoehe', isFinite(h) ? '#' + h.toLocaleString(loc) : '—');
    feld('rate', rate(Number(live.hashrate)));
    // totalSupply ist die Summe aller Guthaben, auch die des Nullkontos. Im Umlauf
    // zaehlt nur, was jemand ausgeben kann: ausgegeben minus verbrannt.
    var einheiten = BigInt(live.totalSupply || '0');
    var ausgegeben = Number(einheiten / 100000000n);
    var umlauf = null;
    if (verbrannt !== null) {
      umlauf = Number((einheiten - verbrannt) / 100000000n);
      feld('umlauf', umlauf.toLocaleString(loc) + ' YSR');
      feld('umlaufMio', (umlauf / 1e6).toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      feld('verbrannt', Number(verbrannt / 100000000n).toLocaleString(loc) + ' YSR');
    }
    var naechste = (Math.floor(h / EPOCHE) + 1) * EPOCHE;
    var vorlage = t('live.blockN') || 'Block {n}';
    feld('halbierung', isFinite(naechste) ? vorlage.replace('{n}', naechste.toLocaleString(loc)) : '—');
    // Bei 10 Minuten je Block; nur eine Schaetzung, die Seite sagt "etwa".
    var tage = Math.round((naechste - h) * 600 / 86400);
    feld('tage', isFinite(tage) ? '≈ ' + tage.toLocaleString(loc) : '—');
    if (live.activeMiners != null) feld('miner', Number(live.activeMiners).toLocaleString(loc));
    if (live.knoten != null) feld('knoten', Number(live.knoten).toLocaleString(loc));
    var max = Number(BigInt(live.maxSupply || '2100000000000000') / 100000000n);
    var anteil = max > 0 ? ausgegeben / max * 100 : 0;
    feld('anteil', (t('supply.anteil') || '{p} %').replace('{p}', anteil.toLocaleString(loc, { maximumFractionDigits: 1 })));
    // Aktuelle Aera: Zeile der Tabelle markieren, Belohnung je Block (875 YSR >> Aera).
    var aera = Math.floor(h / EPOCHE);
    if (isFinite(aera)) {
      var zeilen = document.querySelectorAll('[data-aera]');
      for (var z = 0; z < zeilen.length; z++) {
        zeilen[z].classList.toggle('jetzt', Number(zeilen[z].getAttribute('data-aera')) === aera);
      }
      var belohnung = aera < 37 ? 875 / Math.pow(2, aera) : 0;
      feld('belohnung', belohnung.toLocaleString(loc, { maximumFractionDigits: 8 }) + ' YSR');
      var ende = (aera + 1) * EPOCHE - 1;
      feld('aera', aera.toLocaleString(loc));
      feld('aeraEnde', (t('supply.ek.aeraEnde') || 'until block {b}').replace('{b}', ende.toLocaleString(loc)));
    }
    // Werte nur fuer das Laufband.
    var diff = Number(live.difficultyWert || live.difficulty);
    if (isFinite(diff) && diff > 0) feld('diff', diff.toLocaleString(loc, { maximumFractionDigits: 0 }));
    if (live.mempool != null) feld('mempool', Number(live.mempool).toLocaleString(loc));
    if (typeof live.tipHash === 'string' && live.tipHash.length > 20) {
      feld('tip', live.tipHash.slice(0, 12) + '…' + live.tipHash.slice(-6));
    }
    feld('status', t('live.stand') || '');
    // Die Kette im Abschnitt "So funktioniert es": die letzten Bloecke.
    var glieder = document.querySelectorAll('[data-kette]');
    for (var i = 0; i < glieder.length; i++) {
      var n = h + Number(glieder[i].getAttribute('data-kette'));
      glieder[i].textContent = isFinite(n) && n >= 0 ? '#' + n.toLocaleString(loc) : '#…';
    }
    try { document.dispatchEvent(new CustomEvent('yskar:live', { detail: { hoehe: h, umlauf: umlauf, ausgegeben: ausgegeben, anteil: anteil } })); } catch (e) { /* alte Browser */ }
  }

  function liveHolen() {
    if (!document.getElementById('live-hoehe') && !document.querySelector('[data-live]')) return;
    var json = function (r) { if (!r.ok) throw new Error(r.status); return r.json(); };
    Promise.all([
      fetch(API + '/summary', { cache: 'no-store' }).then(json),
      fetch(API + '/account/' + NULLKONTO, { cache: 'no-store' }).then(json).catch(function () { return null; })
    ])
      .then(function (d) {
        live = d[0]; liveFehler = false;
        if (d[1] && d[1].balance != null) verbrannt = BigInt(String(d[1].balance));
        liveZeigen();
      })
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
