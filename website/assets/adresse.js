/*
 * yskar.app -- eine Adresse nachschlagen: Guthaben und letzte Zahlungen aus
 * /api/v2/account/<adresse>, Link in den Explorer.
 */
(function () {
  'use strict';
  var API = 'https://yskar.vercel.app/api/v2';
  var FORM = /^ysr1[02-9ac-hj-np-z]{38}$/;
  var letzte = null;

  function tt(k) {
    var l = (document.documentElement.lang || 'en').slice(0, 2), b = window.YSKAR_TEXTE || {};
    return (b[l] && b[l][k]) || (b.en && b.en[k]) || k;
  }
  function loc() { return document.documentElement.lang || 'en'; }
  function betrag(einheiten) {
    var e = BigInt(String(einheiten)), ganz = e / 100000000n, rest = Number(e % 100000000n) / 1e8;
    return (Number(ganz) + rest).toLocaleString(loc(), { minimumFractionDigits: 2, maximumFractionDigits: 8 }) + ' YSR';
  }
  function kurz(a) { return a ? a.slice(0, 8) + '…' + a.slice(-4) : ''; }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function zeigen(k) {
    var aus = document.getElementById('adr-aus'); aus.textContent = ''; aus.hidden = false;
    var kopf = el('div', 'adr-stand');
    kopf.appendChild(el('span', 'kennung', tt('adr.guthaben')));
    kopf.appendChild(el('b', null, betrag(k.balance)));
    aus.appendChild(kopf);
    var dl = el('dl', 'adr-daten');
    function zeile(t, w) { var d = el('div'); d.appendChild(el('dt', null, t)); d.appendChild(el('dd', null, w)); dl.appendChild(d); }
    zeile(tt('adr.gesendet'), Number(k.nonce).toLocaleString(loc()));
    if (k.blocksFound) zeile(tt('adr.bloecke'), Number(k.blocksFound).toLocaleString(loc()));
    if (k.poolRewards) zeile(tt('adr.poolAnz'), Number(k.poolRewards).toLocaleString(loc()));
    if (k.firstHeight != null) zeile(tt('adr.aktiv'), '#' + Number(k.firstHeight).toLocaleString(loc()) + ' – #' + Number(k.lastHeight).toLocaleString(loc()));
    aus.appendChild(dl);
    var hist = (k.history || []).slice(0, 3);
    if (hist.length) {
      aus.appendChild(el('span', 'kennung', tt('adr.letzte')));
      var ul = el('ul', 'adr-hist');
      hist.forEach(function (h) {
        var li = el('li');
        var art = h.kind === 'in' ? tt('adr.von').replace('{a}', kurz(h.counterparty))
          : h.kind === 'out' ? tt('adr.an').replace('{a}', kurz(h.counterparty))
          : h.kind === 'pool' ? tt('adr.pool') : tt('adr.block');
        var links = el('span'); links.appendChild(el('b', null, art)); links.appendChild(el('small', null, '#' + Number(h.height).toLocaleString(loc())));
        li.appendChild(links);
        li.appendChild(el('span', h.kind === 'out' ? 'minus' : 'plus', (h.kind === 'out' ? '−' : '+') + betrag(h.amount)));
        ul.appendChild(li);
      });
      aus.appendChild(ul);
    } else aus.appendChild(el('p', 'leise', tt('adr.leer')));
    var a = el('a', 'weiter'); a.href = '/explorer#adr-' + k.address; a.textContent = tt('adr.explorer') + ' →';
    aus.appendChild(a);
  }
  function fehler(text) { var aus = document.getElementById('adr-aus'); aus.hidden = false; aus.textContent = ''; aus.appendChild(el('p', 'adr-fehler', text)); }

  function suchen(e) {
    if (e) e.preventDefault();
    var adr = String(document.getElementById('adr-feld').value || '').trim().toLowerCase();
    if (!FORM.test(adr)) { letzte = null; fehler(tt('adr.ungueltig')); return; }
    fehler(tt('adr.laedt'));
    fetch(API + '/account/' + adr, { cache: 'no-store' })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok || x.j.error) { letzte = null; fehler(x.j && x.j.error === 'bad_address' ? tt('adr.ungueltig') : tt('adr.fehler')); return; }
        letzte = x.j; zeigen(x.j);
      })
      .catch(function () { letzte = null; fehler(tt('adr.fehler')); });
  }
  document.addEventListener('yskar:sprache', function () { if (letzte) zeigen(letzte); });
  document.addEventListener('DOMContentLoaded', function () {
    var f = document.getElementById('adr-form');
    if (f) f.addEventListener('submit', suchen);
  });
})();
