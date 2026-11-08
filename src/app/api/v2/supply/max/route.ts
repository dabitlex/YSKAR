import { mengenLaden } from '@/lib/api/umlaufLaden';
import { ysrText } from '@/lib/api/umlauf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' };
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

/** GET /api/v2/supply/max -- nur die Zahl in YSR als Text (fuer Datenseiten wie CoinMarketCap). */
export async function GET() {
  try {
    const m = await mengenLaden();
    return new Response(ysrText(m.hoechst), {
      headers: { ...CORS, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=60' },
    });
  } catch {
    return new Response('chain_unreachable', { status: 503, headers: { ...CORS, 'content-type': 'text/plain; charset=utf-8' } });
  }
}
