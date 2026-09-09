import { NextResponse } from 'next/server';
import { db } from '@/lib/db/service';
import { unprefix } from '@/lib/node/hex';
import { encodeAddress } from '@/lib/core/address';
import { fromHex } from '@/lib/core/codec';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' };
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

/** GET /api/v2/blocks/:height -- Block samt aller Transaktionen. */
export async function GET(
  _req: Request, { params }: { params: Promise<{ height: string }> },
) {
  const { height: raw } = await params;
  const height = Number(raw);
  if (!Number.isInteger(height) || height < 0) {
    return NextResponse.json({ error: 'bad_height' }, { status: 400, headers: CORS });
  }

  const sb = db().schema('chain2');
  const [{ data: block, error }, { data: txs }] = await Promise.all([
    sb.from('blocks').select('*').eq('height', height).maybeSingle(),
    sb.from('transactions').select('*').eq('block_height', height).order('idx'),
  ]);

  if (error) {
    return NextResponse.json({ error: 'chain_unreachable', detail: error.message },
      { status: 503, headers: CORS });
  }
  if (!block) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: CORS });

  const adr = (v: string | null) => {
    const hex = unprefix(v);
    // Adressen als bech32m ausgeben, nicht als Rohbytes: So sieht der Nutzer
    // dieselbe Zeichenkette wie in seiner Wallet.
    return hex ? encodeAddress(fromHex(hex)) : null;
  };

  return NextResponse.json({
    height: block.height,
    hash: unprefix(block.hash),
    prevHash: unprefix(block.prev_hash),
    merkleRoot: unprefix(block.merkle_root),
    stateRoot: unprefix(block.state_root),
    timestamp: String(block.block_time),
    difficulty: Number(block.difficulty),
    txCount: block.tx_count,
    extranonce: String(block.extranonce),
    nonce: String(block.nonce),
    header: unprefix(block.header),
    sizeBytes: block.size_bytes,
    txs: (txs ?? []).map(t => ({
      txid: unprefix(t.txid),
      idx: t.idx,
      type: t.type === 0 ? 'coinbase' : 'transfer',
      from: adr(t.from_addr),
      to: adr(t.to_addr),
      amount: String(t.amount),
      fee: String(t.fee),
      nonce: t.nonce === null ? null : String(t.nonce),
      memo: unprefix(t.memo),
      raw: unprefix(t.raw),
    })),
  }, { headers: CORS });
}
