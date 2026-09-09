import { NextResponse } from 'next/server';
import { db } from '@/lib/db/service';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: { sessionId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }
  if (!body.sessionId) return NextResponse.json({ error: 'missing_session' }, { status: 400 });

  await db().schema('chain2').from('sessions')
    .update({ status: 'stopped' }).eq('id', body.sessionId).eq('status', 'active');
  return NextResponse.json({ stopped: true });
}
