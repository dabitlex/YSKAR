import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Telegram-Startdaten (initData) pruefen, wie Telegram es beschreibt:
 *   secret = HMAC_SHA256(key = "WebAppData", msg = Bot-Token)
 *   hash   = hex(HMAC_SHA256(key = secret, msg = data_check_string))
 * data_check_string: alle Felder ausser hash, sortiert, "schluessel=wert",
 * mit \n verbunden.
 *
 * Liefert die Telegram-Nutzer-ID oder null. Aelter als maxAlterSek wird
 * abgelehnt, damit ein abgefangener String nicht ewig gilt.
 */
export function pruefeInitData(initData: string, botToken: string, maxAlterSek = 24 * 3600,
  jetztSek = Math.floor(Date.now() / 1000)): number | null {
  if (!initData || !botToken) return null;
  let params: URLSearchParams;
  try { params = new URLSearchParams(initData); } catch { return null; }
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;

  const paare: string[] = [];
  params.forEach((wert, schluessel) => { if (schluessel !== 'hash') paare.push(`${schluessel}=${wert}`); });
  paare.sort();
  const geheim = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const soll = createHmac('sha256', geheim).update(paare.join('\n')).digest();
  const ist = Buffer.from(hash, 'hex');
  if (ist.length !== soll.length || !timingSafeEqual(ist, soll)) return null;

  const auth = Number(params.get('auth_date'));
  if (!Number.isFinite(auth) || jetztSek - auth > maxAlterSek) return null;

  try {
    const user = JSON.parse(params.get('user') ?? 'null') as { id?: unknown } | null;
    return typeof user?.id === 'number' && Number.isSafeInteger(user.id) ? user.id : null;
  } catch { return null; }
}

/** Fingerabdruck der Telegram-ID: HMAC mit einem Geheimnis nur auf dem Server. */
export function fingerabdruck(telegramId: number, geheimnis: string): string {
  return createHmac('sha256', geheimnis).update(`tg:${telegramId}`).digest('hex');
}
