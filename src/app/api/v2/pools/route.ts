import { NextResponse } from 'next/server';
import { poolListe } from '@/lib/api/pools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' };
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

/**
 * GET /api/v2/pools -- die Pools der Liste mit ihrem Stand.
 *
 *   { stand, pools: [{ host, name, kette, status, belegt, plaetze, frei,
 *                      hashrate, feeBps, bloecke }] }
 *
 * status: offen | voll | unbekannt | keinPool | aus  (lib/pool/verzeichnis.ts)
 *
 * Miner, Plaetze, Leistung und Gebuehr sind Selbstauskunft des Pools;
 * `bloecke` ist aus der Kette gezaehlt. Rund 20 Sekunden alt, hoechstens:
 * 10 im Server, 10 im Zwischenspeicher davor. Bewusst OHNE
 * stale-while-revalidate -- das lieferte eine weitere Minute lang den Stand
 * von vorhin, und "voll" von vorhin sperrt einen Pool, der laengst Platz hat.
 */
export async function GET() {
  const liste = await poolListe();
  return NextResponse.json(liste, {
    headers: { ...CORS, 'cache-control': 'public, max-age=0, s-maxage=10' },
  });
}
