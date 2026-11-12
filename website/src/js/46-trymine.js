/*
 * „Raten starten“: Das Gerät des Besuchers sucht auf dem echten Kopf des neuesten Blocks nach einer Nonce,
 * gegen ein leichtes Übungsziel (der Hash muss mit 20 Null-Bits beginnen). Danach steht da, wie lange
 * dasselbe Gerät im Mittel für einen echten Block bräuchte. Gerechnet wird wirklich; die Funken sind die Anzeige dazu.
 */
var TryMine = (function () {
  'use strict';
  var BITS = 20, CAP = 14000000, running = false, stop = false, lastRate = 0, last = null, calm = false;
  var canvas, ctx, W = 0, H = 0, dpr = 1, sparks = [], flash = 0, raf = 0;

  function $(id) { return document.getElementById(id); }
  function targetWords() {
    var one = (BigInt(1) << BigInt(256 - BITS)) - BigInt(1), s = one.toString(16), w = new Int32Array(8), i;
    while (s.length < 64) s = '0' + s;
    for (i = 0; i < 8; i++) w[i] = parseInt(s.substr(i * 8, 8), 16) | 0;
    return w;
  }
  function duration(sec) {
    if (!isFinite(sec)) return '–';
    if (sec < 120) return t('dur.sec', { n: U.num(Math.max(1, sec), 0) });
    if (sec < 7200) return t('dur.min', { n: U.num(sec / 60, 0) });
    if (sec < 172800) return t('dur.hours', { n: U.num(sec / 3600, 0) });
    if (sec < 730 * 86400) return t('dur.days', { n: U.num(sec / 86400, 0) });
    var y = sec / (365.25 * 86400);
    return t('dur.years', { n: y >= 1e6 ? U.compact(y, 1) : U.num(y, y < 10 ? 1 : 0) });
  }
  function hashWithNonce(header, n) {
    var b = new Uint8Array(header), lo = n >>> 0, hi = Math.floor(n / 4294967296) >>> 0;
    b[128] = lo & 255; b[129] = (lo >>> 8) & 255; b[130] = (lo >>> 16) & 255; b[131] = lo >>> 24;
    b[132] = hi & 255; b[133] = (hi >>> 8) & 255; b[134] = (hi >>> 16) & 255; b[135] = hi >>> 24;
    return U.bytesToHex(Sha.twice(b));
  }
  function showHash(hex) {
    var box = $('try-hash'), z = 0; box.textContent = '';
    while (z < 64 && hex[z] === '0') z++;
    if (z) box.appendChild(U.el('b', { text: hex.slice(0, z) }));
    box.appendChild(document.createTextNode(hex.slice(z)));
  }
  function say(kind, n) {
    var s = $('try-say'), r = $('try-real');
    last = kind ? { kind: kind, n: n } : null;
    s.className = 'try__say' + (kind === 'found' ? ' is-ok' : '');
    s.textContent = !kind ? t('mine.try.idle') : t('mine.try.' + kind, { n: U.num(n) });
    if (kind && lastRate) {
      var diff = Number(Live.S.summary.difficultyWert || Live.S.summary.difficulty), work = diff * 65536;
      r.textContent = t('mine.try.real', { x: U.compact(work / Math.pow(2, BITS), 0), r: U.hashrate(lastRate), t: duration(work / lastRate) });
    } else r.textContent = '';
    $('try-go').textContent = running ? t('mine.try.stop') : (kind ? t('mine.try.again') : t('mine.try.go'));
  }

  /* ---------- Funken ---------- */
  function size() {
    var r = canvas.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  function emit(k) {
    if (calm) return;
    for (var i = 0; i < k && sparks.length < 260; i++) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9, v = 1.5 + Math.random() * 4.2;
      sparks.push({ x: W / 2 + (Math.random() - 0.5) * 30, y: H * 0.78, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, d: 0.012 + Math.random() * 0.02 });
    }
    if (!raf) raf = requestAnimationFrame(draw);
  }
  function draw() {
    raf = 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    var i, s;
    for (i = sparks.length - 1; i >= 0; i--) {
      s = sparks[i]; s.x += s.vx; s.y += s.vy; s.vy += 0.035; s.life -= s.d;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.globalAlpha = s.life * 0.9;
      ctx.fillStyle = '#9CCBFF';
      ctx.beginPath(); ctx.arc(s.x, s.y, 1.1 + s.life * 1.3, 0, 6.2832); ctx.fill();
    }
    if (flash > 0) {
      var g = ctx.createRadialGradient(W / 2, H * 0.5, 0, W / 2, H * 0.5, Math.max(W, H) * 0.6 * (1.15 - flash * 0.5));
      g.addColorStop(0, 'rgba(255,226,180,' + (flash * 0.95).toFixed(3) + ')'); g.addColorStop(0.35, 'rgba(255,186,110,' + (flash * 0.4).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,186,110,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      flash -= 0.012;
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (sparks.length || flash > 0) raf = requestAnimationFrame(draw);
  }

  function run() {
    var tip = Live.S.blocks[0]; if (!tip || !tip.header) return;
    var header = U.hexToBytes(tip.header), search = Sha.makeSearch(header), target = targetWords();
    var next = Math.floor(Math.random() * 4000000000), tried = 0, chunk = 4000;
    var clock = (window.performance && performance.now) ? function () { return performance.now(); } : Date.now, t0 = clock();
    running = true; stop = false; flash = 0; say(null); size();
    (function step() {
      var c0 = clock(), r = search(next, chunk, target), dt = clock() - c0;
      tried += r.tried; next += chunk;
      lastRate = tried / Math.max((clock() - t0) / 1000, 0.001);
      $('try-n').textContent = U.num(tried); $('try-rate').textContent = U.hashrate(lastRate);
      if (r.nonce >= 0) { showHash(hashWithNonce(header, r.nonce)); return done('found', tried); }
      showHash(hashWithNonce(header, next - 1)); emit(5);
      if (stop) return done(null, tried);
      if (tried >= CAP) return done('none', tried);
      if (dt < 24) chunk = Math.min(chunk * 2, 300000); else if (dt > 60) chunk = Math.max(2000, Math.floor(chunk / 2));
      setTimeout(step, 0);
    })();
    function done(kind, n) {
      running = false;
      if (kind === 'found') { flash = 1; emit(60); if (!raf) raf = requestAnimationFrame(draw); }
      say(kind, n);
    }
  }
  function init() {
    if (!$('trymine')) return;
    canvas = $('try-canvas'); ctx = canvas.getContext('2d');
    calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    $('try-go').addEventListener('click', function () { if (running) stop = true; else run(); });
    U.on('lang', function () { say(last ? last.kind : null, last ? last.n : 0); });
    U.on('route', function (r) { if (r.page !== 'mine' && running) stop = true; });
    showHash('????????????????????????????????????????????????????????????????'.replace(/\?/g, '·'));
    say(null);
  }
  return { init: init };
})();
