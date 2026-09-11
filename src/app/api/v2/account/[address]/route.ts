import { NextResponse } from 'next/server';
import { db } from '@/lib/db/service';
import { unprefix } from '@/lib/node/hex';
import { encodeAddress, decodeAddress } from '@/lib/core/address';
import { toHex, fromHex } from '@/lib/core/codec';

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

  const [{ data: acc }, { data: pending }, { count: mined }, { data: verlauf }] =
    await Promise.all([
      sb.from('accounts').select('balance, nonce, first_height, last_height')
        .eq('address', key).maybeSingle(),
      sb.from('mempool').select('txid, to_addr, amount, fee, nonce')
        .eq('from_addr', key).order('nonce'),
      sb.from('transactions').select('block_height', { count: 'exact', head: true })
        .eq('to_addr', key).eq('type', 0),
      // Verlauf: alles, was diese Adresse beruehrt, egal in welche Richtung.
      sb.from('transactions')
        .select('txid, block_height, type, from_addr, to_addr, amount, fee, memo')
        .or(`from_addr.eq.${key},to_addr.eq.${key}`)
        .order('block_height', { ascending: false }).limit(40),
    ]);

  // Blockzeiten dazu -- ohne sie waere der Verlauf ohne Zeitbezug.
  const hoehen = [...new Set((verlauf ?? []).map(t => t.block_height))];
  const { data: bloecke } = hoehen.length
    ? await sb.from('blocks').select('height, block_time').in('height', hoehen)
    : { data: [] };
  const zeit = new Map((bloecke ?? []).map(b => [b.height, String(b.block_time)]));

  return NextResponse.json({
    address,
    balance: acc?.balance ?? '0',
    // Die naechste Nonce, die eine Transaktion tragen muss. Ohne sie kann
    // die Wallet nicht signieren.
    nonce: acc?.nonce ?? '0',
    firstHeight: acc?.first_height ?? null,
    lastHeight: acc?.last_height ?? null,
    pending: (pending ?? []).map(p => ({
      txid: unprefix(p.txid as string),
      amount: p.amount, fee: p.fee, nonce: p.nonce,
    })),
    blocksFound: mined ?? 0,
    history: (verlauf ?? []).map(t => {
      const eingang = unprefix(t.to_addr) === toHex(raw);
      // Als bech32m, nicht als Rohbytes: Der Nutzer soll dieselbe
      // Zeichenkette sehen wie in seiner Wallet und sie vergleichen koennen.
      const gegenHex = unprefix(eingang ? t.from_addr : t.to_addr);
      return {
        txid: unprefix(t.txid),
        height: t.block_height,
        timestamp: zeit.get(t.block_height) ?? null,
        kind: t.type === 0 ? 'reward' : (eingang ? 'in' : 'out'),
        counterparty: gegenHex ? encodeAddress(fromHex(gegenHex)) : null,
        amount: String(t.amount),
        fee: String(t.fee),
        memo: unprefix(t.memo),
      };
    }),
  }, { headers: CORS });
}
