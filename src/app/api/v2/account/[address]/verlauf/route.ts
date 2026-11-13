import { NextResponse } from 'next/server';
import { decodeAddress } from '@/lib/core/address';
import { verlaufLaden, richtungAus, cursorAus } from '@/lib/api/verlauf';
import { artAus, nachArt } from '@/lib/api/verlaufArt';
import { sucheAus, zeitAus } from '@/lib/api/suche';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' };
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

/**
 * GET /api/v2/account/:address/verlauf?richtung=alle|ein|aus&vor=hoehe:idx&limit=50
 *                                     &art=mining|transfer&q=suche&von=unix&bis=unix
 *
 * Der vollstaendige Verlauf, seitenweise. Ohne "vor" die neueste Seite;
 * "weiter" in der Antwort ist der Cursor fuer die naechste, null am Ende.
 *
 * art: nur Mining (Blockreward, Pool-Anteil) oder nur Ueberweisungen. Die
 * Auswahl geschieht hier, nicht in der Datenbank (lib/api/verlaufArt.ts).
 * Mit art kann eine Seite LEER sein und trotzdem einen Cursor tragen: Dann
 * lag in dem gelesenen Stueck nichts Passendes, weiter hinten vielleicht
 * schon -- der Aufrufer fragt mit dem Cursor weiter.
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
  const richtung = richtungAus(url.searchParams.get('richtung'));
  const art = artAus(url.searchParams.get('art'));
  const limit = Number(url.searchParams.get('limit') ?? 50);
  const filter = {
    suche: sucheAus(url.searchParams.get('q')),
    von: zeitAus(url.searchParams.get('von')),
    bis: zeitAus(url.searchParams.get('bis')),
  };
  try {
    const seite = art
      // Mining kommt immer herein: Ausgaenge muss dafuer niemand lesen.
      ? await nachArt(
          (vor, n) => verlaufLaden(raw, art === 'mining' && richtung === 'alle' ? 'ein' : richtung, cursorAus(vor), n, filter),
          art, url.searchParams.get('vor'), limit)
      : await verlaufLaden(raw, richtung, cursorAus(url.searchParams.get('vor')), limit, filter);
    return NextResponse.json(seite, { headers: CORS });
  } catch (e) {
    return NextResponse.json({ error: 'chain_unreachable', detail: (e as Error).message },
      { status: 503, headers: CORS });
  }
}
