/*
 * Explorer: Blöcke, Transaktionen und Adressen nachschlagen.
 * Er liest die öffentliche API (nur GET). Der Proof of Work jedes angezeigten Blocks wird im Browser nachgerechnet,
 * die Prüfsumme jeder eingegebenen Adresse ebenfalls.
 *
 * Adressen im Explorer, wie Wallet, App und Miner sie seit jeher verlinken:
 *   /explorer#block-<Höhe>    /explorer#tx-<64 Hexzeichen>    /explorer#adr-<ysr1…>
 *
 * Antwortet die API einmal nicht, zeigt er, was die Seite schon geladen hat (die neuesten Blöcke samt Kopf),
 * sagt es dazu und versucht es mit dem nächsten Stand der Kette von selbst noch einmal.
 */
var Explorer = (function () {
  'use strict';
  var ZERO = 'ysr1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqregwfw';
  var CHARS = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  var view, top, input, msgEl, token = 0, searchToken = 0, proof = null;
  var known = {}, lowest = Infinity, listMode = null, lastTop = -1, busyOlder = false, seenTop = -1, seenLive = false;
  var cache = { block: {}, tx: {}, acc: {} }, cur = { kind: 'home' }, shown = null;
  var more = {}, busyMore = false, viewTip = -1;      // nachgeladene ältere Bewegungen je Adresse: { list, next, top }

  /* ---------- kleine Bausteine ---------- */
  function live() { return Live.S.mode === 'live'; }
  function node(tag, cls, text) {
    var a = {}; if (cls) a['class'] = cls; if (text !== undefined && text !== null) a.text = text;
    return U.el(tag, a);
  }
  /** Link innerhalb der Website; `ref` in der Schreibweise der Quellen ("#explorer-block-12", "#chain-accounts"). */
  function link(ref, text, cls) { var a = { href: Router.href(ref), text: text }; if (cls) a['class'] = cls; return U.el('a', a); }
  function ext(href, text) { return U.el('a', { href: href, text: text, 'class': 'ext', target: '_blank', rel: 'noopener' }); }
  function addr(a) {
    var e = U.el('a', { href: Router.href('#explorer-adr-' + a), 'class': 'mono addr', title: a });
    e.appendChild(node('span', 'a-full', a)); e.appendChild(node('span', 'a-short', U.shortHash(a, 9, 5)));
    return e;
  }
  function when(ts) { return node('span', null, U.date(Number(ts), true)); }
  function memoText(hex) {
    if (!hex) return null;
    try {
      var s = new TextDecoder('utf-8', { fatal: true }).decode(U.hexToBytes(hex));
      return /^[^\u0000-\u001f\u007f-\u009f]+$/.test(s) ? s : null;
    } catch (e) { return null; }
  }
  function api(path) {
    return fetch(Live.API + path, { cache: 'no-store' }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; }, function () { return { ok: false, status: r.status, j: null }; });
    });
  }
  function setMsg(text, bad) { msgEl.textContent = text || ''; msgEl.classList.toggle('err', !!bad && !!text); }
  function go(rest) { Router.go(rest ? '#explorer-' + rest : '#explorer'); }

  /* ---------- Adressprüfung (bech32m, Vorsilbe ysr) ---------- */
  function polymod(v) {
    var G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3], chk = 1, i, k, b;
    for (i = 0; i < v.length; i++) {
      b = chk >>> 25; chk = ((chk & 0x1ffffff) << 5) ^ v[i];
      for (k = 0; k < 5; k++) if ((b >>> k) & 1) chk ^= G[k];
    }
    return chk >>> 0;
  }
  /** 'ok' | 'shape' (keine YSKAR-Adresse) | 'sum' (Tippfehler: Prüfsumme stimmt nicht) */
  function checkAddress(a) {
    if (a.slice(0, 4) !== 'ysr1' || (a.length !== 42 && a.length !== 63)) return 'shape';
    var v = [3, 3, 3, 0, 25, 19, 18], i, c;                       // Vorsilbe "ysr", aufgespreizt
    for (i = 4; i < a.length; i++) { c = CHARS.indexOf(a.charAt(i)); if (c < 0) return 'sum'; v.push(c); }
    return polymod(v) === 0x2bc830a3 ? 'ok' : 'sum';
  }

  /* ---------- Was die Seite schon geladen hat ---------- */
  function headerOf(h) {
    var b = Live.S.blocks, k;
    if (known[h] && known[h].header) return known[h];
    for (k = 0; k < b.length; k++) if (b[k].height === h && b[k].header) return b[k];
    return null;
  }
  function heightOfHash(x) {
    var b = Live.S.blocks, k;
    for (k = 0; k < b.length; k++) if (b[k].hash === x) return b[k].height;
    for (k in known) if (known[k].hash === x) return known[k].height;
    for (k in cache.block) if (cache.block[k].hash === x) return cache.block[k].height;
    return null;
  }

  /* ---------- Blockliste ---------- */
  function sync() {
    var b = Live.S.blocks, hi = b[0].height, lo = b[b.length - 1].height;
    if (listMode !== Live.S.mode || lo > lastTop + 1) { known = {}; lowest = Infinity; listMode = Live.S.mode; }
    b.forEach(function (x) { known[x.height] = x; });
    if (lo < lowest) lowest = lo;
    lastTop = hi;
  }
  function table(cols, rows, cls) {
    var tr = U.el('tr');
    cols.forEach(function (c) { var th = node('th', c.cls || null, c.h); th.setAttribute('scope', 'col'); tr.appendChild(th); });
    var body = U.el('tbody');
    rows.forEach(function (r) {
      var row = U.el('tr');
      r.forEach(function (cell, i) {
        var td = node('td', cols[i].cls || null); td.setAttribute('data-label', cols[i].h);
        if (cell === null || cell === undefined) { td.textContent = '–'; td.classList.add('empty'); }
        else if (typeof cell === 'string') td.textContent = cell; else td.appendChild(cell);
        row.appendChild(td);
      });
      body.appendChild(row);
    });
    var tb = U.el('table', { 'class': 'tbl ex-tbl' + (cls ? ' ' + cls : '') }, [U.el('thead', {}, [tr]), body]);
    return U.el('div', { 'class': 'tbl-scroll' }, [tb]);
  }

  /* ---------- Ansicht: neueste Blöcke ---------- */
  /** Blockhash gekürzt; die führenden Nullen (die geleistete Arbeit) sind eigens ausgezeichnet. */
  function hashNode(hash) {
    var sh = U.shortHash(hash, 12, 8), z = /^0*/.exec(sh)[0], e = node('span', 'xb__hash mono');
    if (z) e.appendChild(node('span', 'z', z));
    e.appendChild(document.createTextNode(sh.slice(z.length)));
    return e;
  }
  function drawHome() {
    sync();
    var tip = Live.S.blocks[0].height, rows = [], h, now = Live.now();
    for (h = tip; h >= lowest && h >= 0; h--) if (known[h]) rows.push(known[h]);
    var list = U.el('ol', { 'class': 'xbl' });
    rows.forEach(function (b) {
      var n = Math.max(0, (b.txCount || 1) - 1), age = node('span', 'xb__age', Live.ago(Number(b.timestamp), now));
      age.title = U.date(Number(b.timestamp), true);
      var fresh = seenLive && live() && seenTop >= 0 && b.height > seenTop && tip - seenTop < 4;
      list.appendChild(U.el('li', fresh ? { 'class': 'is-new' } : {}, [U.el('a', { 'class': 'xb', href: Router.href('#explorer-block-' + b.height) }, [
        node('span', 'xb__h mono', U.num(b.height)), age,
        node('span', 'xb__by', b.finder || t('ex.solo')),
        node('span', 'xb__tx' + (n ? '' : ' quiet'), n === 0 ? t('ex.row.tx0') : n === 1 ? t('ex.row.tx1') : t('ex.row.tx', { n: U.num(n) })),
        node('span', 'xb__size', t('ex.bytes', { n: U.num(b.sizeBytes || 0) })),
        hashNode(b.hash)])]));
    });
    seenTop = tip; seenLive = live();
    var heads = U.el('div', { 'class': 'xbl__head', 'aria-hidden': 'true' }, [
      node('span', null, t('ex.c.height')), node('span', null, t('ex.c.found')), node('span', null, t('ex.c.by')),
      node('span', null, t('ex.c.transfers')), node('span', 'xb__size', t('ex.c.size')), node('span', 'xb__hash', t('ex.c.hash'))]);
    var foot = U.el('div', { 'class': 'ex-foot' }, [
      node('p', 'fig-cap', live() ? t('ex.latest.live') : t('ex.latest.snap', { n: U.num(rows.length) }))]);
    if (live() && lowest > 0) {
      var more = U.el('button', { type: 'button', 'class': 'btn small ghost', text: busyOlder ? t('ex.older.busy') : t('ex.older') });
      if (busyOlder) more.disabled = true;
      more.addEventListener('click', older);
      foot.appendChild(more);
    }
    var box = U.el('div', { 'class': 'display' }, [
      U.el('div', { 'class': 'display-head' }, [node('h2', 'display-title', t('ex.latest.h')), node('span', 'state', Live.values().modeShort)]),
      U.el('div', {}, [heads, list]), foot]);
    paint([Pulse.set({ mode: 'tip' }), box], false);
    document.title = t('title.explorer') + ' – YSKAR';
  }
  function older() {
    if (busyOlder || !live()) return;
    busyOlder = true; if (cur.kind === 'home') drawHome();
    api('/blocks?limit=25&before=' + lowest).then(function (r) {
      busyOlder = false;
      if (r.ok && r.j && r.j.blocks) r.j.blocks.forEach(function (b) { known[b.height] = b; if (b.height < lowest) lowest = b.height; });
      if (cur.kind === 'home') drawHome();
    }, function () { busyOlder = false; if (cur.kind === 'home') drawHome(); });
  }

  /* ---------- gemeinsame Teile der Einzelansichten ---------- */
  function paint(kids, compact) {
    if (proof) { Proof.unmount(proof); proof = null; }
    top.classList.toggle('compact', !!compact);
    view.textContent = '';
    view.appendChild(U.el('section', { 'class': 'sec tight ex-sec' }, [U.el('div', { 'class': 'wrap stack ex-stack' }, kids)]));
  }
  function crumbs(parts) {
    var n = U.el('nav', { 'class': 'crumbs small', 'aria-label': t('ex.crumb') }), i;
    n.appendChild(link('#explorer', t('ex.crumb')));
    for (i = 0; i < parts.length; i++) {
      n.appendChild(node('span', 'sep', '/'));
      n.appendChild(parts[i].href ? link(parts[i].href, parts[i].text) : node('span', 'here', parts[i].text));
    }
    return n;
  }
  function fact(label, value, sub) {
    var dd = U.el('dd');
    if (typeof value === 'string') dd.appendChild(node('span', 'mono wrapany', value)); else dd.appendChild(value);
    if (sub) dd.appendChild(node('span', 'sub', sub));
    return U.el('div', {}, [node('dt', null, label), dd]);
  }
  function wait() { paint([node('p', 'ex-wait', t('ex.loading'))], cur.kind !== 'home'); }
  function none(text) {
    paint([crumbs([]), node('p', 'ex-none', text), U.el('p', {}, [link('#explorer', t('ex.back'))])], true);
  }
  /** Die API antwortet gerade nicht: sagen, was los ist, und einen neuen Versuch anbieten. */
  function unreachable() {
    var again = U.el('button', { type: 'button', 'class': 'btn small ghost', text: t('ex.missing.link') });
    again.addEventListener('click', function () { Live.refresh(); render(false); });
    var box = U.el('div', { 'class': 'limit' }, [U.el('div', { 'class': 'stack', style: '--gap:8px' }, [
      node('strong', null, t('ex.missing.h')), node('p', null, t('ex.missing.p')), U.el('p', {}, [again])])]);
    paint([crumbs([]), box, U.el('p', {}, [link('#explorer', t('ex.back'))])], true);
  }
  /**
   * Lädt einen Datensatz: aus dem Zwischenspeicher, sonst von der API.
   *   o.open(j)   true, wenn sich der Datensatz noch ändern kann (wartende Zahlung): nicht merken, mit jedem neuen Stand neu lesen
   *   o.spare()   was sich zeigen lässt, wenn die API nicht antwortet
   * `quiet`: Der Datensatz steht schon auf dem Bildschirm und wird nur aufgefrischt; bis die Antwort da ist, bleibt er stehen.
   */
  function resolve(o, quiet) {
    var my = ++token, hit = cache[o.store][o.key];
    if (hit) { cur.pending = false; cur.open = false; cur.source = 'live'; return void o.draw(hit, false); }
    if (!quiet) { cur.pending = false; cur.open = false; cur.source = null; wait(); }
    function down() {
      cur.pending = true;                                  // mit dem nächsten Stand der Kette noch einmal versuchen
      if (quiet) return;
      var s = o.spare ? o.spare() : null;
      if (s) { cur.source = 'snapshot'; o.draw(s, true); } else { cur.source = 'snapshot'; unreachable(); }
    }
    api(o.path).then(function (r) {
      if (my !== token) return;
      if (r.ok && r.j && o.valid(r.j)) {
        cur.pending = false; cur.source = 'live';
        cur.open = !!(o.open && o.open(r.j));
        if (!cur.open) cache[o.store][o.key] = r.j;
        o.draw(r.j, false);
      } else if (r.status === 404 || r.status === 400) {
        cur.pending = false; cur.source = 'live'; cur.open = !!o.again;
        if (!quiet) none(o.noneText());
      } else down();
    }, function () { if (my === token) down(); });
  }

  /* ---------- Ansicht: Block ---------- */
  function recipientsTable(rec, total) {
    var sum = Number(total) || rec.reduce(function (a, r) { return a + Number(r.amount); }, 0) || 1;
    return table([{ h: t('ex.tx.c.addr') }, { h: t('ex.tx.c.amount'), cls: 'n' }, { h: t('ex.tx.c.share'), cls: 'n' }],
      rec.slice().sort(function (a, b) { return Number(b.amount) - Number(a.amount); }).map(function (r) {
        var p = Number(r.amount) / sum * 100;
        return [addr(r.address), U.ysr(r.amount, { bare: true }), p > 0 && p < 0.005 ? '< ' + U.num(0.01, 2, 2) + ' %' : U.num(p, 2, 2) + ' %'];
      }));
  }
  function rewardLine(x, height) {
    var created = U.rewardAt(height), fees = Number(x.amount) - created;
    return fees > 0 ? t('ex.tx.newFees', { a: U.ysr(created), f: U.ysr(fees) }) : t('ex.tx.new', { a: U.ysr(x.amount) });
  }
  function typeLabel(x) {
    return x.type === 'coinbase' ? t('ex.tx.coinbase') : x.type === 'transfer' ? t('ex.tx.transfer') : x.type === 'batch' ? t('ex.tx.batch')
      : x.type === 'script_spend' ? t('ex.tx.script') : t('ex.tx.other', { type: String(x.type) });
  }
  function toNode(a) {
    var s = U.el('span', { 'class': 'ex-party' }, [addr(a)]);
    if (a === ZERO) s.appendChild(node('span', 'tag', t('ex.unspendable')));
    return s;
  }
  function txEntry(x, height) {
    var kv = U.el('dl', { 'class': 'kv ex-kv' }), m = memoText(x.memo), art;
    function row(k, v) { kv.appendChild(U.el('div', {}, [node('dt', null, k), typeof v === 'string' ? node('dd', 'mono', v) : U.el('dd', {}, [v])])); }
    if (x.from) row(t('ex.tx.from'), toNode(x.from));
    if (x.to) row(t('ex.tx.to'), toNode(x.to));
    if (x.type !== 'coinbase' && x.fee !== undefined && x.fee !== null) row(t('ex.tx.fee'), U.ysr(x.fee));
    if (m) row(t('ex.tx.memo'), m); else if (x.memo) row(t('ex.tx.memoHex'), x.memo);
    row(t('ex.tx.id'), link('#explorer-tx-' + x.txid, U.shortHash(x.txid, 12, 10), 'mono'));
    art = U.el('article', { 'class': 'ex-tx' }, [
      U.el('header', {}, [node('h3', null, typeLabel(x)), node('span', 'amt mono', U.ysr(x.amount))])]);
    if (x.type === 'coinbase') art.appendChild(node('p', 'sub', rewardLine(x, height)));
    art.appendChild(kv);
    if (x.recipients && x.recipients.length) {
      art.appendChild(node('p', 'sub', t('ex.tx.paid', { n: U.num(x.recipients.length) })));
      art.appendChild(recipientsTable(x.recipients, x.amount));
    }
    return art;
  }
  function drawBlock(b, partial) {
    var h = b.height, tip = Math.max(Live.S.summary.height, h), ts = Number(b.timestamp), txs = b.txs || null, cb = txs && txs[0];
    var isPool = cb ? !!(cb.recipients && cb.recipients.length > 1) : (b.recipients || 1) > 1;
    var who = cb ? memoText(cb.memo) : b.finder, d = U.date(ts, true), ago = Live.ago(ts, Live.now());
    var sum = h === 0 ? t('ex.block.sumGenesis', { date: U.date(ts) })
      : isPool && who ? t('ex.block.sumPool', { date: d, ago: ago, who: who })
        : isPool ? t('ex.block.sumPoolNoName', { date: d, ago: ago }) : t('ex.block.sumSolo', { date: d, ago: ago });
    var navs = U.el('div', { 'class': 'row ex-nav' });
    if (h > 0) navs.appendChild(link('#explorer-block-' + (h - 1), t('ex.prev'), 'btn small ghost'));
    if (h < tip) navs.appendChild(link('#explorer-block-' + (h + 1), t('ex.next'), 'btn small ghost'));
    var head = U.el('div', { 'class': 'ex-head' }, [
      U.el('div', {}, [node('h1', 'ex-title', t('ex.block.h', { h: U.num(h) })), node('p', 'lead ex-sum', sum)]), navs]);
    var kids = [crumbs([{ text: t('ex.block.h', { h: U.num(h) }) }]), head];
    if (partial) kids.push(U.el('div', { 'class': 'limit' }, [node('p', null, t('ex.block.partial'))]));

    if (Pulse.has(h)) kids.push(Pulse.set({ mode: 'around', h: h }));
    var pr = U.el('div', { 'class': 'display wide', 'data-proof': 'fixed', 'data-hex': b.header, 'data-trace': 'short', 'data-legend': 'chips', 'data-plain': '' });
    kids.push(U.el('div', { 'class': 'ex-proof' }, [
      U.el('div', { 'class': 'split-head' }, [node('h2', null, t('ex.proof.h')), node('p', 'muted', t('ex.proof.p'))]), pr]));

    var hd = U.parseHeader(b.header), diff = Number(hd.difficulty);
    var prev = h > 0 ? link('#explorer-block-' + (h - 1), b.prevHash || hd.prev, 'mono wrapany') : node('span', null, t('ex.f.prev.none'));
    var n = b.txCount || (txs ? txs.length : 1);
    var facts = U.el('dl', { 'class': 'facts ex-facts' }, [
      fact(t('ex.f.hash'), b.hash),
      fact(t('ex.f.prev'), prev),
      fact(t('ex.f.merkle'), b.merkleRoot || hd.merkle, t('ex.f.merkle.s')),
      fact(t('ex.f.state'), b.stateRoot || hd.state, t('ex.f.state.s')),
      fact(t('ex.f.diff'), U.num(diff), t('ex.f.diff.s', { n: U.compact(diff * 65536, 0) })),
      fact(t('ex.f.nonce'), hd.nonce.toLocaleString(U.loc()) + ' / ' + hd.extra.toLocaleString(U.loc()), t('ex.f.nonce.s')),
      fact(t('ex.f.size'), n === 1 ? t('ex.f.size.v1', { n: U.num(b.sizeBytes || 0) }) : t('ex.f.size.v', { n: U.num(b.sizeBytes || 0), tx: U.num(n) }))]);
    kids.push(U.el('div', { 'class': 'split ex-split' }, [
      U.el('div', { 'class': 'split-head' }, [node('h2', null, t('ex.block.values')), node('p', 'muted', t('ex.block.values.p'))]), facts]));

    if (txs && txs.length) {
      var list = U.el('div', { 'class': 'display ex-txs' });
      txs.forEach(function (x) { list.appendChild(txEntry(x, h)); });
      kids.push(U.el('div', { 'class': 'split ex-split' }, [
        U.el('div', { 'class': 'split-head' }, [node('h2', null, t('ex.txs.h')), node('p', 'muted', t('ex.txs.p'))]), list]));
    }
    paint(kids, true);
    proof = Proof.mount(pr, false);
    document.title = t('ex.block.h', { h: U.num(h) }) + ' – ' + t('title.explorer') + ' – YSKAR';
  }
  function showBlock(h, quiet) {
    resolve({
      store: 'block', key: h, path: '/blocks/' + h,
      valid: function (j) { return !!j.hash && !!j.header; },
      noneText: function () { return t('ex.none.block', { h: U.num(h), tip: U.num(Live.S.summary.height) }); },
      spare: function () { return headerOf(h); },           // den Kopf der neuesten Blöcke hat die Seite schon
      draw: drawBlock
    }, quiet);
  }

  /* ---------- Ansicht: Transaktion ---------- */
  function copyBtn(text, label) {
    var b = U.el('button', { type: 'button', 'class': 'btn small ghost', text: label });
    b.addEventListener('click', function () { U.copyText(text, b, t('ui.copied')); });
    return b;
  }
  function drawTx(x) {
    var waiting = x.status === 'pending', h = waiting ? null : Number(x.height), m = memoText(x.memo), rows = [], w = x.warteplatz;
    rows.push(fact(t('ex.tx.id'), x.txid));
    if (waiting) {
      var sure = w && w.hoehe !== null && w.hoehe !== undefined && isFinite(Number(w.hoehe));
      rows.push(fact(t('ex.txv.status'), node('span', null, t('ex.txv.waiting')),
        sure ? t('ex.txv.expected', { h: U.num(Number(w.hoehe)), min: U.num(Math.max(1, Number(w.minuten) || 0)) }) : t('ex.txv.unknownWhen')));
    } else rows.push(fact(t('ex.txv.block'), link('#explorer-block-' + h, U.num(h), 'mono')));
    if (x.from) rows.push(fact(t('ex.tx.from'), toNode(x.from)));
    if (x.to) rows.push(fact(t('ex.tx.to'), toNode(x.to)));
    rows.push(fact(t('ex.tx.amount'), U.ysr(x.amount), x.type === 'coinbase' && !waiting ? rewardLine(x, h) : null));
    if (x.type !== 'coinbase') {
      rows.push(fact(t('ex.tx.fee'), U.ysr(x.fee || 0)));
      if (x.nonce !== null && x.nonce !== undefined) rows.push(fact(t('ex.tx.nonce'), U.num(Number(x.nonce)), t('ex.tx.nonce.s')));
      if (x.validUntil !== undefined) rows.push(fact(t('ex.txv.until'), node('span', null, Number(x.validUntil) > 0 ? t('ex.txv.until.h', { h: U.num(Number(x.validUntil)) }) : t('ex.txv.until.none'))));
    }
    if (m) rows.push(fact(t('ex.tx.memo'), node('span', null, m))); else if (x.memo) rows.push(fact(t('ex.tx.memoHex'), x.memo));
    if (x.raw) rows.push(fact(t('ex.txv.size'), t('ex.bytes', { n: U.num(x.raw.length / 2) })));
    var kids = [
      crumbs(waiting ? [{ text: typeLabel(x) }] : [{ href: '#explorer-block-' + h, text: t('ex.block.h', { h: U.num(h) }) }, { text: typeLabel(x) }]),
      U.el('div', { 'class': 'ex-head' }, [U.el('div', {}, [
        node('h1', 'ex-title', typeLabel(x)),
        node('p', 'lead ex-sum', waiting ? t('ex.txv.sumPending') : t('ex.txv.sum', { h: U.num(h), date: U.date(Number(x.timestamp), true) }))]),
        U.el('div', { 'class': 'row ex-nav' }, [copyBtn(x.txid, t('ex.copy.id'))])]),
      U.el('dl', { 'class': 'facts ex-facts' }, rows)];
    if (x.recipients && x.recipients.length) {
      kids.push(U.el('div', { 'class': 'display' }, [node('p', 'sub', t('ex.tx.paid', { n: U.num(x.recipients.length) })), recipientsTable(x.recipients, x.amount)]));
    }
    if (x.raw) {
      var code = node('pre', 'code wrapcode', x.raw);
      kids.push(U.el('div', { 'class': 'split ex-split' }, [
        U.el('div', { 'class': 'split-head' }, [node('h2', null, t('ex.txv.raw')), node('p', 'muted', t('ex.txv.raw.p')),
          link('#chain-accounts', t('ex.txv.how'))]),
        U.el('div', { 'class': 'code-wrap' }, [code, U.el('button', { type: 'button', 'class': 'copy', 'data-copy': '', text: t('ui.copy') })])]));
    }
    paint(kids, true);
    document.title = typeLabel(x) + ' ' + U.shortHash(x.txid, 8, 6) + ' – ' + t('title.explorer') + ' – YSKAR';
  }
  function showTx(id, quiet) {
    resolve({
      store: 'tx', key: id, path: '/tx/' + id,
      valid: function (j) { return !!j.txid; },
      open: function (j) { return j.status === 'pending'; },      // noch in keinem Block: mit jedem neuen Stand nachsehen
      again: true,                                                 // eben erst gesendet und noch nirgends bekannt: weiter nachsehen
      noneText: function () { return t('ex.none.tx'); },
      draw: drawTx
    }, quiet);
  }

  /* ---------- Ansicht: Adresse ---------- */
  var KIND = { 'in': 'ex.k.in', out: 'ex.k.out', reward: 'ex.k.reward', pool: 'ex.k.pool' };
  function drawAccount(acc) {
    var a = acc.address, first = acc.history || [], bal = acc.balance === null || acc.balance === undefined ? 0 : acc.balance;
    var waitingList = Array.isArray(acc.pending) ? acc.pending : [], top = first.length ? first[0].txid : '';
    // Schon nachgeladene ältere Bewegungen bleiben, solange sich vorn nichts getan hat
    if (!more[a] || more[a].top !== top) more[a] = { list: [], next: acc.historyWeiter || null, top: top };
    var hist = first.concat(more[a].list);
    function blockOrDash(h) { return h === null || h === undefined ? node('span', null, '–') : link('#explorer-block-' + h, t('ex.addr.blockN', { h: U.num(h) })); }
    function readout(k, v) {
      var val = node('span', 'v'); if (typeof v === 'string') val.textContent = v; else val.appendChild(v);
      return U.el('div', { 'class': 'readout' }, [node('span', 'k', k), val]);
    }
    var kids = [
      crumbs([{ text: t('ex.addr.h') }]),
      U.el('div', { 'class': 'ex-head' }, [U.el('div', {}, [
        node('p', 'ex-kicker muted', t('ex.addr.h')), node('h1', 'ex-title mono wrapany addr-title', a)]),
        U.el('div', { 'class': 'row ex-nav' }, [copyBtn(a, t('ex.copy.addr'))])])];
    if (a === ZERO) kids.push(U.el('div', { 'class': 'limit' }, [node('p', null, t('ex.addr.zero'))]));
    var empty = !hist.length && !waitingList.length && !Number(bal);
    var box = U.el('div', { 'class': 'display' }, [
      U.el('div', { 'class': 'readouts three' }, [
        U.el('div', { 'class': 'readout wide' }, [node('span', 'k', t('ex.addr.balance')), node('span', 'v', U.ysr(bal))]),
        readout(t('ex.addr.sent'), U.num(Number(acc.nonce) || 0)),
        readout(t('ex.addr.first'), blockOrDash(acc.firstHeight)),
        readout(t('ex.addr.last'), blockOrDash(acc.lastHeight)),
        readout(t('ex.addr.solo'), U.num(Number(acc.blocksFound) || 0)),
        readout(t('ex.addr.pool'), U.num(Number(acc.poolRewards) || 0))])]);
    kids.push(box);
    if (empty) kids.push(node('p', 'muted ex-none', t('ex.addr.none')));
    else if (hist.length || waitingList.length) {
      var rows = waitingList.map(function (e) {
        var out = e.kind === 'out', other = out ? e.to : e.from;
        return [node('span', 'muted', t('ex.addr.waiting')), null, link('#explorer-tx-' + e.txid, t(out ? 'ex.k.out' : 'ex.k.in')), other ? addr(other) : null,
          node('span', out ? 'neg' : 'pos', (out ? '−' : '+') + U.ysr(e.amount)), out ? U.ysr(e.fee || 0) : null];
      }).concat(hist.map(function (e) {
        var out = e.kind === 'out', label = KIND[e.kind] ? t(KIND[e.kind]) : String(e.kind);
        var amt = node('span', out ? 'neg' : 'pos', (out ? '−' : '+') + U.ysr(e.amount));
        return [link('#explorer-block-' + e.height, U.num(e.height), 'mono'), e.timestamp ? U.date(Number(e.timestamp), true) : null,
          link('#explorer-tx-' + e.txid, label), e.counterparty ? addr(e.counterparty) : null, amt,
          out ? U.ysr(e.fee || 0) : null];
      }));
      var histBox = U.el('div', { 'class': 'display' }, [
        U.el('div', { 'class': 'display-head' }, [node('h2', 'display-title', t('ex.addr.hist')), node('span', 'state', Live.values().modeShort)]),
        table([{ h: t('ex.h.block') }, { h: t('ex.h.when') }, { h: t('ex.h.what') }, { h: t('ex.h.with'), cls: 'short-addr' },
          { h: t('ex.h.amount'), cls: 'n' }, { h: t('ex.h.fee'), cls: 'n hide-m' }], rows, 'stack-s hist')]);
      if (more[a].next) {
        var btn = U.el('button', { type: 'button', 'class': 'btn small ghost', text: busyMore ? t('ex.older.busy') : t('ex.addr.older') });
        if (busyMore) btn.disabled = true;
        btn.addEventListener('click', function () { olderActivity(acc); });
        histBox.appendChild(U.el('div', { 'class': 'ex-foot' }, [node('p', 'fig-cap', t('ex.addr.more', { n: U.num(hist.length) })), btn]));
      }
      kids.push(histBox);
    }
    paint(kids, true);
    document.title = t('ex.addr.h') + ' ' + U.shortHash(a, 10, 6) + ' – ' + t('title.explorer') + ' – YSKAR';
  }
  /** Ältere Bewegungen einer Adresse nachladen (die API blättert mit einem Zeiger). */
  function olderActivity(acc) {
    var a = acc.address, m = more[a];
    if (busyMore || !m || !m.next) return;
    busyMore = true; if (cur.kind === 'address' && cur.a === a) drawAccount(acc);
    function done() { busyMore = false; if (cur.kind === 'address' && cur.a === a) drawAccount(acc); }
    api('/account/' + a + '/verlauf?limit=40&vor=' + encodeURIComponent(m.next)).then(function (r) {
      if (r.ok && r.j && Array.isArray(r.j.eintraege) && more[a] === m) { m.list = m.list.concat(r.j.eintraege); m.next = r.j.weiter || null; }
      done();
    }, done);
  }
  function showAddress(a, quiet) {
    resolve({
      store: 'acc', key: a, path: '/account/' + a,
      valid: function (j) { return !!j.address; },
      open: function (j) { return Array.isArray(j.pending) && j.pending.length > 0; },
      noneText: function () { return t('ex.msg.badAddr'); },
      draw: drawAccount
    }, quiet);
  }

  /* ---------- Suche ---------- */
  function search(q) {
    q = String(q || '').trim().replace(/^#/, '');
    if (!q) return void setMsg(t('ex.msg.empty'), true);
    var digits = q.replace(/[\s.,_']/g, ''), lower = q.toLowerCase().replace(/\s+/g, ''), c, h, tip = Live.S.summary.height;
    if (/^\d{1,9}$/.test(digits)) {
      h = +digits;
      if (h > tip) return void setMsg(t('ex.msg.tooHigh', { h: U.num(h), tip: U.num(tip) }), true);
      setMsg(''); return void go('block-' + h);
    }
    if (lower.slice(0, 3) === 'ysr') {
      c = checkAddress(lower);
      if (c !== 'ok') return void setMsg(t(c === 'sum' ? 'ex.msg.badAddr' : 'ex.msg.addrShape'), true);
      setMsg(''); return void go('adr-' + lower);
    }
    if (/^[0-9a-f]{64}$/.test(lower)) {
      h = heightOfHash(lower);
      if (h !== null) { setMsg(''); return void go('block-' + h); }
      if (cache.tx[lower]) { setMsg(''); return void go('tx-' + lower); }
      if (!live()) return void setMsg(t('ex.msg.offlineHash'), true);
      var my = ++searchToken; setMsg(t('ex.msg.searching'));
      return void api('/search?q=' + lower).then(function (r) {
        if (my !== searchToken) return;
        var j = r.j || {};
        if (j.kind === 'block') { setMsg(''); go('block-' + j.height); }
        else if (j.kind === 'tx') { setMsg(''); go('tx-' + j.txid); }
        else setMsg(t('ex.msg.notFound'), true);
      }, function () { if (my === searchToken) setMsg(t('ex.msg.offlineHash'), true); });
    }
    setMsg(t('ex.msg.empty'), true);
  }

  /* ---------- Wegweiser ---------- */
  function parse(rest) {
    var m;
    if (!rest) return { kind: 'home' };
    if ((m = /^block-(\d{1,9})$/.exec(rest))) return { kind: 'block', h: +m[1] };
    if ((m = /^(?:adr|address)-(ysr1[a-z0-9]{20,80})$/.exec(rest))) return { kind: 'address', a: m[1] };
    if ((m = /^tx-([0-9a-f]{64})$/.exec(rest))) return { kind: 'tx', id: m[1] };
    if (rest === 'neu') return { kind: 'home' };          // früher: der Block, der gerade entsteht
    return { kind: 'home', unknown: true };
  }
  function render(quiet) {
    if (cur.kind === 'block') showBlock(cur.h, quiet);
    else if (cur.kind === 'tx') showTx(cur.id, quiet);
    else if (cur.kind === 'address') {
      if (checkAddress(cur.a) !== 'ok') { cur.source = 'live'; none(t(checkAddress(cur.a) === 'sum' ? 'ex.msg.badAddr' : 'ex.msg.addrShape')); }
      else showAddress(cur.a, quiet);
    } else { token++; drawHome(); }
  }
  function onRoute(r) {
    if (r.page !== 'explorer') return;
    var key = r.rest || '', moved = shown !== null && key !== shown;
    cur = parse(key);
    setMsg(cur.unknown ? t('ex.msg.badLink') : '', !!cur.unknown);
    if (input && document.activeElement !== input && key !== shown) input.value = '';
    render();
    if (moved) window.scrollTo(0, 0);
    shown = key;
  }
  function init() {
    view = document.getElementById('ex-view'); if (!view) return;
    top = U.$('.ex-top'); input = document.getElementById('ex-q'); msgEl = document.getElementById('ex-msg');
    document.getElementById('ex-form').addEventListener('submit', function (e) { e.preventDefault(); search(input.value); });
    U.on('route', onRoute);
    U.on('lang', function () { render(false); });
    U.on('data', function () {
      var tip = Live.S.blocks[0].height, grown = tip !== viewTip;
      viewTip = tip;
      if (cur.kind === 'home') return void drawHome();
      // neu lesen, was sich noch ändern kann: wartende Zahlungen, ein Konto nach jedem neuen Block, alles nach einem Ausfall
      if (cur.kind === 'address' && grown && live()) delete cache.acc[cur.a];
      if (cur.pending || cur.open || (cur.source === 'snapshot' && live()) || (cur.kind === 'address' && grown && live())) render(cur.source !== 'snapshot' || !live());
    });
    viewTip = Live.S.blocks[0].height;
    onRoute(Router.parse());
  }
  return { init: init, checkAddress: checkAddress };
})();
