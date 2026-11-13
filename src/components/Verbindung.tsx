'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n';

/**
 * Hinweiszeile oben, wenn etwas mit der Verbindung nicht stimmt:
 *
 *  - kein Internet (Browser meldet offline)
 *  - der YSKAR-Knoten antwortet nicht: Die Kennzahlen werden alle 6 s neu
 *    gelesen; kommt 30 s lang keine neue Antwort, zeigen wir es an.
 *
 * Reine Anzeige -- am Mining und an den Abfragen aendert sie nichts.
 */
const STILL_MS = 30_000;

export interface VerbindungsStand { online: boolean; still: boolean; }

/**
 * Der Stand wird einmal in der App gefuehrt und nur angezeigt, wo die Meldung
 * gerade steht (oben oder auf "Minen" unter der Buehne). So faengt die
 * 30-Sekunden-Frist beim Wechsel des Tabs nicht von vorn an.
 */
export function useVerbindung(summary: unknown): VerbindungsStand {
  const [online, setOnline] = useState(true);
  const [still, setStill] = useState(false);
  const zuletzt = useRef(Date.now());

  useEffect(() => {
    const an = () => setOnline(true), aus = () => setOnline(false);
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
    window.addEventListener('online', an); window.addEventListener('offline', aus);
    return () => { window.removeEventListener('online', an); window.removeEventListener('offline', aus); };
  }, []);

  useEffect(() => { zuletzt.current = Date.now(); setStill(false); }, [summary]);
  useEffect(() => {
    const id = setInterval(() => setStill(Date.now() - zuletzt.current > STILL_MS), 5000);
    return () => clearInterval(id);
  }, []);

  return { online, still };
}

export default function Verbindung({ stand }: { stand: VerbindungsStand }) {
  const { t } = useT();
  const { online, still } = stand;
  if (online && !still) return null;
  const titel = !online ? t.rd.fehler.offlineT : t.rd.fehler.knotenT;
  const text = !online ? t.rd.fehler.offlineS : t.rd.fehler.knotenS;
  return (
    <div role="status" className="glas rise relative z-[1] mb-4 flex gap-3 rounded-[22px] px-4 py-3">
      {/* Ein leerer Ring: Was hier steht, ist ein Stand, nicht live. */}
      <span aria-hidden="true" className={`mt-[6px] h-2 w-2 shrink-0 rounded-full ${!online ? 'shadow-[inset_0_0_0_1.5px_rgb(var(--risk))]' : 'shadow-[inset_0_0_0_1.5px_#FFD29A]'}`} />
      <span className="flex flex-col gap-0.5">
        <span className="text-[14.5px] font-medium leading-[1.3] text-text">{titel}</span>
        <span className="text-[13.5px] leading-[1.4] text-lese">{text}</span>
      </span>
    </div>
  );
}
