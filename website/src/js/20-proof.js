/*
 * Der Blockkopf als Anzeige: 136 Byte, nach Feldern gekennzeichnet, im Browser zweimal gehasht
 * und mit dem Ziel verglichen. Kein Server wird nach dem Ergebnis gefragt.
 *
 *   <div data-proof="tip" data-trace="short" data-legend="chips"></div>
 */
var Proof = (function () {
  'use strict';
  var GENESIS = '010000000000000000000000000000000000000000000000000000000000000000000000000000001007612ea5c27b0b7c6ae79c745da364cfd64224eb6f5519bf559dc3b09fe840e2860175f61cefa97ff34e88d35402a7ee373a8764adbdda0b97ef200bbeca5780a1a06a000000000010000001000000000000000000000024bf060300000000';
  var instances = [];
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fieldValue(id, h) {
    switch (id) {
      case 'version': return String(h.version);
      case 'height': return U.num(h.height);
      case 'prev': return U.shortHash(h.prev, 14, 10);
      case 'merkle': return U.shortHash(h.merkle, 14, 10);
      case 'state': return U.shortHash(h.state, 14, 10);
      case 'time': return U.date(h.time, true);
      case 'diff': return U.num(Number(h.difficulty));
      case 'count': return U.num(h.count);
      case 'extra': return h.extra.toLocaleString(U.loc());
      case 'nonce': return h.nonce.toLocaleString(U.loc());
    }
    return '';
  }

  function Instance(root) {
    this.root = root;
    this.source = root.getAttribute('data-proof') || 'tip';     // tip | genesis | fest (Hex in data-hex)
    this.trace = root.getAttribute('data-trace') || 'short';
    this.legend = root.getAttribute('data-legend') || 'chips';
    this.sel = null; this.hex = null; this.animated = false;
    this.build();
  }
  Instance.prototype.currentHex = function () {
    if (this.source === 'genesis') return GENESIS;
    if (this.source === 'fixed') return this.root.getAttribute('data-hex');
    var b = Live.S.blocks[0];
    return b && b.header ? b.header : GENESIS;
  };
  Instance.prototype.build = function () {
    var r = this.root, self = this;
    r.classList.add('proof');
    r.innerHTML =
      '<div class="display-head"><div class="proof-id"><span class="display-title" data-p="title"></span><span class="proof-age" data-p="age"></span></div>' +
      '<span class="state" data-p="state"></span></div>' +
      '<div class="proof-body"><div class="proof-a">' +
      '<p class="proof-cap" data-p="cap"></p>' +
      '<div class="bytes" data-p="bytes" role="img"></div>' +
      '<div class="legend" data-p="legend"></div>' +
      '</div><div class="proof-b">' +
      '<div class="proof-read" data-p="read" aria-live="polite"></div>' +
      '<div class="proof-result"><div class="trace" data-p="trace"></div>' +
      '<p class="verdict" data-p="verdict" role="status"></p>' +
      '<div class="row proof-actions"><button type="button" class="btn small" data-p="again"></button>' +
      '<button type="button" class="btn small ghost" data-p="swap"></button></div>' +
      '<a class="small proof-open" data-p="open"></a></div>' +
      '</div></div>';
    this.p = {};
    U.$$('[data-p]', r).forEach(function (e) { self.p[e.getAttribute('data-p')] = e; });
    // data-plain: nur dieser eine Block (Explorer) – kein Wechsel zu Block 0, kein Verweis auf sich selbst
    if (r.hasAttribute('data-plain')) { this.p.swap.hidden = true; this.p.open.hidden = true; }
    this.p.again.addEventListener('click', function () { self.render(true); });
    this.p.swap.addEventListener('click', function () {
      self.source = self.source === 'genesis' ? 'tip' : 'genesis';
      self.sel = null; self.render(true);
    });
    this.p.bytes.addEventListener('pointerover', function (e) {
      var c = e.target.closest('[data-f]'); if (c) self.select(c.getAttribute('data-f'), true);
    });
    this.p.bytes.addEventListener('click', function (e) {
      var c = e.target.closest('[data-f]'); if (c) self.select(c.getAttribute('data-f'));
    });
    this.p.legend.addEventListener('click', function (e) {
      var c = e.target.closest('[data-f]'); if (c) self.select(self.sel === c.getAttribute('data-f') ? null : c.getAttribute('data-f'));
    });
  };
  Instance.prototype.select = function (id, soft) {
    if (soft && this.sel === id) return;
    this.sel = id;
    if (id) this.p.bytes.setAttribute('data-sel', id); else this.p.bytes.removeAttribute('data-sel');
    U.$$('[data-f]', this.p.legend).forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-f') === id ? 'true' : 'false'); });
    this.readout();
  };
  Instance.prototype.readout = function () {
    var box = this.p.read, id = this.sel, h = this.res.header;
    box.textContent = '';
    if (!id) { box.appendChild(U.el('p', { class: 'proof-hint', text: t('proof.pick').replace(/<[^>]+>/g, '') })); return; }
    var f = U.FIELDS.filter(function (x) { return x.id === id; })[0];
    box.appendChild(U.el('p', { class: 'proof-field' }, [
      U.el('span', { class: 'sw f-' + id }), U.el('strong', { text: t('field.' + id) }),
      U.el('span', { class: 'mono', text: fieldValue(id, h) }),
      U.el('span', { class: 'proof-range', text: t('proof.range', { a: f.off, b: f.off + f.len - 1 }) })
    ]));
    box.appendChild(U.el('p', { class: 'proof-desc', text: t('field.' + id + '.d').replace(/<[^>]+>/g, '') }));
  };
  Instance.prototype.render = function (animate) {
    var hex = this.currentHex(), self = this, p = this.p;
    this.hex = hex;
    var res = this.res = U.verifyHeader(hex), h = res.header, isTip = this.source === 'tip';
    var tip = Live.S.blocks[0];

    p.title.textContent = t('proof.block', { h: U.num(h.height) });
    p.age.textContent = isTip && tip ? t('proof.found', { ago: Live.ago(Number(tip.timestamp), Live.now()) }) : U.date(h.time, true);
    p.state.textContent = isTip ? Live.values().modeShort : this.source === 'genesis' ? t('proof.fixed') : t('proof.fixedBlock');
    p.state.classList.toggle('fixed', !isTip);
    p.cap.textContent = t('proof.cap');
    p.bytes.setAttribute('aria-label', t('proof.bytesLabel', { h: U.num(h.height) }));

    // 136 Byte
    var frag = document.createDocumentFragment();
    U.FIELDS.forEach(function (f) {
      for (var i = 0; i < f.len; i++) {
        var b = h.bytes[f.off + i];
        frag.appendChild(U.el('span', { class: 'b f-' + f.id + (i === f.len - 1 ? ' end' : ''), 'data-f': f.id, text: (b < 16 ? '0' : '') + b.toString(16) }));
      }
    });
    p.bytes.textContent = ''; p.bytes.appendChild(frag);
    if (this.sel) p.bytes.setAttribute('data-sel', this.sel); else p.bytes.removeAttribute('data-sel');

    // Legende
    p.legend.textContent = '';
    p.legend.className = 'legend ' + this.legend;
    U.FIELDS.forEach(function (f) {
      var kids = [U.el('span', { class: 'sw f-' + f.id }), U.el('span', { class: 'nm', text: t('field.' + f.id) })];
      if (self.legend === 'table') {
        kids.push(U.el('span', { class: 'rg mono', text: f.off + '–' + (f.off + f.len - 1) }));
        kids.push(U.el('span', { class: 'vl mono', text: fieldValue(f.id, h) }));
      }
      p.legend.appendChild(U.el('button', { type: 'button', 'data-f': f.id, 'aria-pressed': self.sel === f.id ? 'true' : 'false' }, kids));
    });
    this.readout();

    // Rechenweg
    p.trace.textContent = '';
    if (this.trace === 'full') p.trace.appendChild(line(t('proof.first'), res.first, null));
    var cmp = compare(res.hash, res.target);
    p.trace.appendChild(line(t('proof.hash'), res.hash, cmp, 'hash'));
    p.trace.appendChild(line(t('proof.target', { d: U.num(Number(h.difficulty)) }), res.target, cmp, 'target'));

    p.verdict.className = 'verdict ' + (res.valid ? 'ok' : 'bad');
    p.verdict.textContent = (res.valid ? t('proof.valid') : t('proof.invalid')) + ' ' +
      t('proof.time', { ms: U.num(Math.max(res.ms, 0.01), res.ms < 10 ? 2 : 0) });
    p.again.textContent = t('proof.again');
    p.swap.textContent = this.source === 'genesis' ? t('proof.latest') : t('proof.genesis');
    p.open.textContent = t('proof.open');
    p.open.setAttribute('href', Router.href('#explorer-block-' + h.height));

    if (animate && !reduce) this.play();
  };
  /** Stelle, an der Hash und Ziel sich zum ersten Mal unterscheiden. */
  function compare(hash, target) {
    var i = 0;
    while (i < 64 && hash[i] === target[i]) i++;
    return i;
  }
  function line(label, hex, cmp, kind) {
    var code = U.el('code', { class: 'hexline' });
    if (cmp === null || cmp === undefined || cmp >= 64) code.textContent = hex;
    else {
      code.appendChild(U.el('span', { class: 'same', text: hex.slice(0, cmp) }));
      code.appendChild(U.el('span', { class: 'pivot ' + kind, text: hex[cmp] }));
      code.appendChild(U.el('span', { class: 'rest', text: hex.slice(cmp + 1) }));
    }
    return U.el('div', { class: 'tline' }, [U.el('span', { class: 'k', text: label.replace(/<[^>]+>/g, '') }), code]);
  }
  /** Ein Durchlauf: die Felder leuchten der Reihe nach auf, dann steht das Urteil. */
  Instance.prototype.play = function () {
    var cells = U.$$('.b', this.p.bytes), self = this, i = 0, n = cells.length, step = 4;
    this.root.classList.add('running');
    (function tick() {
      for (var k = 0; k < step && i < n; k++, i++) cells[i].classList.add('lit');
      if (i < n) return void requestAnimationFrame(tick);
      setTimeout(function () {
        cells.forEach(function (c) { c.classList.remove('lit'); });
        self.root.classList.remove('running');
      }, 220);
    })();
  };

  function init() {
    U.$$('[data-proof]').forEach(function (root) { instances.push(new Instance(root)); });
    instances.forEach(function (x, idx) { x.render(idx === 0); });
    var lastTip = Live.S.blocks[0] && Live.S.blocks[0].hash, lastMode = Live.S.mode;
    U.on('data', function () {
      var tip = Live.S.blocks[0] && Live.S.blocks[0].hash, fresh = tip !== lastTip, mode = Live.S.mode;
      instances.forEach(function (x) {
        if (x.source !== 'tip') { if (mode !== lastMode) x.render(false); return; }
        x.render(fresh && !x.root.closest('[hidden]'));
      });
      lastTip = tip; lastMode = mode;
    });
  }
  function mount(root, animate) { var x = new Instance(root); instances.push(x); x.render(!!animate); return x; }
  function unmount(x) { var i = instances.indexOf(x); if (i >= 0) instances.splice(i, 1); }
  return { init: init, GENESIS: GENESIS, mount: mount, unmount: unmount };
})();
