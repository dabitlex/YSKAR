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
  /*
    Eigener Typ fuer die Zeile.

    supabase-js leitet den Typ aus der select-Zeichenkette ab und kennt die
    ::text-Schreibweise nicht -- es faellt dann auf einen Fehlertyp zurueck.
    Die Abfrage laeuft korrekt, nur die Typableitung nicht.
  */
  type BlockZeile = {
    height: number; hash: string; version: number;
    prev_hash: string; merkle_root: string; state_root: string;
    block_time: string; difficulty: number; tx_count: number;
    extranonce: string; nonce: string;
    header: string; size_bytes: number; received_at: string;
  };

  const [{ data: rohBlock, error }, { data: txs }] = await Promise.all([
    /*
      extranonce und nonce ausdruecklich als TEXT holen.

      Die Spalten sind numeric(20,0), und PostgREST liefert numeric als
      JSON-ZAHL. JavaScript kann Zahlen ueber 2^53 nicht exakt darstellen --
      aus 13111268702705097209 wurde 13111268702705097000, und der daraus
      gebaute Header ergab einen anderen Hash. Der Explorer meldete dann
      "Hash stimmt NICHT" fuer einen voellig gueltigen Block.

      Mit ::text kommt die Zahl unveraendert an. Ein "*" waere hier also
      falsch, obwohl es alle Spalten holt.
    */
    sb.from('blocks')
      .select('height, hash, version, prev_hash, merkle_root, state_root, '
        + 'block_time, difficulty, tx_count, extranonce::text, nonce::text, '
        + 'header, size_bytes, received_at')
      .eq('height', height).maybeSingle(),
    sb.from('transactions').select('*').eq('block_height', height).order('idx'),
  ]);

  const block = rohBlock as unknown as BlockZeile | null;

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
      /*
        Coinbase mit mehreren Empfaengern.

        Bei Fassung 2 ist "to" leer und "amount" die Gesamtsumme. Nur das
        zu zeigen waere irrefuehrend: Es saehe aus, als haette niemand
        etwas bekommen. Die Aufteilung gehoert sichtbar in den Explorer --
        genau das ist der Sinn einer Auszahlung ueber die Kette.
      */
      recipients: t.coinbase_outputs
        ? (t.coinbase_outputs as { to: string; amount: string }[]).map(o => ({
            address: adr(o.to), amount: String(o.amount),
          }))
        : null,
    })),
  }, { headers: CORS });
}
