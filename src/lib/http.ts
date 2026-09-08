import { NextResponse } from 'next/server';
import { verify, bearer, type Claims } from './auth/jwt.ts';

export function ok(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export function fail(reason: string, status = 400) {
  return NextResponse.json({ error: reason }, { status });
}

/**
 * Authentifizierung eines Requests. Gibt bei Ablauf bewusst 401 zurueck --
 * der Client muss das erneuern, ohne die Mining-Session abzureissen.
 */
export function authed(req: Request): { claims: Claims } | { response: Response } {
  const secret = process.env.JWT_SECRET;
  if (!secret) return { response: fail('server_misconfigured', 500) };
  const token = bearer(req.headers.get('authorization'));
  if (!token) return { response: fail('missing_token', 401) };
  const res = verify(token, secret);
  if (!res.ok) return { response: fail(res.reason, 401) };
  return { claims: res.claims };
}
