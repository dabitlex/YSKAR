/**
 * GET /api/v2/fees[?fee=<betrag>]
 *
 * Auskunft ueber die Marktlage. KEINE Konsensregel -- nichts hier
 * entscheidet, ob eine Transaktion gueltig ist. Wer weniger als die
 * empfohlene Gebuehr zahlt, wartet laenger; abgelehnt wird er nicht.
 *
 * WARUM DAS DURCHGEREICHT WIRD UND NICHT SELBST GERECHNET
 *
 * Die Gebuehrenlage haengt am Mempool, und der Mempool ist fluechtig: Er
 * lebt im Full Node und wird nicht nach Supabase gespiegelt. Wer die Antwort
 * aus dem Spiegel rechnet, liest dort dauerhaft einen leeren Mempool und
 * empfiehlt bei jedem Andrang die Mindestgebuehr -- eine Auskunft, die
 * immer freundlich und bei Andrang falsch ist.
 *
 * Das Antwortformat des Knotens ist Feld fuer Feld dasselbe, das hier
 * frueher gebaut wurde (ReadApi.fees). Durchreichen ist deshalb verlustfrei.
 */
import { NextResponse } from 'next/server';
import { fullnodeLesen, FullnodeFehler } from '@/lib/api/fullnode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' };
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

export async function GET(req: Request) {
  // Nur die eine Angabe weiterreichen, die der Knoten kennt -- nicht die
  // ganze Query, damit sich nichts Fremdes an den Knoten haengen kann.
  const roh = new URL(req.url).searchParams.get('fee');
  const pfad = roh !== null && /^\d+$/.test(roh)
    ? `/api/v2/fees?fee=${roh}`
    : '/api/v2/fees';

  try {
    return NextResponse.json(await fullnodeLesen(pfad), { headers: CORS });
  } catch (e) {
    if (e instanceof FullnodeFehler) {
      return NextResponse.json({ error: e.code, detail: e.message }, { status: 503, headers: CORS });
    }
    throw e;
  }
}
