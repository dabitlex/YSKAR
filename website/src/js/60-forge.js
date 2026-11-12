/*
 * Seite „Die Kette“, Szene „Ein Block, drei Schritte“: der Kopf des neuesten Blocks, Byte für Byte.
 * 1 Miner suchen: die Nonce (warm) wechselt, der Hash darunter springt. 2 Knoten prüfen: Nonce und Hash des echten Blocks
 * stehen fest, ein Licht je gemeldetem Knoten geht an. 3 Der Block zahlt aus: er nimmt seinen Platz am Ende der Kette ein
 * und zahlt an so viele Adressen, wie dieser Block bezahlt hat.
 * Echt sind: Kopf, Hash, Ziel und das Ergebnis der Prüfung (hier im Browser gerechnet), die Zahl der Knoten, Belohnung und
 * Zahl der Empfänger, die Blöcke davor mit ihren Zeitabständen. Darstellung sind: das Springen der Nonce und die Reihenfolge,
 * in der die Lichter angehen.
 */
var Forge = (function () {
  'use strict';
  var root, canvas, ctx, W = 0, H = 0, dpr = 1, wide = false, cur = null, fontOk = false, checkAt = 0;
  var box = { x: 0, y: 0, w: 0, h: 0, cw: 0, ch: 0 };
  var HEX = '0123456789abcdef', LAMP = '#FFC47A';

  function rnd(i, s) { var x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); }
  function clamp(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function ease(x) { return x * x * (3 - 2 * x); }
  function zeros(s) { var z = 0; while (z < s.length && s.charAt(z) === '0') z++; return z; }

  /** Der neueste Block, einmal je Block im Browser nachgerechnet. */
  function block() {
    var bl = Live.S.blocks, b = bl && bl[0], i;
    if (!b || !b.header) return cur;
    if (!cur || cur.height !== b.height) {
      var v = U.verifyHeader(b.header), t0 = Number(b.timestamp), prev = [];
      for (i = 1; i < bl.length && prev.length < 8; i++) prev.push({ h: bl[i].height, dt: Math.max(0, t0 - Number(bl[i].timestamp)) });
      cur = { height: b.height, bytes: v.header.bytes, hash: v.hash, target: v.target, zh: zeros(v.hash), zt: zeros(v.target),
        valid: v.valid === true, paid: Math.max(1, Number(b.recipients || 1)), reward: b.reward, prev: prev };
    }
    return cur;
  }
  function size() {
    var r = canvas.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    wide = W >= 900;
    var room = wide ? Math.min(W * 0.4, 560) : Math.min(W - 40, 420);
    var bw = Math.min(room, H * 0.3 / 8 / 0.95 * 17);                 // niedrige Fenster: das Raster bleibt im oberen Drittel
    box.cw = bw / 17; box.ch = box.cw * 0.95; box.w = bw; box.h = box.ch * 8;
    box.x = wide ? W * 0.56 + (room - bw) / 2 : (W - bw) / 2;
    box.y = wide ? Math.max(96, H * 0.5 - box.h / 2 - 84) : Math.max(84, H * 0.17);
  }
  function mono(px, w) { return (w || 500) + ' ' + px.toFixed(1) + 'px ' + (fontOk ? '"Geist Mono",' : '') + 'ui-monospace,Menlo,Consolas,monospace'; }
  function split(txt, x, y, px, n, colA, colB) {
    ctx.font = mono(px); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    var a = txt.slice(0, n);
    ctx.fillStyle = colA; ctx.fillText(a, x, y);
    ctx.fillStyle = colB; ctx.fillText(txt.slice(n), x + ctx.measureText(a).width, y);
  }
  function glow(x, y, r, rgb, a) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a.toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  }
  function draw(f, api) {
    var B = block(); if (!B) return false;
    var now = performance.now() / 1000, k = function (a, b) { return clamp((f - a) / (b - a)); };
    var found = api.calm || f >= 0.6, fold = ease(k(1.25, 1.65)), pay = k(1.58, 1.86), check, i, x, y;
    if (api.calm) check = 1;
    else if (f < 0.7) { checkAt = 0; check = 0; }
    else { if (!checkAt) checkAt = now; check = clamp((now - checkAt) / 1.5); }
    var tick = Math.floor(now * 16), cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    var px = Math.max(8.5, Math.min(14, box.w / 64 / 0.6)), lw = 64 * px * 0.6, lx = cx - lw / 2, ly = box.y + box.h + (wide ? 46 : 34);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);

    /* ---- der Kopf: 136 Byte, darunter Hash und Ziel ---- */
    if (fold < 1) {
      ctx.save();
      if (fold > 0) { var s = 1 - fold * 0.72; ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy); }
      ctx.globalAlpha = 1 - fold;
      ctx.font = mono(box.cw * 0.5); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (i = 0; i < 136; i++) {
        x = box.x + (i % 17 + 0.5) * box.cw; y = box.y + (Math.floor(i / 17) + 0.5) * box.ch;
        var v = B.bytes[i], nonce = i >= 128;
        if (nonce && !found) v = Math.floor(rnd(i, tick) * 256);
        if (nonce && found) { ctx.fillStyle = 'rgba(255,196,122,.16)'; ctx.fillRect(x - box.cw * 0.46, y - box.ch * 0.4, box.cw * 0.92, box.ch * 0.8); }
        ctx.fillStyle = nonce ? LAMP : i >= 120 ? 'rgba(255,196,122,.72)' : 'rgba(226,236,255,.62)';
        ctx.fillText(HEX.charAt(v >> 4) + HEX.charAt(v & 15), x, y);
      }
      ctx.font = mono(px * 0.86, 400); ctx.fillStyle = 'rgba(212,226,255,.5)'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(t('forge.hash'), lx, ly - px * 1.5);
      if (!found) {
        var str = '', q; for (q = 0; q < 64; q++) str += HEX.charAt(Math.floor(rnd(q, tick + 7) * 16));
        split(str, lx, ly, px, 0, LAMP, 'rgba(212,226,255,.5)');
      } else split(B.hash, lx, ly, px, B.zh, LAMP, '#EEF4FF');
      ctx.font = mono(px * 0.86, 400); ctx.fillStyle = 'rgba(212,226,255,.5)';
      ctx.fillText(t('forge.target'), lx, ly + px * 1.7);
      split(B.target, lx, ly + px * 3.2, px, B.zt, 'rgba(255,196,122,.6)', 'rgba(212,226,255,.5)');
      if (found && B.valid) {
        ctx.font = mono(px * 0.95, 500); ctx.fillStyle = '#5BE3AB';
        ctx.fillText(t('forge.ok'), lx, ly + px * 5.3);
      }
      ctx.restore();
    }

    /* ---- die Knoten: ein Licht je gemeldetem Knoten, eines nach dem anderen ---- */
    var rowA = (api.calm ? 1 : k(0.6, 0.78)) * (1 - fold);
    if (rowA > 0.01) {
      var n = Math.max(1, Math.min(480, Number(Live.S.summary.knoten || 0))), per = Math.max(2, Math.floor(lw / 10) + 1);
      var rows = Math.ceil(n / per), ry = ly + px * 8.2;
      for (i = 0; i < n; i++) {
        var col = i % per, inRow = Math.min(per, n - Math.floor(i / per) * per);
        x = inRow === 1 ? lx : lx + lw * col / (Math.max(inRow, per > n ? n : per) - 1);
        y = ry + Math.floor(i / per) * 13;
        var on = clamp(check * (n + 3) - i);
        ctx.globalAlpha = rowA;
        if (on > 0) glow(x, y, 9, '99,216,255', 0.34 * on);
        if (on > 0 && on < 1) {
          ctx.strokeStyle = 'rgba(159,230,255,' + (0.7 * (1 - on)).toFixed(3) + ')'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, 3 + 9 * on, 0, 6.2832); ctx.stroke();
        }
        ctx.fillStyle = on >= 0.5 ? '#9FE6FF' : 'rgba(170,198,255,.42)';
        ctx.beginPath(); ctx.arc(x, y, on >= 0.5 ? 2.5 : 1.9, 0, 6.2832); ctx.fill();
      }
      ctx.font = mono(px * 0.86, 400); ctx.fillStyle = 'rgba(212,226,255,.5)'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(tn('forge.nodes', n, { n: U.num(n) }), lx, ry + (rows - 1) * 13 + px * 2);
      ctx.globalAlpha = 1;
    }

    /* ---- der Block am Ende der Kette, davor die letzten Blöcke im Abstand ihres Fundes ---- */
    if (fold > 0) {
      var L = box.w / 2, prev = B.prev, span = prev.length ? Math.max(1, prev[prev.length - 1].dt) : 1, R = box.w * 0.42;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(150,186,255,' + (0.3 * fold).toFixed(3) + ')'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx - L, cy); ctx.lineTo(cx, cy); ctx.stroke();
      for (i = 0; i < prev.length; i++) {
        var a = clamp(fold * 2 - i / prev.length);
        if (a <= 0) continue;
        x = cx - prev[i].dt / span * L;
        glow(x, cy, 10, '99,216,255', 0.3 * a);
        ctx.globalAlpha = a; ctx.fillStyle = '#9FE6FF';
        ctx.beginPath(); ctx.arc(x, cy, 2.5, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1;
      }
      glow(cx, cy, 54, '255,196,122', 0.55 * fold);
      glow(cx, cy, 14, '255,240,214', 0.95 * fold);
      ctx.font = mono(12, 500); ctx.fillStyle = 'rgba(255,196,122,' + fold.toFixed(3) + ')'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(t('walk.tip.block', { h: U.num(B.height) }), cx, cy - 64);
      // Auszahlung: ein Strahl je bezahlter Adresse
      if (pay > 0) {
        var m = Math.min(B.paid, 96);
        for (i = 0; i < m; i++) {
          var ang = m === 1 ? Math.PI * 0.5 : Math.PI * (0.14 + 0.72 * i / (m - 1)), len = R;
          var p = clamp(pay * 1.5 - i / m * 0.5);
          if (p <= 0) continue;
          var x0 = cx + Math.cos(ang) * 16, y0 = cy + Math.sin(ang) * 16, x1 = cx + Math.cos(ang) * len, y1 = cy + Math.sin(ang) * len;
          ctx.strokeStyle = 'rgba(255,196,122,' + (0.45 * p).toFixed(3) + ')'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + (x1 - x0) * p, y0 + (y1 - y0) * p); ctx.stroke();
          if (p >= 1) { glow(x1, y1, 8, '255,196,122', 0.3); ctx.fillStyle = '#FFD9A6'; ctx.beginPath(); ctx.arc(x1, y1, 2.5, 0, 6.2832); ctx.fill(); }
        }
        var la = clamp(pay * 2 - 1);
        if (la > 0) {
          ctx.textAlign = 'center';
          ctx.font = mono(Math.max(11, px * 0.95), 500); ctx.fillStyle = 'rgba(255,196,122,' + la.toFixed(3) + ')';
          ctx.fillText(tn('forge.paid', B.paid, { r: U.ysr(B.reward), n: U.num(B.paid) }), cx, cy + R + 34);
          if (prev.length) {
            ctx.font = mono(Math.max(9.5, px * 0.8), 400); ctx.fillStyle = 'rgba(212,226,255,' + (0.5 * la).toFixed(3) + ')';
            ctx.fillText(t('forge.before', { n: U.num(prev.length), m: U.num(Math.round(span / 60)) }), cx, cy + R + 56);
          }
        }
      }
    }
    return !found || (check > 0 && check < 1);
  }
  function init() {
    root = document.getElementById('forge'); if (!root) return;
    canvas = U.$('canvas', root); ctx = canvas.getContext('2d'); size();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fontOk = true; });
    Steps.mount(root, draw, { onSize: size, calmAt: 1 });
  }
  return { init: init };
})();
