import { NextResponse } from 'next/server';
import { db } from '@/lib/db/service';
import { unprefix } from '@/lib/node/hex';
import { encodeAddress } from '@/lib/core/address';
import { fromHex } from '@/lib/core/codec';
import { fullnodeLesen } from '@/lib/api/fullnode';

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

  /*
    Noch nicht in einem Block, aber eingereicht: Das weiss nur der Full Node.
    Der Mempool wird nicht nach Supabase gespiegelt -- er ist fluechtig und
    aendert sich hundertmal schneller als die Kette. Der Knoten liefert
    dazu den Warteplatz: im wievielten Block, an welcher Hoehe, in etwa wie
    vielen Minuten.
  */
  try {
    const offen = await fullnodeLesen<{ status?: string }>(`/api/v2/tx/${q}`);
    if (offen && offen.status === 'pending') {
      return NextResponse.json(offen, { headers: CORS });
    }
  } catch {
    // Knoten nicht erreichbar oder kennt sie nicht: dann eben nicht gefunden.
  }

  return NextResponse.json({ error: 'not_found' }, { status: 404, headers: CORS });
}
