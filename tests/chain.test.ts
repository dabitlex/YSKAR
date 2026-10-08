import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { targetFromDifficulty } from '../src/lib/core/params.ts';
// @ts-expect-error -- reines JavaScript ohne Typen
import { targetBytes, toHex as minerHex } from '../miner/src/header.mjs';
import { verifyInitData, isMobilePlatform } from '../src/lib/telegram/initdata.ts';
import { issue, verify } from '../src/lib/auth/jwt.ts';

/*
  Hier standen bis zum 9. Oktober 2026 Tests fuer VarDiff und LWMA der ERSTEN
  Kette (src/lib/chain/vardiff.ts, difficulty.ts). Diese Dateien wurden nur
  noch von hier benutzt und waren vom laufenden Code abgewichen -- die Tests
  sagten nichts mehr ueber das Netz (Issue #5). Die Difficulty-Regel der
  Kette prueft tests/core.test.ts, das Share-Ziel der Knoten
  tests/share-ziel.test.ts.
*/

// ---------------------------------------------------------------- initData

/**
 * Baut initData so, wie Telegram sie liefert.
 *
 * `signature` bildet nach, was Telegram seit Bot API 7.10 mitschickt. Es
 * gehoert in den data-check-string des HMAC-Verfahrens -- nur beim
 * Ed25519-Verfahren fuer Dritte bleibt es draussen. Genau diese Verwechslung
 * hatte beim ersten Deployment `bad_signature` verursacht.
 */
