import { NextResponse } from 'next/server';
import { db } from '@/lib/db/service';
import { unprefix } from '@/lib/node/hex';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
};
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

/**
 * GET /api/v2/sync?from=0&count=200
 *
 * Rohe Blockkoerper zum Selbstpruefen. Das ist die Route, ueber die ein
 * fremder Knoten die Kette holt und NACHRECHNET -- Header, Merkle-Wurzel,
 * Signaturen, Zustandswurzel.
 *
 * Stapelweise, weil ein Aufruf je Block bei rund 50.000 Bloecken im Jahr
 * unzumutbar waere. Bei zehn Minuten Blockzeit und einem Block von wenigen
 * hundert Byte sind 200 Stueck je Aufruf ein guter Schnitt.
 *
 * Der Koerper wird aus Header und Transaktionen zusammengesetzt, genau nach
 * dem Format aus src/lib/core/block.ts:
 *
 *   header(136) | u32 anzahl | je Transaktion: u32 laenge, bytes
 *
 * Er wird bewusst NICHT vorgehalten, sondern jedes Mal erzeugt: Eine zweite
 * Kopie derselben Daten koennte von der ersten abweichen, und dann haette
 * man zwei Wahrheiten.
 */

const MAX = 200;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = Math.max(0, Number(url.searchParams.get('from') ?? 0));
  const count = Math.min(MAX, Math.max(1, Number(url.searchParams.get('count') ?? 100)));

  if (!Number.isInteger(from)) {
    return NextResponse.json({ error: 'bad_from' }, { status: 400, headers: CORS });
  }

  const sb = db().schema('chain2');
  const bis = from + count - 1;

  const [{ data: bloecke, error: e1 }, { data: txs, error: e2 }] = await Promise.all([
    sb.from('blocks').select('height, hash, header, tx_count')
      .gte('height', from).lte('height', bis).order('height'),
    sb.from('transactions').select('block_height, idx, raw')
      .gte('block_height', from).lte('block_height', bis)
      .order('block_height').order('idx'),
  ]);

  if (e1 || e2) {
    return NextResponse.json(
      { error: 'chain_unreachable', detail: (e1 ?? e2)!.message },
      { status: 503, headers: CORS });
  }

  // Transaktionen nach Hoehe buendeln, Reihenfolge aus der Abfrage behalten.
  const nachHoehe = new Map<number, string[]>();
  for (const t of txs ?? []) {
    const liste = nachHoehe.get(t.block_height) ?? [];
    liste.push(unprefix(t.raw)!);
    nachHoehe.set(t.block_height, liste);
  }

  const out: { height: number; hash: string; body: string }[] = [];
  for (const b of bloecke ?? []) {
    const roh = nachHoehe.get(b.height) ?? [];
    // Die im Header eingetragene Anzahl muss stimmen, sonst waere der
    // Koerper falsch zusammengesetzt und jeder Pruefer wuerde ihn ablehnen
    // -- ohne zu wissen, dass der Fehler hier entstand.
    if (roh.length !== b.tx_count) {
      return NextResponse.json({
        error: 'inconsistent_block', height: b.height,
        detail: `Header nennt ${b.tx_count} Transaktionen, gefunden ${roh.length}`,
      }, { status: 500, headers: CORS });
    }
    out.push({
      height: b.height,
      hash: unprefix(b.hash)!,
      body: baueKoerper(unprefix(b.header)!, roh),
    });
  }

  return NextResponse.json({
    from, count: out.length,
    blocks: out,
    // Damit der Abrufer weiss, ob noch etwas kommt.
    tip: (await sb.from('blocks').select('height')
      .order('height', { ascending: false }).limit(1).maybeSingle()).data?.height ?? null,
  }, { headers: CORS });
}

/** header | u32 anzahl | (u32 laenge, bytes)* -- alles Little-Endian. */
function baueKoerper(headerHex: string, txsHex: string[]): string {
  const u32 = (n: number) => {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, true);
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  };
  let out = headerHex + u32(txsHex.length);
  for (const t of txsHex) out += u32(t.length / 2) + t;
  return out;
}
