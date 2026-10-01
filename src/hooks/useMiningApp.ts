'use client';

import { useState } from 'react';
import type { Woerterbuch } from '@/i18n';
import { useMining } from '@/hooks/useMining';
import { useMiningNativ } from '@/hooks/useMiningNativ';
import { nativMiningVerfuegbar } from '@/lib/native/nativMining';

/**
 * Welches Mining?
 *
 *   Android-App ab APK 1.0.9  -> useMiningNativ (der Dienst rechnet)
 *   alles andere              -> useMining (Worker im WebView, wie bisher)
 *
 * Die Mini App in Telegram, der Browser und aeltere APKs landen IMMER bei
 * useMining -- unveraendert. Die Wahl faellt einmal beim Einhaengen und
 * bleibt fest; die Reihenfolge der Hooks aendert sich also nie.
 */
export function useMiningApp(address: string | null, platform: string, t: Woerterbuch) {
  const [nativ] = useState(nativMiningVerfuegbar);
  const wahl = nativ ? useMiningNativ : useMining;
  return wahl(address, platform, t);
}
