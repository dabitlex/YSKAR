/*
 * yskar.app -- aktive Pools, live aus dem Pool-Verzeichnis (/api/v2/pools).
 * Die Werte meldet jeder Pool selbst; die Seite zeigt sie nur an.
 */
(function () {
  'use strict';
  var API = 'https://yskar.vercel.app/api/v2';
  var daten = null;

  function tt(k) {
    var l = (document.documentElement.lang || 'en').slice(0, 2), b = window.YSKAR_TEXTE || {};
    return (b[l] && b[l][k]) || (b.en && b.en[k]) || k;
  }
  function loc() { return document.documentElement.lang || 'en'; }
  function rate(h) {
    if (!(h > 0)) return '—';
    var st = [[1e15, 'PH/s'], [1e12, 'TH/s'], [1e9, 'GH/s'], [1e6, 'MH/s'], [1e3, 'kH/s']];
    for (var i = 0; i < st.length; i++) if (h >= st[i][0]) return (h / st[i][0]).toLocaleString(loc(), { maximumFractionDigits: 2 }) + ' ' + st[i][1];
    return Math.round(h) + ' H/s';
  }
  function td(text, cls) { var e = document.createElement('td'); if (cls) e.className = cls; e.textContent = text; return e; }

  function zeichnen() {
    var body = document.getElementById('pools-body');
    if (!body || !daten) return;
    body.textContent = '';
    var pools = daten.pools.slice().sort(function (a, b) { return (b.hashrate || 0) - (a.hashrate || 0); });
    pools.forEach(function (p) {
      var tr = document.createElement('tr');
      var n = document.createElement('td');
      var b = document.createElement('b'); b.textContent = p.name; n.appendChild(b);
      var s = document.createElement('small'); s.textContent = p.host; n.appendChild(s);
      tr.appendChild(n);
      tr.appendChild(td(rate(p.hashrate), 'mono'));
      tr.appendChild(td(Number(p.belegt).toLocaleString(loc()) + ' / ' + Number(p.plaetze).toLocaleString(loc()), 'mono'));
      tr.appendChild(td(Number(p.bloecke).toLocaleString(loc()), 'mono'));
      tr.appendChild(td((p.feeBps / 100).toLocaleString(loc(), { maximumFractionDigits: 2 }) + ' %', 'mono'));
      var st = document.createElement('td');
      var pill = document.createElement('span');
      var offen = p.status === 'offen' && p.frei > 0;
      pill.className = 'pool-status ' + (offen ? 'offen' : 'voll');
      pill.textContent = offen ? tt('pools.offen') : tt('pools.voll');
      st.appendChild(pill); tr.appendChild(st);
      body.appendChild(tr);
    });
    var stand = document.getElementById('pools-stand');
    if (stand) stand.textContent = tt('pools.stand').replace('{n}', pools.length.toLocaleString(loc()));
  }
  function holen() {
    fetch(API + '/pools', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { if (j && j.pools) { daten = j; zeichnen(); document.dispatchEvent(new CustomEvent('yskar:pools', { detail: j })); } })
      .catch(function () { var s = document.getElementById('pools-stand'); if (s && !daten) s.textContent = tt('pools.fehler'); });
  }
  window.YSKAR_POOLS = function () { return daten; };
  document.addEventListener('yskar:sprache', zeichnen);
  document.addEventListener('DOMContentLoaded', function () {
    if (!document.getElementById('pools-body')) return;
    holen(); setInterval(holen, 60000);
  });
})();
