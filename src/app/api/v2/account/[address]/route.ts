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

  const [{ data: acc }, { data: pending }, { count: mined }, { data: verlauf },
         { data: poolAnteile }] =
    await Promise.all([
      sb.from('accounts').select('balance, nonce, first_height, last_height')
        .eq('address', key).maybeSingle(),
      sb.from('mempool').select('txid, to_addr, amount, fee, nonce')
        .eq('from_addr', key).order('nonce'),
      sb.from('transactions').select('block_height', { count: 'exact', head: true })
        .eq('to_addr', key).eq('type', 0),
      // Verlauf: alles, was diese Adresse beruehrt, egal in welche Richtung.
      sb.from('transactions')
        .select('txid, block_height, type, from_addr, to_addr, amount, fee, memo, coinbase_outputs')
        .or(`from_addr.eq.${key},to_addr.eq.${key}`)
        .order('block_height', { ascending: false }).limit(40),
      /*
        Coinbase mit mehreren Empfaengern.

        Bei Fassung 2 steht in to_addr NICHTS -- die Aufteilung liegt in
        coinbase_outputs. Wer ueber einen Pool bezahlt wird, faende seinen
        Eingang sonst nirgends: nicht im Verlauf, nicht in der Zahl der
        gefundenen Bloecke. Das Guthaben stimmte, die Herkunft waere
        unsichtbar.
      */
      sb.from('transactions')
        .select('txid, block_height, type, amount, memo, coinbase_outputs')
        .contains('coinbase_outputs', JSON.stringify([{ to: key.replace(/^\\x/, '') }]))
        .order('block_height', { ascending: false }).limit(40),
    ]);

  /*
    Pool-Anteile in den Verlauf einreihen.

    Sie kommen aus einer eigenen Abfrage, weil sie in to_addr nicht zu
    finden sind. Zusammengefuehrt und nach Hoehe sortiert, damit der Nutzer
    eine Liste sieht und nicht zwei.
  */
  const key_hex = toHex(raw);
  const ausPool = (poolAnteile ?? []).flatMap(t => {
    const outs = (t.coinbase_outputs ?? []) as { to: string; amount: string }[];
    const meiner = outs.find(o => unprefix(o.to) === key_hex);
    if (!meiner) return [];
    return [{
      txid: t.txid, block_height: t.block_height, type: t.type,
      from_addr: null, to_addr: null,
      amount: meiner.amount, fee: '0', memo: t.memo,
      poolAnteil: true,
      empfaenger: outs.length,
    }];
  });

  const zusammen = [...(verlauf ?? []).map(t => ({ ...t, poolAnteil: false, empfaenger: 1 })),
                    ...ausPool]
    .sort((a, b) => b.block_height - a.block_height)
    .slice(0, 40);

  // Blockzeiten dazu -- ohne sie waere der Verlauf ohne Zeitbezug.
  const hoehen = [...new Set(zusammen.map(t => t.block_height))];
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
    /** Bloecke, an deren Coinbase diese Adresse beteiligt war. */
    poolRewards: ausPool.length,
    history: zusammen.map(t => {
      const eingang = unprefix(t.to_addr) === toHex(raw);
      // Als bech32m, nicht als Rohbytes: Der Nutzer soll dieselbe
      // Zeichenkette sehen wie in seiner Wallet und sie vergleichen koennen.
      const gegenHex = unprefix(eingang ? t.from_addr : t.to_addr);
      return {
        txid: unprefix(t.txid),
        height: t.block_height,
        timestamp: zeit.get(t.block_height) ?? null,
        kind: t.type === 0
          ? (t.poolAnteil ? 'pool' : 'reward')
          : (eingang ? 'in' : 'out'),
        counterparty: gegenHex ? encodeAddress(fromHex(gegenHex)) : null,
        // Bei einem Pool-Anteil: wie viele sich den Block geteilt haben.
        shares: t.poolAnteil ? t.empfaenger : undefined,
        amount: String(t.amount),
        fee: String(t.fee),
        memo: unprefix(t.memo),
      };
    }),
  }, { headers: CORS });
}
