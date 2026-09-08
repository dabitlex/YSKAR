import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import * as vardiff from '../src/lib/chain/vardiff.ts';
import { nextDifficulty, effectiveDifficulty, type DifficultyParams }
  from '../src/lib/chain/difficulty.ts';
import { verifyInitData, isMobilePlatform } from '../src/lib/telegram/initdata.ts';
import { issue, verify } from '../src/lib/auth/jwt.ts';

const VP = {
  targetSeconds: 30,
  min: 32n,
  max: 4096n,
  blockDifficulty: 24576n,
  shareDiffBlockRatio: 8,
};

const DP: DifficultyParams = {
  targetBlockTime: 600,
  lwmaWindow: 45,
  lwmaClamp: 4,
  minDifficulty: 4096n,
  emergencyFactor: 3,
};

test('VarDiff regelt nach oben, wenn Shares zu schnell kommen', () => {
  const next = vardiff.adjust(256n, 5, VP);   // 5 s statt 30 s
  assert.ok(next > 256n, `erwartet Erhöhung, bekam ${next}`);
});

test('VarDiff regelt nach unten, wenn Shares zu langsam kommen', () => {
  const next = vardiff.adjust(1024n, 200, VP);
  assert.ok(next < 1024n, `erwartet Senkung, bekam ${next}`);
});

test('VarDiff hat eine Totzone -- Rauschen loest keine Anpassung aus', () => {
  // Der Abstand zwischen Shares ist exponentialverteilt. Ein einzelner Wert
  // nahe am Ziel ist kein Signal.
  for (const s of [24, 28, 30, 33, 38]) {
    assert.equal(vardiff.adjust(512n, s, VP), 512n, `bei ${s}s hätte nichts passieren dürfen`);
  }
});

test('Share-Difficulty kann nie in die Nähe der Block-Difficulty kommen', () => {
  const hoch = vardiff.adjust(4096n, 0.001, VP);           // absurd schnell
  assert.ok(hoch <= VP.blockDifficulty / 8n,
    `Obergrenze verletzt: ${hoch} > ${VP.blockDifficulty / 8n}`);

  // Auch bei winziger Block-Difficulty bleibt die Untergrenze erhalten
  const eng = { ...VP, blockDifficulty: 100n };
  assert.ok(vardiff.adjust(512n, 0.001, eng) >= eng.min);
});

test('VarDiff verkraftet kaputte Zeitangaben', () => {
  for (const bad of [0, -5, NaN, Infinity]) {
    const r = vardiff.adjust(512n, bad, VP);
    assert.equal(r, 512n, `bei ${bad} hätte der Wert stehen bleiben müssen`);
  }
});

test('LWMA erhöht die Difficulty, wenn Blöcke zu schnell kommen', () => {
  const schnell = Array.from({ length: 45 }, () => ({
    difficulty: 100_000n, solveSeconds: 150,   // 150s statt 600s
  }));
  const next = nextDifficulty(schnell, DP);
  assert.ok(next > 100_000n, `erwartet Erhöhung, bekam ${next}`);
  assert.ok(next <= 400_000n, 'Clamp auf Faktor 4 wurde nicht eingehalten');
});

test('LWMA senkt die Difficulty, wenn Blöcke zu langsam kommen', () => {
  const langsam = Array.from({ length: 45 }, () => ({
    difficulty: 100_000n, solveSeconds: 2400,
  }));
  const next = nextDifficulty(langsam, DP);
  assert.ok(next < 100_000n, `erwartet Senkung, bekam ${next}`);
  assert.ok(next >= 25_000n, 'Clamp nach unten wurde nicht eingehalten');
});

test('Ein einzelner Ausreißer kippt das Fenster nicht', () => {
  const normal = Array.from({ length: 45 }, () => ({
    difficulty: 100_000n, solveSeconds: 600,
  }));
  const mitAusreisser = [...normal];
  mitAusreisser[44] = { difficulty: 100_000n, solveSeconds: 86_400 };  // ein Tag

  const ohne = nextDifficulty(normal, DP);
  const mit = nextDifficulty(mitAusreisser, DP);
  // Die Klammerung auf 6x Zielzeit begrenzt den Einfluss
  assert.ok(mit < ohne, 'Ausreißer sollte die Difficulty senken');
  assert.ok(mit > ohne / 4n, `Ausreißer hat zu stark durchgeschlagen: ${mit} vs ${ohne}`);
});

test('Difficulty fällt nie unter die Untergrenze', () => {
  const tot = Array.from({ length: 45 }, () => ({
    difficulty: 4096n, solveSeconds: 3600,
  }));
  assert.ok(nextDifficulty(tot, DP) >= DP.minDifficulty);
  assert.equal(nextDifficulty([], DP), DP.minDifficulty);
});

test('Notfallregel lockert das Target erst nach dem Schwellwert', () => {
  const base = 100_000n;
  assert.equal(effectiveDifficulty(base, 600, DP), base, 'zu früh gelockert');
  assert.equal(effectiveDifficulty(base, 1800, DP), base, 'genau am Schwellwert');

  const nach1h = effectiveDifficulty(base, 3600, DP);
  assert.ok(nach1h < base && nach1h >= base / 2n - 1n,
    `nach 1h sollte etwa halbiert sein, ist ${nach1h}`);

  const nach2h = effectiveDifficulty(base, 7200, DP);
  assert.ok(nach2h < nach1h, 'sollte weiter fallen');
  assert.ok(effectiveDifficulty(base, 10 ** 9, DP) >= DP.minDifficulty,
    'Untergrenze auch im Extremfall');
});

// ---------------------------------------------------------------- initData

function fakeInitData(botToken: string, user: object, authDate = Math.floor(Date.now() / 1000)) {
  const fields: Record<string, string> = {
    auth_date: String(authDate),
    query_id: 'AAF_test',
    user: JSON.stringify(user),
  };
  const dcs = Object.keys(fields).sort().map(k => `${k}=${fields[k]}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secret).update(dcs).digest('hex');
  const p = new URLSearchParams(fields);
  p.set('hash', hash);
  return p.toString();
}

test('Gültige initData wird akzeptiert', () => {
  const bot = '123456:AAterrificTestTokenValue';
  const data = fakeInitData(bot, { id: 1900315719, first_name: 'Kevin', username: 'dabitlex' });
  const r = verifyInitData(data, bot);
  assert.equal(r.ok, true);
  assert.equal(r.user?.id, 1900315719);
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
  assert.equal(verify(t, 'anderes').reason, 'bad_signature');
  assert.equal(verify('kaputt', 'geheim').reason, 'malformed');

  const abgelaufen = issue('user-uuid', 42, 'geheim', -10);
  assert.equal(verify(abgelaufen, 'geheim').reason, 'expired');

  // Claims manipuliert, Signatur nicht nachgezogen
  const [h, , s] = t.split('.');
  const boese = Buffer.from(JSON.stringify({
    sub: 'fremd', tg: 1, jti: 'x', iat: 0, exp: 9999999999,
  })).toString('base64url');
  assert.equal(verify(`${h}.${boese}.${s}`, 'geheim').reason, 'bad_signature');
});
