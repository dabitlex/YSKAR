/*
 * yskar.app -- "YSR nutzen": zwei Live-Werte aus der Kette.
 *
 *   - Gebuehr einer normalen Ueberweisung: /fees minFee (Einheiten, 1 YSR = 10^8)
 *   - mittlere Zeit zwischen den letzten 50 Bloecken: /blocks, Zeitstempel
 *
 * Ohne Netz bleibt "—" stehen.
 */
(function () {
  'use strict';

  var API = 'https://yskar.vercel.app/api/v2';
  var werte = { gebuehr: null, minuten: null };

  function tt(k) {
    var l = document.documentElement.lang || 'en';
    var T = window.YSKAR_TEXTE || {};
    return (T[l] && T[l][k]) || (T.en && T.en[k]) || '';
  }
  function zahl(n, d) {
    try { return n.toLocaleString(document.documentElement.lang || 'en', { minimumFractionDigits: d, maximumFractionDigits: d }); }
    catch (e) { return n.toFixed(d); }
  }

  function zeigen() {
    var g = document.getElementById('nz-gebuehr');
    var b = document.getElementById('nz-blockzeit');
    if (g && werte.gebuehr !== null) g.textContent = zahl(werte.gebuehr / 1e8, 7) + ' YSR';
    if (b && werte.minuten !== null) b.textContent = tt('nz.min').replace('{n}', zahl(werte.minuten, 1));
  }

  function laden() {
    fetch(API + '/fees', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) { var f = Number(d.minFee); if (isFinite(f) && f > 0) { werte.gebuehr = f; zeigen(); } })
      .catch(function () {});
    fetch(API + '/blocks?limit=50', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var bl = (d && d.blocks) || [];
        if (bl.length < 2) return;
        var neu = Number(bl[0].timestamp), alt = Number(bl[bl.length - 1].timestamp);
        var abst = Math.abs(bl[0].height - bl[bl.length - 1].height);
        if (!(abst > 0) || !isFinite(neu - alt)) return;
        werte.minuten = Math.abs(neu - alt) / abst / 60;
        zeigen();
      })
      .catch(function () {});
  }

  document.addEventListener('yskar:sprache', zeigen);
  document.addEventListener('DOMContentLoaded', function () {
    if (!document.getElementById('nz-gebuehr')) return;
    laden();
    setInterval(laden, 120000);
  });
})();
