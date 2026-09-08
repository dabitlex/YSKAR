import { NextResponse } from 'next/server';
import { verifyInitData, isMobilePlatform } from '@/lib/telegram/initdata';
import { issue } from '@/lib/auth/jwt';
import { db } from '@/lib/db/service';

export const runtime = 'nodejs';

/**
 * POST /api/v1/auth/telegram
 * Body: { initData: string, platform: string }
 *
 * Prueft die Signatur, legt den Nutzer an oder aktualisiert ihn und gibt ein
 * kurzlebiges JWT zurueck.
 *
 * Der Plattform-Gate steht hier bewusst NICHT: Wer am Desktop sitzt, soll
 * Bloecke, Rangliste und seinen Kontostand ansehen koennen. Geblockt wird
 * erst beim Start einer Mining-Session.
 */
export async function POST(req: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const jwtSecret = process.env.JWT_SECRET;
  if (!botToken || !jwtSecret) {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }

  let body: { initData?: string; platform?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }

  const result = verifyInitData(body.initData ?? '', botToken);
  if (!result.ok || !result.user) {
    return NextResponse.json({ error: result.reason ?? 'unauthorized' }, { status: 401 });
  }

  const tg = result.user;
  const platform = (body.platform ?? '').toLowerCase();

  const { data, error } = await db()
    .from('users')
    .upsert({
      telegram_id: tg.id,
      username: tg.username ?? null,
      first_name: tg.first_name ?? null,
      last_name: tg.last_name ?? null,
      photo_url: tg.photo_url ?? null,
      language_code: tg.language_code ?? null,
      is_premium: tg.is_premium ?? false,
      platform: platform || null,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'telegram_id' })
    .select('id, banned, balance, blocks_found, first_seen_at')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'user_upsert_failed' }, { status: 500 });
  }
  if (data.banned) {
    return NextResponse.json({ error: 'banned' }, { status: 403 });
  }

  return NextResponse.json({
    token: issue(data.id, tg.id, jwtSecret),
    user: {
      id: data.id,
      firstName: tg.first_name ?? null,
      username: tg.username ?? null,
      balance: data.balance,
      blocksFound: data.blocks_found,
      memberSince: data.first_seen_at,
    },
    canMine: isMobilePlatform(platform),
  });
}
