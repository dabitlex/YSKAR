/*
 * Mining-Seite, Szene „Der Block zahlt aus“: Viele raten, eine Zahl passt, der Block bezahlt alle Beteiligten.
 * Die Zahl der bezahlten Adressen ist die des neuesten Pool-Blocks der Kette.
 */
var Pay = (function () {
  'use strict';
  var root, canvas, ctx, W = 0, H = 0, dpr = 1, pts = [], cx = 0, cy = 0, R = 0;

  function rnd(i, s) { var x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); }
  function size() {
    var r = canvas.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    var wide = W >= 900;
    cx = wide ? W * 0.7 : W * 0.5; cy = wide ? H * 0.5 : H * 0.33; R = Math.min(wide ? W * 0.24 : W * 0.4, H * (wide ? 0.36 : 0.24));
    pts = [];
    for (var i = 0; i < 170; i++) {
      var a = rnd(i, 1) * 6.2832, d = Math.sqrt(rnd(i, 2)) * R * 1.45;
      pts.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * 0.82, p: rnd(i, 3) * 6.2832, s: 0.6 + rnd(i, 4) * 1.5, v: 0.8 + rnd(i, 5) * 2.4 });
    }
  }
  function paid() {
    var b = Live.S.blocks, i;
    for (i = 0; i < b.length; i++) if ((b[i].recipients || 1) > 1) return { n: Number(b[i].recipients), h: b[i].height };
    return { n: 16, h: null };
  }
  function draw(f, api) {
    var t = performance.now() / 1000, k = function (a, b) { return Math.max(0, Math.min(1, (f - a) / (b - a))); };
    var gather = k(0.5, 1), block = k(0.85, 1.15), rays = k(1.3, 1.95), fade = k(2.3, 3), i, p, x, y, a;
    var info = paid(), n = Math.min(info.n, 40);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    // Versuche: funkelnde Punkte, die sich zur Mitte sammeln
    for (i = 0; i < pts.length; i++) {
      p = pts[i];
      var e = gather * gather;
      x = p.x + (cx - p.x) * e; y = p.y + (cy - p.y) * e;
      a = (0.25 + 0.75 * Math.abs(Math.sin(t * p.v + p.p))) * (1 - gather * 0.92);
      if (a < 0.02) continue;
      ctx.globalAlpha = api.calm ? 0.5 * (1 - gather) : a; ctx.fillStyle = '#9CCBFF';
      ctx.beginPath(); ctx.arc(x, y, p.s, 0, 6.2832); ctx.fill();
    }
    // der Fund
    if (block > 0) {
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120);
      g.addColorStop(0, 'rgba(255,214,160,' + (0.5 * block * (1 - fade * 0.5)).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,186,110,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(cx - 120, cy - 120, 240, 240);
    }
    ctx.globalCompositeOperation = 'source-over';
    // Auszahlung: Strahlen vom Block zu jeder bezahlten Adresse
    if (rays > 0) {
      for (i = 0; i < n; i++) {
        var ang = -Math.PI / 2 + i / n * 6.2832, d0 = 38, d1 = R * (0.86 + 0.14 * rnd(i, 9));
        var reach = Math.max(0, Math.min(1, rays * 1.5 - i / n * 0.5)), x0 = cx + Math.cos(ang) * d0, y0 = cy + Math.sin(ang) * d0;
        x = cx + Math.cos(ang) * (d0 + (d1 - d0) * reach); y = cy + Math.sin(ang) * (d0 + (d1 - d0) * reach);
        ctx.globalAlpha = 0.5 * (1 - fade * 0.75); ctx.strokeStyle = '#FFC47A'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke();
        if (reach >= 1) {
          ctx.globalAlpha = 1; ctx.fillStyle = '#FFE0B0';
          ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 6.2832); ctx.fill();
          ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(x, y, 8, 0, 6.2832); ctx.fill();
        }
      }
    }
    if (block > 0) {
      var s = 30 * (0.6 + 0.4 * block);
      ctx.globalAlpha = block; ctx.fillStyle = '#0B1630'; ctx.strokeStyle = '#FFD9A6'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cx - s, cy - s, s * 2, s * 2, 12); else ctx.rect(cx - s, cy - s, s * 2, s * 2);
      ctx.fill(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    var out = document.getElementById('pay-n'); if (out && out.textContent !== String(info.n)) out.textContent = U.num(info.n);
    return !api.calm && f < 1.2;          // solange gefunkelt wird, weiterzeichnen
  }
  function init() {
    root = document.getElementById('pay'); if (!root) return;
    canvas = U.$('canvas', root); ctx = canvas.getContext('2d'); size();
    Steps.mount(root, draw, { onSize: size });
  }
  return { init: init };
})();
