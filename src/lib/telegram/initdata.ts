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
 * dataCheckString sind die empfangenen Felder, alphabetisch nach Schlüssel
 * sortiert, je Zeile "key=value", mit \n verbunden.
 *
 * WELCHE FELDER: Für dieses HMAC-Verfahren ist laut Telegram-Doku nur `hash`
 * ausgenommen -- `signature` gehört hinein. Der Ausschluss von `signature`
 * gilt ausschließlich für das Ed25519-Verfahren zur Prüfung durch Dritte,
 * das wir nicht verwenden.
 *
 * Genau diese Verwechslung war der Grund für `bad_signature` beim ersten
 * Deployment: Seit Bot API 7.10 liefert Telegram das Feld mit, wodurch der
 * verkürzte data-check-string nicht mehr passte. Wir prüfen deshalb beide
 * Varianten -- das schwächt nichts ab, für beide Zeichenketten wird weiterhin
 * der Bot-Token benötigt.
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
  variant?: 'with_signature' | 'without_signature';
}

function checkString(params: URLSearchParams, dropSignature: boolean): string {
  const pairs: string[] = [];
  for (const [k, v] of params.entries()) {
    if (k === 'hash') continue;
    if (dropSignature && k === 'signature') continue;
    pairs.push(`${k}=${v}`);
  }
  pairs.sort();
  return pairs.join('\n');
}

function hmacMatches(secret: Buffer, data: string, givenHex: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(givenHex)) return false;
  const a = createHmac('sha256', secret).update(data).digest();
  const b = Buffer.from(givenHex, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
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

  // Der Token wird getrimmt: Beim Einfügen in Vercel rutscht leicht ein
  // Zeilenumbruch mit, und der wäre sonst als bad_signature verkleidet.
  const secret = createHmac('sha256', 'WebAppData').update(botToken.trim()).digest();

  let variant: InitDataResult['variant'];
  if (hmacMatches(secret, checkString(params, false), given)) {
    variant = 'with_signature';
  } else if (hmacMatches(secret, checkString(params, true), given)) {
    variant = 'without_signature';
  } else {
    return { ok: false, reason: 'bad_signature' };
  }

  // Alter prüfen: eine einmal abgefangene initData soll nicht ewig gelten.
  const authDate = Number(params.get('auth_date') ?? 0);
  if (!authDate) return { ok: false, reason: 'malformed' };
  const age = Math.floor(Date.now() / 1000) - authDate;
  if (age > maxAgeSeconds) return { ok: false, reason: 'expired', variant };

  const rawUser = params.get('user');
  if (!rawUser) return { ok: false, reason: 'no_user', variant };

  let user: TelegramUser;
  try {
    user = JSON.parse(rawUser) as TelegramUser;
  } catch {
    return { ok: false, reason: 'malformed', variant };
  }
  if (typeof user.id !== 'number') return { ok: false, reason: 'no_user', variant };

  return { ok: true, user, authDate, variant };
}

/** Erlaubte Plattformen. Client-gemeldet, siehe Hinweis oben. */
export const MOBILE_PLATFORMS = new Set(['android', 'ios']);

export function isMobilePlatform(platform: string | null | undefined): boolean {
  return !!platform && MOBILE_PLATFORMS.has(platform.toLowerCase());
}
