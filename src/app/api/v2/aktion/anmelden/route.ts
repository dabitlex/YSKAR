import { NextResponse } from 'next/server';
import { anmelden } from '@/lib/aktion/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v2/aktion/anmelden  { initData, adresse, publicKey, signatur, ref? }
 *
 * Meldet ein Telegram-Konto mit seiner Wallet bei "Hilf YSKAR beim Wachsen"
 * an (idempotent). Nur aus der Mini App: initData wird mit dem Bot-Token
 * geprueft, die Adresse mit einer Signatur der Wallet.
 */
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: 'malformed' }, { status: 400 }); }
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  const r = await anmelden({
    initData: s(b.initData), adresse: s(b.adresse), publicKey: s(b.publicKey), signatur: s(b.signatur),
    ref: s(b.ref) || null,
  });
  if (!r.ok) {
    const status = r.fehler === 'nicht_eingerichtet' ? 503 : r.fehler === 'db' ? 500 : 400;
    return NextResponse.json({ error: r.fehler }, { status });
  }
  return NextResponse.json({ ok: true, code: r.zeile.code, status: r.zeile.status });
}
