/*
 * yskar.app -- "Prüf es selbst": Block 0 oder den neuesten Block im Browser nachrechnen.
 *
 * Block 0 wird aus seinen Feldern (docs/PROTOCOL.md, Genesis block) zusammengesetzt.
 * Der neueste Block kommt mit seinem Kopf als Hex aus /api/v2/blocks. In beiden
 * Faellen rechnet der Browser selbst: doppeltes SHA-256 ueber die 136 Byte, dann
 * Vergleich mit dem Blockhash und mit dem Ziel floor(2^240 / difficulty).
 */
(function () {
  'use strict';
  var API = 'https://yskar.vercel.app/api/v2';

  function tt(k) {
    var l = (document.documentElement.lang || 'en').slice(0, 2), b = window.YSKAR_TEXTE || {};
    return (b[l] && b[l][k]) || (b.en && b.en[k]) || k;
  }
  function loc() { var l = (document.documentElement.lang || 'en'); return l === 'zh-CN' ? 'zh-CN' : l; }
  function hex(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16); return s; }
  function vonHex(h) { var a = new Uint8Array(h.length / 2); for (var i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; }

  // Kopf von Block 0, Feld fuer Feld (little-endian).
  function genesisKopf() {
    var b = new Uint8Array(136), v = new DataView(b.buffer);
    v.setUint32(0, 1, true);                       // version
    v.setUint32(4, 0, true);                       // height
    /* prevHash: 32 Null-Bytes */
    b.set(vonHex('1007612ea5c27b0b7c6ae79c745da364cfd64224eb6f5519bf559dc3b09fe840'), 40); // merkleRoot
    b.set(vonHex('e2860175f61cefa97ff34e88d35402a7ee373a8764adbdda0b97ef200bbeca57'), 72); // stateRoot
    v.setBigUint64(104, 1788912000n, true);        // timestamp 2026-09-09 00:00:00 UTC
    v.setUint32(112, 4096, true);                  // difficulty
    v.setUint32(116, 1, true);                     // txCount
    v.setBigUint64(120, 0n, true);                 // extranonce
    v.setBigUint64(128, 50773796n, true);          // nonce
    return { kopf: b, hash: '000000090a14a03f1562d11113d539c1208b8078c6391da6c48f6bcf72c33c66', diff: 4096n, hoehe: 0 };
  }

  // Difficulty-Feld: bis 2^31-1 direkt, darueber Gleitkomma (Konsensfassung 4).
  function diffAusFeld(f) {
    if ((f & 0x80000000) === 0) return BigInt(f);
    var e = (f >>> 23) & 0xff, m = f & 0x7fffff;
    return (BigInt(0x800000 + m)) << BigInt(e);
  }

  function zeile(ok, titel, wert) {
    var li = document.createElement('li');
    li.className = ok === true ? 'gut' : ok === false ? 'schlecht' : '';
    var b = document.createElement('b'); b.textContent = titel; li.appendChild(b);
    if (wert) { var c = document.createElement('code'); c.textContent = wert; li.appendChild(c); }
    return li;
  }

  async function pruefe(quelle) {
    var aus = document.getElementById('pruef-aus');
    var liste = document.getElementById('pruef-liste');
    aus.hidden = false; liste.textContent = '';
    var titel = document.getElementById('pruef-titel');
    if (!(window.crypto && crypto.subtle)) { liste.appendChild(zeile(false, tt('chk.keinSubtle'))); return; }
    var d;
    try {
      if (quelle === 'genesis') d = genesisKopf();
      else {
        titel.textContent = tt('chk.laedt');
        var r = await fetch(API + '/blocks?limit=1', { cache: 'no-store' });
        var j = await r.json(), blk = j.blocks[0];
        var kopf = vonHex(blk.header);
        d = { kopf: kopf, hash: blk.hash, diff: diffAusFeld(new DataView(kopf.buffer).getUint32(112, true)), hoehe: blk.height };
      }
    } catch (e) { titel.textContent = ''; liste.appendChild(zeile(false, tt('chk.fehler'))); return; }

    titel.textContent = tt('chk.titel').replace('{h}', '#' + d.hoehe.toLocaleString(loc()));
    liste.appendChild(zeile(null, tt('chk.s1'), hex(d.kopf)));
    var h1 = new Uint8Array(await crypto.subtle.digest('SHA-256', d.kopf));
    liste.appendChild(zeile(null, tt('chk.s2'), hex(h1)));
    var h2 = new Uint8Array(await crypto.subtle.digest('SHA-256', h1));
    var ergebnis = hex(h2);
    liste.appendChild(zeile(null, tt('chk.s3'), ergebnis));
    liste.appendChild(zeile(ergebnis === d.hash, ergebnis === d.hash ? tt('chk.gleich') : tt('chk.ungleich'), d.hash));
    var ziel = (1n << 240n) / d.diff;
    var unter = BigInt('0x' + ergebnis) <= ziel;
    var zielHex = ziel.toString(16).padStart(64, '0');
    liste.appendChild(zeile(unter, (unter ? tt('chk.unter') : tt('chk.ueber')).replace('{d}', d.diff.toLocaleString(loc())), zielHex));
    var link = document.getElementById('pruef-link');
    link.href = '/explorer#block-' + d.hoehe; link.hidden = false;
  }

  document.addEventListener('DOMContentLoaded', function () {
    var a = document.getElementById('pruef-0'), b = document.getElementById('pruef-neu');
    if (a) a.addEventListener('click', function () { pruefe('genesis'); });
    if (b) b.addEventListener('click', function () { pruefe('neu'); });
  });
})();
