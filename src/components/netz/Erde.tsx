'use client';

import { useEffect, useRef } from 'react';
import { LANDPUNKTE } from '@/components/netz/landpunkte';

/**
 * Die drehende Erde fuer "Hilf dem Netzwerk zu wachsen": Kontinente aus
 * Punkten, darueber ein Netz aus Knoten und Verbindungen. Live auf einem
 * Canvas gezeichnet, keine vorberechneten Bilder.
 *
 * Die Knoten sind reine Illustration -- grosse Staedte auf allen Kontinenten,
 * KEINE echten Standorte von YSKAR-Knoten.
 */
const KNOTEN: [number, number][] = [
  [50.1, 8.7], [51.5, -0.1], [40.4, -3.7], [41.0, 29.0], [55.7, 37.6], [59.3, 18.1], [48.9, 2.3], [52.5, 13.4],
  [25.2, 55.3], [19.0, 72.8], [28.6, 77.2], [13.7, 100.5], [1.35, 103.8], [22.3, 114.2], [31.2, 121.5], [35.7, 139.7],
  [37.6, 127.0], [39.9, 116.4], [-33.9, 151.2], [-37.8, 145.0], [-36.8, 174.8], [-6.2, 106.8], [14.6, 121.0],
  [6.5, 3.4], [-1.3, 36.8], [-33.9, 18.4], [30.0, 31.2], [33.6, -7.6], [9.0, 38.7],
  [40.7, -74.0], [34.0, -118.2], [41.9, -87.6], [43.7, -79.4], [19.4, -99.1], [25.8, -80.2], [47.6, -122.3], [49.3, -123.1],
  [-23.5, -46.6], [-34.6, -58.4], [4.7, -74.1], [-12.0, -77.0], [-33.4, -70.6], [64.1, -21.9], [61.2, -149.9],
];

type V3 = [number, number, number];
const rad = Math.PI / 180;
const vec = (lat: number, lon: number): V3 => {
  const a = lat * rad, o = lon * rad;
  return [Math.cos(a) * Math.cos(o), Math.cos(a) * Math.sin(o), Math.sin(a)];
};

/** Einmal vorbereiten: Land, Knoten und die Boegen (je Knoten zu den drei naechsten). */
function vorbereiten() {
  const land: V3[] = [];
  for (let i = 0; i < LANDPUNKTE.length; i += 2) land.push(vec(LANDPUNKTE[i], LANDPUNKTE[i + 1]));
  const knoten = KNOTEN.map(([a, b]) => vec(a, b));
  const dot = (p: V3, q: V3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const kanten = new Set<string>();
  knoten.forEach((a, i) => {
    knoten.map((b, j) => [j, dot(a, b)] as const).filter(([j]) => j !== i)
      .sort((x, y) => y[1] - x[1]).slice(0, 3)
      .forEach(([j]) => kanten.add(i < j ? `${i}-${j}` : `${j}-${i}`));
  });
  const boegen: V3[][] = [];
  kanten.forEach(k => {
    const [i, j] = k.split('-').map(Number);
    const va = knoten[i], vb = knoten[j];
    const om = Math.acos(Math.max(-1, Math.min(1, dot(va, vb))));
    const pts: V3[] = [];
    for (let s = 0; s <= 14; s++) {
      const t = s / 14;
      const s1 = Math.sin((1 - t) * om) / Math.sin(om), s2 = Math.sin(t * om) / Math.sin(om);
      const h = 1 + 0.16 * om * Math.sin(Math.PI * t);
      pts.push([(s1 * va[0] + s2 * vb[0]) * h, (s1 * va[1] + s2 * vb[1]) * h, (s1 * va[2] + s2 * vb[2]) * h]);
    }
    boegen.push(pts);
  });
  return { land, knoten, boegen };
}

export default function Erde({ breite = 300, hoehe = 170, radius = 78 }: { breite?: number; hoehe?: number; radius?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = breite * dpr; cv.height = hoehe * dpr;
    ctx.scale(dpr, dpr);
    const { land, knoten, boegen } = vorbereiten();
    const cx = breite / 2, cy = hoehe / 2, R = radius;
    const la0 = 22 * rad, ca = Math.cos(la0), sa = Math.sin(la0);
    const ruhig = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let lon = -20, id = 0, zuletzt = performance.now();
    const zeichne = (jetzt: number) => {
      // 10 Grad pro Sekunde: eine Umdrehung in 36 Sekunden.
      if (!ruhig) lon += Math.min(0.1, (jetzt - zuletzt) / 1000) * 10;
      zuletzt = jetzt;
      const l = -lon * rad, cl = Math.cos(l), sl = Math.sin(l);
      const pr = (v: V3): V3 => {
        const x1 = v[0] * cl - v[1] * sl, y1 = v[0] * sl + v[1] * cl;
        return [cx + R * y1, cy - R * (-x1 * sa + v[2] * ca), x1 * ca + v[2] * sa];
      };
      ctx.clearRect(0, 0, breite, hoehe);
      // Schein hinter der Kugel
      const g = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.5);
      g.addColorStop(0, 'rgba(47,123,255,.18)'); g.addColorStop(1, 'rgba(47,123,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, breite, hoehe);
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10,17,34,.9)'; ctx.fill();
      ctx.strokeStyle = 'rgba(99,216,255,.18)'; ctx.lineWidth = 1; ctx.stroke();

      for (const v of land) {
        const [x, y, d] = pr(v);
        if (d <= 0.04) continue;
        ctx.fillStyle = `rgba(170,195,255,${(0.2 + d * 0.65).toFixed(2)})`;
        const r = 0.6 + d * 0.4;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.lineWidth = 0.9; ctx.strokeStyle = 'rgba(99,216,255,.45)';
      for (const b of boegen) {
        const p = b.map(pr);
        if (p.some(q => q[2] < -0.02)) continue;
        ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]);
        for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
        ctx.stroke();
      }
      for (const v of knoten) {
        const [x, y, d] = pr(v);
        if (d <= 0.05) continue;
        ctx.fillStyle = 'rgba(99,216,255,.35)'; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#E6F7FF'; ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill();
      }
      if (!ruhig) id = requestAnimationFrame(zeichne);
    };
    id = requestAnimationFrame(zeichne);
    // Unsichtbar (Tab im Hintergrund): rAF pausiert ohnehin.
    return () => cancelAnimationFrame(id);
  }, [breite, hoehe, radius]);

  return <canvas ref={ref} aria-hidden="true" style={{ width: breite, height: hoehe }} className="block" />;
}
