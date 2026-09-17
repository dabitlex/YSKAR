import { NextResponse } from 'next/server';
import { db } from '@/lib/db/service';
import { unprefix } from '@/lib/node/hex';
import { encodeAddress } from '@/lib/core/address';
import { fromHex } from '@/lib/core/codec';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = { 'access-control-allow-origin': '*' };

/**
 * GET /api/v2/tx/<txid>
 *
 * Eine einzelne Transaktion mit allem, was zum Nachrechnen noetig ist --
 * einschliesslich der rohen Bytes. Wer ihr nicht glaubt, kann sie selbst
 * serialisieren und den txid nachrechnen.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ txid: string }> },
) {
  const { txid } = await params;
  const q = txid.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(q)) {
    return NextResponse.json({ error: 'bad_txid' }, { status: 400, headers: CORS });
  }

  const adr = (v: string | null) =>
    v ? encodeAddress(fromHex(unprefix(v))) : null;

  const { data: t } = await db().schema('chain2').from('transactions')
    .select('*').eq('txid', '\\x' + q).maybeSingle();

  if (t) {
    const { data: block } = await db().schema('chain2').from('blocks')
      .select('hash, block_time').eq('height', t.block_height).maybeSingle();

    return NextResponse.json({
      txid: q,
      status: 'confirmed',
      height: t.block_height,
      blockHash: block ? unprefix(block.hash) : null,
      timestamp: block ? String(block.block_time) : null,
      idx: t.idx,
      type: t.type === 0 ? 'coinbase' : 'transfer',
      from: adr(t.from_addr),
      to: adr(t.to_addr),
      amount: String(t.amount),
      fee: String(t.fee),
      nonce: t.nonce === null ? null : String(t.nonce),
      validUntil: t.valid_until,
      memo: unprefix(t.memo),
      // Bei einer Coinbase mit mehreren Empfaengern ist "to" leer und
      // "amount" die Gesamtsumme. Ohne diese Liste saehe es aus, als haette
      // niemand etwas bekommen.
      recipients: t.coinbase_outputs
        ? (t.coinbase_outputs as { to: string; amount: string }[]).map(o => ({
            address: adr(o.to), amount: String(o.amount),
          }))
        : null,
      raw: unprefix(t.raw),
    }, { headers: CORS });
  }

  // Noch nicht in einem Block, aber eingereicht.
  const { data: offen } = await db().schema('chain2').from('mempool')
    .select('*').eq('txid', '\\x' + q).maybeSingle();

  if (offen) {
    return NextResponse.json({
      txid: q,
      status: 'pending',
      height: null, blockHash: null, timestamp: null,
      type: 'transfer',
      from: adr(offen.from_addr),
      to: adr(offen.to_addr),
      amount: String(offen.amount),
      fee: String(offen.fee),
      nonce: String(offen.nonce),
      validUntil: offen.valid_until,
      memo: unprefix(offen.memo),
      recipients: null,
      raw: unprefix(offen.raw),
    }, { headers: CORS });
  }

  return NextResponse.json({ error: 'not_found' }, { status: 404, headers: CORS });
}
