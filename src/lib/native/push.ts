'use client';

import { istNativ } from './plattform';

/**
 * Benachrichtigungen (Android-App) -- Anmeldung des Geraets.
 *
 * Opt-in: Erst wenn der Nutzer es in den Einstellungen einschaltet, holt die
 * App ein FCM-Token und meldet es mit der Wallet-Adresse beim Server an.
 * Ausschalten loescht den Token dort. Was gemeldet wird, entscheidet der
 * Watcher auf dem Knoten (scripts/push-watcher.ts).
 *
 * Zwei Kanaele: "wallet" (Eingang, Bestaetigung, Blockfund) und "news".
 * Android laesst den Nutzer beide getrennt stummschalten. Die Kanalnamen
 * stehen in den Android-Einstellungen -- deshalb in der Sprache der App.
 */

const MERKER = 'yskar.push';          // localStorage: eingeschaltet ja/nein
const TOKEN = 'yskar.push.token';

export type PushStand = 'aus' | 'an' | 'verweigert' | 'nicht_nativ';

export function pushAktiv(): boolean {
  try { return localStorage.getItem(MERKER) === '1'; } catch { return false; }
}

/* Proxy nie direkt aus async zurueckgeben -- siehe biometrie.ts. */
async function plugin() {
  const m = await import('@capacitor/push-notifications');
  return { p: m.PushNotifications };
}

async function kanaele(sprache: string) {
  const p = (await plugin()).p;
  const en = sprache !== 'de';
  await p.createChannel({ id: 'wallet', name: 'Wallet',
                          description: en ? 'Incoming payments, confirmations, block finds' : 'Eingänge, Bestätigungen, Blockfunde',
                          importance: 4, visibility: 1, vibration: true });
  await p.createChannel({ id: 'news', name: en ? 'News' : 'Neuigkeiten',
                          description: en ? 'News about YSKAR' : 'Neuigkeiten zu YSKAR',
                          importance: 3, visibility: 1 });
}

/** Token holen (mit Erlaubnis-Dialog) -- null, wenn verweigert oder fehlgeschlagen. */
async function tokenHolen(sprache: string): Promise<string | null> {
  const p = (await plugin()).p;
  let erl = await p.checkPermissions();
  if (erl.receive === 'prompt' || erl.receive === 'prompt-with-rationale') erl = await p.requestPermissions();
  if (erl.receive !== 'granted') return null;
  await kanaele(sprache);
  return new Promise<string | null>(resolve => {
    let fertig = false;
    const ende = (t: string | null) => { if (!fertig) { fertig = true; resolve(t); } };
    p.addListener('registration', t => ende(t.value));
    p.addListener('registrationError', () => ende(null));
    p.register().catch(() => ende(null));
    setTimeout(() => ende(null), 15_000);
  });
}

export async function pushEinschalten(address: string, sprache: string): Promise<PushStand> {
  if (!istNativ()) return 'nicht_nativ';
  const token = await tokenHolen(sprache);
  if (!token) return 'verweigert';
  const res = await fetch('/api/v2/push/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, address, plattform: 'android', sprache }),
  });
  if (!res.ok) return 'aus';
  try { localStorage.setItem(MERKER, '1'); localStorage.setItem(TOKEN, token); } catch { /* egal */ }
  return 'an';
}

export async function pushAusschalten(): Promise<void> {
  let token: string | null = null;
  try { token = localStorage.getItem(TOKEN); } catch { /* egal */ }
  if (token) {
    await fetch('/api/v2/push/unregister', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }),
    }).catch(() => {});
  }
  try { localStorage.removeItem(MERKER); localStorage.removeItem(TOKEN); } catch { /* egal */ }
  try { (await plugin()).p.unregister(); } catch { /* egal */ }
}

/**
 * Beim Start: Token auffrischen (FCM tauscht ihn gelegentlich) und die
 * Anmeldung mit der aktuellen Adresse bestaetigen. Nur, wenn eingeschaltet.
 */
export async function pushAuffrischen(address: string, sprache: string): Promise<void> {
  if (!istNativ() || !pushAktiv()) return;
  const token = await tokenHolen(sprache).catch(() => null);
  if (!token) return;
  try { localStorage.setItem(TOKEN, token); } catch { /* egal */ }
  fetch('/api/v2/push/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, address, plattform: 'android', sprache }),
  }).catch(() => {});
}

/** Tipp auf eine Benachrichtigung: sagt, wohin die App springen soll. */
export async function pushBeiTipp(fn: (art: string, daten: Record<string, string>) => void): Promise<() => void> {
  if (!istNativ()) return () => {};
  const p = (await plugin()).p;
  const h = await p.addListener('pushNotificationActionPerformed', a => {
    const d = (a.notification.data ?? {}) as Record<string, string>;
    fn(d.art ?? '', d);
  });
  return () => { h.remove().catch(() => {}); };
}
