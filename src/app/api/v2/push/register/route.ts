import { NextResponse } from 'next/server';
import { db } from '@/lib/db/service';
import { isValidAddress } from '@/lib/core/address';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

/**
 * POST /api/v2/push/register  { token, address, plattform? }
 *
 * Ein Geraet meldet sich fuer Benachrichtigungen zu einer Adresse an. Ein
 * Token gehoert zu genau einer Adresse; meldet sich dasselbe Geraet mit
 * einer anderen Wallet, wird umgeschrieben -- die alte Zuordnung ist damit
 * weg, so soll es sein.
 *
 * Kein Nachweis, dass der Anmelder die Adresse besitzt. Das ist Absicht:
 * Wer eine fremde Adresse eintraegt, erfaehrt nur, was ohnehin oeffentlich
 * in der Kette steht -- und muss dafuer sein eigenes Geraet hergeben.
 */
export async function POST(req: Request) {
  let body: { token?: unknown; address?: unknown; plattform?: unknown; sprache?: unknown };
  try { body = await req.json(); } catch { return fehler('malformed'); }

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  const address = typeof body.address === 'string' ? body.address.trim().toLowerCase() : '';
  if (token.length < 20 || token.length > 4096) return fehler('bad_token');
  if (!isValidAddress(address)) return fehler('bad_address');
  const plattform = typeof body.plattform === 'string' ? body.plattform.slice(0, 20) : 'android';
  const sprache = typeof body.sprache === 'string' ? body.sprache.slice(0, 8) : 'en';

  const { error } = await db().schema('chain2').from('push_geraete')
    .upsert({ token, address, plattform, sprache, zuletzt: new Date().toISOString() },
            { onConflict: 'token' });
  if (error) return fehler('db', 500, error.message);
  return NextResponse.json({ ok: true }, { headers: CORS });
}

function fehler(code: string, status = 400, detail?: string) {
  return NextResponse.json({ error: code, detail }, { status, headers: CORS });
}
