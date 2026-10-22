'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  eigeneLesen, eigeneSchreiben, lage, ERNEUT_MS, type EigeneZahlung,
} from '@/lib/wallet/wartendeZahlungen';

/** Siehe useMining.ts -- leer heisst: derselbe Server wie die App. */
const MINING_BASIS = (process.env.NEXT_PUBLIC_MINING_BASE ?? '').trim().replace(/\/+$/, '');

interface Konto {
  nonce: string;
  pending?: { txid: string; kind: string; block?: number | null }[];
  history?: { txid: string }[];
}

/**
 * Eigene Zahlungen nachhalten (src/lib/wallet/wartendeZahlungen.ts): erneut
 * einreichen, was weder wartet noch bestaetigt ist, und melden, welche
 * festhaengen.
 *
 * Fest haengt eine Zahlung, wenn der Knoten sie nicht wieder annimmt (die
 * Untergrenze liegt inzwischen hoeher) oder wenn sie wartet, aber in der
 * Vorschau des Knotens noch keinen Block hat. Fuer beide bietet die Wallet
 * "Gebuehr erhoehen" an.
 */
export function useEigeneZahlungen(adresse: string | null, konto: Konto | null) {
  const [fest, setFest] = useState<EigeneZahlung[]>([]);
  const laeuft = useRef(false);

  const pruefe = useCallback(async () => {
    if (!adresse || !konto || laeuft.current) return;
    laeuft.current = true;
    try {
      const jetzt = Date.now();
      // Nur Aenderungen sammeln (txid -> neu, null = vergessen) und am Ende
      // auf die DANN gespeicherte Liste anwenden: Waehrend der Anfragen kann
      // Senden eine neue Zahlung gemerkt haben, die nicht verloren gehen darf.
      const aenderung = new Map<string, EigeneZahlung | null>();
      for (const z of eigeneLesen(adresse)) {
        const l = lage(z, konto, jetzt);
        if (l === 'bestaetigt' || l === 'ueberholt' || l === 'aufgegeben') { aenderung.set(z.txid, null); continue; }
        if (l !== 'erneut') {
          // Wartet sie, gilt eine frueher gemeldete Untergrenze nicht mehr.
          if (l === 'wartet' && z.noetig) aenderung.set(z.txid, { ...z, noetig: null });
          continue;
        }
        let neu: EigeneZahlung = { ...z, zuletzt: jetzt };
        try {
          const res = await fetch(`${MINING_BASIS}/api/v2/tx`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ raw: z.raw }),
          });
          const b = await res.json();
          if (b.accepted || b.reason === 'duplicate') neu = { ...neu, noetig: null };
          else if (b.reason === 'pool_min_fee' || b.reason === 'fee_too_low') neu = { ...neu, noetig: b.required ?? null };
          else if (b.reason === 'nonce_too_low') { aenderung.set(z.txid, null); continue; }   // bestaetigt oder ersetzt
        } catch { /* Netz weg: beim naechsten Mal */ }
        aenderung.set(z.txid, neu);
      }
      const behalten: EigeneZahlung[] = [];
      for (const z of eigeneLesen(adresse)) {
        const a = aenderung.get(z.txid);
        if (a === null) continue;
        behalten.push(a ?? z);
      }
      eigeneSchreiben(adresse, behalten);
      const ohneBlock = new Set((konto.pending ?? [])
        .filter(p => p.kind === 'out' && p.block === null).map(p => p.txid));
      setFest(behalten.filter(z => (z.noetig != null && z.noetig !== '') || ohneBlock.has(z.txid)));
    } finally {
      laeuft.current = false;
    }
  }, [adresse, konto]);

  useEffect(() => { void pruefe(); }, [pruefe]);
  useEffect(() => {
    const t = setInterval(() => { void pruefe(); }, ERNEUT_MS);
    return () => clearInterval(t);
  }, [pruefe]);

  return { fest };
}
