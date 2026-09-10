'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as vault from '@/lib/wallet/vault';
import {
  createMnemonic, keypairFromMnemonic, isValidMnemonic, normalizeMnemonic,
  type Keypair,
} from '@/lib/core/wallet';

/**
 * Wallet-Zustand der App.
 *
 * Vier Lagen, die auseinandergehalten werden muessen:
 *
 *   kein Tresor      -> Onboarding: erstellen oder wiederherstellen
 *   Tresor, gesperrt -> PIN abfragen
 *   entsperrt        -> Schluessel im Speicher, Mining und Senden moeglich
 *   Woerter ungesichert -> erstellt, aber noch nicht bestaetigt
 *
 * Der private Schluessel lebt ausschliesslich im Arbeitsspeicher dieser
 * Sitzung. Beim Neuladen ist er weg und die PIN wird erneut gebraucht --
 * das ist Absicht, nicht Unbequemlichkeit.
 */

export type WalletPhase = 'laden' | 'kein_tresor' | 'gesperrt' | 'offen';

interface WalletState {
  phase: WalletPhase;
  address: string | null;
  keypair: Keypair | null;
  /** Nur direkt nach dem Erstellen gesetzt, bis der Nutzer bestaetigt hat. */
  freshMnemonic: string | null;

  create: () => string;
  confirmAndSeal: (pin: string) => Promise<void>;
  discardFresh: () => void;
  recover: (mnemonic: string, pin: string) => Promise<{ ok: boolean; reason?: string }>;
  unlock: (pin: string) => Promise<{ ok: boolean; reason?: string }>;
  /** Woerter erneut anzeigen -- nur gegen PIN, nie aus dem Speicher. */
  revealMnemonic: (pin: string) => Promise<{ ok: boolean; mnemonic?: string; reason?: string }>;
  lock: () => void;
  forget: () => void;
}

const Ctx = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<WalletPhase>('laden');
  const [address, setAddress] = useState<string | null>(null);
  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [freshMnemonic, setFreshMnemonic] = useState<string | null>(null);

  useEffect(() => {
    const v = vault.load();
    if (!v) { setPhase('kein_tresor'); return; }
    setAddress(v.address);
    setPhase('gesperrt');
  }, []);

  /** Neue Merkwoerter. Noch nichts gespeichert -- erst nach der Bestaetigung. */
  const create = useCallback(() => {
    const m = createMnemonic(12);
    setFreshMnemonic(m);
    return m;
  }, []);

  const confirmAndSeal = useCallback(async (pin: string) => {
    if (!freshMnemonic) throw new Error('keine Woerter vorhanden');
    const kp = keypairFromMnemonic(freshMnemonic);
    const sealed = await vault.seal(freshMnemonic, pin, kp.address);
    vault.save(sealed);
    setKeypair(kp);
    setAddress(kp.address);
    setFreshMnemonic(null);
    setPhase('offen');
  }, [freshMnemonic]);

  const discardFresh = useCallback(() => setFreshMnemonic(null), []);

  const recover = useCallback(async (mnemonic: string, pin: string) => {
    const clean = normalizeMnemonic(mnemonic);
    if (!isValidMnemonic(clean)) {
      return { ok: false, reason: 'Die Wörter ergeben keine gültige Wallet.' };
    }
    const kp = keypairFromMnemonic(clean);
    vault.save(await vault.seal(clean, pin, kp.address));
    setKeypair(kp);
    setAddress(kp.address);
    setPhase('offen');
    return { ok: true };
  }, []);

  const unlock = useCallback(async (pin: string) => {
    const v = vault.load();
    if (!v) return { ok: false, reason: 'Kein Tresor auf diesem Gerät.' };
    const opened = await vault.unseal(v, pin);
    if (!opened.ok) return { ok: false, reason: 'PIN stimmt nicht.' };
    const kp = keypairFromMnemonic(opened.mnemonic);
    setKeypair(kp);
    setAddress(kp.address);
    setPhase('offen');
    return { ok: true };
  }, []);

  /*
    Die Woerter liegen nur verschluesselt im Geraet. Sie erneut zu zeigen
    heisst, sie erneut zu entschluesseln -- deshalb wird die PIN verlangt,
    auch wenn die Wallet gerade offen ist. Sie im Arbeitsspeicher
    mitzufuehren waere bequemer und genau die Abkuerzung, die man bei
    Schluesselmaterial nicht nimmt.
  */
  const revealMnemonic = useCallback(async (pin: string) => {
    const v = vault.load();
    if (!v) return { ok: false, reason: 'Kein Tresor auf diesem Gerät.' };
    const opened = await vault.unseal(v, pin);
    if (!opened.ok) return { ok: false, reason: 'PIN stimmt nicht.' };
    return { ok: true, mnemonic: opened.mnemonic };
  }, []);

  const lock = useCallback(() => {
    setKeypair(null);
    setPhase(vault.hasWallet() ? 'gesperrt' : 'kein_tresor');
  }, []);

  const forget = useCallback(() => {
    vault.wipe();
    setKeypair(null);
    setAddress(null);
    setFreshMnemonic(null);
    setPhase('kein_tresor');
  }, []);

  return (
    <Ctx.Provider value={{
      phase, address, keypair, freshMnemonic,
      create, confirmAndSeal, discardFresh, recover, unlock, revealMnemonic,
      lock, forget,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWallet(): WalletState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useWallet ausserhalb des WalletProvider');
  return c;
}
