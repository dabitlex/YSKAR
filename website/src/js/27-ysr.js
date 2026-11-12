/* Seite „YSR und Menge“: Mengenbalken, Ausgabe nach Blockhöhe (aus der Belohnungsregel berechnet), Tabelle der Ären. */
var Ysr = (function () {
  'use strict';
  var DEEP = '#1B4FD1', MAXH = 96000, STEP = 500, chart = null, showAll = false, sel = null;

  function supplyBar() {
    var root = document.getElementById('supplybar'); if (!root) return;
    var sp = Live.S.supply, max = parseFloat(sp.max), circ = parseFloat(sp.circulating), burned = parseFloat(sp.unspendable);
    var parts = [
      { key: 'circ', v: circ, color: '#3987E5', ink: '#000' },
      { key: 'burned', v: burned, color: '#D95926', ink: '#000' },
      { key: 'open', v: max - circ - burned, color: '#2A2E35', ink: '#EEF1F5' }];
    root.textContent = '';
    var names = [];
    parts.forEach(function (p) {
      var share = p.v / max * 100, seg = U.el('span', { style: 'flex:' + p.v + ' 0 0;background:' + p.color + ';color:' + p.ink });
      if (share >= 9) seg.textContent = U.num(share, 1, 1) + ' %';
      root.appendChild(seg);
      names.push(t('ysr.bar.' + p.key) + ' ' + U.num(share, 1, 1) + ' %');
    });
    root.setAttribute('aria-label', names.join(', '));
    var lg = document.getElementById('supplybar-legend'); lg.textContent = '';
    parts.forEach(function (p) {
      lg.appendChild(U.el('span', {}, [U.el('i', { style: 'background:' + p.color }), t('ysr.bar.' + p.key) + ' ', U.el('b', { class: 'mono', text: U.num(p.v, 0) + ' YSR' })]));
    });
  }

  function drawEmission(root) {
    var pts = [], h, tip = Live.S.summary.height;
    for (h = 0; h <= MAXH; h += STEP) pts.push({ y: U.mintedAt(h) / U.UNIT, label: U.num(h), tip: t('chart.height') + ' ' + U.num(h) });
    var marks = [{ i: Math.round(Math.min(tip, MAXH) / STEP), label: t('ysr.t.now'), color: '#14161A', dy: 17 }];
    if (sel !== null && Math.abs(sel - tip) > STEP) marks.push({ i: Math.round(sel / STEP), color: DEEP });
    Charts.line(root, {
      points: pts, color: DEEP, light: true, surface: '#D5D8DC', left: 54, name: t('ysr.sched.series'), label: t('ysr.sched.title'),
      ticks: [0, 7e6, 14e6, 21e6],
      yFmt: function (v, full) { return full ? U.num(v, 0) + ' YSR' : (v === 0 ? '0' : U.num(v / 1e6, 0) + ' M'); },
      marks: marks
    });
  }
  function read() {
    var tip = Live.S.summary.height, h = sel === null ? tip : sel, era = Math.floor(h / U.EPOCH), minted = U.mintedAt(h);
    var set = function (id, v) { var e = document.getElementById(id); if (e) e.textContent = v; };
    set('em-height', U.num(h));
    set('em-era', U.num(era + 1) + ' (' + U.num(era * U.EPOCH) + '–' + U.num((era + 1) * U.EPOCH - 1) + ')');
    set('em-reward', U.ysr(U.rewardAt(h)));
    set('em-issued', U.ysr(minted, { max: 2 }));
    set('em-share', U.num(minted / (21000000 * U.UNIT) * 100, 2, 2) + ' %');
    var tipTime = Number(Live.S.blocks[0].timestamp);
    set('em-when', h <= tip ? t('ysr.sched.when.past') : t('ysr.sched.when.future', { date: U.date(tipTime + (h - tip) * 600) }));
  }
  function eraTable() {
    var body = U.$('#era-table tbody'); if (!body) return;
    var tip = Live.S.summary.height, cur = Math.floor(tip / U.EPOCH), n = showAll ? 37 : 8, k;
    body.textContent = '';
    for (k = 0; k < n; k++) {
      var reward = U.rewardAt(k * U.EPOCH), tr = U.el('tr', { class: k === cur ? 'now' : '' }, [
        U.el('td', {}, [U.el('span', { class: 'mono', text: String(k + 1) }), k === cur ? U.el('span', { class: 'nowtag', text: ' ' + t('ysr.t.now') }) : null]),
        U.el('td', { class: 'n', text: U.num(k * U.EPOCH) + '–' + U.num((k + 1) * U.EPOCH - 1) }),
        U.el('td', { class: 'n', text: U.ysr(reward, { bare: true }) }),
        U.el('td', { class: 'n', text: U.ysr(reward * U.EPOCH, { bare: true, max: 4 }) }),
        U.el('td', { class: 'n', text: U.ysr(U.mintedAt((k + 1) * U.EPOCH - 1), { bare: true, max: 4 }) })]);
      body.appendChild(tr);
    }
    var btn = document.getElementById('era-toggle');
    btn.textContent = showAll ? t('ysr.t.less') : t('ysr.t.all');
    btn.setAttribute('aria-expanded', showAll ? 'true' : 'false');
  }
  function all() { supplyBar(); read(); eraTable(); }
  function init() {
    var root = document.getElementById('chart-emission'); if (!root) return;
    chart = Charts.register(root, drawEmission);
    var slider = document.getElementById('emission-h');
    slider.value = Math.round(Live.S.summary.height / 100) * 100;
    slider.addEventListener('input', function () {
      sel = +slider.value; read();
      if (chart.root.clientWidth) chart.draw(chart.root);
    });
    document.getElementById('era-toggle').addEventListener('click', function () { showAll = !showAll; eraTable(); });
    all(); U.on('data', all);
  }
  return { init: init };
})();
