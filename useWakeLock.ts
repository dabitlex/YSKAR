'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Haelt den Bildschirm wach, solange gemint wird.
 *
 * Warum das noetig ist: Sperrt das Display, haelt die Plattform den Worker
 * an. Das Mining endet dann mitten im Job, ohne dass jemand etwas gedrueckt
 * haette -- und der Nutzer sieht beim naechsten Entsperren nur, dass nichts
 * passiert ist.
 *
 * Zwei Eigenheiten der Schnittstelle, die man kennen muss:
 *
 *  1. Die Sperre wird AUTOMATISCH freigegeben, sobald die Seite unsichtbar
 *     wird -- etwa beim Wechsel in eine andere App. Sie muss danach neu
 *     angefordert werden, sonst ist sie stillschweigend weg.
 *  2. Sie braucht einen sicheren Kontext (https) und eine sichtbare Seite.
 *     Wird sie zu frueh angefordert, wirft sie.
 *
 * Was sie NICHT kann: das manuelle Sperren durch den Nutzer verhindern oder
 * weiterlaufen, wenn die App in den Hintergrund geht. Das ist Absicht der
 * Plattform und nichts, was sich umgehen laesst.
 */

export type WakeStatus = 'aus' | 'aktiv' | 'nicht_moeglich';

export function useWakeLock(aktivieren: boolean) {
  const sperre = useRef<WakeLockSentinel | null>(null);
  const [status, setStatus] = useState<WakeStatus>('aus');

  const anfordern = useCallback(async () => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      setStatus('nicht_moeglich');
      return;
    }
    if (document.visibilityState !== 'visible') return;
    if (sperre.current) return;

    try {
      const s = await navigator.wakeLock.request('screen');
      sperre.current = s;
      setStatus('aktiv');
      // Das System kann die Sperre jederzeit selbst aufheben, etwa bei
      // niedrigem Akkustand. Dann muss der Zustand mitwandern, sonst
      // behauptet die Anzeige etwas Falsches.
      s.addEventListener('release', () => {
        sperre.current = null;
        setStatus(v => (v === 'aktiv' ? 'aus' : v));
      });
    } catch {
      // Wirft unter anderem, wenn das System es verweigert. Kein Fehler,
      // den der Nutzer beheben koennte -- also nur vermerken.
      setStatus('nicht_moeglich');
    }
  }, []);

  const freigeben = useCallback(async () => {
    const s = sperre.current;
    sperre.current = null;
    setStatus('aus');
    if (s) { try { await s.release(); } catch { /* schon weg */ } }
  }, []);

  useEffect(() => {
    if (aktivieren) anfordern();
    else freigeben();
  }, [aktivieren, anfordern, freigeben]);

  // Nach der Rueckkehr aus dem Hintergrund ist die Sperre weg. Ohne dieses
  // Neuanfordern wuerde das Display beim naechsten Mal doch abschalten.
  useEffect(() => {
    const beiSichtbar = () => {
      if (aktivieren && document.visibilityState === 'visible') anfordern();
    };
    document.addEventListener('visibilitychange', beiSichtbar);
    return () => document.removeEventListener('visibilitychange', beiSichtbar);
  }, [aktivieren, anfordern]);

  // Beim Verlassen der Seite aufraeumen
  useEffect(() => () => { void freigeben(); }, [freigeben]);

  return status;
}
