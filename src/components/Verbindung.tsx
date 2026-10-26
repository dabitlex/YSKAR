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

export default function Verbindung({ summary }: { summary: unknown }) {
  const { t } = useT();
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

  if (online && !still) return null;
  const titel = !online ? t.rd.fehler.offlineT : t.rd.fehler.knotenT;
  const text = !online ? t.rd.fehler.offlineS : t.rd.fehler.knotenS;
  return (
    <div role="status" className={`rise mb-4 flex gap-3 border-y px-3 py-3 ${!online ? 'border-risk/30 bg-risk/[.06]' : 'border-amber/25 bg-amber/[.05]'}`}>
      <span className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${!online ? 'bg-risk' : 'bg-amber'}`} />
      <span className="flex flex-col gap-0.5">
        <span className="text-[13.5px] font-semibold text-text">{titel}</span>
        <span className="text-[12.5px] leading-[1.45] text-dim">{text}</span>
      </span>
    </div>
  );
}
