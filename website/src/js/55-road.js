/*
 * Community: der Weg von der Abstimmung (25. Oktober 2026) bis Block 10.000, an dem Fassung 6 beginnt.
 * Der Stand kommt aus der Kette; die Schätzung rechnet mit der zuletzt gemessenen Blockzeit.
 */
var Road = (function () {
  'use strict';
  var root, bar, nowLab, line, need, VOTE = Date.UTC(2026, 9, 25, 12) / 1000;

  function heightAt(ts) {
    var c = Chain.get(), lo = 0, hi = c.n - 1, mid, rel = ts - c.t0;
    while (lo < hi) { mid = (lo + hi + 1) >> 1; if (c.T[mid] <= rel) lo = mid; else hi = mid - 1; }
    return lo;
  }
  function paint() {
    var h = Number(Live.S.summary.height), h0 = heightAt(VOTE), v = Live.values(), done = h >= U.V6;
    var q = Math.max(0, Math.min(1, (h - h0) / (U.V6 - h0)));
    root.style.setProperty('--q', q.toFixed(4));
    root.classList.toggle('is-done', done);
    nowLab.textContent = t('road.now', { h: v.height });
    line.textContent = done ? t('road.done') : t('road.left', { n: v.v6Left, eta: v.v6Eta });
    need.textContent = t(done ? 'road.need.done' : 'road.need');
    fit(q);
  }
  /** Die Beschriftung des jetzigen Blocks bleibt innerhalb der Linie. */
  function fit(q) {
    var W = bar.clientWidth, lw = nowLab.offsetWidth, x = q * W, shift = 0;
    if (!W || !lw) return;
    if (x + lw / 2 > W + 6) shift = W + 6 - (x + lw / 2);
    if (x - lw / 2 < -6) shift = -6 - (x - lw / 2);
    nowLab.style.setProperty('--shift', shift.toFixed(1) + 'px');
  }
  function init() {
    root = document.getElementById('road'); if (!root) return;
    bar = U.$('.road__bar', root); nowLab = document.getElementById('road-now'); line = document.getElementById('road-line'); need = U.$('[data-t="road.need"]', root);
    paint();
    U.on('data', paint); U.on('lang', paint);
    U.on('route', function (r) { if (r.page === 'community') setTimeout(paint, 40); });
    if (window.ResizeObserver) new ResizeObserver(paint).observe(bar);
  }
  return { init: init };
})();
