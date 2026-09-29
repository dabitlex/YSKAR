/**
 * Firebase Cloud Messaging, HTTP v1 -- ohne Firebase-SDK.
 *
 * Der Versand braucht ein OAuth2-Zugriffstoken, das aus dem Dienstkonto
 * (service account) der Firebase-Konsole abgeleitet wird: ein signiertes JWT
 * (RS256) wird gegen ein Token getauscht, das eine Stunde gilt. Das ist
 * wenig genug Code, um ihn selbst zu schreiben -- und erspart eine
 * Abhaengigkeit mit Dutzenden Unterpaketen auf dem Knoten.
 *
 * Nichts hier kennt die Kette. Wer was gemeldet bekommt, entscheidet der
 * Watcher.
 */
import { createSign } from 'node:crypto';

export interface Dienstkonto {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export interface Nachricht {
  titel: string;
  text: string;
  /** Frei waehlbare Schluessel, kommen in der App als data an. */
  daten?: Record<string, string>;
  /** Android-Kanal; die App legt "wallet" und "news" an. */
  kanal?: 'wallet' | 'news';
}

export type SendeErgebnis =
  | { ok: true; id: string }
  | { ok: false; status: number; grund: string; /** Token ist tot, austragen. */ ungueltig: boolean };

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Signiertes JWT fuer den Token-Tausch. Exportiert, damit es testbar ist. */
export function dienstJwt(konto: Dienstkonto, jetzt = Math.floor(Date.now() / 1000)): string {
  const kopf = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const rumpf = b64url(JSON.stringify({
    iss: konto.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: konto.token_uri ?? 'https://oauth2.googleapis.com/token',
    iat: jetzt, exp: jetzt + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${kopf}.${rumpf}`);
  const sig = b64url(signer.sign(konto.private_key));
  return `${kopf}.${rumpf}.${sig}`;
}

export class Fcm {
  private token: { wert: string; bis: number } | null = null;
  private konto: Dienstkonto;
  private fetchFn: typeof fetch;

  // Kein Parameter-Property: Node fuehrt TypeScript nur mit entfernten
  // Typen aus, und diese Schreibweise erzeugt Code.
  constructor(konto: Dienstkonto, fetchFn: typeof fetch = fetch) {
    this.konto = konto;
    this.fetchFn = fetchFn;
  }

  static ausJson(text: string): Fcm {
    const k = JSON.parse(text) as Dienstkonto;
    if (!k.project_id || !k.client_email || !k.private_key) {
      throw new Error('Dienstkonto unvollstaendig: project_id, client_email, private_key noetig');
    }
    return new Fcm(k);
  }

  private async zugriff(): Promise<string> {
    const jetzt = Date.now();
    if (this.token && this.token.bis > jetzt + 60_000) return this.token.wert;
    const res = await this.fetchFn(this.konto.token_uri ?? 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: dienstJwt(this.konto),
      }),
    });
    if (!res.ok) throw new Error(`Token-Tausch fehlgeschlagen: HTTP ${res.status} ${await res.text()}`);
    const j = await res.json() as { access_token: string; expires_in: number };
    this.token = { wert: j.access_token, bis: jetzt + j.expires_in * 1000 };
    return j.access_token;
  }

  /** Eine Nachricht an ein Geraet. Wirft nicht -- der Watcher entscheidet. */
  async senden(geraeteToken: string, n: Nachricht): Promise<SendeErgebnis> {
    let zugriff: string;
    try { zugriff = await this.zugriff(); }
    catch (e) { return { ok: false, status: 0, grund: String((e as Error).message), ungueltig: false }; }

    const body = {
      message: {
        token: geraeteToken,
        notification: { title: n.titel, body: n.text },
        data: n.daten ?? {},
        android: {
          priority: 'HIGH',
          notification: { channel_id: n.kanal ?? 'wallet', sound: 'default' },
        },
      },
    };
    const res = await this.fetchFn(
      `https://fcm.googleapis.com/v1/projects/${this.konto.project_id}/messages:send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${zugriff}` },
        body: JSON.stringify(body),
      });
    if (res.ok) {
      const j = await res.json() as { name?: string };
      return { ok: true, id: j.name ?? '' };
    }
    const text = await res.text();
    // UNREGISTERED / INVALID_ARGUMENT bei 404/400: Das Geraet gibt es nicht mehr.
    const ungueltig = res.status === 404
      || (res.status === 400 && /INVALID_ARGUMENT|not a valid FCM registration token/i.test(text));
    return { ok: false, status: res.status, grund: text.slice(0, 300), ungueltig };
  }
}
