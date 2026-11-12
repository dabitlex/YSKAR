/* Technikseite: Difficulty-Verlauf und der Stand der Konsensfassungen. */
var Tech = (function () {
  'use strict';
  var BLUE = '#2F7BFF';

  function short(v) {
    try { return new Intl.NumberFormat(U.loc(), { notation: 'compact', maximumFractionDigits: 1 }).format(v); } catch (e) { return U.num(v); }
  }
  function drawDifficulty(root) {
    var ser = Chain.series(), pts = ser.map(function (p) {
      return { y: p[1], label: U.num(p[0]), tip: t('chart.height') + ' ' + U.num(p[0]) };
    });
    Charts.line(root, {
      points: pts, log: true, color: BLUE, left: 62, name: t('field.diff'),
      label: t('tech.diff.chart'),
      yFmt: function (v, full) { return full ? U.num(v) : short(v); },
      marks: [{ i: pts.length - 1 }]
    });
    var rows = [], step = Math.max(1, Math.floor(ser.length / 14)), i;
    for (i = 0; i < ser.length; i += step) rows.push([U.num(ser[i][0]), U.num(ser[i][1])]);
    if ((ser.length - 1) % step) rows.push([U.num(ser[ser.length - 1][0]), U.num(ser[ser.length - 1][1])]);
    Charts.table(document.getElementById('table-difficulty'), [t('chart.height'), t('field.diff')], rows);
  }
  function revisions() {
    var tip = Live.S.summary.height;
    U.$$('[data-rev]').forEach(function (cell) {
      var h = +cell.getAttribute('data-rev');
      var at = h <= tip ? Chain.timeOf(h) : null;
      cell.textContent = h <= tip ? (at ? t('rev.active', { date: U.date(at) }) : t('ms.done')) : t('rev.set', { n: U.num(h - tip) });
      cell.parentNode.classList.toggle('now', h > tip);
    });
  }
  function init() {
    var root = document.getElementById('chart-difficulty');
    if (root) { Chain.want(); Charts.register(root, drawDifficulty); }
    revisions(); U.on('data', revisions);
  }
  return { init: init };
})();
