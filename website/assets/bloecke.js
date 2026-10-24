/*
 * yskar.app -- die letzten Bloecke der Kette in "So funktioniert es", live.
 * Holt alle 30 Sekunden /api/v2/blocks. Ein neuer Block gleitet von rechts herein.
 * Ohne Antwort bleibt die Anzeige, die site.js aus der Blockhoehe baut.
 */
(function () {
  'use strict';
  var API = 'https://yskar.vercel.app/api/v2';
  var bekannt = 0;

  function tt(k) {
    var l = (document.documentElement.lang || 'en').slice(0, 2), b = window.YSKAR_TEXTE || {};
    return (b[l] && b[l][k]) || (b.en && b.en[k]) || k;
  }
  function loc() { return document.documentElement.lang || 'en'; }
  function alter(sek) {
    var d = Math.max(0, Math.round(Date.now() / 1000 - sek));
    if (d < 60) return tt('blk.sek').replace('{n}', d);
    if (d < 3600) return tt('blk.min').replace('{n}', Math.round(d / 60));
    return tt('blk.std').replace('{n}', Math.round(d / 3600));
  }
  function finder(b) {
    if (b.finder) return b.finder;
    if (b.minerAddress) return b.minerAddress.slice(0, 8) + '…' + b.minerAddress.slice(-4);
    return tt('blk.solo');
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  var letzte = [];
  function zeichnen() {
    var reihe = document.querySelector('.kettenreihe');
    if (!reihe || !letzte.length) return;
    var liste = letzte.slice(0, 4).reverse();
    reihe.textContent = '';
    liste.forEach(function (b, i) {
      if (i) reihe.appendChild(el('span', 'kl'));
      var k = el('a', 'kb live' + (i === liste.length - 1 ? ' neu' : '') + (b.height > bekannt && bekannt ? ' frisch' : ''));
      k.href = '/explorer#block-' + b.height;
      k.appendChild(el('b', null, '#' + b.height.toLocaleString(loc())));
      k.appendChild(el('span', 'ck', '✓'));
      k.appendChild(el('small', 'kb-finder', finder(b)));
      k.appendChild(el('small', 'kb-zeit', alter(Number(b.timestamp))));
      reihe.appendChild(k);
    });
    var cap = document.getElementById('kette-live');
    if (cap) { cap.hidden = false; }
    bekannt = Math.max(bekannt, letzte[0].height);
  }
  function holen() {
    fetch(API + '/blocks?limit=4', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { if (j && j.blocks && j.blocks.length) { letzte = j.blocks; zeichnen(); } })
      .catch(function () { /* Anzeige bleibt */ });
  }
  document.addEventListener('yskar:sprache', zeichnen);
  document.addEventListener('DOMContentLoaded', function () {
    if (!document.querySelector('.kettenreihe')) return;
    holen();
    setInterval(holen, 30000);
    setInterval(zeichnen, 30000);
  });
})();
