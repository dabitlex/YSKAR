/**
 * Stillgelegte Routen -- Mining und Transaktionsannahme auf Vercel.
 *
 * WARUM DAS HIER STEHT UND DIE DATEIEN NICHT GELOESCHT SIND
 *
 * Ein geloeschter Endpunkt antwortet mit 404. Fuer einen Miner, der noch
 * gegen die alte Adresse laeuft, sieht das aus wie ein Tippfehler oder ein
 * Ausfall -- er versucht es weiter. 410 Gone sagt dagegen: Diese Route hat
 * es gegeben, sie kommt nicht wieder, und hier steht wohin stattdessen.
 *
 * Fachlich: Die Kette lebt im Full Node. Supabase ist nur noch Spiegel und
 * darf keine Sitzung eroeffnen, keinen Job ausgeben, keinen Share annehmen
 * und keine Transaktion in den Mempool legen. Sonst gaebe es zwei Stellen,
 * die Arbeit verteilen -- und zwei Wahrheiten.
 */
import { NextResponse } from 'next/server';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/**
 * Die Antwort auf eine stillgelegte Route.
 *
 * `stattdessen` ist der Pfad am Full Node, der dieselbe Aufgabe erfuellt --
 * derselbe Pfad wie hier, nur an der anderen Adresse. Die Adresse selbst
 * kommt aus YSKAR_FULLNODE_URL, damit ein Wechsel des Knotens nicht
 * zehn Dateien anfasst.
 */
export function stillgelegt(stattdessen: string) {
  const basis = process.env.YSKAR_FULLNODE_URL?.replace(/\/+$/, '') ?? null;

  return NextResponse.json({
    error: 'moved_to_fullnode',
    detail:
      'Mining und Transaktionen laufen nicht mehr über diese Adresse. ' +
      'Der Full Node ist die Wahrheit; hier liegt nur noch ein Lesespiegel.',
    fullnode: basis,
    stattdessen: basis ? basis + stattdessen : stattdessen,
  }, { status: 410, headers: CORS });
}
