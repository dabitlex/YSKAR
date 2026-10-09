import { test } from 'node:test';
import assert from 'node:assert/strict';

import { targetFromDifficulty } from '../src/lib/core/params.ts';
// @ts-expect-error -- reines JavaScript ohne Typen
import { targetBytes, toHex as minerHex } from '../miner/src/header.mjs';

/*
  Hier standen bis zum 9. Oktober 2026 Tests fuer VarDiff und LWMA der ERSTEN
  Kette (src/lib/chain/vardiff.ts, difficulty.ts). Diese Dateien wurden nur
  noch von hier benutzt und waren vom laufenden Code abgewichen -- die Tests
  sagten nichts mehr ueber das Netz (Issue #5). Die Difficulty-Regel der
  Kette prueft tests/core.test.ts, das Share-Ziel der Knoten
  tests/share-ziel.test.ts.
*/

/*
  Hier standen bis zum 9. Oktober 2026 auch Tests fuer die Telegram-Anmeldung
  (initData) und die JWT der ersten Kette. Beide gehoerten zu
  /api/v1/auth/telegram, das mit /api/v1 entfernt wurde (Issue #5).
*/

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
