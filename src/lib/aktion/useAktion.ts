'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@/lib/wallet/useWallet';
import { sign } from '@/lib/core/wallet';
import { toHex } from '@/lib/core/codec';
import { imTelegram, initDataRoh, telegramId, cloudLesen, cloudSchreiben } from '@/lib/telegram/webapp';
import { laeuft, ZIEHUNG, ABHOL_ENDE, codeAusStartParam } from '@/lib/aktion/regeln';
import type { Status } from '@/lib/aktion/regeln';

/**
 * "Hilf YSKAR beim Wachsen" in der App.
 *
 *  - Meldet das Telegram-Konto einmal mit der Wallet an (nur in Telegram,
 *    nur mit gesicherter Wallet). Antwortet der Server "nicht eingerichtet",
 *    bleibt die Aktion unsichtbar.
 *  - Der Hinweis im Mine-Tab laesst sich dauerhaft schliessen (Telegram
 *    CloudStorage, zusaetzlich lokal).
 *  - Den Stand (Lose, Empfehlungen, Gewinn) laedt die Aktionsseite selbst.
 */
const ANGEMELDET = 'yskar.aktion.angemeldet';
const ZU = 'yskar.aktion.hinweisZu';
const CLOUD_ZU = 'aktion_hinweis_zu';

export interface AktionStand {
  aktiv: boolean;
  ende: number;
  code: string;
  lose: number;
  selbst: { status: Status; mining_tage: number };
  empfehlungen: { adresse: string; status: Status; grund: string | null; mining_tage: number; angemeldet: string; frist: number }[];
  gewinn: { platz: number; betrag_usd: number; code: string } | null;
}

function lokal(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
function lokalSetzen(k: string, v: string): void { try { localStorage.setItem(k, v); } catch { /* egal */ } }

export function useAktion() {
  const wallet = useWallet();
  const [bereit, setBereit] = useState<boolean>(false);
  const [code, setCode] = useState<string | null>(null);
  const [zu, setZu] = useState<boolean>(() => lokal(ZU) === '1');
  const [gewinn, setGewinn] = useState<AktionStand['gewinn']>(null);

  // Hinweis schon auf einem anderen Geraet geschlossen?
  useEffect(() => {
    if (zu) return;
    cloudLesen(CLOUD_ZU).then(w => { if (w === '1') { setZu(true); lokalSetzen(ZU, '1'); } });
  }, [zu]);

  // Anmelden (einmal je Wallet und Geraet), solange die Aktion laeuft.
  useEffect(() => {
    if (!imTelegram() || wallet.phase !== 'offen' || !wallet.gesichert || !wallet.keypair || !wallet.address) return;
    const adresse = wallet.address;
    const gemerkt = lokal(ANGEMELDET);
    if (gemerkt?.startsWith(adresse + ':')) { setBereit(true); setCode(gemerkt.split(':')[1] || null); return; }
    if (!laeuft()) return;
    const id = telegramId();
    if (id === null) return;
    let ref: string | null = null;
    try { ref = codeAusStartParam(JSON.parse(lokal('yskar.kampagne') ?? 'null')?.code); } catch { /* keiner */ }
    const nachricht = new TextEncoder().encode(`YSKAR Hilf-wachsen ${id} ${adresse}`);
    const signatur = toHex(sign(nachricht, wallet.keypair.privateKey));
    fetch('/api/v2/aktion/anmelden', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: initDataRoh(), adresse, publicKey: toHex(wallet.keypair.publicKey), signatur, ref }),
    }).then(async r => {
      if (!r.ok) return;
      const d = await r.json() as { code?: string };
      if (d.code) { lokalSetzen(ANGEMELDET, `${adresse}:${d.code}`); setCode(d.code); setBereit(true); }
    }).catch(() => { /* naechster Start */ });
  }, [wallet.phase, wallet.gesichert, wallet.keypair, wallet.address]);

  // Nach der Ziehung: einmal nachsehen, ob diese Wallet gewonnen hat.
  useEffect(() => {
    if (!bereit || Date.now() < ZIEHUNG || Date.now() > ABHOL_ENDE) return;
    standLaden().then(s => { if (s?.gewinn) setGewinn(s.gewinn); });
  }, [bereit]);

  const schliessen = useCallback(() => {
    setZu(true); lokalSetzen(ZU, '1'); cloudSchreiben(CLOUD_ZU, '1');
  }, []);

  return {
    /** Aktion eingerichtet und dieses Konto angemeldet. */
    bereit,
    code,
    gewinn,
    /** Hinweis im Mine-Tab zeigen? */
    hinweis: bereit && !zu && (laeuft() || !!gewinn),
    schliessen,
  };
}

export async function standLaden(): Promise<AktionStand | null> {
  try {
    const r = await fetch('/api/v2/aktion/stand', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: initDataRoh() }),
    });
    if (!r.ok) return null;
    return await r.json() as AktionStand;
  } catch { return null; }
}
