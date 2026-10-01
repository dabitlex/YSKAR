import { NextResponse } from 'next/server';
import { decodeAddress } from '@/lib/core/address';
import { verlaufLaden, richtungAus, cursorAus } from '@/lib/api/verlauf';
import { sucheAus, zeitAus } from '@/lib/api/suche';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' };
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

/**
 * GET /api/v2/account/:address/verlauf?richtung=alle|ein|aus&vor=hoehe:idx&limit=50
 *                                     &q=suche&von=unix&bis=unix
 *
 * Der vollstaendige Verlauf, seitenweise. Ohne "vor" die neueste Seite;
 * "weiter" in der Antwort ist der Cursor fuer die naechste, null am Ende.
 *
 * q: Blocknummer, TxID-Anfang, Adresse (oder ihr Anfang) oder Notiztext --
 * siehe lib/api/suche.ts. von/bis: Blockzeit in Unix-Sekunden, [von, bis).
 */
export async function GET(
  req: Request, { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  let raw: Uint8Array;
  try { raw = decodeAddress(address); }
  catch { return NextResponse.json({ error: 'bad_address' }, { status: 400, headers: CORS }); }

  const url = new URL(req.url);
  try {
    const seite = await verlaufLaden(
      raw,
      richtungAus(url.searchParams.get('richtung')),
      cursorAus(url.searchParams.get('vor')),
      Number(url.searchParams.get('limit') ?? 50),
      {
        suche: sucheAus(url.searchParams.get('q')),
        von: zeitAus(url.searchParams.get('von')),
        bis: zeitAus(url.searchParams.get('bis')),
      },
    );
    return NextResponse.json(seite, { headers: CORS });
  } catch (e) {
    return NextResponse.json({ error: 'chain_unreachable', detail: (e as Error).message },
      { status: 503, headers: CORS });
  }
}
