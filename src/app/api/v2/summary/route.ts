import { NextResponse } from 'next/server';
import { unprefix } from '@/lib/node/hex';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' };
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

/** GET /api/v2/summary -- Kennzahlen der Kette, oeffentlich. */
export async function GET() {
  const fullnodeUrl = process.env.YSKAR_FULLNODE_URL;

  if (!fullnodeUrl) {
    return NextResponse.json(
      { error: 'fullnode_not_configured', detail: 'YSKAR_FULLNODE_URL is not configured' },
      { status: 503, headers: CORS },
    );
  }

  try {
    const response = await fetch(`${fullnodeUrl}/api/v2/summary`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'chain_unreachable', detail: `Fullnode returned HTTP ${response.status}` },
        { status: 503, headers: CORS },
      );
    }

    const summary = await response.json();

    return NextResponse.json({
      token: summary.token ?? null,
      height: summary.height ?? null,
      nextHeight: summary.nextHeight ?? 0,
      difficulty: summary.difficulty ?? null,
      hashrate: summary.hashrate ?? null,
      targetBlockTime: summary.targetBlockTime ?? null,
      tipHash: unprefix(summary.tipHash as string | undefined),
      stateHeight: summary.stateHeight ?? -1,
      stateRoot: unprefix(summary.stateRoot as string | undefined),
      totalSupply: summary.totalSupply ?? '0',
      maxSupply: summary.maxSupply ?? '0',
      nextReward: summary.nextReward ?? '0',
      mempool: summary.mempool ?? 0,
      /** Aus der Fullnode -- basiert auf den dort validierten Mining-Daten. */
      minerHashrate: summary.minerHashrate ?? null,
      /** Sessions, die laut Fullnode aktuell aktiv sind. */
      miningSessions: summary.miningSessions ?? 0,
      activeMiners: summary.activeMiners ?? 0,
      /** Knoten, deren Miner in activeMiners und minerHashrate mitzaehlen. */
      knoten: summary.knoten ?? 1,
    }, { headers: CORS });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'chain_unreachable',
        detail: error instanceof Error ? error.message : 'Unable to reach Fullnode',
      },
      { status: 503, headers: CORS },
    );
  }
}
