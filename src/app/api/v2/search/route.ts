import { NextResponse } from 'next/server';
import { db } from '@/lib/db/service';
import { unprefix } from '@/lib/node/hex';
import { decodeAddress, encodeAddress } from '@/lib/core/address';
import { toHex, fromHex } from '@/lib/core/codec';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = { 'access-control-allow-origin': '*' };

/**
 * GET /api/v2/search?q=…
 *
 * Findet heraus, WAS gesucht wurde, und liefert nur den Verweis -- die
 * Einzelheiten holt der Aufrufer bei der zustaendigen Route.
 *
 * Das ist Absicht: Eine Suche, die gleich alle Daten mitliefert, verdoppelt
 * die Aufbereitung aus drei anderen Routen und laeuft mit ihnen
 * auseinander, sobald sich dort etwas aendert.
 *
 * Erkannt werden:
 *   ysr1…          Adresse
 *   64 Hexzeichen  Blockhash oder Transaktionskennung
 *   Ziffern        Blockhoehe
 *
 * Die 64 Hexzeichen sind zweideutig. Geprueft wird erst gegen die Bloecke,
 * dann gegen die Transaktionen -- und das Ergebnis sagt, was es geworden
 * ist. Zu raten und danebenzuliegen waere schlimmer als zwei Abfragen.
 */
export async function GET(req: Request) {
  const roh = (new URL(req.url).searchParams.get('q') ?? '').trim();
  if (!roh) return NextResponse.json({ kind: 'leer' }, { headers: CORS });

  const q = roh.toLowerCase();

  // --- Adresse ---
  if (q.startsWith('ysr1')) {
    let bytes: Uint8Array;
    try { bytes = decodeAddress(q); }
    catch { return nichts('Keine gültige YSKAR-Adresse.'); }

    const { data } = await db().schema('chain2').from('accounts')
      .select('balance, first_height').eq('address', '\\x' + toHex(bytes)).maybeSingle();

    return NextResponse.json({
      kind: 'address',
      address: encodeAddress(bytes),
      // Auch unbekannte Adressen sind gueltig -- sie hatten nur noch nie
      // Guthaben. Das ist kein Fehler und wird auch nicht so genannt.
      bekannt: !!data,
      balance: data?.balance ?? '0',
    }, { headers: CORS });
  }

  // --- Blockhoehe ---
  if (/^\d+$/.test(q)) {
    const hoehe = Number(q);
    if (!Number.isSafeInteger(hoehe) || hoehe < 0) return nichts('Ungültige Höhe.');
    const { data } = await db().schema('chain2').from('blocks')
      .select('height').eq('height', hoehe).maybeSingle();
    return data
      ? NextResponse.json({ kind: 'block', height: hoehe }, { headers: CORS })
      : nichts(`Block ${hoehe} gibt es (noch) nicht.`);
  }

  // --- 64 Hexzeichen: Blockhash oder Transaktion ---
  if (/^[0-9a-f]{64}$/.test(q)) {
    const bytea = '\\x' + q;

    const { data: block } = await db().schema('chain2').from('blocks')
      .select('height').eq('hash', bytea).maybeSingle();
    if (block) {
      return NextResponse.json({ kind: 'block', height: block.height },
        { headers: CORS });
    }

    const { data: tx } = await db().schema('chain2').from('transactions')
      .select('txid, block_height').eq('txid', bytea).maybeSingle();
    if (tx) {
      return NextResponse.json({
        kind: 'tx', txid: unprefix(tx.txid), height: tx.block_height,
      }, { headers: CORS });
    }

    // Noch im Mempool? Dann gibt es sie, nur noch nicht in einem Block.
    const { data: offen } = await db().schema('chain2').from('mempool')
      .select('txid').eq('txid', bytea).maybeSingle();
    if (offen) {
      return NextResponse.json({
        kind: 'tx', txid: q, height: null, pending: true,
      }, { headers: CORS });
    }

    return nichts('Kein Block und keine Transaktion mit diesem Hash.');
  }

  return nichts('Adresse, Transaktion, Blockhöhe oder Blockhash eingeben.');
}

function nichts(hinweis: string) {
  return NextResponse.json({ kind: 'nichts', hinweis }, { headers: CORS });
}
