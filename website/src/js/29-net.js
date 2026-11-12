/* Netzseite: Verlauf aus den Blöcken (Tageswerte), Finder-Anteile, neueste Blöcke. */
var Net = (function () {
  'use strict';
  var BLUE = '#2F7BFF', SER = [
    { key: 'main', color: '#3987E5', name: 'net.s.main' },
    { key: 'gozero', color: '#D95926', name: 'net.s.gozero' },
    { key: 'solo', color: '#199E70', name: 'net.s.solo' }];
  var range = 'all';

  function days(completeOnly) {
    var d = Chain.daily().slice();
    if (completeOnly) d = d.slice(1, d.length - 1);          // erster und letzter Tag sind angebrochen
    if (range !== 'all') d = d.slice(-(+range));
    return d;
  }
  function series() { return SER.map(function (s) { return { key: s.key, color: s.color, name: t(s.name) }; }); }
  function short(v) { try { return new Intl.NumberFormat(U.loc(), { notation: 'compact', maximumFractionDigits: 1 }).format(v); } catch (e) { return U.num(v); } }

  function drawHash(root) {
    var d = days(false), log = range === 'all';
    Charts.line(root, {
      points: d.map(function (x) { return { y: x.hr || 1, label: U.dayLabel(x.d), tip: U.dayLabel(x.d) }; }),
      log: log, color: BLUE, left: 68, name: '', label: t('net.c.hash'),
      yFmt: function (v) { return v > 0 ? U.hashrate(v) : '0'; }, marks: [{ i: d.length - 1 }]
    });
    document.getElementById('cap-hash').textContent = log ? t('net.c.hash.capLog') : t('net.c.hash.capLin');
    Charts.table(document.getElementById('table-hash'), [t('net.c.day'), t('net.c.hash')],
      d.map(function (x) { return [U.dayLabel(x.d), U.hashrate(x.hr)]; }));
  }
  function drawBlocks(root) {
    var d = days(true);
    Charts.bars(root, {
      items: d.map(function (x) { return { label: U.dayLabel(x.d), n: x.n }; }),
      series: [{ key: 'n', color: BLUE, name: '' }], name: t('net.c.blocks.name'), left: 40, label: t('net.c.blocks'),
      ref: { value: 144, label: t('net.c.blocks.ref') }, yFmt: function (v) { return U.num(v); }
    });
    Charts.table(document.getElementById('table-blocks'), [t('net.c.day'), t('net.c.blocks')],
      d.map(function (x) { return [U.dayLabel(x.d), U.num(x.n)]; }));
  }
  function drawFinders(root) {
    var d = days(true), se = series();
    Charts.bars(root, {
      items: d.map(function (x) { return { label: U.dayLabel(x.d), main: x.main, gozero: x.gozero, solo: x.solo + (x.other || 0) }; }),
      series: se, left: 40, label: t('net.c.finders'), yFmt: function (v) { return U.num(v); }
    });
    var lg = document.getElementById('legend-finders'); lg.textContent = '';
    se.forEach(function (s) { lg.appendChild(U.el('span', {}, [U.el('i', { style: 'background:' + s.color }), s.name])); });
    Charts.table(document.getElementById('table-finders'), [t('net.c.day')].concat(se.map(function (s) { return s.name; })),
      d.map(function (x) { return [U.dayLabel(x.d), U.num(x.main), U.num(x.gozero), U.num(x.solo + (x.other || 0))]; }));
  }
  function drawTime(root) {
    var d = days(true);
    Charts.line(root, {
      points: d.map(function (x) { return { y: x.bt, label: U.dayLabel(x.d), tip: U.dayLabel(x.d) }; }),
      color: BLUE, left: 48, name: '', label: t('net.c.time'),
      refs: [{ y: 600, label: t('net.c.time.ref') }],
      yFmt: function (v, full) { return full ? U.num(v, 0) + ' s' : U.num(v, 0); }, marks: [{ i: d.length - 1 }]
    });
    Charts.table(document.getElementById('table-time'), [t('net.c.day'), t('net.c.time')],
      d.map(function (x) { return [U.dayLabel(x.d), U.num(x.bt, 0) + ' s']; }));
  }

  /* Anteile als Balken: ein Ganzes, in Teile zerlegt */
  function shareBars() {
    var root = document.getElementById('sharebars'); if (!root) return;
    var S = Live.S, se = series(), live = { main: 0, gozero: 0, solo: 0 }, b = S.blocks.slice(0, 50);
    b.forEach(function (x) {
      if (x.finder === 'Gozero') live.gozero++; else if (x.finder === 'YSKAR MAIN') live.main++; else live.solo++;
    });
    var tot = Chain.totals(), known = Chain.exactTip(), rows = [
      { label: t('net.find.last', { n: U.num(b.length) }), v: live },
      { label: t('net.find.last1000', { h: U.num(known) }), v: tot.finders1000 },
      { label: t('net.find.allb', { h: U.num(known) }), v: tot.finders }];
    root.textContent = '';
    rows.forEach(function (r) {
      var sum = se.reduce(function (a, s) { return a + (r.v[s.key] || 0); }, 0) + (r.v.other || 0) || 1, bar = U.el('div', { class: 'sharebar', role: 'img' }), names = [];
      se.forEach(function (s) {
        var val = (r.v[s.key] || 0) + (s.key === 'solo' ? (r.v.other || 0) : 0), pct = val / sum * 100;
        if (!val) return;
        var seg = U.el('span', { style: 'flex:' + val + ' 0 0;background:' + s.color });
        if (pct >= 8) seg.textContent = U.num(pct, pct < 10 ? 1 : 0) + ' %';
        bar.appendChild(seg);
        names.push(s.name + ' ' + U.num(pct, 1) + ' %');
      });
      bar.setAttribute('aria-label', r.label + ': ' + names.join(', '));
      root.appendChild(U.el('div', { class: 'sharerow' }, [U.el('span', { class: 'k', text: r.label }), bar,
        U.el('span', { class: 'vals mono', text: names.join('  ') })]));
    });
    var lg = document.getElementById('legend-share'); lg.textContent = '';
    se.forEach(function (s) { lg.appendChild(U.el('span', {}, [U.el('i', { style: 'background:' + s.color }), s.name])); });
  }
  function latest() {
    var body = U.$('#net-blocks tbody'); if (!body) return;
    body.textContent = '';
    Live.S.blocks.slice(0, 10).forEach(function (b) {
      var n = b.recipients || 1;
      body.appendChild(U.el('tr', {}, [
        U.el('td', {}, [U.el('a', { class: 'mono', href: Router.href('#explorer-block-' + b.height), text: U.num(b.height) })]),
        U.el('td', { text: Live.ago(Number(b.timestamp), Live.now()) }),
        U.el('td', { text: b.finder || t('net.b.solo') }),
        U.el('td', { class: 'n hide-s', text: tn('net.b.addr', n, { n: U.num(n) }) }),
        U.el('td', { class: 'n hide-s', text: U.num(Number(b.difficultyWert)) })]));
    });
  }
  function init() {
    if (!document.getElementById('chart-hash')) return;
    Chain.want();
    Charts.register(document.getElementById('chart-hash'), drawHash);
    Charts.register(document.getElementById('chart-blocks'), drawBlocks);
    Charts.register(document.getElementById('chart-finders'), drawFinders);
    Charts.register(document.getElementById('chart-time'), drawTime);
    document.getElementById('net-range').addEventListener('click', function (e) {
      var b = e.target.closest('[data-range]'); if (!b) return;
      range = b.getAttribute('data-range');
      U.$$('#net-range [data-range]').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      Charts.refresh(true);
    });
    function rest() { shareBars(); latest(); }
    rest(); U.on('data', rest);
  }
  return { init: init };
})();
