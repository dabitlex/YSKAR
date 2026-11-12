/* Mining-Seite: Rechner (Schätzung aus der Arbeit der letzten Blöcke) und die Pool-Tabelle. */
var Mining = (function () {
  'use strict';
  var UNITS = { 'H/s': 1, 'kH/s': 1e3, 'MH/s': 1e6, 'GH/s': 1e9, 'TH/s': 1e12 }, mode = 'pool', PER_DAY = 144;

  function $(id) { return document.getElementById(id); }
  /** Netz-Hashrate und Finder aus den neuesten Blöcken der Kette. */
  function basis() {
    var b = Live.S.blocks.slice(0, 50), n = b.length, work = 0, i, finds = {};
    for (i = 0; i < n - 1; i++) work += Number(b[i].difficultyWert || b[i].difficulty);
    var span = Number(b[0].timestamp) - Number(b[n - 1].timestamp);
    b.forEach(function (x) { var f = x.finder || ''; finds[f] = (finds[f] || 0) + 1; });
    return { n: n, net: span > 0 ? work * 65536 / span : 0, finds: finds, height: b[0].height };
  }
  function every(days) {
    if (!isFinite(days)) return '—';
    var sec = days * 86400;
    if (sec < 7200) return t('calc.every.min', { n: U.num(Math.max(1, sec / 60), 0) });
    if (sec < 172800) return t('calc.every.hours', { n: U.num(sec / 3600, 1) });
    if (days < 730) return t('calc.every.days', { n: U.num(days, days < 10 ? 1 : 0) });
    return t('calc.every.years', { n: U.num(days / 365.25, days / 365.25 < 10 ? 1 : 0) });
  }
  function amount(x) {
    var max = x >= 100 ? 0 : x >= 1 ? 2 : x >= 0.01 ? 4 : 8;
    return U.num(x, max) + ' YSR';
  }
  function poolList() {
    var sel = $('calc-pool'), old = sel.value, B = basis();
    var pools = (Live.S.pools.pools || []).slice().sort(function (a, b) { return (B.finds[b.kette || b.name] || 0) - (B.finds[a.kette || a.name] || 0); });
    sel.textContent = '';
    pools.forEach(function (p) {
      var o = U.el('option', { value: p.host, text: p.name + ', ' + U.num(p.feeBps / 100, 2) + ' %' });
      sel.appendChild(o);
    });
    if (old && pools.some(function (p) { return p.host === old; })) sel.value = old;
    return pools;
  }
  function calc() {
    if (!$('calc')) return;
    var B = basis(), raw = String($('calc-rate').value || '').replace(/\s/g, '').replace(',', '.');
    var own = parseFloat(raw) * (UNITS[$('calc-unit').value] || 1);
    var pools = Live.S.pools.pools || [], pool = pools.filter(function (p) { return p.host === $('calc-pool').value; })[0] || pools[0];
    $('calc-pool-field').hidden = mode !== 'pool';
    U.$$('#calc [data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-mode') === mode ? 'true' : 'false'); });
    var set = function (id, v) { $(id).textContent = v; }, detail = $('calc-detail');
    detail.textContent = '';
    if (!(own > 0) || !(B.net > 0)) {
      set('calc-day', '—'); set('calc-week', '—'); set('calc-month', '—'); set('calc-share', '—');
      set('calc-note', t('calc.enter')); return;
    }
    var h = B.height, era = Math.floor(h / U.EPOCH), R = U.rewardAt(h) / U.UNIT, total = B.net + own, share = own / total;
    var fee = mode === 'pool' && pool ? pool.feeBps / 10000 : 0;
    var perDay = share * PER_DAY * R * (1 - fee);
    // Die Halbierung innerhalb des Zeitraums zählt mit: danach die halbe Belohnung
    var daysToHalving = ((era + 1) * U.EPOCH - h) * 600 / 86400;
    var over = function (d) { return perDay * Math.min(d, daysToHalving) + perDay / 2 * Math.max(0, d - daysToHalving); };
    set('calc-day', '≈ ' + amount(perDay));
    set('calc-week', amount(over(7)));
    set('calc-month', amount(over(30)));
    set('calc-share', U.num(share * 100, share < 0.001 ? 4 : 2) + ' %');
    var row = function (k, v) { detail.appendChild(U.el('div', {}, [U.el('dt', { text: k }), U.el('dd', { class: 'mono', text: v })])); };
    if (mode === 'solo') {
      row(t('calc.d.every'), every(1 / (share * PER_DAY)));
      row(t('calc.d.chance'), U.num((1 - Math.exp(-share * PER_DAY)) * 100, 1) + ' %');
      row(t('calc.d.block'), amount(R));
    } else if (pool) {
      var ps = (B.finds[pool.kette || pool.name] || 0) / B.n, withMe = ps * B.net + own;
      row(t('calc.d.poolShare', { n: U.num(B.n) }), U.num(ps * 100, 1) + ' %');
      row(t('calc.d.poolEvery'), every(1 / (withMe / total * PER_DAY)));
      row(t('calc.d.part'), amount(own / withMe * R * (1 - fee)));
      row(t('calc.d.fee'), U.num(pool.feeBps / 100, 2) + ' %');
    }
    row(t('calc.d.net', { n: U.num(B.n) }), U.hashrate(B.net));
    var note = t('calc.note');
    if (daysToHalving < 30) note = t('calc.halving', { b: U.num((era + 1) * U.EPOCH), d: U.num(daysToHalving, 0) }) + ' ' + note;
    set('calc-note', note);
  }
  function poolsTable() {
    var body = U.$('#pools-table tbody'); if (!body) return;
    var B = basis(), pools = poolList();
    body.textContent = '';
    pools.forEach(function (p) {
      var found = B.finds[p.kette || p.name] || 0, full = p.status !== 'offen';
      body.appendChild(U.el('tr', {}, [
        U.el('td', { class: 'wide' }, [U.el('strong', { text: p.name }), U.el('br'), U.el('span', { class: 'mono host', text: p.host })]),
        U.el('td', { class: 'n' }, [U.num(p.belegt) + ' / ' + U.num(p.plaetze) + (full ? ' (' + t('pools.full') + ')' : ''), U.el('br'),
          U.el('span', { class: 'host', text: p.hashrate > 0 ? t('pools.reported', { r: U.hashrate(p.hashrate) }) : '—' })]),
        U.el('td', { class: 'n', text: U.num(p.feeBps / 100, 2) + ' %' }),
        U.el('td', { class: 'n', text: U.num(p.bloecke || 0) }),
        U.el('td', { class: 'n', text: U.num(found) + ' (' + U.num(found / B.n * 100, 0) + ' %)' })]));
    });
    var th = document.getElementById('pools-th-last');
    if (th) th.textContent = t('pools.c5', { n: U.num(B.n) });
    $('pools-cap').textContent = t('pools.cap', { n: U.num(B.n) });
    UI.labelTables(document.getElementById('pools-table'));
  }
  function all() { poolsTable(); if ($('calc-pool') && !U.$('#pools-table tbody')) poolList(); calc(); }
  function init() {
    var form = $('calc'); if (!form) return;
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    form.addEventListener('input', calc); form.addEventListener('change', calc);
    form.addEventListener('click', function (e) {
      var b = e.target.closest('[data-mode]'); if (!b) return;
      mode = b.getAttribute('data-mode'); calc();
    });
    all(); U.on('data', all);
  }
  return { init: init };
})();
