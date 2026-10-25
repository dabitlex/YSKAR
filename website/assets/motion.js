/*
 * yskar.app -- Bewegung auf der Startseite.
 *
 * Alles hier ist Zierde: Ohne dieses Skript ist jede Seite vollstaendig
 * lesbar. Bei "Bewegung reduzieren" im System bleibt alles ruhig stehen.
 *
 *   - Warp im Einstieg (Canvas) und ein ruhiges Sternenfeld im V6-Abschnitt
 *   - Kopfzeile wird beim Scrollen fest
 *   - Laufband: Inhalt doppelt fuer eine nahtlose Schleife
 *   - Aussage: Woerter leuchten beim Scrollen auf, *Wort* wird hervorgehoben
 *   - "So funktioniert es": der Schritt in Bildmitte ist aktiv, Geraete rechnen
 *   - Kurve der Gesamtmenge zeichnet sich, Punkt "heute" folgt den Live-Werten
 *   - Lichtschein unter dem Mauszeiger auf Kacheln
 */
(function () {
  'use strict';

  var ruhig = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var farben = { a: [47, 123, 255], b: [99, 216, 255], bg: [3, 6, 15] };

  // ------------------------------------------------------------ Aussage
  function worteTeilen() {
    var ps = document.querySelectorAll('[data-worte]');
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      var roh = p.textContent;
      p.textContent = '';
      var teile = roh.split(/\s+/);
      for (var j = 0; j < teile.length; j++) {
        var w = teile[j];
        if (!w) continue;
        var hl = w.charAt(0) === '*';
        if (hl) w = w.slice(1);
        var s = document.createElement('span');
        s.className = 'w' + (hl ? ' hl' : '');
        s.textContent = w;
        p.appendChild(s);
        p.appendChild(document.createTextNode(' '));
      }
    }
    worteLeuchten();
  }
  function worteLeuchten() {
    var ps = document.querySelectorAll('[data-worte]');
    for (var i = 0; i < ps.length; i++) {
      var ws = ps[i].querySelectorAll('.w');
      var r = ps[i].getBoundingClientRect(), vh = window.innerHeight;
      var anteil = ruhig ? 1 : Math.min(1, Math.max(0, (vh * 0.9 - r.top) / (r.height + vh * 0.3)));
      var n = Math.round(anteil * ws.length);
      for (var j = 0; j < ws.length; j++) ws[j].classList.toggle('an', j < n);
    }
  }
  // Nach jedem Sprachwechsel steht der Satz neu (mit *) im Element.
  document.addEventListener('yskar:sprache', worteTeilen);

  // ------------------------------------------------------------ Schritte
  var schritte = [];
  function schrittWaehlen() {
    var mitte = window.innerHeight / 2, best = null, abstand = 1e9;
    for (var i = 0; i < schritte.length; i++) {
      var r = schritte[i].getBoundingClientRect();
      var d = Math.abs(r.top + r.height / 2 - mitte);
      if (d < abstand) { abstand = d; best = schritte[i]; }
    }
    for (i = 0; i < schritte.length; i++) schritte[i].classList.toggle('aktiv', schritte[i] === best);
  }

  var HEX = '0123456789abcdef';
  function zufall(n) { var s = ''; for (var i = 0; i < n; i++) s += HEX[Math.random() * 16 | 0]; return s; }
  var geraete = [], letzterHash = 0, letzterFund = 0;
  function hashen(t) {
    if (!schritte[0] || !schritte[0].classList.contains('aktiv') || t - letzterHash < 90) return;
    letzterHash = t;
    for (var i = 0; i < geraete.length; i++) {
      if (!geraete[i].classList.contains('fund')) geraete[i].querySelector('.hx').textContent = zufall(46);
    }
    if (t - letzterFund > 3200) {
      letzterFund = t;
      for (i = 0; i < geraete.length; i++) geraete[i].classList.remove('fund');
      var g = geraete[Math.random() * geraete.length | 0];
      g.classList.add('fund');
      g.querySelector('.hx').textContent = '0000000000' + zufall(26) + '  ✓';
    }
  }

  // ------------------------------------------------------------ Kurve
  function kurveVorbereiten() {
    var linie = document.getElementById('kurve-linie');
    if (!linie || ruhig || !('IntersectionObserver' in window)) return;
    if (linie.getBoundingClientRect().top < window.innerHeight) return; // schon sichtbar: so lassen
    var laenge = linie.getTotalLength();
    linie.style.strokeDasharray = laenge;
    linie.style.strokeDashoffset = laenge;
    var io = new IntersectionObserver(function (es) {
      if (!es[0].isIntersecting) return;
      linie.style.transition = 'stroke-dashoffset 2.2s cubic-bezier(.3,.7,.2,1)';
      linie.style.strokeDashoffset = 0;
      io.disconnect();
    }, { threshold: 0.5 });
    io.observe(linie);
  }
  // Punkt "heute" an die echte Stelle der Kurve: x nach Blockhoehe, y nach Menge.
  document.addEventListener('yskar:live', function (e) {
    var g = document.getElementById('kurve-jetzt');
    if (!g || !e.detail) return;
    var x = 40 + Math.min(96000, e.detail.hoehe) / 96000 * 590;
    var y = 300 - (e.detail.ausgegeben || e.detail.umlauf) / 1e6 * (270 / 21);
    if (isFinite(x) && isFinite(y)) g.setAttribute('transform', 'translate(' + (x - 77.5).toFixed(1) + ' ' + (y - 231.3).toFixed(1) + ')');
  });

  // ------------------------------------------------------------ Canvas-Helfer
  function passend(cv) {
    var d = Math.min(window.devicePixelRatio || 1, 2), r = cv.getBoundingClientRect();
    cv.width = Math.max(1, r.width * d); cv.height = Math.max(1, r.height * d);
    var x = cv.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0);
    return { x: x, w: r.width, h: r.height };
  }
  function sichtbar(el, cb) {
    if (!('IntersectionObserver' in window)) { cb(true); return; }
    new IntersectionObserver(function (es) { cb(es[0].isIntersecting); }).observe(el);
  }

  // Warp: feine Striche, die aus einem Fluchtpunkt rechts vom Text treiben.
  function warp(cv) {
    var g = passend(cv), P = [];
    function neu(p, weit) { p.a = Math.random() * Math.PI * 2; p.d = weit ? Math.random() * 900 : 20 + Math.random() * 60; p.s = 0.25 + Math.random() * 1.1; p.c = Math.random(); return p; }
    for (var i = 0; i < 380; i++) P.push(neu({}, true));
    function groesse() { g = passend(cv); g.x.fillStyle = 'rgb(' + farben.bg + ')'; g.x.fillRect(0, 0, g.w, g.h); }
    window.addEventListener('resize', groesse);
    groesse();
    return function () {
      var x = g.x, w = g.w, h = g.h, schmal = w < 760;
      var cx = schmal ? w * 0.5 : w * 0.7, cy = h * (schmal ? 0.28 : 0.5);
      var R = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) + 40;
      x.fillStyle = 'rgba(' + farben.bg + ',.28)'; x.fillRect(0, 0, w, h);
      for (var i = 0; i < P.length; i++) {
        var p = P[i], d0 = p.d; p.d += p.s * (1 + p.d * 0.009);
        if (p.d > R) { neu(p, false); continue; }
        var q = p.d / R, len = Math.max(1.5, (p.d - d0) * 4), cs = Math.cos(p.a), sn = Math.sin(p.a);
        var c = p.c < 0.7 ? farben.a : farben.b;
        x.strokeStyle = 'rgba(' + c + ',' + (q * 0.75).toFixed(3) + ')'; x.lineWidth = 0.4 + q * 1.4;
        x.beginPath(); x.moveTo(cx + cs * (p.d - len), cy + sn * (p.d - len)); x.lineTo(cx + cs * p.d, cy + sn * p.d); x.stroke();
      }
    };
  }

  // V6: ein ruhiges Feld aus Punkten, die langsam nach oben treiben.
  function sterne(cv) {
    var g = passend(cv), S = [];
    function neu(s, irgendwo) { s.x = Math.random(); s.y = irgendwo ? Math.random() : 1.02; s.v = 0.00015 + Math.random() * 0.0005; s.r = 0.4 + Math.random() * 1.3; s.c = Math.random() < 0.75 ? farben.b : farben.a; s.a = 0.15 + Math.random() * 0.6; return s; }
    for (var i = 0; i < 160; i++) S.push(neu({}, true));
    window.addEventListener('resize', function () { g = passend(cv); });
    return function () {
      var x = g.x; x.clearRect(0, 0, g.w, g.h);
      for (var i = 0; i < S.length; i++) {
        var s = S[i]; s.y -= s.v; if (s.y < -0.02) neu(s, false);
        x.fillStyle = 'rgba(' + s.c + ',' + s.a + ')';
        x.beginPath(); x.arc(s.x * g.w, s.y * g.h, s.r, 0, Math.PI * 2); x.fill();
      }
    };
  }

  // ------------------------------------------------------------ Start
  document.addEventListener('DOMContentLoaded', function () {
    // Falls site.js nicht lief, trotzdem teilen.
    if (!document.querySelector('[data-worte] .w')) worteTeilen();

    var lauf = document.getElementById('lauf');
    if (lauf && !ruhig) lauf.innerHTML += lauf.innerHTML;

    schritte = [].slice.call(document.querySelectorAll('.schritt'));
    geraete = [].slice.call(document.querySelectorAll('[data-geraet]'));
    for (var i = 0; i < geraete.length; i++) geraete[i].querySelector('.hx').textContent = zufall(46);

    var kopf = document.getElementById('kopf');
    function beimScrollen() {
      worteLeuchten();
      schrittWaehlen();
      if (kopf) kopf.classList.toggle('fest', window.scrollY > 40);
    }
    window.addEventListener('scroll', beimScrollen, { passive: true });
    window.addEventListener('resize', beimScrollen);
    beimScrollen();

    kurveVorbereiten();

    var fp = document.querySelector('.fahrplan');
    if (fp) {
      if (ruhig || !('IntersectionObserver' in window)) fp.classList.add('da');
      else {
        var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { fp.classList.add('da'); io.disconnect(); } }, { threshold: 0.3 });
        io.observe(fp);
      }
    }

    var lichter = document.querySelectorAll('.kachel, .v6-feld');
    for (i = 0; i < lichter.length; i++) {
      lichter[i].addEventListener('pointermove', function (e) {
        var r = this.getBoundingClientRect();
        this.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        this.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    }

    // Canvas nur zeichnen, solange es zu sehen ist.
    var bilder = [];
    var cw = document.getElementById('warp');
    if (cw && cw.getContext) { var b1 = { f: warp(cw), an: true }; bilder.push(b1); sichtbar(cw, function (v) { b1.an = v; }); }
    var cs = document.getElementById('v6-sterne');
    if (cs && cs.getContext) { var b2 = { f: sterne(cs), an: false }; bilder.push(b2); sichtbar(cs, function (v) { b2.an = v; }); }

    if (ruhig) {
      // Ein stilles Bild: ein paar Schritte vorrechnen und stehen lassen.
      for (i = 0; i < bilder.length; i++) for (var k = 0; k < 90; k++) bilder[i].f();
      return;
    }
    // Muenze im Fluchtpunkt: der Winkel laeuft fortlaufend weiter, statt dass
    // eine CSS-Animation bei 360 Grad neu startet (das gab einen kurzen Haenger).
    var muenze = document.querySelector('.m-dreh');
    if (muenze) muenze.classList.add('js');
    var muenzeStart = null;
    function schleife(t) {
      for (var i = 0; i < bilder.length; i++) if (bilder[i].an) bilder[i].f();
      if (muenze && (!b1 || b1.an) && !muenze.parentNode.classList.contains('gl')) {
        if (muenzeStart === null) muenzeStart = t;
        var grad = ((t - muenzeStart) / 9000 * 360) % 360;
        muenze.style.transform = 'rotateX(8deg) rotateY(' + grad.toFixed(2) + 'deg)';
      }
      hashen(t);
      window.requestAnimationFrame(schleife);
    }
    window.requestAnimationFrame(schleife);
  });
})();
