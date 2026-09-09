import { NextResponse } from 'next/server';
import { db } from '@/lib/db/service';
import { decodeAddress } from '@/lib/core/address';
import { toHex } from '@/lib/core/codec';

export const runtime = 'nodejs';

/**
 * POST /api/v2/session   { address, platform?, telegramId? }
 *
 * KEINE Anmeldung noetig. Wer eine Session startet, gibt eine Adresse an;
 * die Coinbase geht dorthin. Das ist bewusst offen -- bei echtem Mining
 * richtet man seinen Miner auf eine Adresse, und fuer jemand anderen zu
 * minen ist kein Angriff, sondern ein Geschenk.
 *
 * Der Preis: Es gibt keine kontogebundene Begrenzung mehr. Missbrauchsschutz
 * muss ueber Ratenbegrenzung laufen, nicht ueber Identitaet. Ein einfacher
 * Deckel je Adresse steht unten; er ersetzt keine echte Ratenbegrenzung.
 */
export async function POST(req: Request) {
  let body: { address?: string; platform?: string; telegramId?: number };
  try { body = await req.json(); } catch { return fail('bad_json'); }
  if (!body.address) return fail('missing_address');

  let raw: Uint8Array;
  try { raw = decodeAddress(body.address); }
  catch { return fail('bad_address'); }

  const sb = db().schema('chain2');
  const addr = '\\x' + toHex(raw);

  // Eine aktive Session je Adresse. Mehrere Geraete brauchen mehrere
  // Adressen -- die kostet die Wallet nichts, sie leitet sie einfach ab.
  await sb.from('sessions').update({ status: 'stopped' })
    .eq('address', addr).eq('status', 'active');

  const { data, error } = await sb.from('sessions').insert({
    address: addr,
    telegram_id: body.telegramId ?? null,   // nur Bequemlichkeit, kein Eigentum
    share_difficulty: 128,
    platform: body.platform ?? null,
  }).select('id, extranonce, share_difficulty').single();

  if (error || !data) return fail('session_create_failed', 500);

  return NextResponse.json({
    sessionId: data.id,
    extranonce: String(data.extranonce),
    shareDifficulty: String(data.share_difficulty),
    address: body.address,
  });
}

function fail(reason: string, status = 400) {
  return NextResponse.json({ error: reason }, { status });
}
