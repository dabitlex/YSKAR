import { NextResponse } from 'next/server';
import { db } from '@/lib/db/service';
import { decodeAddress } from '@/lib/core/address';
import { toHex } from '@/lib/core/codec';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' };
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

/** GET /api/v2/account/:address -- Guthaben, Nonce und offene Transaktionen. */
export async function GET(
  _req: Request, { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  let raw: Uint8Array;
  try { raw = decodeAddress(address); }
  catch { return NextResponse.json({ error: 'bad_address' }, { status: 400, headers: CORS }); }

  const key = '\\x' + toHex(raw);
  const sb = db().schema('chain2');

  const [{ data: acc }, { data: pending }, { data: mined }] = await Promise.all([
    sb.from('accounts').select('balance, nonce, first_height, last_height')
      .eq('address', key).maybeSingle(),
    sb.from('mempool').select('txid, to_addr, amount, fee, nonce')
      .eq('from_addr', key).order('nonce'),
    sb.from('transactions').select('block_height', { count: 'exact', head: true })
      .eq('to_addr', key).eq('type', 0),
  ]);

  return NextResponse.json({
    address,
    balance: acc?.balance ?? '0',
    // Die naechste Nonce, die eine Transaktion tragen muss. Ohne sie kann
    // die Wallet nicht signieren.
    nonce: acc?.nonce ?? '0',
    firstHeight: acc?.first_height ?? null,
    lastHeight: acc?.last_height ?? null,
    pending: (pending ?? []).map(p => ({
      txid: (p.txid as string).replace(/^\\\\x/, ''),
      amount: p.amount, fee: p.fee, nonce: p.nonce,
    })),
    blocksFound: mined ?? 0,
  }, { headers: CORS });
}
