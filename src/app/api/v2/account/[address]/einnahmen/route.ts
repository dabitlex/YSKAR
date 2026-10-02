import { NextResponse } from 'next/server';
import { decodeAddress } from '@/lib/core/address';
import { einnahmenLaden, tageAus, zoneAus } from '@/lib/api/einnahmen';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' };
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

/**
 * GET /api/v2/account/:address/einnahmen?tage=30&tz=Europe/Berlin
 *
 * Je Kalendertag: Mining-Einnahmen (summe, bloecke -- Blockrewards und
 * Pool-Anteile) und daneben die empfangenen Ueberweisungen (eingaenge).
 * "tage" Tage bis heute (1..90, Vorgabe 30), aelteste zuerst, Tage ohne
 * Betrag mit 0. "tz" ist die Zeitzone des Geraets; ohne sie zaehlen die
 * Tage in UTC.
 */
export async function GET(
  req: Request, { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  let raw: Uint8Array;
  try { raw = decodeAddress(address); }
  catch { return NextResponse.json({ error: 'bad_address' }, { status: 400, headers: CORS }); }

  const url = new URL(req.url);
  const zone = zoneAus(url.searchParams.get('tz'));
  try {
    const tage = await einnahmenLaden(raw, tageAus(url.searchParams.get('tage')), zone);
    return NextResponse.json({ zone, tage }, { headers: CORS });
  } catch (e) {
    return NextResponse.json({ error: 'chain_unreachable', detail: (e as Error).message },
      { status: 503, headers: CORS });
  }
}
