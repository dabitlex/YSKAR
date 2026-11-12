/*
 * Explorer: Blöcke, Transaktionen und Adressen nachschlagen.
 * Er liest die öffentliche API (nur GET). Jeder angezeigte Block wird im Browser nachgerechnet: Kopf aus den Einzelfeldern
 * neu zusammengesetzt, Hash, Proof of Work, Verkettung mit dem Vorgänger. Die Prüfsumme jeder eingegebenen Adresse ebenfalls.
 *
 * Adressen im Explorer, wie Wallet, App und Miner sie seit jeher verlinken:
 *   /explorer#block-<Höhe>    /explorer#tx-<64 Hexzeichen>    /explorer#adr-<ysr1…>    /explorer#neu (der Block im Bau)
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
  var checks = {}, side = {}, sideBusy = {}, mirrorSince = null;   // Prüfergebnisse je Höhe; Vorgänger, die nicht in der Liste stehen
  var atTip = null;                                                // der Verweis "nächster Block" des Blocks an der Spitze
  var MAX_TX = 2000, MAX_TX_V6 = 5000, DIFF_V4 = 6000;            // wie src/lib/core/params.ts

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

  /* ---------- Prüfen im Browser ---------- */
  /** Plätze für Transaktionen in Block h (ab Konsensfassung 6 mehr). */
  function slotsAt(h) {
    var v6 = Number(Live.S.fees && Live.S.fees.aktivierung) || U.V6;
    return v6 > 0 && h >= v6 ? MAX_TX_V6 : MAX_TX;
  }
  function percent(p) { return U.num(p, p > 0 && p < 10 ? 2 : 0); }
  function span(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m ? U.num(m) + ' min ' : '') + s + ' s';
  }
  /** Setzt die 136 Byte des Kopfes aus den einzeln gemeldeten Feldern neu zusammen (wie src/lib/core/block.ts). */
  function serialize(b) {
    var out = new Uint8Array(136), dv = new DataView(out.buffer), one = BigInt(1), e, m, field;
    var v = BigInt(b.difficultyWert !== undefined && b.difficultyWert !== null ? b.difficultyWert : b.difficulty);
    if (b.height < DIFF_V4 || v < (one << BigInt(31))) field = Number(v);       // ab Fassung 4 über 2^31 als Gleitkomma
    else { e = BigInt(v.toString(2).length) - BigInt(24); m = v >> e; field = Number((one << BigInt(31)) | (e << BigInt(23)) | (m - (one << BigInt(23)))); }
    dv.setUint32(0, b.version === undefined || b.version === null ? 1 : b.version, true);
    dv.setUint32(4, b.height, true);
    out.set(U.hexToBytes(b.prevHash), 8); out.set(U.hexToBytes(b.merkleRoot), 40); out.set(U.hexToBytes(b.stateRoot), 72);
    dv.setBigUint64(104, BigInt(b.timestamp), true);
    dv.setUint32(112, field, true);
    dv.setUint32(116, b.txCount, true);
    dv.setBigUint64(120, BigInt(b.extranonce), true);
    dv.setBigUint64(128, BigInt(b.nonce), true);
    return out;
  }
  /**
   * Vier getrennte Aussagen zu einem Block, jede 'ok' | 'bad' | 'open':
   *   ser   aus den Einzelfeldern ergibt sich genau der gespeicherte Kopf
   *   hash  der hier errechnete Hash ist der gemeldete
   *   pow   der Hash liegt unter dem Ziel der eingetragenen Difficulty
   *   link  das Feld "Vorgänger" ist der hier errechnete Hash des Blocks eine Höhe darunter
   */
  function check(b) {
    var c = checks[b.height], bytes, mine, target, prev, hv;
    if (!c || c.of !== b.hash) {
      c = { of: b.hash, ser: 'open', hash: 'open', pow: 'open', link: 'open', mine: null, achieved: null };
      try {
        bytes = U.hexToBytes(b.header);
        mine = U.bytesToHex(Sha.digest(Sha.digest(bytes)));
        target = U.targetHex(U.parseHeader(b.header).difficulty);
        c.mine = mine;
        c.hash = mine === b.hash ? 'ok' : 'bad';
        c.pow = mine <= target ? 'ok' : 'bad';
        hv = BigInt('0x' + mine);
        c.achieved = hv === BigInt(0) ? null : (BigInt(1) << BigInt(240)) / hv;
        if (b.prevHash && b.merkleRoot && b.stateRoot && b.nonce !== undefined) c.ser = U.bytesToHex(serialize(b)) === b.header ? 'ok' : 'bad';
      } catch (e) { c.hash = c.pow = 'bad'; }
      checks[b.height] = c;
    }
    if (c.link === 'open' && b.height > 0 && c.mine) {
      prev = headerOf(b.height - 1) || side[b.height - 1] || cache.block[b.height - 1];
      if (prev && prev.header) {
        try { c.link = U.parseHeader(b.header).prev === U.bytesToHex(Sha.digest(Sha.digest(U.hexToBytes(prev.header)))) ? 'ok' : 'bad'; }
        catch (e2) { c.link = 'bad'; }
      }
    }
    return c;
  }
  /** 'ok' = hier nachgerechnet, 'bad' = eine Prüfung schlug fehl, 'open' = noch nicht geprüft. */
  function verdictOf(c) {
    if (!c) return 'open';
    if (c.ser === 'bad' || c.hash === 'bad' || c.pow === 'bad' || c.link === 'bad') return 'bad';
    return c.hash === 'ok' && c.pow === 'ok' ? 'ok' : 'open';
  }
  function dot(state, title) {
    var d = node('i', 'dot ' + state);
    if (title) { d.title = title; d.setAttribute('role', 'img'); d.setAttribute('aria-label', title); } else d.setAttribute('aria-hidden', 'true');
    return d;
  }
  /** Holt den Block eine Höhe unter h, wenn die Seite ihn noch nicht hat; erst mit ihm lässt sich die Verkettung prüfen. */
  function needPrev(h, done) {
    if (h <= 0 || headerOf(h - 1) || side[h - 1] || cache.block[h - 1] || sideBusy[h] || !live()) return;
    sideBusy[h] = true;
    api('/blocks?limit=1&before=' + h).then(function (r) {
      delete sideBusy[h];
      var b = r.ok && r.j && r.j.blocks && r.j.blocks[0];
      if (b && b.height === h - 1 && b.header) { side[h - 1] = b; done(); }
    }, function () { delete sideBusy[h]; });
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
  function txCountText(n) { return n === 0 ? t('ex.row.tx0') : tn('ex.row.tx', n, { n: U.num(n) }); }
  /**
   * Spiegel und Full Node vergleichen: Die Blockliste kommt aus dem Spiegel (Datenbank), /summary vom Full Node.
   * Zeigt der Spiegel auf derselben Höhe einen anderen Block oder liegt er zurück, steht ein Hinweis da, sobald das
   * länger als eine Minute so bleibt. Ein Block Rückstand für ein paar Sekunden ist normal.
   */
  function mirrorNote() {
    var s = Live.S.summary, head = Live.S.blocks[0], text = '', behind;
    if (live() && s && head && s.height === Number(s.height)) {
      if (s.height === head.height && typeof s.tipHash === 'string' && s.tipHash.toLowerCase() !== String(head.hash).toLowerCase()) text = t('ex.mirror.fork', { h: U.num(head.height) });
      else if (s.height > head.height) { behind = s.height - head.height; text = tn('ex.mirror.behind', behind, { n: U.num(behind) }); }
    }
    if (!text) { mirrorSince = null; return null; }
    if (mirrorSince === null) mirrorSince = Date.now();
    return Date.now() - mirrorSince < 60000 ? null : text;
  }
  function drawHome() {
    sync();
    var tip = Live.S.blocks[0].height, rows = [], h, now = Live.now(), good = 0, bad = 0;
    for (h = tip; h >= lowest && h >= 0; h--) if (known[h]) rows.push(known[h]);
    var list = U.el('ol', { 'class': 'xbl' });
    if (live()) {                                           // der Block, an dem gerade gesucht wird
      var waiting = Number(Live.S.summary.mempool) || 0;
      list.appendChild(U.el('li', { 'class': 'is-next' }, [U.el('a', { 'class': 'xb', href: Router.href('#explorer-neu') }, [
        U.el('span', { 'class': 'xb__h mono' }, [document.createTextNode(U.num(tip + 1)), node('i', 'ring')]),
        node('span', 'xb__age', t('ex.next.tag')),
        node('span', 'xb__by', '–'),
        node('span', 'xb__tx' + (waiting ? '' : ' quiet'), txCountText(waiting)),
        node('span', 'xb__size', ''), node('span', 'xb__hash mono', '')])]));
    }
    rows.forEach(function (b) {
      var n = Math.max(0, (b.txCount || 1) - 1), age = node('span', 'xb__age', Live.ago(Number(b.timestamp), now));
      age.title = U.date(Number(b.timestamp), true);
      var fresh = seenLive && live() && seenTop >= 0 && b.height > seenTop && tip - seenTop < 4;
      var v = b.header ? verdictOf(check(b)) : 'open', num = U.el('span', { 'class': 'xb__h mono' }, [document.createTextNode(U.num(b.height))]);
      if (v === 'ok') { good++; num.appendChild(dot('ok', t('ex.verified'))); } else if (v === 'bad') { bad++; num.appendChild(dot('bad', t('ex.check.bad'))); }
      list.appendChild(U.el('li', fresh ? { 'class': 'is-new' } : {}, [U.el('a', { 'class': 'xb', href: Router.href('#explorer-block-' + b.height) }, [
        num, age,
        node('span', 'xb__by', b.finder || t('ex.solo')),
        node('span', 'xb__tx' + (n ? '' : ' quiet'), txCountText(n)),
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
    var kids = [U.el('div', { 'class': 'display-head' }, [node('h2', 'display-title', t('ex.latest.h')), node('span', 'state', Live.values().modeShort)])];
    var note = mirrorNote();
    if (note) kids.push(U.el('div', { 'class': 'limit' }, [node('p', null, note)]));
    kids.push(U.el('div', {}, [heads, list]));
    if (good || bad) {
      var said = U.el('p', { 'class': 'ex-said ' + (bad ? 'bad' : 'ok') }, [dot(bad ? 'bad' : 'ok'),
        node('span', null, bad ? t('ex.verdict.bad') : tn('ex.verdict.ok', good, { n: U.num(good) }))]);
      kids.push(U.el('div', { 'class': 'ex-checked' }, [said, node('p', 'fig-cap', t('ex.check.p'))]));
    }
    kids.push(foot);
    paint([Pulse.set({ mode: 'tip' }), U.el('div', { 'class': 'display' }, kids)], false);
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
  /** Eine Zeile "Bezeichnung: Wert"; `sub` ist eine Unterzeile oder eine Liste davon (Text oder Knoten). */
  function fact(label, value, sub) {
    var dd = U.el('dd');
    if (typeof value === 'string') dd.appendChild(node('span', 'mono wrapany', value)); else dd.appendChild(value);
    (Array.isArray(sub) ? sub : [sub]).forEach(function (x) {
      if (x) dd.appendChild(typeof x === 'string' ? node('span', 'sub', x) : x);
    });
    return U.el('div', {}, [node('dt', null, label), dd]);
  }
  function meter(p) {
    var m = U.el('span', { 'class': 'meter', 'aria-hidden': 'true' }, [U.el('i')]);
    m.firstChild.style.width = Math.max(0, Math.min(100, p)).toFixed(2) + '%';
    return m;
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
    atTip = null;
    if (h < tip) navs.appendChild(link('#explorer-block-' + (h + 1), t('ex.next'), 'btn small ghost'));
    else if (live()) { atTip = { h: h, a: link('#explorer-neu', t('ex.next'), 'btn small ghost') }; navs.appendChild(atTip.a); }   // an der Spitze: der Block im Bau
    var head = U.el('div', { 'class': 'ex-head' }, [
      U.el('div', {}, [node('h1', 'ex-title', t('ex.block.h', { h: U.num(h) })), node('p', 'lead ex-sum', sum)]), navs]);
    var kids = [crumbs([{ text: t('ex.block.h', { h: U.num(h) }) }]), head];
    if (partial) kids.push(U.el('div', { 'class': 'limit' }, [node('p', null, t('ex.block.partial'))]));

    if (Pulse.has(h)) kids.push(Pulse.set({ mode: 'around', h: h }));
    var pr = U.el('div', { 'class': 'display wide', 'data-proof': 'fixed', 'data-hex': b.header, 'data-trace': 'short', 'data-legend': 'chips', 'data-plain': '' });
    kids.push(U.el('div', { 'class': 'ex-proof' }, [
      U.el('div', { 'class': 'split-head' }, [node('h2', null, t('ex.proof.h')), node('p', 'muted', t('ex.proof.p'))]), pr]));

    // Vier Aussagen, getrennt: eine Gesamtnote würde verstecken, was geprüft wurde
    var c = check(b), linkLi = null, timeRow, factsEl;
    function before() { return h > 0 ? (headerOf(h - 1) || side[h - 1] || cache.block[h - 1]) : null; }
    function state(label, v, toPrev) {
      var nm = U.el('span', { 'class': 'nm' }, [dot(v), node('span', null, label)]);
      if (toPrev) { nm.appendChild(node('span', 'sep', '·')); nm.appendChild(link('#explorer-block-' + (h - 1), t('ex.block.h', { h: U.num(h - 1) }))); }
      return U.el('li', { 'class': v }, [nm, node('span', 'st', t('ex.check.' + v))]);
    }
    function timeFact() {
      var p = before();
      return p && p.timestamp ? fact(t('ex.f.time'), node('span', null, span(ts - Number(p.timestamp))), t('ex.f.time.s')) : null;
    }
    var list4 = U.el('ul', { 'class': 'checks' }, [state(t('ex.check.ser'), c.ser), state(t('ex.check.hash'), c.hash), state(t('ex.check.pow'), c.pow)]);
    if (h > 0) { linkLi = state(t('ex.check.link'), c.link, true); list4.appendChild(linkLi); }
    kids.push(U.el('div', { 'class': 'split ex-split' }, [
      U.el('div', { 'class': 'split-head' }, [node('h2', null, t('ex.check.h')), node('p', 'muted', t('ex.check.note'))]), list4]));

    var hd = U.parseHeader(b.header), diff = Number(hd.difficulty);
    var prev = h > 0 ? link('#explorer-block-' + (h - 1), b.prevHash || hd.prev, 'mono wrapany') : node('span', null, t('ex.f.prev.none'));
    var n = b.txCount || (txs ? txs.length : 1), fill = Math.min(100, n / slotsAt(h) * 100);
    var rows = [fact(t('ex.f.hash'), b.hash), fact(t('ex.f.prev'), prev)];
    timeRow = timeFact();
    if (timeRow) rows.push(timeRow);
    rows.push(
      fact(t('ex.f.merkle'), b.merkleRoot || hd.merkle, t('ex.f.merkle.s')),
      fact(t('ex.f.state'), b.stateRoot || hd.state, t('ex.f.state.s')),
      fact(t('ex.f.diff'), U.num(diff), [t('ex.f.diff.s', { n: U.compact(diff * 65536, 0) }), c.achieved ? t('ex.f.achieved') + ' ' + U.num(Number(c.achieved)) : null]),
      fact(t('ex.f.nonce'), hd.nonce.toLocaleString(U.loc()) + ' / ' + hd.extra.toLocaleString(U.loc()), t('ex.f.nonce.s')),
      fact(t('ex.f.size'), tn('ex.f.size.v', n, { n: U.num(b.sizeBytes || 0), tx: U.num(n) }),
        [t('ex.fill', { p: percent(fill) }) + ' · ' + t('ex.fill.of', { n: U.num(n), max: U.num(slotsAt(h)) }), meter(fill)]));
    factsEl = U.el('dl', { 'class': 'facts ex-facts' }, rows);
    kids.push(U.el('div', { 'class': 'split ex-split' }, [
      U.el('div', { 'class': 'split-head' }, [node('h2', null, t('ex.block.values')), node('p', 'muted', t('ex.block.values.p'))]), factsEl]));
    // Der Vorgänger fehlt noch: holen, dann Verkettung und Blockzeit an Ort und Stelle nachtragen
    if (h > 0 && !before()) needPrev(h, function () {
      if (!view.contains(factsEl)) return;
      var li = state(t('ex.check.link'), check(b).link, true), row = timeFact();
      linkLi.parentNode.replaceChild(li, linkLi); linkLi = li;
      if (row && !timeRow) { factsEl.insertBefore(row, factsEl.children[2] || null); timeRow = row; }
    });

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

  /* ---------- Ansicht: der Block im Bau ---------- */
  /*
   * Der Block, an dem gerade gesucht wird. Hier steht nur, was feststeht: Vorgänger, Belohnung, wartende Zahlungen.
   * Seine Difficulty rechnet das Netz erst mit dem Block aus; sie steht deshalb nicht da.
   */
  function drawNext() {
    var s = Live.S.summary, tip = s.height, next = tip + 1, waiting = Number(s.mempool) || 0, f = Live.S.fees || {};
    var fill = Math.min(100, (waiting + 1) / slotsAt(next) * 100);
    var title = U.el('h1', { 'class': 'ex-title' }, [document.createTextNode(t('ex.block.h', { h: U.num(next) }) + ' '), node('span', 'tag', t('ex.next.tag'))]);
    var head = U.el('div', { 'class': 'ex-head' }, [
      U.el('div', {}, [title, node('p', 'lead ex-sum', (waiting ? t('ex.next.some') : t('ex.next.empty')) + ' ' + t('ex.next.who'))]),
      U.el('div', { 'class': 'row ex-nav' }, [link('#explorer-block-' + tip, t('ex.prev'), 'btn small ghost')])]);
    var facts = U.el('dl', { 'class': 'facts ex-facts' }, [
      fact(t('ex.f.prev'), link('#explorer-block-' + tip, t('ex.block.h', { h: U.num(tip) }))),
      fact(t('ex.next.reward'), node('span', null, U.ysr(s.nextReward))),
      fact(t('ex.next.pending'), node('span', null, U.num(waiting)), [t('ex.fill', { p: percent(fill) }), meter(fill)])]);
    var rows = (Array.isArray(f.bloecke) ? f.bloecke : []).slice(0, 12).filter(function (b) { return Number(b.hoehe) > 0; });
    var base = Number(f.basisBytes) || 168, pace = Number(f.blockzeit) || 600, queue;
    if (!rows.length) queue = node('p', 'ex-queue-none', t('ex.queue.none'));
    else {
      queue = U.el('ul', { 'class': 'ex-queue' }, rows.map(function (b) {
        var fee = U.ysr(Math.ceil(Number(b.minJeByte) * base)), min = Math.max(1, Math.round(Number(b.block) * pace / 60));
        return U.el('li', {}, [node('span', 'mono', t('ex.addr.blockN', { h: U.num(Number(b.hoehe)) })),
          node('span', 'q', t('ex.queue.row', { n: U.num(Number(b.anzahl) || 0), fee: fee, min: U.num(min) }))]);
      }));
    }
    var notes = [];
    if (rows.length && Number(f.bloeckeGesamt) > rows.length) notes.push(t('ex.queue.more', { n: U.num(Number(f.inVorschau) || 0), b: U.num(Number(f.bloeckeGesamt)) }));
    if (rows.length) notes.push(t('ex.queue.note'));
    var qBox = U.el('div', { 'class': 'display' }, [queue]);
    if (notes.length) qBox.appendChild(node('p', 'fig-cap', notes.join(' ')));
    paint([crumbs([{ text: t('ex.block.h', { h: U.num(next) }) }]), head, Pulse.set({ mode: 'tip' }),
      U.el('div', { 'class': 'split ex-split' }, [U.el('div', { 'class': 'split-head' }, [node('h2', null, t('ex.next.h'))]), facts]),
      U.el('div', { 'class': 'split ex-split' }, [U.el('div', { 'class': 'split-head' }, [node('h2', null, t('ex.queue.h'))]), qBox])], true);
    document.title = t('ex.block.h', { h: U.num(next) }) + ' · ' + t('ex.next.tag') + ' – ' + t('title.explorer') + ' – YSKAR';
  }
  function showNext() {
    token++;
    cur.source = live() ? 'live' : 'snapshot';
    cur.pending = !live();                                  // antwortet die Kette nicht, mit dem nächsten Stand noch einmal
    if (live()) drawNext(); else unreachable();
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
    if (rest === 'neu') return { kind: 'next' };          // der Block, der gerade entsteht
    return { kind: 'home', unknown: true };
  }
  function render(quiet) {
    if (cur.kind === 'block') showBlock(cur.h, quiet);
    else if (cur.kind === 'next') showNext();
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
    // Pfeiltasten blättern von Block zu Block; rechts vom neuesten liegt der Block im Bau
    document.addEventListener('keydown', function (e) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      var el = document.activeElement, tag = el && el.tagName, tip = Live.S.summary.height, left = e.key === 'ArrowLeft';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable) || (el && el.closest && el.closest('.proof, [role="slider"], canvas, #menu'))) return;
      if (cur.kind === 'block') {
        if (left && cur.h > 0) go('block-' + (cur.h - 1));
        else if (!left && cur.h < tip) go('block-' + (cur.h + 1));
        else if (!left && live()) go('neu');
      } else if (cur.kind === 'next' && left) go('block-' + tip);
    });
    U.on('data', function () {
      var tip = Live.S.blocks[0].height, grown = tip !== viewTip;
      viewTip = tip;
      if (cur.kind === 'home') return void drawHome();
      if (cur.kind === 'next') return void showNext();
      // ein geöffneter Block bleibt offen; nur sein "nächster Block" zeigt jetzt auf einen gefundenen statt auf den im Bau
      if (cur.kind === 'block' && atTip && atTip.h === cur.h && tip > cur.h) { atTip.a.setAttribute('href', Router.href('#explorer-block-' + (cur.h + 1))); atTip = null; }
      // neu lesen, was sich noch ändern kann: wartende Zahlungen, ein Konto nach jedem neuen Block, alles nach einem Ausfall
      if (cur.kind === 'address' && grown && live()) delete cache.acc[cur.a];
      if (cur.pending || cur.open || (cur.source === 'snapshot' && live()) || (cur.kind === 'address' && grown && live())) render(cur.source !== 'snapshot' || !live());
    });
    viewTip = Live.S.blocks[0].height;
    onRoute(Router.parse());
  }
  return { init: init, checkAddress: checkAddress };
})();
