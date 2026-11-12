/*
 * Mining-Demo: Der Browser sucht auf dem echten Kopf des neuesten Blocks nach einer Nonce,
 * gegen ein leichteres Ziel (der Hash muss mit n Null-Bits beginnen). Danach steht da,
 * wie lange derselbe Browser im Mittel für einen echten Block bräuchte.
 */
var Miner = (function () {
  'use strict';
  var running = false, stop = false, lastRate = 0, lastState = null;
  var CAP = 60000000;

  function $(id) { return document.getElementById(id); }
  function bits() { return +$('miner-bits').value; }
  function targetHex(b) {
    var one = (BigInt(1) << BigInt(256 - b)) - BigInt(1), s = one.toString(16);
    while (s.length < 64) s = '0' + s;
    return s;
  }
  function targetWords(hex) {
    var w = new Int32Array(8), i;
    for (i = 0; i < 8; i++) w[i] = parseInt(hex.substr(i * 8, 8), 16) | 0;
    return w;
  }
  function duration(sec) {
    if (!isFinite(sec)) return '—';
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
  function showHash(hex, found, b) {
    var code = $('miner-hash'); code.textContent = '';
    if (!hex) { code.textContent = '—'; return; }
    var zeros = 0;
    while (zeros < 64 && hex[zeros] === '0') zeros++;
    code.appendChild(U.el('span', { class: found ? 'zeros ok' : 'same', text: hex.slice(0, zeros) }));
    code.appendChild(U.el('span', { class: 'rest', text: hex.slice(zeros) }));
    $('miner-hash-k').textContent = found ? t('miner.hashFound') : t('miner.hash');
  }
  function paintIdle() {
    var b = bits();
    $('miner-odds').textContent = t('miner.odds', { b: b, n: U.num(Math.pow(2, b)) });
    $('miner-target').textContent = targetHex(b);
    $('miner-go').textContent = running ? t('miner.stop') : t('miner.start');
    real();
  }
  function real() {
    var box = $('miner-real');
    if (!lastRate) { box.textContent = ''; return; }
    var diff = Number(Live.S.summary.difficultyWert || Live.S.summary.difficulty);
    box.textContent = t('miner.real', { r: U.hashrate(lastRate), t: duration(diff * 65536 / lastRate) });
  }
  function verdict(kind, n) {
    var v = $('miner-verdict');
    lastState = kind ? { kind: kind, n: n } : null;
    if (!kind) { v.textContent = ''; v.className = 'verdict'; return; }
    v.className = 'verdict ' + (kind === 'found' ? 'ok' : 'idle');
    v.textContent = t('miner.' + kind, { n: U.num(n) });
  }
  function run() {
    var tip = Live.S.blocks[0]; if (!tip || !tip.header) return;
    var header = U.hexToBytes(tip.header), search = Sha.makeSearch(header), b = bits(), thex = targetHex(b), target = targetWords(thex);
    var start = Math.floor(Math.random() * 4000000000), next = start, tried = 0, chunk = 4000;
    var clock = (window.performance && performance.now) ? function () { return performance.now(); } : Date.now, t0 = clock();
    running = true; stop = false; verdict(null); paintIdle();
    $('miner-bits').disabled = true; $('miner-nonce').textContent = '—';
    (function step() {
      var c0 = clock(), r = search(next, chunk, target), dt = clock() - c0;
      tried += r.tried; next += chunk;
      var el = (clock() - t0) / 1000;
      lastRate = tried / Math.max(el, 0.001);
      $('miner-n').textContent = U.num(tried);
      $('miner-rate').textContent = U.hashrate(lastRate);
      $('miner-time').textContent = U.num(el, 1, 1) + ' s';
      if (r.nonce >= 0) {
        showHash(hashWithNonce(header, r.nonce), true, b);
        $('miner-nonce').textContent = r.nonce.toLocaleString(U.loc());
        return done('found', tried);
      }
      showHash(hashWithNonce(header, next - 1), false, b);
      if (stop) return done('stopped', tried);
      if (tried >= CAP) return done('none', tried);
      if (dt < 24) chunk = Math.min(chunk * 2, 400000); else if (dt > 60) chunk = Math.max(2000, Math.floor(chunk / 2));
      setTimeout(step, 0);
    })();
    function done(kind, n) {
      running = false; $('miner-bits').disabled = false;
      verdict(kind, n); paintIdle();
    }
  }
  function init() {
    if (!$('miner')) return;
    $('miner-go').addEventListener('click', function () { if (running) stop = true; else run(); });
    $('miner-bits').addEventListener('input', paintIdle);
    U.on('lang', function () { paintIdle(); if (lastState) verdict(lastState.kind, lastState.n); });
    U.on('data', real);
    U.on('route', function (r) { if (r.page !== 'chain' && running) stop = true; });
    paintIdle();
  }
  return { init: init };
})();
