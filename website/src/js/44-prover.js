/*
 * „Prüf es selbst“: Das Gerät des Besuchers rechnet den Kopf eines Blocks nach (zweimal SHA-256)
 * und vergleicht das Ergebnis mit dem Ziel. Die Rechnung ist echt; nur das Einlaufen der Zeichen ist Inszenierung.
 */
var Prover = (function () {
  'use strict';
  var box, out, verdict, link, busy = false, calm = false, last = null;
  var HEX = '0123456789abcdef';

  function paint(hash, done) {
    out.textContent = '';
    var zeros = 0, i, row;
    if (done) while (zeros < 64 && hash[zeros] === '0') zeros++;
    for (i = 0; i < 64; i += 16) {
      row = U.el('span', { class: 'prover__row' });
      var part = hash.slice(i, i + 16), z = Math.max(0, Math.min(16, zeros - i));
      if (z) row.appendChild(U.el('b', { text: part.slice(0, z) }));
      row.appendChild(document.createTextNode(part.slice(z)));
      out.appendChild(row);
    }
  }
  function noise(fixed, real) {
    var s = '', i;
    for (i = 0; i < 64; i++) s += i < fixed ? real[i] : HEX[(Math.random() * 16) | 0];
    return s;
  }
  function say(res, which) {
    verdict.className = 'prover__verdict ' + (res.valid ? 'is-ok' : 'is-bad');
    var h = U.num(res.header.height);
    verdict.textContent = res.valid ? t('prove.ok', { h: h, ms: U.num(res.ms, res.ms < 0.01 ? 4 : 3) }) : t('prove.bad', { h: h });
    link.hidden = false; link.setAttribute('href', Router.href('#explorer-block-' + res.header.height));
    U.$('span', link).textContent = t('prove.open', { h: h });
  }
  function run(which) {
    if (busy) return;
    var hex = which === 'tip' ? (Live.S.blocks[0] && Live.S.blocks[0].header) : window.YSKAR_SNAPSHOT.genesis.header;
    if (!hex) return;
    var res = U.verifyHeader(hex);
    last = { res: res, which: which };
    box.classList.add('is-run'); verdict.textContent = ''; verdict.className = 'prover__verdict'; link.hidden = true;
    if (calm) { paint(res.hash, true); say(res, which); return; }
    busy = true;
    var start = performance.now(), total = 1500;
    (function tick() {
      var k = (performance.now() - start) / total;
      if (k >= 1) { paint(res.hash, true); say(res, which); busy = false; box.classList.add('is-done'); return; }
      paint(noise(Math.floor(Math.max(0, (k - 0.35) / 0.65) * 64), res.hash), false);
      requestAnimationFrame(tick);
    })();
  }
  function init() {
    box = document.getElementById('prover'); if (!box) return;
    out = document.getElementById('prover-hash'); verdict = document.getElementById('prover-verdict'); link = document.getElementById('prover-link');
    calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    paint('················································································'.slice(0, 64), false);
    U.$$('[data-prove]', box).forEach(function (b) { b.addEventListener('click', function () { run(b.getAttribute('data-prove')); }); });
    U.on('lang', function () { if (last && !busy) say(last.res, last.which); });
  }
  return { init: init };
})();
