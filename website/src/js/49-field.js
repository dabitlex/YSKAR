/*
 * YSR als Lichtfeld: 21 Millionen YSR, jedes Licht steht für 1.000 (schmal: 2.000) YSR, in der Reihenfolge ihrer Entstehung.
 * Geschürft = leuchtet, verbrannt = Glut, noch nicht geschürft = dunkel. Werte aus der Kette und aus den Konsensregeln.
 */
var Field = (function () {
  'use strict';
  var root, canvas, ctx, W = 0, H = 0, dpr = 1, unit = 1000, N = 21000, cols = 1, cell = 4, ox = 0, oy = 0, rows = 1, api;

  function size() {
    var r = canvas.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    var wide = W >= 900;
    unit = W < 700 ? 2000 : 1000; N = 21000000 / unit;
    // Fläche für das Feld: breit rechts neben dem Text, schmal über dem Text
    var ax = wide ? W * 0.44 : 20, aw = wide ? W * 0.56 - 56 : W - 40, ay = wide ? H * 0.16 : 118, ah = wide ? H * 0.7 : H * 0.44;
    cell = Math.floor(Math.sqrt(aw * ah / N) * 100) / 100;
    cols = Math.max(10, Math.floor(aw / cell)); rows = Math.ceil(N / cols);
    while (rows * cell > ah && cell > 1) { cell -= 0.05; cols = Math.floor(aw / cell); rows = Math.ceil(N / cols); }
    ox = ax + (aw - cols * cell) / 2; oy = ay + (ah - rows * cell) / 2;
    U.$$('[data-field-unit]', root).forEach(function (e) { e.textContent = U.num(unit); });
  }
  function band(from, to, color, alpha) {
    if (to <= from) return;
    var d = Math.max(1, cell * 0.62), i, x, y, r0 = Math.floor(from / cols), r1 = Math.floor((to - 1) / cols), row, a, b;
    ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath();
    for (row = r0; row <= r1; row++) {
      a = row === r0 ? from - row * cols : 0; b = row === r1 ? to - row * cols : cols;
      y = oy + row * cell;
      for (i = a; i < b; i++) { x = ox + i * cell; ctx.rect(x, y, d, d); }
    }
    ctx.fill();
  }
  function draw(f) {
    var S = Live.S, max = Number(S.summary.maxSupply), minted = Number(S.summary.totalSupply) / max * N, burned = parseFloat(S.supply.unspendable) * U.UNIT / max * N;
    var k = function (a, b) { return Math.max(0, Math.min(1, (f - a) / (b - a))); };
    var lit = Math.round(minted * k(0.25, 1)), ash = Math.round(burned * k(1.3, 2)), era = k(2.3, 3), halv = k(3.3, 4);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    band(0, N, '#8FB4FF', 0.13);                                       // alles, was es je geben wird
    if (halv > 0) {                                                    // Epochen als abwechselnd hellere Bänder
      var start = 0, e, len = N / 2;
      for (e = 0; e < 9 && len >= 1; e++) { if (e % 2 === 0) band(Math.round(start), Math.round(start + len), '#8FB4FF', 0.13 * halv); start += len; len /= 2; }
    }
    if (era > 0) band(0, Math.round(N / 2), '#63D8FF', 0.16 * era * (1 - halv * 0.6));
    band(0, lit, '#6FB6FF', 0.95);                                     // geschürft
    if (ash > 0) { band(0, ash, '#020510', 1); band(0, ash, '#FF9B5C', 0.9 - 0.55 * k(1.7, 2.4)); }
    // Rahmen um die erste Epoche
    if (era > 0.02) {
      var rr = Math.ceil(N / 2 / cols);
      ctx.globalAlpha = era * (1 - halv * 0.5); ctx.strokeStyle = '#FFC47A'; ctx.lineWidth = 1.2;
      ctx.strokeRect(ox - 5, oy - 5, cols * cell + 8, rr * cell + 8);
    }
    ctx.globalAlpha = 1;
  }
  function init() {
    root = document.getElementById('field'); if (!root) return;
    canvas = U.$('canvas', root); ctx = canvas.getContext('2d');
    size();
    api = Steps.mount(root, function (f) { draw(f); return false; }, { onSize: size });
  }
  return { init: init };
})();
