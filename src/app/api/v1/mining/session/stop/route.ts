import { authed, ok, fail } from '@/lib/http';
import { db } from '@/lib/db/service';

export const runtime = 'nodejs';

/** POST /api/v1/mining/session/stop -- sauberes Beenden beim Schliessen der App. */
export async function POST(req: Request) {
  const auth = authed(req);
  if ('response' in auth) return auth.response;

  const { error } = await db().from('mining_sessions')
    .update({ status: 'stopped' })
    .eq('user_id', auth.claims.sub)
    .eq('status', 'active');

  return error ? fail('stop_failed', 500) : ok({ stopped: true }, 200, auth.renewedToken);
}
