import { test } from 'node:test';
import assert from 'node:assert/strict';

import { adresseAusCode } from '../src/lib/wallet/qr.ts';
import { encodeAddress } from '../src/lib/core/address.ts';

const ADR = encodeAddress(new Uint8Array(20).fill(7));

test('QR: rohe Adresse wird erkannt', () => {
  assert.equal(adresseAusCode(ADR), ADR);
  assert.equal(adresseAusCode(`  ${ADR}\n`), ADR);
  assert.equal(adresseAusCode(ADR.toUpperCase()), ADR);
});

test('QR: URI-Schreibweisen werden auf die Adresse reduziert', () => {
  assert.equal(adresseAusCode(`ysr:${ADR}`), ADR);
  assert.equal(adresseAusCode(`yskar://${ADR}?amount=1.5`), ADR);
  assert.equal(adresseAusCode(`YSKAR:${ADR}#notiz`), ADR);
});

test('QR: fremde Codes werden abgelehnt', () => {
  assert.equal(adresseAusCode('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'), null);
  assert.equal(adresseAusCode('https://example.org'), null);
  assert.equal(adresseAusCode(ADR.slice(0, -1) + (ADR.endsWith('q') ? 'p' : 'q')), null);
  assert.equal(adresseAusCode(''), null);
});
