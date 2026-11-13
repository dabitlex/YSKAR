/* Sätze aus Live-Zahlen (<p data-lit data-say="schluessel">) und der Stand der laufenden Epoche. */
var Early = (function () {
  'use strict';
  function paint() {
    var v = Live.values();
    U.$$('[data-say]').forEach(function (el) {
      // ohne Verbindung (mitgeführter Stand) gilt, wo vorhanden, die Fassung "<schluessel>.snap": Vergangenheit statt "gerade"
      var key = el.getAttribute('data-say'), snap = key + '.snap';
      if (Live.S.mode !== 'live' && I18n.has(snap)) key = snap;
      var s = t(key, { d: v.day, n: v.nodes, m: v.miners, p: v.poolCount, x: v.transfers, k: v.nodesNext, h: v.height, a: v.tipAgeLong, r: v.hashrate, date: v.snapDate });
      if (el._txt !== s) { el._txt = s; el.textContent = s; el._split = false; Scenes.split(el.parentNode); }
    });
    U.$$('[data-era-fill]').forEach(function (f) { f.style.width = v.eraPct.replace(/\s/g, ''); });
  }
  function init() {
    paint(); U.on('data', paint); U.on('lang', paint);
    // Netz-Seite: die Zeitachse der letzten Stunden als eigenes Exemplar
    var box = document.getElementById('net-pulse');
    if (box && window.Pulse) box.appendChild(Pulse.make().set({ mode: 'tip' }));
  }
  return { init: init };
})();
