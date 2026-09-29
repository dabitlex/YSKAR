import { NextResponse } from 'next/server';
import { db } from '@/lib/db/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

/** POST /api/v2/push/unregister { token } -- Token wird geloescht, nicht deaktiviert. */
export async function POST(req: Request) {
  let body: { token?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'malformed' }, { status: 400, headers: CORS });
  }
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!token) return NextResponse.json({ error: 'bad_token' }, { status: 400, headers: CORS });
  const { error } = await db().schema('chain2').from('push_geraete').delete().eq('token', token);
  if (error) return NextResponse.json({ error: 'db', detail: error.message }, { status: 500, headers: CORS });
  return NextResponse.json({ ok: true }, { headers: CORS });
}
