/**
 * STILLGELEGT -- die ganze Schnittstelle /api/v1.
 *
 * Unter /api/v1 lagen die Routen der ERSTEN Kette: Anmeldung per Telegram
 * mit JWT, Bloecke und Kennzahlen aus dem Schema `public`, und Mining ueber
 * Supabase. Nichts im heutigen Projekt ruft sie auf -- weder App, Mini App,
 * Explorer, Miner, Node Core noch die Wallet-App. Am 9. Oktober 2026 wurden
 * die Routen entfernt (Issue #5); mit ihnen der Code, den nur sie brauchten
 * (src/lib/chain/blockView.ts und params.ts, src/lib/auth/jwt.ts,
 * src/lib/telegram/initdata.ts).
 *
 * Geblieben ist nur diese eine Datei: Ein Aufruf, der doch noch kommt,
 * bekommt 410 statt 404 -- dieselbe Regel wie in src/lib/api/stillgelegt.ts.
 * Fuer die frueheren Mining-Routen nennt die Antwort wie bisher denselben
 * Pfad am Full Node; fuer alles andere den Lesezugang unter /api/v2.
 */
import { NextResponse } from 'next/server';
import { stillgelegt } from '@/lib/api/stillgelegt';

export { OPTIONS } from '@/lib/api/stillgelegt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };

function antwort(req: Request) {
  const pfad = new URL(req.url).pathname.replace(/^\/api\/v1/, '');
  // Die frueheren Mining-Routen: dieselbe Antwort wie bis zum 9. Oktober 2026.
  if (/^\/mining\/(session|session\/stop|job|share|status)\/?$/.test(pfad)) {
    return stillgelegt('/api/v2' + pfad.replace(/^\/mining/, '').replace(/\/$/, ''));
  }
  return NextResponse.json({
    error: 'gone',
    detail: 'Die Schnittstelle /api/v1 gehörte zur ersten Kette und ist stillgelegt. Lesen: /api/v2.',
    stattdessen: '/api/v2',
  }, { status: 410, headers: CORS });
}

export async function GET(req: Request) { return antwort(req); }
export async function POST(req: Request) { return antwort(req); }
