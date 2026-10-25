/*
 * yskar.app -- Mining-Rechner. Schaetzung in YSR, ohne Geldwerte.
 *
 * Annahmen (stehen auch unter dem Rechner):
 *   - Netz-Hashrate = Arbeit der letzten 100 Bloecke geteilt durch ihre Zeit
 *     (aus der Kette, nicht aus Meldungen). Deine Hashrate kommt dazu.
 *   - Pool-Anteil = Anteil des Pools an den letzten 100 Bloecken. Die Hashrate,
 *     die ein Pool selbst meldet, wird nicht verwendet.
 *   - Im Mittel 144 Bloecke am Tag (Ziel 600 s).
 *   - Belohnung der aktuellen Aera, ohne Gebuehren.
 *   - Pool: Anteil nach geleisteter Arbeit, abzueglich der Pool-Gebuehr.
 */
(function () {
  'use strict';
  var API = 'https://yskar.vercel.app/api/v2';
  var EPOCHE = 12000, PRO_TAG = 86400 / 600;
  var EINHEIT = { 'H/s': 1, 'kH/s': 1e3, 'MH/s': 1e6, 'GH/s': 1e9, 'TH/s': 1e12 };
  var netz = null, hoehe = null, pools = null, funde = {}, anzahl = 0;

  function tt(k) {
    var l = (document.documentElement.lang || 'en').slice(0, 2), b = window.YSKAR_TEXTE || {};
    return (b[l] && b[l][k]) || (b.en && b.en[k]) || k;
  }
  function loc() { return document.documentElement.lang || 'en'; }
  function zahl(x, max) { return x.toLocaleString(loc(), { maximumFractionDigits: max == null ? 2 : max }); }
  function ysr(x) {
    var max = x >= 100 ? 0 : x >= 1 ? 2 : x >= 0.01 ? 4 : 8;
    return zahl(x, max) + ' YSR';
  }
  function rate(h) {
    var st = [[1e12, 'TH/s'], [1e9, 'GH/s'], [1e6, 'MH/s'], [1e3, 'kH/s']];
    for (var i = 0; i < st.length; i++) if (h >= st[i][0]) return zahl(h / st[i][0]) + ' ' + st[i][1];
    return zahl(h, 0) + ' H/s';
  }
  function dauer(tage) {
    if (!isFinite(tage)) return '—';
    var s = tage * 86400;
    if (s < 3600) return tt('rech.min').replace('{n}', zahl(Math.max(1, s / 60), 0));
    if (s < 172800) return tt('rech.std').replace('{n}', zahl(s / 3600, 1));
    if (tage < 730) return tt('rech.tage').replace('{n}', zahl(tage, tage < 10 ? 1 : 0));
    return tt('rech.jahre').replace('{n}', zahl(tage / 365, 1));
  }
  function $(id) { return document.getElementById(id); }
  function setze(id, text) { var e = $(id); if (e) e.textContent = text; }

  function rechnen() {
    var form = $('rechner'); if (!form) return;
    var roh = String($('r-wert').value || '').replace(/\s/g, '').replace(',', '.');
    var eigen = parseFloat(roh) * (EINHEIT[$('r-einheit').value] || 1);
    var modus = form.querySelector('input[name="r-modus"]:checked').value;
    $('r-pool-wahl').hidden = modus !== 'pool';
    $('r-solo').hidden = modus !== 'solo';
    $('r-pool').hidden = modus !== 'pool';
    if (!(netz > 0) || hoehe == null) { setze('r-tag', '—'); setze('r-hinweis', tt('rech.laedt')); return; }
    setze('r-netz', rate(netz));
    if (!(eigen > 0)) { setze('r-tag', '—'); setze('r-hinweis', tt('rech.eingabe')); return; }
    setze('r-hinweis', '');

    var aera = Math.floor(hoehe / EPOCHE);
    var R = aera < 37 ? 875 / Math.pow(2, aera) : 0;
    var gesamt = netz + eigen, anteil = eigen / gesamt;
    var gebuehr = 0, pool = null;
    if (modus === 'pool' && pools) {
      pool = pools.filter(function (p) { return p.host === $('r-pool-liste').value; })[0] || null;
      if (pool) gebuehr = pool.feeBps / 10000;
    }
    var proTag = anteil * PRO_TAG * R * (1 - gebuehr);
    setze('r-tag', '≈ ' + ysr(proTag));
    setze('r-woche', ysr(proTag * 7));
    setze('r-monat', ysr(proTag * 30));
    setze('r-anteil', zahl(anteil * 100, anteil < 0.001 ? 4 : 2) + ' %');

    if (modus === 'solo') {
      setze('r-alle', dauer(1 / (anteil * PRO_TAG)));
      setze('r-chance', zahl((1 - Math.exp(-anteil * PRO_TAG)) * 100, 1) + ' %');
      setze('r-block', ysr(R));
    } else if (pool) {
      var poolAnteil = anzahl ? (funde[pool.kette || pool.name] || 0) / anzahl : 0;
      var poolMit = poolAnteil * netz + eigen;
      setze('r-pool-funde', zahl(poolAnteil * 100, 1) + ' %');
      setze('r-pool-alle', dauer(1 / (poolMit / gesamt * PRO_TAG)));
      setze('r-pool-teil', ysr(eigen / poolMit * R * (1 - gebuehr)));
      setze('r-pool-geb', zahl(pool.feeBps / 100) + ' %');
    }
    var bis = (aera + 1) * EPOCHE - hoehe;
    var tageBis = bis * 600 / 86400;
    setze('r-halbierung', tt('rech.halbierung')
      .replace('{r}', ysr(R)).replace('{b}', ((aera + 1) * EPOCHE).toLocaleString(loc()))
      .replace('{t}', zahl(tageBis, 0)));
    $('r-warn-monat').hidden = !(tageBis < 30);
  }

  function poolsSetzen(j) {
    pools = j.pools.slice().sort(function (a, b) { return (funde[b.kette || b.name] || 0) - (funde[a.kette || a.name] || 0); });
    var sel = $('r-pool-liste'); if (!sel) return;
    var alt = sel.value; sel.textContent = '';
    pools.forEach(function (p) {
      var o = document.createElement('option'); o.value = p.host;
      o.textContent = p.name + ' · ' + zahl(p.feeBps / 100) + ' %';
      sel.appendChild(o);
    });
    if (alt && pools.some(function (p) { return p.host === alt; })) sel.value = alt;
    rechnen();
  }
  function holen() {
    // Die Schnittstelle liefert hoechstens 50 Bloecke je Abfrage: zwei Seiten.
    function seite(vor) {
      return fetch(API + '/blocks?limit=50' + (vor != null ? '&before=' + vor : ''), { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (d) { return d.blocks || []; });
    }
    seite(null)
      .then(function (a) { return a.length ? seite(a[a.length - 1].height).then(function (z) { return a.concat(z); }) : a; })
      .then(function (b) {
        b = b.slice(0, 100);
        if (b.length < 3) throw new Error('zu wenige Bloecke');
        // Arbeit der Bloecke nach dem aeltesten, geteilt durch die Zeit dazwischen.
        var arbeit = 0;
        for (var i = 0; i < b.length - 1; i++) arbeit += Number(b[i].difficultyWert || b[i].difficulty);
        var spanne = Number(b[0].timestamp) - Number(b[b.length - 1].timestamp);
        if (!(spanne > 0)) throw new Error('keine Zeitspanne');
        netz = arbeit * 65536 / spanne;
        hoehe = Number(b[0].height);
        funde = {}; anzahl = b.length;
        b.forEach(function (x) { var f = x.finder || ''; funde[f] = (funde[f] || 0) + 1; });
        setze('r-basis-n', tt('rech.basis').replace('{n}', anzahl.toLocaleString(loc())));
        if (pools) poolsSetzen({ pools: pools }); else rechnen();
      })
      .catch(function () { setze('r-hinweis', tt('rech.fehler')); });
  }

  document.addEventListener('yskar:pools', function (e) { if (e.detail) poolsSetzen(e.detail); });
  document.addEventListener('yskar:sprache', rechnen);
  document.addEventListener('DOMContentLoaded', function () {
    var form = $('rechner'); if (!form) return;
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    form.addEventListener('input', rechnen);
    form.addEventListener('change', rechnen);
    if (window.YSKAR_POOLS && window.YSKAR_POOLS()) poolsSetzen(window.YSKAR_POOLS());
    holen(); setInterval(holen, 60000);
    rechnen();
  });
})();
