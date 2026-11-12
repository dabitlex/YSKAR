/*
 * Diagramme ohne Bibliothek: Linie mit Fläche, Säulen, gestapelte Säulen.
 * Regeln: eine Achse, dünne Marken, zurückhaltendes Raster, Fadenkreuz mit Ablesung,
 * jede Zahl auch als Tabelle. Farben der Reihen sind für die schwarze Anzeige geprüft.
 */
var Charts = (function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg', registry = [];

  function s(tag, attrs, kids) {
    var e = document.createElementNS(NS, tag), k;
    for (k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    (kids || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }
  function txt(x, y, str, cls, anchor) {
    var e = s('text', { x: x, y: y, class: cls || 'c-tick', 'text-anchor': anchor || 'start' });
    e.textContent = str; return e;
  }
  /** Runde Achsenwerte: höchstens n Schritte bis über max. */
  function niceTicks(max, n) {
    if (!(max > 0)) return [0, 1];
    var raw = max / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
    var step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag, out = [], v;
    for (v = 0; v < max + step * 0.999; v += step) out.push(+v.toPrecision(12));
    return out;
  }
  function logTicks(min, max) {
    var out = [], e;
    for (e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) out.push(Math.pow(10, e));
    return out;
  }
  function frame(root, o) {
    var W = Math.max(root.clientWidth, 260), H = o.height || (W < 480 ? 210 : 250);
    var m = { l: o.left || 52, r: 14, t: o.key ? 32 : 14, b: 26 };
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': o.label || '', tabindex: '0', class: 'chart-svg' });
    root.textContent = ''; root.appendChild(svg);
    return { svg: svg, W: W, H: H, m: m, pw: W - m.l - m.r, ph: H - m.t - m.b };
  }
  function tipNode(head, rows) {
    var box = U.el('div', {}, [U.el('div', { class: 'th', text: head })]);
    rows.forEach(function (r) {
      var kids = [];
      if (r.color) kids.push(U.el('span', { class: 'key', style: 'background:' + r.color }));
      kids.push(U.el('b', { text: r.value }));
      if (r.name) kids.push(U.el('span', { text: r.name }));
      box.appendChild(U.el('div', { class: 'tr' }, kids));
    });
    return box;
  }
  /** Fadenkreuz: rastet auf die nächste Datenstelle ein; Pfeiltasten bewegen es. */
  function crosshair(f, n, xOf, onPick, light) {
    var line = s('line', { x1: 0, x2: 0, y1: f.m.t, y2: f.m.t + f.ph, class: 'c-cross' + (light ? ' light' : ''), visibility: 'hidden' });
    f.svg.appendChild(line);
    var cur = -1;
    function pick(i, ev) {
      i = Math.max(0, Math.min(n - 1, i)); cur = i;
      var x = xOf(i); line.setAttribute('x1', x); line.setAttribute('x2', x); line.setAttribute('visibility', 'visible');
      var r = f.svg.getBoundingClientRect();
      var node = onPick(i);
      U.tipShow(node, ev ? ev.clientX : r.left + x * (r.width / f.W), ev ? ev.clientY : r.top + f.m.t + 10);
    }
    function nearest(ev) {
      var r = f.svg.getBoundingClientRect(), x = (ev.clientX - r.left) * (f.W / r.width), best = 0, bd = Infinity, i, d;
      for (i = 0; i < n; i++) { d = Math.abs(xOf(i) - x); if (d < bd) { bd = d; best = i; } }
      return best;
    }
    function hide() { line.setAttribute('visibility', 'hidden'); U.tipHide(); cur = -1; }
    f.svg.addEventListener('pointermove', function (ev) { pick(nearest(ev), ev); });
    f.svg.addEventListener('pointerdown', function (ev) { pick(nearest(ev), ev); });
    f.svg.addEventListener('pointerleave', hide);
    f.svg.addEventListener('blur', hide);
    f.svg.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') { ev.preventDefault(); pick(cur < 0 ? n - 1 : cur + (ev.key === 'ArrowRight' ? 1 : -1)); }
      else if (ev.key === 'Escape') hide();
    });
  }
  function yAxis(f, ticks, yOf, fmt, light) {
    ticks.forEach(function (v) {
      var y = yOf(v);
      if (y < f.m.t - 1 || y > f.m.t + f.ph + 1) return;
      f.svg.appendChild(s('line', { x1: f.m.l, x2: f.m.l + f.pw, y1: y, y2: y, class: 'c-grid' + (light ? ' light' : '') }));
      f.svg.appendChild(txt(f.m.l - 8, y + 4, fmt(v), 'c-tick' + (light ? ' light' : ''), 'end'));
    });
  }
  function xLabels(f, n, xOf, labelOf, light) {
    var want = f.W < 480 ? 3 : 5, step = Math.max(1, Math.round((n - 1) / (want - 1))), i, used = {};
    for (i = 0; i < n; i += step) used[i] = 1;
    used[n - 1] = 1;
    Object.keys(used).forEach(function (k) {
      var i = +k;
      if (i !== n - 1 && n - 1 - i < step * 0.6) return;     // letzte Beschriftung nicht überlagern
      var a = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      f.svg.appendChild(txt(xOf(i), f.H - 7, labelOf(i), 'c-tick' + (light ? ' light' : ''), a));
    });
  }

  /** Bezugslinie: gestrichelt über die Fläche, benannt in einer Zeile über dem Diagramm (kollidiert mit nichts). */
  function refLine(f, y, label, light) {
    f.svg.appendChild(s('line', { x1: f.m.l, x2: f.m.l + f.pw, y1: y, y2: y, class: 'c-ref' + (light ? ' light' : '') }));
    f.svg.appendChild(s('line', { x1: f.m.l, x2: f.m.l + 20, y1: 10, y2: 10, class: 'c-ref' + (light ? ' light' : '') }));
    f.svg.appendChild(txt(f.m.l + 27, 14, label, 'c-reflabel' + (light ? ' light' : ''), 'start'));
  }

  /* ---- Linie mit Fläche ---- */
  function line(root, o) {
    o.key = !!(o.refs && o.refs.length);
    var f = frame(root, o), pts = o.points, n = pts.length;
    if (!n) return;
    var ys = pts.map(function (p) { return p.y; }), max = Math.max.apply(null, ys.concat(o.refs ? o.refs.map(function (r) { return r.y; }) : [])), min = Math.min.apply(null, ys);
    var ticks, yOf;
    if (o.log) {
      ticks = logTicks(Math.max(min, 1), max);
      var lo = Math.log10(ticks[0]), hi = Math.log10(ticks[ticks.length - 1]);
      yOf = function (v) { return f.m.t + f.ph - (Math.log10(Math.max(v, ticks[0])) - lo) / (hi - lo) * f.ph; };
    } else {
      ticks = o.ticks || niceTicks(max, 4);
      var top = ticks[ticks.length - 1];
      yOf = function (v) { return f.m.t + f.ph - v / top * f.ph; };
    }
    var xOf = function (i) { return f.m.l + (n === 1 ? f.pw / 2 : i / (n - 1) * f.pw); };
    yAxis(f, ticks, yOf, o.yFmt, o.light);
    xLabels(f, n, xOf, function (i) { return pts[i].label; }, o.light);
    (o.refs || []).forEach(function (r) { refLine(f, yOf(r.y), r.label, o.light); });
    var d = '', i;
    for (i = 0; i < n; i++) d += (i ? 'L' : 'M') + xOf(i).toFixed(1) + ' ' + yOf(pts[i].y).toFixed(1);
    var base = f.m.t + f.ph;
    f.svg.appendChild(s('path', { d: d + 'L' + xOf(n - 1).toFixed(1) + ' ' + base + 'L' + xOf(0).toFixed(1) + ' ' + base + 'Z', fill: o.color, 'fill-opacity': o.light ? 0.13 : 0.12, stroke: 'none' }));
    f.svg.appendChild(s('path', { d: d, fill: 'none', stroke: o.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    (o.marks || []).forEach(function (mk) {
      if (mk.i < 0 || mk.i >= n) return;
      f.svg.appendChild(s('circle', { cx: xOf(mk.i), cy: yOf(pts[mk.i].y), r: 5, fill: mk.color || o.color, stroke: o.surface || '#000', 'stroke-width': 2 }));
      if (mk.label) f.svg.appendChild(txt(xOf(mk.i) + (mk.i > n * 0.8 ? -10 : 10), yOf(pts[mk.i].y) + (mk.dy === undefined ? -9 : mk.dy), mk.label, 'c-label' + (o.light ? ' light' : ''), mk.i > n * 0.8 ? 'end' : 'start'));
    });
    crosshair(f, n, xOf, function (i) { return tipNode(pts[i].tip || pts[i].label, [{ value: o.yFmt(pts[i].y, true), color: o.color, name: o.name }]); }, o.light);
    return { xOf: xOf, yOf: yOf, frame: f };
  }

  /* ---- Säulen (eine Reihe oder gestapelt) ---- */
  function bars(root, o) {
    o.key = !!o.ref;
    var f = frame(root, o), items = o.items, n = items.length, series = o.series;
    if (!n) return;
    var totals = items.map(function (it) { return series.reduce(function (a, se) { return a + (it[se.key] || 0); }, 0); });
    var max = Math.max.apply(null, totals.concat(o.ref ? [o.ref.value] : []));
    var ticks = niceTicks(max, 4), top = ticks[ticks.length - 1];
    var yOf = function (v) { return f.m.t + f.ph - v / top * f.ph; };
    var band = f.pw / n, bw = Math.max(2, Math.min(24, band - 2));
    var xOf = function (i) { return f.m.l + band * (i + 0.5); };
    yAxis(f, ticks, yOf, o.yFmt, false);
    xLabels(f, n, xOf, function (i) { return items[i].label; }, false);
    items.forEach(function (it, i) {
      var y = f.m.t + f.ph, x = xOf(i) - bw / 2, live = series.filter(function (se) { return (it[se.key] || 0) > 0; });
      live.forEach(function (se, k) {
        var h = (it[se.key] || 0) / top * f.ph, gap = k < live.length - 1 ? 2 : 0, hh = Math.max(h - gap, 0.5), isTop = k === live.length - 1;
        y -= h;
        var r = isTop ? Math.min(3, bw / 2, hh) : 0;
        // oben abgerundet, an der Grundlinie eckig
        var d = 'M' + x + ' ' + (y + gap + hh) + 'V' + (y + gap + r) + 'Q' + x + ' ' + (y + gap) + ' ' + (x + r) + ' ' + (y + gap) +
          'H' + (x + bw - r) + 'Q' + (x + bw) + ' ' + (y + gap) + ' ' + (x + bw) + ' ' + (y + gap + r) + 'V' + (y + gap + hh) + 'Z';
        f.svg.appendChild(s('path', { d: d, fill: se.color }));
      });
    });
    if (o.ref) refLine(f, yOf(o.ref.value), o.ref.label, false);
    crosshair(f, n, xOf, function (i) {
      var rows = series.map(function (se) { return { value: o.yFmt(items[i][se.key] || 0, true), color: se.color, name: series.length > 1 ? se.name : (o.name || '') }; });
      if (series.length > 1) rows.push({ value: o.yFmt(totals[i], true), name: t('chart.total') });
      return tipNode(items[i].tip || items[i].label, rows);
    }, false);
  }

  /** Tabelle mit denselben Werten wie das Diagramm. */
  function table(root, head, rows) {
    var tb = U.el('table', { class: 'tbl' }), tr = U.el('tr');
    head.forEach(function (h, i) { tr.appendChild(U.el('th', { text: h, class: i ? 'n' : '' })); });
    tb.appendChild(U.el('thead', {}, [tr]));
    var body = U.el('tbody');
    rows.forEach(function (r) {
      var row = U.el('tr');
      r.forEach(function (c, i) { row.appendChild(U.el('td', { text: c, class: i ? 'n' : '' })); });
      body.appendChild(row);
    });
    tb.appendChild(body);
    root.textContent = ''; root.appendChild(U.el('div', { class: 'tbl-scroll' }, [tb]));
  }

  /** Meldet ein Diagramm an: gezeichnet wird, sobald es sichtbar ist, und neu bei Daten, Sprache, Größe. */
  function register(root, draw) {
    var item = { root: root, draw: draw, w: -1 };
    registry.push(item); return item;
  }
  function refresh(force) {
    registry.forEach(function (it) {
      var w = it.root.clientWidth;
      if (!w) return;                                   // Seite gerade nicht sichtbar
      if (force || w !== it.w) { it.w = w; try { it.draw(it.root); } catch (e) { if (window.console) console.error(e); } }
    });
  }
  function init() {
    var to = null;
    window.addEventListener('resize', function () { clearTimeout(to); to = setTimeout(function () { refresh(false); }, 120); });
    U.on('route', function () { requestAnimationFrame(function () { refresh(false); }); });
    U.on('data', function () { refresh(true); });
    U.on('tab', function () { requestAnimationFrame(function () { refresh(false); }); });
    refresh(true);
  }
  return { init: init, line: line, bars: bars, table: table, register: register, refresh: refresh };
})();
