/*
 * Geschichte: die Wegmarken der Kette nach Blockhöhe. Die Abstände folgen grob der Zahl der Blöcke dazwischen,
 * der Stand von heute kommt aus der Kette. Beim Scrollen läuft die Linie bis zum heutigen Block mit; was danach kommt, wartet.
 */
var Miles = (function () {
  'use strict';
  var root, items = [], VOTE = Date.UTC(2026, 9, 25, 12) / 1000, calm = false, tipIndex = 0, shown = -1;

  function heightAt(ts) {
    var c = Chain.get(), lo = 0, hi = c.n - 1, mid, rel = ts - c.t0;
    while (lo < hi) { mid = (lo + hi + 1) >> 1; if (c.T[mid] <= rel) lo = mid; else hi = mid - 1; }
    return lo;
  }
  function layout() {
    var c = Chain.get(), tip = Number(Live.S.summary.height), prev = null;
    items.forEach(function (li, i) {
      var at = li.getAttribute('data-h'), h = at === 'tip' ? tip : at === 'vote' ? heightAt(VOTE) : Number(at);
      li._h = h;
    });
    // der heutige Block steht an seiner Stelle zwischen den festen Marken
    items.sort(function (a, b) { return a._h - b._h || (a.getAttribute('data-h') === 'tip' ? 1 : -1); });
    items.forEach(function (li, i) {
      root.appendChild(li);
      var h = li._h, isTip = li.getAttribute('data-h') === 'tip', past = h <= tip, k = U.$('.miles__k', li), next = items[i + 1];
      li.classList.toggle('is-tip', isTip); li.classList.toggle('is-past', past && !isTip); li.classList.toggle('is-next', !past);
      if (isTip) tipIndex = i;
      li.style.setProperty('--gap', next ? Math.round(Math.max(56, Math.min(240, (next._h - h) * 0.075))) + 'px' : '0px');
      var when = past ? (h < c.n ? U.date(c.t0 + c.T[h]) : '') : t('miles.left', { n: U.num(h - tip) });
      k.textContent = '';
      k.appendChild(U.el('b', { text: t('walk.tip.block', { h: U.num(h) }) }));
      k.appendChild(U.el('span', { text: isTip ? t('pulse.now') : when }));
      U.$$('[data-when]', li).forEach(function (x) { x.hidden = (x.getAttribute('data-when') === 'future') !== !past; });
    });
    light(true);
  }
  /** Die Linie läuft bis zu der Marke, die beim Scrollen zuletzt erreicht wurde, höchstens bis zum heutigen Block. */
  function light(force) {
    var top = root.getBoundingClientRect().top, lim = window.innerHeight * 0.7, k = 0, i;
    if (calm || !window.ScrollTrigger) k = tipIndex + 1;
    else for (i = 0; i <= tipIndex; i++) if (top + items[i].offsetTop < lim) k = i + 1;
    if (k === shown && !force) return;
    shown = k;
    items.forEach(function (li, j) { li.classList.toggle('on', j < k); });
    var last = items[Math.max(0, k - 1)];
    root.style.setProperty('--len', (k ? last.offsetTop - items[0].offsetTop : 0) + 'px');
  }
  function init() {
    root = document.getElementById('miles'); if (!root) return;
    items = U.$$('li', root);
    calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    layout();
    if (!calm && window.ScrollTrigger) ScrollTrigger.create({ trigger: root, start: 'top bottom', end: 'bottom top', onUpdate: function () { light(false); } });
    U.on('data', layout);
    U.on('lang', layout);
    U.on('route', function (r) { if (r.page === 'story') setTimeout(function () { light(true); if (window.ScrollTrigger) ScrollTrigger.refresh(); }, 60); });
  }
  return { init: init };
})();
