/* Mining-Seite: die Pools des öffentlichen Verzeichnisses als Zeilen, mit ihrem Anteil an den letzten Blöcken der Kette. */
var Pools = (function () {
  'use strict';
  function paint() {
    var box = document.getElementById('pools-live'); if (!box) return;
    var b = Live.S.blocks.slice(0, 50), n = b.length, finds = {};
    b.forEach(function (x) { var f = x.finder || ''; finds[f] = (finds[f] || 0) + 1; });
    var pools = (Live.S.pools.pools || []).slice().sort(function (a, c) { return (finds[c.kette || c.name] || 0) - (finds[a.kette || a.name] || 0); });
    box.textContent = '';
    pools.forEach(function (p) {
      var found = finds[p.kette || p.name] || 0, full = p.status !== 'offen';
      box.appendChild(U.el('div', { class: 'pool' }, [
        U.el('div', { class: 'pool__top' }, [U.el('span', { class: 'pool__name', text: p.name }), U.el('span', { class: 'pool__host', text: p.host })]),
        U.el('div', { class: 'pool__bar' }, [U.el('i', { style: 'width:' + (n ? found / n * 100 : 0).toFixed(1) + '%' })]),
        U.el('p', { class: 'pool__meta' }, [
          U.el('span', {}, [U.el('b', { text: U.num(found) + ' / ' + U.num(n) }), ' ' + t('poolsx.last')]),
          U.el('span', {}, [U.el('b', { text: U.num(p.feeBps / 100, 2) + ' %' }), ' ' + t('poolsx.fee')]),
          U.el('span', {}, [U.el('b', { text: U.num(p.belegt) + ' / ' + U.num(p.plaetze) }), ' ' + t('poolsx.seats') + (full ? ' (' + t('pools.full') + ')' : '')]),
          U.el('span', {}, [U.el('b', { text: p.hashrate > 0 ? U.hashrate(p.hashrate) : '–' }), ' ' + t('poolsx.rate')])
        ])
      ]));
    });
    var cap = document.getElementById('pools-live-cap'); if (cap) cap.textContent = t('pools.cap', { n: U.num(n) });
  }
  function init() { if (!document.getElementById('pools-live')) return; paint(); U.on('data', paint); U.on('lang', paint); }
  return { init: init };
})();
