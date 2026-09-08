import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Prüfung der Telegram-initData.
 *
 * Telegram signiert die Daten mit einem Schlüssel, der aus dem Bot-Token
 * abgeleitet ist. Nur wer den Token hat, kann die Signatur erzeugen -- damit
 * ist die Telegram-User-ID belegt und nicht bloß behauptet.
 *
 *     secret = HMAC_SHA256(key: "WebAppData", msg: botToken)
 *     hash   = HMAC_SHA256(key: secret,       msg: dataCheckString)
 *
 * dataCheckString sind alle Felder außer `hash`, alphabetisch nach Schlüssel
 * sortiert, je Zeile "key=value", mit \n verbunden.
 *
 * WICHTIG: Die Plattform (android/ios) steht NICHT in den signierten Daten.
 * Sie kommt unsigniert aus Telegram.WebApp.platform und ist damit nicht
 * überprüfbar. Der Smartphone-Gate ist eine Regel, keine Sicherheitsgrenze --
 * siehe docs/SECURITY.md.
 */

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface InitDataResult {
  ok: boolean;
  reason?: 'missing_hash' | 'bad_signature' | 'expired' | 'no_user' | 'malformed';
  user?: TelegramUser;
  authDate?: number;
}

export function verifyInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 3600,
): InitDataResult {
  if (!initData) return { ok: false, reason: 'malformed' };

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: 'malformed' };
  }

  const given = params.get('hash');
  if (!given) return { ok: false, reason: 'missing_hash' };

  const pairs: string[] = [];
  for (const [k, v] of params.entries()) {
    if (k === 'hash' || k === 'signature') continue;
    pairs.push(`${k}=${v}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = createHmac('sha256', secret).update(dataCheckString).digest('hex');

  const a = Buffer.from(computed, 'hex');
  const b = Buffer.from(given, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' };
  }

  // Alter prüfen: eine einmal abgefangene initData soll nicht ewig gelten.
  const authDate = Number(params.get('auth_date') ?? 0);
  if (!authDate) return { ok: false, reason: 'malformed' };
  const age = Math.floor(Date.now() / 1000) - authDate;
  if (age > maxAgeSeconds) return { ok: false, reason: 'expired' };

  const rawUser = params.get('user');
  if (!rawUser) return { ok: false, reason: 'no_user' };

  let user: TelegramUser;
  try {
    user = JSON.parse(rawUser) as TelegramUser;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof user.id !== 'number') return { ok: false, reason: 'no_user' };

  return { ok: true, user, authDate };
}

/** Erlaubte Plattformen. Client-gemeldet, siehe Hinweis oben. */
export const MOBILE_PLATFORMS = new Set(['android', 'ios']);

export function isMobilePlatform(platform: string | null | undefined): boolean {
  return !!platform && MOBILE_PLATFORMS.has(platform.toLowerCase());
}
