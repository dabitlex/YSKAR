import { NextResponse } from 'next/server';
import { verify, bearer, issue, type Claims } from './auth/jwt.ts';

/** Ab wann ein Token im laufenden Betrieb erneuert wird. */
const RENEW_BEFORE_SECONDS = 900;   // 15 Minuten Restlaufzeit

export function ok(body: unknown, status = 200, renewedToken?: string) {
  const res = NextResponse.json(body, { status });
  if (renewedToken) res.headers.set('x-renewed-token', renewedToken);
  return res;
}

export function fail(reason: string, status = 400) {
  return NextResponse.json({ error: reason }, { status });
}

export interface Authed {
  claims: Claims;
  /**
   * Gesetzt, wenn der Token bald ablaeuft. Die Route gibt ihn ueber
   * ok(body, status, renewedToken) im Header x-renewed-token zurueck.
   *
   * Damit laeuft ein Token nie ab, solange die App offen ist und
   * regelmaessig Anfragen stellt -- der Client muss nichts wissen ausser
   * "wenn der Header kommt, den neuen Token uebernehmen".
   */
  renewedToken?: string;
}

export function authed(req: Request): Authed | { response: Response } {
  const secret = process.env.JWT_SECRET;
  if (!secret) return { response: fail('server_misconfigured', 500) };

  const token = bearer(req.headers.get('authorization'));
  if (!token) return { response: fail('missing_token', 401) };

  const res = verify(token, secret);
  if (!res.ok) return { response: fail(res.reason, 401) };

  const remaining = res.claims.exp - Math.floor(Date.now() / 1000);
  const renewedToken = remaining < RENEW_BEFORE_SECONDS
    ? issue(res.claims.sub, res.claims.tg, secret)
    : undefined;

  return { claims: res.claims, renewedToken };
}
