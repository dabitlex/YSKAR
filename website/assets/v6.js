/*
 * yskar.app -- Countdown bis V6 (Block 10.000).
 *
 * Holt /blocks?limit=50: Hoehe des neuesten Blocks und mittlere Blockzeit
 * der letzten 50 Bloecke. Die Tage sind eine Schaetzung und so beschriftet.
 */
(function () {
  'use strict';

  var API = 'https://yskar.vercel.app/api/v2';
  var V6 = 10000;
  var stand = null; // { hoehe, sekJeBlock }

  function sprache() { return document.documentElement.lang || 'en'; }
  function tt(k) {
    var T = window.YSKAR_TEXTE || {}, l = sprache();
    return (T[l] && T[l][k]) || (T.en && T.en[k]) || '';
  }

  function zeigen() {
    var box = document.getElementById('v6-countdown');
    if (!box || !stand) return;
    var zahl = document.getElementById('cd-bloecke'), etwa = document.getElementById('cd-etwa');
    var rest = V6 - stand.hoehe;
    if (rest <= 0) {
      box.classList.add('aktiv');
      zahl.textContent = tt('v6.cd.aktiv');
      etwa.textContent = '';
      return;
    }
    zahl.textContent = tt('v6.cd.bloecke').replace('{n}', rest.toLocaleString(sprache()));
    var sek = rest * stand.sekJeBlock;
    var tage = Math.max(1, Math.round(sek / 86400));
    var datum = '';
    try { datum = new Date(Date.now() + sek * 1000).toLocaleDateString(sprache(), { day: 'numeric', month: 'long' }); } catch (e) { datum = ''; }
    etwa.textContent = datum ? tt('v6.cd.etwa').replace('{d}', tage.toLocaleString(sprache())).replace('{datum}', datum) : '';
  }

  function laden() {
    fetch(API + '/blocks?limit=50', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var bl = (d && d.blocks) || [];
        if (!bl.length) return;
        var h = Number(bl[0].height);
        var sekJeBlock = 600;
        if (bl.length > 1) {
          var dt = Number(bl[0].timestamp) - Number(bl[bl.length - 1].timestamp);
          var dh = h - Number(bl[bl.length - 1].height);
          if (dh > 0 && dt > 0) sekJeBlock = dt / dh;
        }
        if (!isFinite(h)) return;
        stand = { hoehe: h, sekJeBlock: sekJeBlock };
        zeigen();
      })
      .catch(function () {});
  }

  document.addEventListener('yskar:sprache', zeigen);
  document.addEventListener('DOMContentLoaded', function () {
    if (!document.getElementById('v6-countdown')) return;
    laden();
    setInterval(laden, 60000);
  });
})();
