'use client';

import type { ReactNode } from 'react';

/**
 * Der Explorer unter der Adresse der Website.
 *
 * Aus der App und der Mini App heraus oeffnet er sich im Browser des
 * Nutzers, nicht in der App selbst: Dort hat er Platz, eine Adresszeile zum
 * Teilen und den Zurueck-Knopf des Browsers -- und die App bleibt daneben
 * offen, statt vom Explorer ersetzt zu werden.
 */
export const EXPLORER_URL = 'https://www.yskar.app/explorer';

/**
 * Adresse im Browser des Nutzers oeffnen.
 *
 *   Telegram      openLink -- der System-Browser, nicht der eingebaute.
 *   Android-App   Die Huelle reicht jede fremde Adresse an Android weiter;
 *                 das oeffnet den Standard-Browser.
 *   Browser       ein neuer Tab.
 *
 * Derselbe Weg wie beim APK-Hinweis (components/AppLaden.tsx).
 */
export function externOeffnen(url: string): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tg = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;
  if (tg?.openLink) {
    try { tg.openLink(url, { try_instant_view: false }); return; }
    catch { /* dann der gewoehnliche Weg */ }
  }
  window.open(url, '_blank', 'noopener');
}

/**
 * Ein Verweis nach draussen. Ohne Skript bleibt es ein gewoehnlicher Link
 * in einem neuen Tab; mit Skript geht er den Weg von externOeffnen().
 */
export function ExternLink({ href, className, children }: {
  href: string; className?: string; children: ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}
       onClick={e => { e.preventDefault(); externOeffnen(href); }}>
      {children}
    </a>
  );
}
