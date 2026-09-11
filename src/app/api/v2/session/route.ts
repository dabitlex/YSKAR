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
 * MEHRERE MINER JE ADRESSE SIND ERLAUBT. Handy und Rechner gleichzeitig,
 * mehrere Rechner, ein Rechner mit mehreren Instanzen -- alles zulaessig.
 *
 * Unbedenklich ist das, weil `extranonce` in der Datenbank UNIQUE ueber alle
 * Sessions ist: Jede Session durchsucht dadurch einen eigenen Nonce-Raum.
 * Zwei Miner koennen denselben Treffer gar nicht finden, und doppelte Arbeit
 * entsteht nicht.
 *
 * Frueher beendete eine neue Session alle anderen derselben Adresse. Das war
 * als Missbrauchsbremse gedacht und war die falsche Bremse: Sie hielt
 * niemanden auf, der es darauf anlegt -- Adressen kostet die Wallet nichts
 * --, brach aber genau den Fall, fuer den der eigenstaendige Miner gebaut
 * wurde.
 *
 * Was bleibt, ist ein Deckel gegen das Zumuellen der Tabelle. Er ersetzt
 * keine echte Ratenbegrenzung.
 */

/** Gleichzeitige Sessions je Adresse. Grosszuegig, aber nicht unbegrenzt. */
const MAX_SESSIONS = 8;

export async function POST(req: Request) {
  let body: { address?: string; platform?: string; telegramId?: number };
  try { body = await req.json(); } catch { return fail('bad_json'); }
  if (!body.address) return fail('missing_address');

  let raw: Uint8Array;
  try { raw = decodeAddress(body.address); }
  catch { return fail('bad_address'); }

  const sb = db().schema('chain2');
  const addr = '\\x' + toHex(raw);

  // Zaehlt nur, was wirklich lebt: Die Funktion schliesst vorher Sessions,
  // die seit fuenf Minuten nichts mehr eingereicht haben. Ohne das wuerden
  // abgestuerzte Miner -- die niemals /session/stop aufrufen -- gegen den
  // Deckel zaehlen, und nach ein paar Abstuerzen ginge gar nichts mehr.
  const { data: lebend, error: zaehlFehler } =
    await sb.rpc('live_sessions', { p_address: addr });

  if (zaehlFehler) {
    return NextResponse.json(
      { error: 'chain_unreachable', detail: zaehlFehler.message }, { status: 503 });
  }

  if ((lebend ?? 0) >= MAX_SESSIONS) {
    return NextResponse.json({
      error: 'too_many_sessions',
      detail: `Für diese Adresse laufen bereits ${lebend} Miner. ` +
              `Mehr als ${MAX_SESSIONS} gleichzeitig sind nicht vorgesehen.`,
      active: lebend,
      max: MAX_SESSIONS,
    }, { status: 429 });
  }

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
    // Damit die Oberflaeche zeigen kann, dass noch anderswo gemint wird.
    concurrentSessions: (lebend ?? 0) + 1,
  });
}

function fail(reason: string, status = 400) {
  return NextResponse.json({ error: reason }, { status });
}
