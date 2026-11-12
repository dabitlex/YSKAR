/* Kleine Helfer: DOM, Bytes, Protokollformeln, Zahlenformate. */
var U = (function () {
  'use strict';
  var UNIT = 100000000, EPOCH = 12000, REWARD0 = 875 * UNIT, V6 = 10000;
  var listeners = {};

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag), k;
    if (attrs) for (k in attrs) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); }
  function emit(evt, data) { (listeners[evt] || []).forEach(function (fn) { try { fn(data); } catch (e) { if (window.console) console.error(e); } }); }

  /* ---- Bytes ---- */
  function hexToBytes(hex) {
    var out = new Uint8Array(hex.length >> 1), i;
    for (i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }
  function bytesToHex(b) {
    var s = '', i;
    for (i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16);
    return s;
  }
  function le(b, off, len) {           // kleine Zahlen (bis 2^53) little-endian
    var v = 0, i;
    for (i = len - 1; i >= 0; i--) v = v * 256 + b[off + i];
    return v;
  }
  function leBig(b, off, len) {
    var v = BigInt(0), i;
    for (i = len - 1; i >= 0; i--) v = v * BigInt(256) + BigInt(b[off + i]);
    return v;
  }

  /* ---- Protokoll ---- */
  /** Difficulty-Feld (4 Byte) lesen; ab 2^31 Gleitkomma-Schreibweise (Konsensfassung 4). */
  function decodeDifficulty(field) {
    var f = BigInt(field);
    if (f < (BigInt(1) << BigInt(31))) return f;
    var e = (f >> BigInt(23)) & BigInt(255), m = (f & BigInt(0x7fffff)) | (BigInt(1) << BigInt(23));
    return m << e;
  }
  /** target = floor(2^240 / difficulty), als 64 Hexzeichen */
  function targetHex(diff) {
    var t = (BigInt(1) << BigInt(240)) / BigInt(diff), s = t.toString(16);
    while (s.length < 64) s = '0' + s;
    return s;
  }
  var FIELDS = [
    { id: 'version', off: 0, len: 4 }, { id: 'height', off: 4, len: 4 }, { id: 'prev', off: 8, len: 32 },
    { id: 'merkle', off: 40, len: 32 }, { id: 'state', off: 72, len: 32 }, { id: 'time', off: 104, len: 8 },
    { id: 'diff', off: 112, len: 4 }, { id: 'count', off: 116, len: 4 }, { id: 'extra', off: 120, len: 8 },
    { id: 'nonce', off: 128, len: 8 }];
  function parseHeader(hex) {
    var b = hexToBytes(hex);
    return {
      bytes: b,
      version: le(b, 0, 4), height: le(b, 4, 4),
      prev: bytesToHex(b.subarray(8, 40)), merkle: bytesToHex(b.subarray(40, 72)), state: bytesToHex(b.subarray(72, 104)),
      time: le(b, 104, 8), diffField: le(b, 112, 4), difficulty: decodeDifficulty(le(b, 112, 4)),
      count: le(b, 116, 4), extra: leBig(b, 120, 8), nonce: leBig(b, 128, 8)
    };
  }
  /** Rechnet den Blockkopf nach: zweimal SHA-256, Vergleich mit dem Ziel. */
  function verifyHeader(hex) {
    var h = parseHeader(hex), clock = (window.performance && performance.now) ? function () { return performance.now(); } : Date.now;
    var first = Sha.digest(h.bytes), hash = bytesToHex(Sha.digest(first)), target = targetHex(h.difficulty);
    // Zeit je Prüfung: über viele Durchläufe gemittelt, weil eine einzelne unter der Auflösung der Uhr liegt
    var reps = 200, t0 = clock(), i;
    for (i = 0; i < reps; i++) Sha.twice(h.bytes);
    var ms = (clock() - t0) / reps;
    return { header: h, first: bytesToHex(first), hash: hash, target: target, valid: hash <= target, ms: ms };
  }
  function rewardAt(height) {
    var era = Math.floor(height / EPOCH);
    return era >= 63 ? 0 : Math.floor(REWARD0 / Math.pow(2, era));
  }
  /** Summe aller Belohnungen bis einschließlich Block `height`, in Einheiten. */
  function mintedAt(height) {
    var n = height + 1, eras = Math.floor(n / EPOCH), rem = n % EPOCH, sum = 0, k;
    for (k = 0; k < eras && k < 63; k++) sum += EPOCH * Math.floor(REWARD0 / Math.pow(2, k));
    if (eras < 63) sum += rem * Math.floor(REWARD0 / Math.pow(2, eras));
    return sum;
  }

  /* ---- Formate ---- */
  function loc() { return (document.documentElement.lang || 'en') === 'de' ? 'de-DE' : 'en-US'; }
  function num(x, max, min) {
    return Number(x).toLocaleString(loc(), { maximumFractionDigits: max === undefined ? 0 : max, minimumFractionDigits: min || 0 });
  }
  function compact(x, digits) {
    try {
      return new Intl.NumberFormat(loc(), { notation: 'compact', compactDisplay: 'long', maximumFractionDigits: digits === undefined ? 1 : digits }).format(x);
    } catch (e) { return num(x); }
  }
  /** Betrag aus Einheiten (Zahl oder Ziffernfolge) als YSR, genau bis zur 8. Stelle, Nullen am Ende weg. */
  function ysr(units, opt) {
    opt = opt || {};
    var u = BigInt(String(units).split('.')[0]), neg = u < BigInt(0);
    if (neg) u = -u;
    var whole = u / BigInt(UNIT), frac = (u % BigInt(UNIT)).toString();
    while (frac.length < 8) frac = '0' + frac;
    var max = opt.max === undefined ? 8 : opt.max;
    frac = frac.slice(0, max).replace(/0+$/, '');
    while (frac.length < (opt.min || 0)) frac += '0';
    var sep = loc() === 'de-DE' ? ',' : '.';
    return (neg ? '−' : '') + Number(whole).toLocaleString(loc()) + (frac ? sep + frac : '') + (opt.bare ? '' : ' YSR');
  }
  function hashrate(h) {
    var st = [[1e15, 'PH/s'], [1e12, 'TH/s'], [1e9, 'GH/s'], [1e6, 'MH/s'], [1e3, 'kH/s']], i;
    if (!(h > 0)) return '—';
    for (i = 0; i < st.length; i++) if (h >= st[i][0]) return num(h / st[i][0], 2) + ' ' + st[i][1];
    return num(h, 0) + ' H/s';
  }
  function shortHash(h, a, b) {
    a = a === undefined ? 10 : a; b = b === undefined ? 8 : b;
    return h.length <= a + b + 1 ? h : h.slice(0, a) + '…' + h.slice(-b);
  }
  function date(ts, withTime) {
    var d = new Date(ts * 1000), o = { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' };
    if (withTime) { o.hour = '2-digit'; o.minute = '2-digit'; o.hour12 = false; }
    return d.toLocaleString(loc(), o) + (withTime ? ' UTC' : '');
  }
  function dayLabel(iso) {            // "2026-11-10" -> "10 Nov" / "10. Nov."
    var p = iso.split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).toLocaleDateString(loc(), { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  function store(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem(key);
      window.localStorage.setItem(key, value);
    } catch (e) { /* ohne Speicher läuft alles weiter */ }
    return null;
  }
  function copyText(text, btn, doneLabel) {
    function ok() {
      if (!btn) return;
      var old = btn.textContent; btn.textContent = doneLabel || '✓'; btn.classList.add('done');
      setTimeout(function () { btn.textContent = old; btn.classList.remove('done'); }, 1600);
    }
    function fallback() {
      try {
        var ta = el('textarea', { style: 'position:fixed;left:-999px;top:0', 'aria-hidden': 'true' });
        ta.value = text; document.body.appendChild(ta); ta.select();
        var done = document.execCommand('copy'); document.body.removeChild(ta);
        if (done) ok();
      } catch (e) { /* Kopieren ist hier nicht erlaubt */ }
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback);
      else fallback();
    } catch (e) { fallback(); }
  }

  /* ---- Schwebender Hinweis ---- */
  var tipEl = null;
  function tipShow(node, x, y) {
    tipEl = tipEl || document.getElementById('tip');
    tipEl.textContent = ''; tipEl.appendChild(node); tipEl.hidden = false;
    var w = tipEl.offsetWidth, h = tipEl.offsetHeight, vw = window.innerWidth, left = x + 14, top = y - h - 12;
    if (left + w > vw - 8) left = x - w - 14;
    if (left < 8) left = 8;
    if (top < 8) top = y + 16;
    tipEl.style.left = left + 'px'; tipEl.style.top = top + 'px';
  }
  function tipHide() { if (tipEl) tipEl.hidden = true; }

  return {
    $: $, $$: $$, el: el, on: on, emit: emit,
    hexToBytes: hexToBytes, bytesToHex: bytesToHex, le: le, leBig: leBig,
    FIELDS: FIELDS, parseHeader: parseHeader, verifyHeader: verifyHeader, targetHex: targetHex, decodeDifficulty: decodeDifficulty,
    rewardAt: rewardAt, mintedAt: mintedAt, UNIT: UNIT, EPOCH: EPOCH, V6: V6,
    loc: loc, num: num, compact: compact, ysr: ysr, hashrate: hashrate, shortHash: shortHash, date: date, dayLabel: dayLabel,
    store: store, copyText: copyText, tipShow: tipShow, tipHide: tipHide
  };
})();
