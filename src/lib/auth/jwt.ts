import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

/**
 * Minimales HS256-JWT ohne Fremdbibliothek.
 *
 * Zweck: Die initData-Prüfung läuft einmal beim Login. Danach trägt ein
 * kurzlebiges eigenes Token die Session. Bei einem Share alle 30 Sekunden
 * wäre eine erneute HMAC-Prüfung der initData reine Verschwendung.
 *
 * Laufzeit ist bewusst kurz. Der Client muss den 401-Fall sauber behandeln
 * und erneuern -- ein abgelaufenes Token darf keine laufende Mining-Session
 * stillschweigend abreißen lassen.
 */

const ALG = { alg: 'HS256', typ: 'JWT' } as const;

export interface Claims {
  sub: string;        // users.id
  tg: number;         // telegram_id
  jti: string;
  iat: number;
  exp: number;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url');
}

function sign(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('base64url');
}

export function issue(
  userId: string,
  telegramId: number,
  secret: string,
  ttlSeconds = 3600,
): string {
  const now = Math.floor(Date.now() / 1000);
  const claims: Claims = {
    sub: userId,
    tg: telegramId,
    jti: randomUUID(),
    iat: now,
    exp: now + ttlSeconds,
  };
  const head = b64url(JSON.stringify(ALG));
  const body = b64url(JSON.stringify(claims));
  return `${head}.${body}.${sign(`${head}.${body}`, secret)}`;
}

export type VerifyResult =
  | { ok: true; claims: Claims }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

export function verify(token: string, secret: string): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [head, body, sig] = parts;

  const expected = Buffer.from(sign(`${head}.${body}`, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: 'bad_signature' };
  }

  let claims: Claims;
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Claims;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof claims.exp !== 'number' || typeof claims.sub !== 'string') {
    return { ok: false, reason: 'malformed' };
  }
  if (claims.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, claims };
}

/** Bearer-Token aus dem Authorization-Header ziehen. */
export function bearer(header: string | null): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1] : null;
}
