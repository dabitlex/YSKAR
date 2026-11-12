/* Wallet-Seite: Handy mit echten Bildschirmen (wechseln beim Scrollen) und die zwölf Zeilen, die sich schreiben. */
var Phone = (function () {
  'use strict';
  function words() {
    var list = document.getElementById('words'); if (!list) return;
    var seed = 12, i, k;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    for (i = 1; i <= 12; i++) {
      // eine unleserliche Handschriftzeile: Bögen und Schlaufen entlang einer Grundlinie
      var x = 2, d = 'M2 17', letters = 4 + Math.floor(rnd() * 5);
      for (k = 0; k < letters; k++) {
        var w = 7 + rnd() * 8, h = 6 + rnd() * 11, up = rnd() > 0.25;
        d += ' q' + (w * 0.3).toFixed(1) + ' ' + (up ? -h : h * 0.4).toFixed(1) + ' ' + (w * 0.55).toFixed(1) + ' ' + (rnd() * 3 - 1.5).toFixed(1);
        d += ' q' + (w * 0.2).toFixed(1) + ' ' + (up ? h * 0.5 : -h * 0.3).toFixed(1) + ' ' + (w * 0.45).toFixed(1) + ' 0';
        x += w;
      }
      var li = document.createElement('li'), n = document.createElement('span');
      n.textContent = i;
      li.appendChild(n);
      li.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 ' + Math.ceil(x + 6) + ' 24" preserveAspectRatio="xMinYMid meet" aria-hidden="true"><path pathLength="1" d="' + d + '" style="transition-delay:' + (i * 90) + 'ms"/></svg>');
      list.appendChild(li);
    }
  }
  function init() {
    words();
    var root = document.getElementById('screens'); if (!root) return;
    var imgs = U.$$('.phone img', root), cur = -1;
    Steps.mount(root, function (f) {
      var i = Math.max(0, Math.min(imgs.length - 1, Math.round(f)));
      if (i !== cur) { cur = i; imgs.forEach(function (im, k) { im.classList.toggle('is-on', k === i); }); }
      return false;
    }, { calmAt: 0 });
  }
  return { init: init };
})();