function fakeInitData(
  botToken: string,
  user: object,
  authDate = Math.floor(Date.now() / 1000),
  opts: { signature?: string; hashOverSignature?: boolean } = {},
) {
  const fields: Record<string, string> = {
    auth_date: String(authDate),
    query_id: 'AAF_test',
    user: JSON.stringify(user),
  };
  if (opts.signature) fields.signature = opts.signature;

  const hashed = { ...fields };
  if (opts.signature && opts.hashOverSignature === false) delete hashed.signature;

  const dcs = Object.keys(hashed).sort().map(k => `${k}=${hashed[k]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secret).update(dcs).digest('hex');
  const p = new URLSearchParams(fields);
  p.set('hash', hash);
  return p.toString();
}

test('Gültige initData wird akzeptiert', () => {
  const bot = '123456:AAterrificTestTokenValue';
  const data = fakeInitData(bot, { id: 100200300, first_name: 'Test', username: 'tester' });
  const r = verifyInitData(data, bot);
  assert.equal(r.ok, true);
  assert.equal(r.user?.id, 100200300);
});

test('Manipulierte initData wird abgewiesen', () => {
  const bot = '123456:AAterrificTestTokenValue';
  const data = fakeInitData(bot, { id: 1, first_name: 'A' });

  // Fremde User-ID untergeschoben
  const p = new URLSearchParams(data);
  p.set('user', JSON.stringify({ id: 999999, first_name: 'Angreifer' }));
  assert.equal(verifyInitData(p.toString(), bot).reason, 'bad_signature');

  // Falscher Bot-Token
  assert.equal(verifyInitData(data, '123456:WrongToken').reason, 'bad_signature');

  // Ohne hash
  const p2 = new URLSearchParams(data);
  p2.delete('hash');
  assert.equal(verifyInitData(p2.toString(), bot).reason, 'missing_hash');

  assert.equal(verifyInitData('', bot).reason, 'malformed');
});


test('initData mit signature-Feld wird akzeptiert (Regression zu bad_signature)', () => {
  const bot = '123456:AAterrificTestTokenValue';
  const user = { id: 100200300, first_name: 'Test' };

  // So liefert Telegram es heute: signature ist Teil des data-check-string
  const mit = fakeInitData(bot, user, undefined,
    { signature: 'abc_signature_value', hashOverSignature: true });
  const r1 = verifyInitData(mit, bot);
  assert.equal(r1.ok, true, 'signature muss in den data-check-string');
  assert.equal(r1.variant, 'with_signature');

  // Aeltere Clients ohne signature bleiben gueltig
  const ohne = fakeInitData(bot, user);
  assert.equal(verifyInitData(ohne, bot).ok, true);

  // Ein Client, der den Hash ohne signature bildet, wird ebenfalls akzeptiert
  const gemischt = fakeInitData(bot, user, undefined,
    { signature: 'abc_signature_value', hashOverSignature: false });
  const r3 = verifyInitData(gemischt, bot);
  assert.equal(r3.ok, true);
  assert.equal(r3.variant, 'without_signature');
});

test('Bot-Token mit Zeilenumbruch beim Einfuegen wird verkraftet', () => {
  const bot = '123456:AAterrificTestTokenValue';
  const data = fakeInitData(bot, { id: 1, first_name: 'A' });
  assert.equal(verifyInitData(data, bot + '\n').ok, true);
  assert.equal(verifyInitData(data, '  ' + bot + '  ').ok, true);
});

test('Manipulierte initData bleibt trotz zweier Varianten abgewiesen', () => {
  const bot = '123456:AAterrificTestTokenValue';
  const data = fakeInitData(bot, { id: 1, first_name: 'A' },
    undefined, { signature: 'sig', hashOverSignature: true });

  // signature veraendert -> keine der beiden Varianten passt
  const p = new URLSearchParams(data);
  p.set('signature', 'gefaelscht');
  assert.equal(verifyInitData(p.toString(), bot).reason, 'bad_signature');

  // User untergeschoben
  const p2 = new URLSearchParams(data);
  p2.set('user', JSON.stringify({ id: 999, first_name: 'Angreifer' }));
  assert.equal(verifyInitData(p2.toString(), bot).reason, 'bad_signature');
});

test('Abgelaufene initData wird abgewiesen', () => {
  const bot = '123456:AAterrificTestTokenValue';
  const alt = Math.floor(Date.now() / 1000) - 7200;
  const data = fakeInitData(bot, { id: 1, first_name: 'A' }, alt);
  assert.equal(verifyInitData(data, bot).reason, 'expired');
  assert.equal(verifyInitData(data, bot, 10800).ok, true, 'mit größerem Fenster gültig');
});

test('Plattform-Gate lässt nur Smartphones durch', () => {
  assert.equal(isMobilePlatform('android'), true);
  assert.equal(isMobilePlatform('ios'), true);
  assert.equal(isMobilePlatform('tdesktop'), false);
  assert.equal(isMobilePlatform('macos'), false);
  assert.equal(isMobilePlatform('weba'), false);
  assert.equal(isMobilePlatform(null), false);
});

// --------------------------------------------------------------------- JWT

test('JWT wird ausgestellt und wieder akzeptiert', () => {
  const t = issue('user-uuid', 42, 'geheim');
  const r = verify(t, 'geheim');
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.claims.sub, 'user-uuid');
});

test('JWT mit falschem Schlüssel oder abgelaufen wird abgewiesen', () => {
  const t = issue('user-uuid', 42, 'geheim');
  const falsch = verify(t, 'anderes');
  assert.equal(!falsch.ok && falsch.reason, 'bad_signature');
  const kaputt = verify('kaputt', 'geheim');
  assert.equal(!kaputt.ok && kaputt.reason, 'malformed');

  const abgelaufen = issue('user-uuid', 42, 'geheim', -10);
  const alt = verify(abgelaufen, 'geheim');
  assert.equal(!alt.ok && alt.reason, 'expired');

  // Claims manipuliert, Signatur nicht nachgezogen
  const [h, , s] = t.split('.');
  const boese = Buffer.from(JSON.stringify({
    sub: 'fremd', tg: 1, jti: 'x', iat: 0, exp: 9999999999,
  })).toString('base64url');
  const manipuliert = verify(`${h}.${boese}.${s}`, 'geheim');
  assert.equal(!manipuliert.ok && manipuliert.reason, 'bad_signature');
});

// -------------------------------------- Share-Target vs. Block-Target
// Regression zum ersten Testlauf im Betrieb: Die Job-Route lieferte das
// Block-Target statt des Share-Targets. Der Client suchte dadurch nach einem
// ganzen Block und lieferte praktisch nie einen Share ab -- von aussen sah
// das aus, als wuerde das Mining gar nicht starten.

test('Share-Target ist um Groessenordnungen leichter als das Block-Target', () => {
  const blockDifficulty = 24576n;
  const shareDifficulty = 128n;

  const blockTarget = targetFromDifficulty(blockDifficulty);
  const shareTarget = targetFromDifficulty(shareDifficulty);

  assert.ok(shareTarget > blockTarget,
    'Share-Target muss groesser (= leichter erreichbar) sein als das Block-Target');

  // Erwarteter Aufwand: 128 * 65536 = 8,4 Mio gegen 24576 * 65536 = 1,6 Mrd
  const shareHashes = shareDifficulty * 65536n;
  const blockHashes = blockDifficulty * 65536n;
  assert.equal(shareHashes, 8_388_608n);
  assert.equal(blockHashes, 1_610_612_736n);
  assert.ok(blockHashes / shareHashes === 192n,
    'Der Unterschied betraegt Faktor 192 -- 3 Sekunden gegen 10 Minuten');
});

test('Die Ziel-Umrechnung des Miners stimmt mit der des Kerns ueberein', () => {
  // Vorher gegen src/lib/chain/target.ts (erste Kette, Issue #5); jetzt gegen
  // den Kern und die Funktion, die der Kommandozeilen-Miner wirklich benutzt.
  for (const d of [1, 32, 128, 512, 4096, 24576, 1_000_000]) {
    assert.equal(
      minerHex(targetBytes(d)),
      targetFromDifficulty(BigInt(d)).toString(16).padStart(64, '0'),
      `Abweichung bei Difficulty ${d} -- der Worker wuerde gegen ein anderes Target pruefen`,
    );
  }
});

// ------------------------------------------------------------ bytea-Praefix

test('unprefix entfernt genau einen Backslash-x, nicht zwei', async () => {
  const { unprefix, prefix } = await import('../src/lib/node/hex.ts');

  // So liefert Postgres es wirklich: EIN Backslash.
  const ausDerDb = '\\x000000090a14a03f';
  assert.equal(unprefix(ausDerDb), '000000090a14a03f');

  // Der Fehler, der im Betrieb sichtbar wurde: eine Regex, die zwei
  // Backslashes suchte, traf nie und liess das Praefix stehen.
  assert.notEqual(unprefix(ausDerDb), ausDerDb);

  assert.equal(unprefix('deadbeef'), 'deadbeef', 'ohne Praefix unveraendert');
  assert.equal(unprefix(null), null);
  assert.equal(unprefix(undefined), null);

  assert.equal(prefix('deadbeef'), '\\xdeadbeef');
  assert.equal(prefix('\\xdeadbeef'), '\\xdeadbeef', 'nicht doppelt voranstellen');
  assert.equal(unprefix(prefix('abc123')), 'abc123');
});
