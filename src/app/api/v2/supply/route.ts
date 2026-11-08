import { NextResponse } from 'next/server';
import { mengenLaden } from '@/lib/api/umlaufLaden';
import { NULL_ADRESSE, ysrText } from '@/lib/api/umlauf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' };
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

/** GET /api/v2/supply -- Mengen in YSR (Dezimaltext) mit Hoehe und gesperrter Adresse. */
export async function GET() {
  try {
    const m = await mengenLaden();
    return NextResponse.json({
      height: m.hoehe,
      circulating: ysrText(m.umlauf),
      total: ysrText(m.umlauf),
      max: ysrText(m.hoechst),
      minted: ysrText(m.erzeugt),
      unspendable: ysrText(m.gesperrt),
      unspendableAddress: NULL_ADRESSE,
    }, { headers: { ...CORS, 'cache-control': 'public, max-age=60' } });
  } catch (e) {
    return NextResponse.json(
      { error: 'chain_unreachable', detail: e instanceof Error ? e.message : 'unknown' },
      { status: 503, headers: CORS },
    );
  }
}
