/* Start. Jede Baugruppe startet für sich; fällt eine aus, laufen die anderen weiter. */
(function () {
  'use strict';
  function run(name, fn) {
    try { fn(); } catch (e) { if (window.console) console.error('[YSKAR] ' + name, e); }
  }
  function boot() {
    run('Bilder', function () { Img.init(); });
    run('Seiten', function () { Router.init(); });
    run('Bedienung', function () { UI.init(); });
    run('Verlauf', function () { Chain.init(); });
    run('Kettendaten', function () { Live.start(); });
    ['Proof', 'Sky', 'Walk', 'Prover', 'TryMine', 'Supply', 'Field', 'Phone', 'Pay', 'Pools', 'Shore', 'Log', 'Road', 'Coin', 'Doc', 'Miles', 'Forge', 'Term', 'Tech', 'Miner', 'Ysr', 'Mining', 'Net', 'Explorer', 'Dev', 'Charts', 'Early', 'Scenes'].forEach(function (n) {
      if (typeof window[n] !== 'undefined' && window[n] && window[n].init) run(n, function () { window[n].init(); });
    });
    window.__booted = true;
    document.documentElement.classList.add('ready');
  }
  /* Erst die Texte der gewählten Sprache (sie stehen sofort auf der Seite), dann der Stand der Kette, dann das Programm. */
  function begin() { I18n.ready(function () { run('Sprache', function () { I18n.init(); }); Live.prime(boot); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', begin); else begin();
})();
