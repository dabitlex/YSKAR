import { NextResponse } from 'next/server';
import { db } from '@/lib/db/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' };
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

/**
 * GET /api/v2/finder -- wie viele Bloecke ein Pool gefunden hat und wie
 * viele ein einzelner Miner, gezaehlt ueber die ganze Kette.
 *
 * Aus dem Spiegel (chain2.finder_statistik, Migration 00023). Dieselbe
 * Regel wie in /api/v2/blocks: Coinbase mit mehr als einem Empfaenger =
 * Pool.
 *
 * Anders als die Bloecke selbst rechnet der Explorer diese Zahl NICHT im
 * Browser nach -- dafuer muesste er die ganze Kette laden. Er zeigt sie als
 * das, was sie ist: eine Zaehlung des Servers.
 */
export async function GET() {
  const { data, error } = await db().schema('chain2').rpc('finder_statistik');
  if (error) {
    return NextResponse.json({ error: 'chain_unreachable', detail: error.message },
      { status: 503, headers: CORS });
  }
  const zeile = (Array.isArray(data) ? data[0] : data) as { pool?: number | string; solo?: number | string } | null;
  const pool = Number(zeile?.pool ?? 0);
  const solo = Number(zeile?.solo ?? 0);
  return NextResponse.json({ pool, solo, blocks: pool + solo }, { headers: CORS });
}
