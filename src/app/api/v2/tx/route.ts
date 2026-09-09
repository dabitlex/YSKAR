import { NextResponse } from 'next/server';
import { submitTransaction } from '@/lib/node/node';
import { fromHex } from '@/lib/core/codec';

export const runtime = 'nodejs';

/**
 * POST /api/v2/tx   { raw: "<hex>" }
 *
 * Die Signatur IST die Berechtigung -- es braucht keine Anmeldung. Wer eine
 * gueltig signierte Transaktion einreicht, hat den passenden Schluessel.
 */
export async function POST(req: Request) {
  let body: { raw?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }
  if (!body.raw) return NextResponse.json({ error: 'missing_raw' }, { status: 400 });

  let raw: Uint8Array;
  try { raw = fromHex(body.raw); }
  catch { return NextResponse.json({ error: 'bad_hex' }, { status: 400 }); }
  if (raw.length > 1024) return NextResponse.json({ error: 'too_large' }, { status: 400 });

  const result = await submitTransaction(raw);
  return NextResponse.json(result, { status: result.accepted ? 200 : 400 });
}
