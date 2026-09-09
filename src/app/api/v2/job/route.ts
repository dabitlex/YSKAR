import { NextResponse } from 'next/server';
import { createJob } from '@/lib/node/node';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v2/job?session=<uuid>
 *
 * Jede Session bekommt einen EIGENEN Job: Die Coinbase geht an ihre Adresse,
 * und weil state_root auf den Zustand nach dem Block verpflichtet,
 * unterscheiden sich merkle_root und state_root zwischen zwei Minern
 * zwangslaeufig.
 */
export async function GET(req: Request) {
  const session = new URL(req.url).searchParams.get('session');
  if (!session) return NextResponse.json({ error: 'missing_session' }, { status: 400 });
  try {
    return NextResponse.json(await createJob(session));
  } catch (e) {
    const msg = (e as Error).message;
    const status = msg === 'session_inactive' ? 409 : msg === 'no_genesis' ? 503 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
