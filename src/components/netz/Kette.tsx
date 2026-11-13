'use client';

import { useT } from '@/i18n';

/**
 * Die Kette entlang: die letzten Bloecke als Lichter auf einer Linie. Der
 * Abstand zweier Lichter ist die Zeit zwischen den Bloecken -- so sieht man,
 * dass Bloecke nicht im Takt kommen. Kalt ist ein Block ohne, warm ein Block
 * mit Ueberweisungen (mehr als die Coinbase). Der offene Ring rechts ist der
 * naechste Block, an dem gerade gerechnet wird.
 */

export interface KettenBlock { height: number; timestamp: string; txCount: number }

const B = 346, LINKS = 8, WEG = 286, NAECHSTER = 332, Y = 34;
/** Sekunden: Sehr kurze Abstaende bleiben sichtbar, sehr lange sprengen die Linie nicht. */
const MIN = 150, MAX = 2400;

export default function Kette({ bloecke }: { bloecke: KettenBlock[] }) {
  const { t, zahl } = useT();
  // Aelteste zuerst, hoechstens zehn.
  const liste = [...bloecke].sort((a, b) => a.height - b.height).slice(-10);
  if (liste.length < 2) return <div style={{ aspectRatio: `${B} / 92` }} />;

  const abstaende = liste.slice(1).map((b, i) =>
    Math.max(MIN, Math.min(MAX, Number(b.timestamp) - Number(liste[i].timestamp))));
  const summe = abstaende.reduce((a, b) => a + b, 0);
  const xs = [LINKS];
  for (const a of abstaende) xs.push(xs[xs.length - 1] + (a / summe) * WEG);
  const letzter = xs.length - 1;

  return (
    <div>
      <svg viewBox={`0 0 ${B} 92`} role="img" aria-label={t.licht.ketteAria} className="block w-full">
        <line x1="0" y1={Y} x2={xs[letzter]} y2={Y} stroke="rgb(170 198 255 / .3)" strokeWidth="1" />
        <line x1={xs[letzter]} y1={Y} x2={NAECHSTER} y2={Y} stroke="rgb(170 198 255 / .3)" strokeWidth="1" strokeDasharray="2 5" />
        {liste.map((b, i) => {
          const neu = i === letzter;
          return b.txCount > 1 ? (
            <g key={b.height}>
              <circle cx={xs[i]} cy={Y} r={neu ? 10 : 9} fill="rgb(255 186 110 / .2)" />
              <circle cx={xs[i]} cy={Y} r={neu ? 4.4 : 3.6} fill="#FFD29A" />
            </g>
          ) : (
            <g key={b.height}>
              <circle cx={xs[i]} cy={Y} r={neu ? 10 : 8} fill={`rgb(120 190 255 / ${neu ? .26 : .16})`} />
              <circle cx={xs[i]} cy={Y} r={neu ? 4.4 : 3.2} fill={neu ? '#DDF3FF' : '#9CCBFF'} />
            </g>
          );
        })}
        <circle cx={NAECHSTER} cy={Y} r="5.5" fill="none" stroke="rgb(238 244 255 / .6)" strokeWidth="1.3" />
        <text x={LINKS} y="70" fontSize="12" className="font-mono" fill="rgb(212 226 255 / .62)">{zahl(liste[0].height)}</text>
        <text x={Math.min(xs[letzter], B - 52)} y="70" textAnchor="middle" fontSize="12" className="font-mono" fill="#EEF4FF">{zahl(liste[letzter].height)}</text>
        <text x={B - 6} y="12" textAnchor="end" fontSize="12.5" fill="rgb(226 236 255 / .78)">{t.licht.ketteNaechster}</text>
      </svg>
      <div className="mt-1.5 flex flex-wrap gap-x-[18px] gap-y-1 text-[13px] text-dim">
        <span className="flex items-center gap-2"><span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-[#9CCBFF]" />{t.licht.ketteBlock}</span>
        <span className="flex items-center gap-2"><span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-[#FFD29A]" />{t.licht.ketteMitTx}</span>
      </div>
    </div>
  );
}
