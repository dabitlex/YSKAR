/*
 * Seite „Entwickeln“: eine echte Anfrage und ihre Antwort. Gezeigt wird /summary so, wie die öffentliche API sie liefert
 * (live gelesen, sonst die letzte Antwort, die die Seite kennt). Kommt ein neuer Block, ändert sich die Antwort.
 */
var Term = (function () {
  'use strict';
  var box, pre, note, more, shown = '', seen = false, calm = false, timer = 0, lines = [], open = false, CUT = 16;

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  /** Eine JSON-Zeile mit leichter Auszeichnung: Schlüssel gedämpft, Zahlen kalt, Text warm. Der Einzug bleibt beim Umbruch stehen. */
  function row(line) {
    var indent = line.length - line.replace(/^ +/, '').length;
    var html = esc(line).replace(/("(?:[^"\\]|\\.)*")(\s*:)?|(-?\b\d+(?:\.\d+)?\b)/g, function (m, str, colon, num) {
      if (str) return colon ? '<span class="tk">' + str + '</span>' + colon : '<span class="ts">' + str + '</span>';
      return '<span class="tn">' + num + '</span>';
    });
    return '<span class="ln" style="--in:' + indent + 'ch">' + html + '</span>';
  }
  function head() { return '<span class="ln" style="--in:0ch"><span class="tp">$</span> curl ' + esc(Live.PUBLIC) + '/summary</span>'; }
  function put(n) { pre.innerHTML = head() + lines.slice(0, n).join(''); }
  function labels() {
    note.textContent = Live.S.mode === 'live' ? t('term.note.live', { d: U.date(Live.S.at, true) }) : t('term.note.snap', { d: Live.values().snapDate });
    more.textContent = t(open ? 'term.less' : 'term.more', { n: U.num(lines.length + 1) });
    more.hidden = lines.length + 1 <= CUT + 2;
    box.classList.toggle('is-cut', !open && !more.hidden);
  }
  function render(animate) {
    var json = JSON.stringify(Live.S.summary, null, 2);
    if (json !== shown) {
      shown = json; lines = json.split('\n').map(row);
      clearInterval(timer);
      if (!animate || calm) put(lines.length);
      else {
        var i = 0; put(0);
        timer = setInterval(function () { i += 1; put(i); if (i >= lines.length) clearInterval(timer); }, 34);
      }
    }
    labels();
  }
  function init() {
    pre = document.getElementById('term-out'); if (!pre) return;
    box = document.getElementById('term-box'); note = document.getElementById('term-note'); more = document.getElementById('term-more');
    calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    more.addEventListener('click', function () { open = !open; more.setAttribute('aria-expanded', open ? 'true' : 'false'); labels(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (l, io) { if (l[0].isIntersecting) { seen = true; render(true); io.disconnect(); } }, { threshold: 0.2 }).observe(box);
    } else { seen = true; render(false); }
    U.on('data', function () { if (seen) render(false); });
    U.on('lang', function () { if (seen) labels(); });
  }
  return { init: init };
})();
