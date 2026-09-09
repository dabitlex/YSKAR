import { NextResponse } from 'next/server';
import { submitShare } from '@/lib/node/share';

export const runtime = 'nodejs';

/** POST /api/v2/share   { sessionId, jobId, nonce } */
export async function POST(req: Request) {
  let body: { sessionId?: string; jobId?: string; nonce?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }

  if (!body.sessionId || !body.jobId || body.nonce === undefined) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  let nonce: bigint;
  try {
    nonce = BigInt(body.nonce);
    if (nonce < 0n || nonce > 0xffffffffffffffffn) throw new Error();
  } catch { return NextResponse.json({ error: 'bad_nonce' }, { status: 400 }); }

  return NextResponse.json(await submitShare(body.sessionId, body.jobId, nonce));
}
