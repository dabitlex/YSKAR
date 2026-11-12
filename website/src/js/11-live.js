/*
 * Der Stand der Kette. Die Seite liest ihn aus der öffentlichen YSKAR-API (nur GET, derselbe Rechner: /api/v2)
 * und fragt alle 45 Sekunden neu.
 *
 * Bis die erste Antwort da ist, und falls die API einmal nicht antwortet, gilt der Stand aus assets/data/kette.js
 * (der beim letzten Bau der Seite) oder die letzte Antwort, die diese Seite schon erhalten hat. Solange das so ist,
 * steht am <html> data-mode="snapshot" und die Seite nennt das Datum dieses Stands, statt ihn als "jetzt" auszugeben.
 *
 * Im Browser wird davon nichts gespeichert.
 */
var Live = (function () {
  'use strict';
  var SNAP = window.YSKAR_SNAPSHOT, API = '/api/v2', PUBLIC = 'https://www.yskar.app/api/v2';
  var S = {
    mode: 'snapshot', at: SNAP.takenAt, summary: SNAP.summary, supply: SNAP.supply, pools: SNAP.pools, fees: SNAP.fees,
    blocks: SNAP.blocks.slice(),
    tried: false                 // true, sobald der erste Leseversuch beendet ist (gelungen oder nicht)
  };
  var timer = null, busy = false, started = false, pending = false;

  function get(path, ms) {
    var ctl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 8000);
    return fetch(API + path, { cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(to); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); },
        function (e) { clearTimeout(to); throw e; });
  }
  function valid(sum, bl) { return !!sum && typeof sum.height === 'number' && !!bl && !!bl.blocks && bl.blocks.length > 0 && !!bl.blocks[0].header; }

  function take(sum, bl) {
    S.summary = sum; S.blocks = bl.blocks; S.mode = 'live'; S.at = Math.floor(Date.now() / 1000);
  }

  function refresh() {
    if (busy) return Promise.resolve(false);
    if (!window.fetch) { S.tried = true; return Promise.resolve(false); }
    busy = true;
    return Promise.all([get('/summary'), get('/blocks?limit=50')]).then(function (r) {
      if (!valid(r[0], r[1])) throw new Error('unerwartete Antwort');
      take(r[0], r[1]);
      return extras();
    }).then(function () { busy = false; S.tried = true; publish(); return true; },
      function () {
        busy = false; S.tried = true;
        if (Date.now() / 1000 - S.at > 180) S.mode = 'snapshot';       // seit drei Minuten keine Antwort: der Stand gilt nicht mehr als "jetzt"
        publish(); return false;
      });
  }
  /** Pools, Menge und Gebühren: Zugaben. Fehlt eine, bleibt der letzte bekannte Wert stehen. */
  function extras() {
    return Promise.all([get('/pools').catch(nil), get('/supply').catch(nil), get('/fees').catch(nil)]).then(function (r) {
      if (r[0] && r[0].pools) S.pools = r[0];
      if (r[1] && r[1].max) S.supply = r[1];
      if (r[2] && r[2].minFee) S.fees = r[2];
    });
  }
  function nil() { return null; }

  /**
   * Vor dem Start des Programms kurz auf die Abfrage warten, die der Kopf der Seite schon losgeschickt hat:
   * So zeigt schon das erste Bild den Stand von jetzt. Kommt die Antwort nicht rechtzeitig, startet die Seite mit dem
   * Stand aus assets/data/kette.js und holt den neuen nach.
   */
  function prime(done) {
    var early = window.YSKAR_EARLY, gone = false;
    function go() { if (gone) return; gone = true; done(); }
    if (!early) return void go();
    pending = true;
    early.then(function (r) {
      pending = false;
      if (r && valid(r.summary, r.blocks)) {
        take(r.summary, r.blocks); S.at = Math.floor(r.at / 1000); S.tried = true;
        if (started) publish();
        busy = true;
        extras().then(function () { busy = false; if (started) publish(); });
      } else if (started) refresh();
      go();
    });
    setTimeout(go, 700);
  }

  function avgBlockTime() {
    var b = S.blocks, n = Math.min(b.length, 50);
    if (n < 3) return 600;
    return (Number(b[0].timestamp) - Number(b[n - 1].timestamp)) / (n - 1);
  }
  function duration(sec) {
    if (sec < 5400) return t('unit.min', { n: U.num(Math.max(1, Math.round(sec / 60))) });
    if (sec < 172800) return t('unit.hours', { n: U.num(sec / 3600, 0) });
    return t('unit.days', { n: U.num(sec / 86400, sec < 864000 ? 1 : 0) });
  }
  function ago(ts, ref) {
    var d = Math.max(0, ref - ts);
    if (d < 90) return t('ago.sec', { n: U.num(Math.max(1, d)) });
    if (d < 5400) return t('ago.min', { n: U.num(Math.round(d / 60)) });
    if (d < 172800) return t('ago.hours', { n: U.num(Math.round(d / 3600)) });
    return t('ago.days', { n: U.num(Math.round(d / 86400)) });
  }
  /** Wie ago(), aber ausgeschrieben, für Sätze in Überschriftgröße: "3 minutes ago", "vor 3 Minuten". */
  function agoLong(ts, ref) {
    var d = Math.max(0, ref - ts), n, k;
    if (d < 90) { n = Math.max(1, d); k = 'sec'; }
    else if (d < 5400) { n = Math.round(d / 60); k = 'min'; }
    else if (d < 172800) { n = Math.round(d / 3600); k = 'hours'; }
    else { n = Math.round(d / 86400); k = 'days'; }
    return tn('agol.' + k, n, { n: U.num(n) });
  }
  /** Bezugszeit für "vor … Minuten": live die Uhr, im Schnappschuss der Zeitpunkt der Aufnahme. */
  function now() { return S.mode === 'live' ? Math.floor(Date.now() / 1000) : S.at; }

  function values() {
    var s = S.summary, h = s.height, tip = S.blocks[0], avg = avgBlockTime();
    var era = Math.floor(h / U.EPOCH), nextHalving = (era + 1) * U.EPOCH;
    var minted = Number(s.totalSupply), max = Number(s.maxSupply);
    var tipTime = Number(tip.timestamp), v6Left = Math.max(0, U.V6 - h), halvingLeft = nextHalving - h;
    var diff = BigInt(s.difficultyWert || s.difficulty), attempts = Number(diff) * 65536;
    var tot = Chain.totals(), f = tot.finders1000 || {}, fsum = (f.main || 0) + (f.gozero || 0) + (f.solo || 0) + (f.other || 0) || 1;
    var snapDate = U.date(S.at, true), histTip = Chain.exactTip();
    var dayN = Math.floor((now() - Chain.get().t0) / 86400) + 1;
    var nodesN = Number(s.knoten || 0), eraLeft = nextHalving - h;
    var v = {
      height: U.num(h), heightHash: '#' + U.num(h),
      tipAge: ago(tipTime, now()), tipAgeLong: agoLong(tipTime, now()), tipTime: U.date(tipTime, true),
      hashrate: U.hashrate(s.hashrate), difficulty: U.num(Number(diff)),
      attempts: U.compact(attempts, 0),
      reward: U.ysr(s.nextReward), rewardAfter: U.ysr(U.rewardAt(nextHalving)),
      minted: U.ysr(minted, { max: 0 }), mintedPct: U.num(minted / max * 100, 1, 1) + ' %',
      circulating: U.num(parseFloat(S.supply.circulating), 0) + ' YSR',
      burned: U.num(parseFloat(S.supply.unspendable), 0) + ' YSR',
      burnedExact: U.num(parseFloat(S.supply.unspendable), 8, 2) + ' YSR',
      era: U.num(era + 1), eraRange: U.num(era * U.EPOCH) + '–' + U.num(nextHalving - 1),
      halvingHeight: U.num(nextHalving), halvingLeft: U.num(halvingLeft),
      halvingEta: t('eta.around', { d: duration(halvingLeft * avg), date: U.date(tipTime + halvingLeft * avg) }),
      v6Left: U.num(v6Left),
      v6Eta: v6Left > 0 ? t('eta.around', { d: duration(v6Left * avg), date: U.date(tipTime + v6Left * avg) }) : t('v6.active'),
      v6State: v6Left > 0 ? t('v6.pending', { n: U.num(v6Left) }) : t('v6.active'),
      mempool: U.num(s.mempool || 0), miners: U.num(s.activeMiners || 0), sessions: U.num(s.miningSessions || 0), nodes: U.num(s.knoten || 0),
      avgTime: U.num(avg, 0) + ' s', avgTimeMin: U.num(avg / 60, 1) + ' min',
      feeStd: U.ysr(S.fees.minFee), feeBytes: U.num(S.fees.basisBytes || 168),
      transfers: U.num(tot.transfers), blocksTotal: U.num(h + 1),
      avgAll: U.num(tot.avgBlockTime, 0) + ' s',
      shareGozero: U.num((f.gozero || 0) / fsum * 100, 1) + ' %', shareMain: U.num((f.main || 0) / fsum * 100, 1) + ' %',
      shareSolo: U.num((f.solo || 0) / fsum * 100, 1) + ' %',
      poolCount: U.num((S.pools.pools || []).length),
      supplyCirc: String(S.supply.circulating), supplyTotal: String(S.supply.total), supplyMax: String(S.supply.max),
      histState: t('mode.history', { h: U.num(histTip) }),
      snapTip: U.num(histTip), snapDate: snapDate,
      day: U.num(dayN), nodesNext: U.num(nodesN + 1), nextHeight: U.num(h + 1),
      eraLeft: U.num(eraLeft), eraPct: U.num((h - era * U.EPOCH) / U.EPOCH * 100, 0) + ' %',
      rewardNow: U.num(Number(s.nextReward) / 1e8, 4), rewardNext: U.num(U.rewardAt(nextHalving) / 1e8, 4),
      heroLine: t('home.hero.live', { d: U.num(dayN), h: U.num(h), n: U.num(nodesN) }),
      nowLine: t('home.walk.now', { d: U.num(dayN), h: U.num(h) }),
      mode: S.mode === 'live' ? t('mode.live') : t('mode.snapshot', { date: snapDate }),
      modeShort: S.mode === 'live' ? t('mode.liveShort') : t('mode.snapshotShort'),
      sourceNote: S.mode === 'live' ? t('foot.live') : t('foot.stale', { date: snapDate, h: U.num(h) })
    };
    return v;
  }
  function bind() {
    var v = values();
    document.documentElement.setAttribute('data-mode', S.mode);
    U.$$('[data-live]').forEach(function (e) {
      var k = e.getAttribute('data-live');
      if (v[k] !== undefined && e.textContent !== v[k]) e.textContent = v[k];
    });
  }
  function publish() { bind(); U.emit('data', S); }

  function start() {
    started = true;
    bind();
    if (!S.tried && !pending) refresh();
    timer = setInterval(function () { if (!document.hidden) refresh(); }, 45000);
    setInterval(function () { if (!document.hidden) bind(); }, 20000);
    // zurück im Vordergrund oder über "Zurück" wieder aufgerufen: nicht bis zum nächsten Takt warten
    function stale() { if (!document.hidden && Date.now() / 1000 - S.at > 60) refresh(); }
    document.addEventListener('visibilitychange', stale);
    window.addEventListener('pageshow', function (e) { if (e.persisted) stale(); });
    U.on('lang', publish);
    U.on('chain', publish);
  }
  return { S: S, prime: prime, start: start, refresh: refresh, get: get, values: values, avgBlockTime: avgBlockTime, ago: ago, now: now, duration: duration, API: API, PUBLIC: PUBLIC };
})();
