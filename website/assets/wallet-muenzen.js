/*
 * yskar.app -- Wallet-Kachel: YSKAR-Muenzen fliegen nacheinander ins Handy.
 *
 * Nur Zierde: Die Muenzen starten oben rechts in der Kachel, ziehen in einem
 * Bogen zum Bildschirm des Handys, werden dabei kleiner und tauchen ein; das
 * Handy leuchtet kurz auf. Laeuft nur, solange die Kachel zu sehen ist.
 * Bei "Bewegung reduzieren" passiert nichts.
 */
(function () {
  'use strict';

  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  function muenze() {
    var m = document.createElement('span');
    m.className = 'flugmuenze';
    m.setAttribute('aria-hidden', 'true');
    m.innerHTML = '<img src="/assets/img/zeichen.svg?v=1" alt="">';
    return m;
  }

  function fliegen(kachel, telefon, verzoegerung) {
    if (!kachel.animate) return;
    var k = kachel.getBoundingClientRect(), t = telefon.getBoundingClientRect();
    if (!t.width) return;
    var m = muenze();
    kachel.appendChild(m);
    var gr = m.offsetWidth || 40;
    // Start: oben rechts, leicht ausserhalb; Ziel: oberes Drittel des Bildschirms.
    var sx = k.width * 0.42 + (Math.random() * 120 - 60), sy = -gr * 1.1;
    var zx = t.left - k.left + t.width / 2 - gr / 2, zy = t.top - k.top + t.height * 0.24 - gr / 2;
    var mx = (sx + zx) / 2 + 20 + Math.random() * 50, my = sy + (zy - sy) * 0.18 + Math.random() * 20;
    var dreh = 540 + Math.random() * 360;
    var a = m.animate([
      { transform: 'translate(' + sx + 'px,' + sy + 'px) scale(1) rotateY(0deg)', opacity: 0 },
      { transform: 'translate(' + sx + 'px,' + (sy + 10) + 'px) scale(1) rotateY(' + dreh * 0.1 + 'deg)', opacity: 1, offset: 0.08 },
      { transform: 'translate(' + mx + 'px,' + my + 'px) scale(1.08) rotateY(' + dreh * 0.55 + 'deg)', opacity: 1, offset: 0.5 },
      { transform: 'translate(' + zx + 'px,' + (zy - 6) + 'px) scale(.5) rotateY(' + dreh * 0.92 + 'deg)', opacity: 1, offset: 0.88 },
      { transform: 'translate(' + zx + 'px,' + zy + 'px) scale(.2) rotateY(' + dreh + 'deg)', opacity: 0 }
    ], { duration: 1700, delay: verzoegerung || 0, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'both' });
    a.onfinish = function () {
      m.remove();
      telefon.classList.remove('empfang');
      void telefon.offsetWidth; // Leuchten neu starten
      telefon.classList.add('empfang');
    };
  }

  document.addEventListener('DOMContentLoaded', function () {
    var kachel = document.querySelector('.k-wallet');
    var telefon = kachel && kachel.querySelector('.telefon');
    if (!telefon || !('IntersectionObserver' in window)) return;

    var sichtbar = false, uhr = null, ersteRunde = true;
    function runde() {
      if (!sichtbar) return;
      if (ersteRunde) {
        ersteRunde = false;
        for (var i = 0; i < 4; i++) fliegen(kachel, telefon, i * 260);
      } else {
        fliegen(kachel, telefon, 0);
      }
    }
    new IntersectionObserver(function (es) {
      sichtbar = es[0].isIntersecting;
      if (sichtbar && !uhr) { runde(); uhr = setInterval(runde, 4200); }
      if (!sichtbar && uhr) { clearInterval(uhr); uhr = null; }
    }, { threshold: 0.45 }).observe(kachel);
  });
})();
