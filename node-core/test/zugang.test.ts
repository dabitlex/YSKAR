/**
 * Zugangsschluessel der Oberflaeche: zufaellig, oder fuer Werkzeuge ueber
 * YSKAR_ZUGANG vorgegeben (der Probelauf im Bau auf GitHub braucht ihn, weil
 * er seit Befund S8 nicht mehr in der Seite steht).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startZugang } from '../src/main.ts';

const GUELTIG = 'ab'.repeat(32);

test('Ohne Vorgabe: 64 zufaellige Hexzeichen, jedes Mal andere', () => {
  const a = startZugang({}), b = startZugang({});
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});

test('Gueltige Vorgabe wird benutzt und aus der Umgebung entfernt', () => {
  const env: NodeJS.ProcessEnv = { YSKAR_ZUGANG: GUELTIG };
  assert.equal(startZugang(env), GUELTIG);
  assert.equal('YSKAR_ZUGANG' in env, false, 'Kindprozesse erben sie nicht');
});

test('Ungueltige Vorgabe: zufaelliger Schluessel, Variable trotzdem entfernt', () => {
  for (const falsch of ['', 'abc', 'AB'.repeat(32), GUELTIG + '0', 'zz'.repeat(32)]) {
    const env: NodeJS.ProcessEnv = { YSKAR_ZUGANG: falsch };
    const z = startZugang(env);
    assert.notEqual(z, falsch);
    assert.match(z, /^[0-9a-f]{64}$/);
    assert.equal('YSKAR_ZUGANG' in env, false);
  }
});
