/* YSR-Seite: Menge als Lichtband und die Epochen als Balken. Alle Werte aus der Kette bzw. aus den Konsensregeln. */
var Supply = (function () {
  'use strict';
  function paint() {
    var S = Live.S, max = Number(S.summary.maxSupply), minted = Number(S.summary.totalSupply), burned = parseFloat(S.supply.unspendable) * U.UNIT;
    var m = document.getElementById('supply-mined'); if (!m) return;
    m.style.width = (minted / max * 100).toFixed(2) + '%';
    document.getElementById('supply-burned').style.width = (burned / max * 100).toFixed(2) + '%';
    document.getElementById('supply-open').textContent = U.num((max - minted) / U.UNIT, 0) + ' YSR';
    var box = document.getElementById('eras'), h = S.summary.height, era = Math.floor(h / U.EPOCH), first = 10500000, i, rest = 21000000;
    box.textContent = '';
    for (i = 0; i < 8; i++) {
      var amount = first / Math.pow(2, i); rest -= amount;
      box.appendChild(U.el('div', { class: 'eras__row' + (i === era ? ' is-now' : '') }, [
        U.el('span', { text: t('coin.eras.era', { n: i + 1 }) + (i === era ? ' · ' + t('coin.eras.now') : '') }),
        U.el('i', { style: 'width:' + (amount / first * 100).toFixed(2) + '%' }),
        U.el('b', { text: U.num(amount, 0) })
      ]));
    }
    box.appendChild(U.el('div', { class: 'eras__row' }, [U.el('span', { text: '9+' }), U.el('i', { style: 'width:' + (rest / first * 100).toFixed(2) + '%' }), U.el('b', { text: U.num(rest, 0) })]));
    box.appendChild(U.el('p', { class: 'micro faint', text: t('coin.eras.rest') }));
  }
  function init() { if (!document.getElementById('supply')) return; paint(); U.on('data', paint); U.on('lang', paint); }
  return { init: init };
})();
