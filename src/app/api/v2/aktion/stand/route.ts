import { NextResponse } from 'next/server';
import { stand } from '@/lib/aktion/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/v2/aktion/stand  { initData } -- eigene Lose, Empfehlungen, Gewinn. */
export async function POST(req: Request) {
  let b: { initData?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'malformed' }, { status: 400 }); }
  const r = await stand(typeof b.initData === 'string' ? b.initData : '');
  if (!r.ok) {
    const status = r.fehler === 'nicht_eingerichtet' ? 503 : r.fehler === 'initdata' ? 401 : 404;
    return NextResponse.json({ error: r.fehler }, { status });
  }
  return NextResponse.json(r.stand, { headers: { 'cache-control': 'no-store' } });
}
