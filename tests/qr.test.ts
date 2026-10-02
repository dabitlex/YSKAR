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

// ---------------------------------------------------------------- Zahlungsanforderung

import { zahlungAusCode, zahlungsCode } from '../src/lib/wallet/qr.ts';

test('QR: blanke Adresse ist eine Zahlung ohne Betrag und Notiz', () => {
  assert.deepEqual(zahlungAusCode(ADR), { adresse: ADR, betrag: null, notiz: null });
  assert.equal(zahlungsCode(ADR), ADR);
  assert.equal(zahlungsCode(ADR, 0n, '  '), ADR);
});

test('QR: Betrag und Notiz gehen hin und zurück', () => {
  const code = zahlungsCode(ADR, 2_550_000_000n, 'Danke fürs Essen');
  assert.equal(code, `yskar:${ADR}?amount=25.5&memo=Danke%20f%C3%BCrs%20Essen`);
  assert.deepEqual(zahlungAusCode(code), { adresse: ADR, betrag: 2_550_000_000n, notiz: 'Danke fürs Essen' });
  // Kleinste Einheit und ganze Zahl.
  assert.equal(zahlungsCode(ADR, 1n), `yskar:${ADR}?amount=0.00000001`);
  assert.equal(zahlungAusCode(`yskar:${ADR}?amount=0.00000001`)?.betrag, 1n);
  assert.equal(zahlungsCode(ADR, 300_000_000n), `yskar:${ADR}?amount=3`);
  // Nur Notiz.
  assert.deepEqual(zahlungAusCode(zahlungsCode(ADR, null, 'Miete')), { adresse: ADR, betrag: null, notiz: 'Miete' });
});

test('QR: ein alter Leser bekommt aus dem neuen Code die Adresse', () => {
  assert.equal(adresseAusCode(zahlungsCode(ADR, 100n, 'x & y = z?')), ADR);
});

test('QR: unbrauchbare Beträge werden weggelassen, die Adresse bleibt', () => {
  for (const b of ['abc', '-5', '1,5', '1e3', '0', '0.000000001', '1.', '.5', '1234567890123']) {
    assert.deepEqual(zahlungAusCode(`yskar:${ADR}?amount=${b}`), { adresse: ADR, betrag: null, notiz: null }, b);
  }
  assert.equal(zahlungAusCode('https://example.org?amount=5'), null);
});

test('QR: Notiz wird auf 32 Byte gekürzt, nie mitten im Zeichen', () => {
  const lang = 'ä'.repeat(40);
  const z = zahlungAusCode(`yskar:${ADR}?memo=${encodeURIComponent(lang)}`);
  assert.equal(z?.notiz, 'ä'.repeat(16));
  assert.equal(new TextEncoder().encode(z!.notiz!).length, 32);
  // Steuerzeichen werden zu Leerzeichen.
  assert.equal(zahlungAusCode(`yskar:${ADR}?memo=a%0Ab`)?.notiz, 'a b');
});

import { zahlungAusText } from '../src/lib/wallet/qr.ts';

test('Einfügen: Adresse oder Code aus einer ganzen Nachricht', () => {
  assert.deepEqual(zahlungAusText(ADR), { adresse: ADR, betrag: null, notiz: null });
  assert.deepEqual(zahlungAusText(`Bitte sende mir 5 YSR an ${ADR}. Danke!`), { adresse: ADR, betrag: null, notiz: null });
  assert.deepEqual(
    zahlungAusText(`Bitte sende mir 25,50 YSR.\nyskar:${ADR}?amount=25.5&memo=Miete`),
    { adresse: ADR, betrag: 2_550_000_000n, notiz: 'Miete' });
  assert.equal(zahlungAusText('Hallo, wie geht es dir?'), null);
  assert.equal(zahlungAusText(''), null);
});

test('Einfügen: zwei verschiedene Adressen im Text -- keine wird geraten', () => {
  const B = encodeAddress(new Uint8Array(20).fill(9));
  assert.equal(zahlungAusText(`${ADR} oder ${B}`), null);
  // Dieselbe Adresse zweimal ist eindeutig.
  assert.equal(zahlungAusText(`${ADR} (nochmal: ${ADR})`)?.adresse, ADR);
});

test('Einfügen: Code am Anfang, zweite Adresse dahinter -- keine wird geraten', () => {
  const B = encodeAddress(new Uint8Array(20).fill(9));
  assert.equal(zahlungAusText(`yskar:${ADR}?amount=5\noder ${B}`), null);
  assert.equal(zahlungAusText(`${ADR}# oder ${B}`), null);
  // Ein Code mit Text dahinter bleibt ein Code -- samt Betrag.
  assert.deepEqual(zahlungAusText(`yskar:${ADR}?amount=5 bitte bis Freitag`), { adresse: ADR, betrag: 500_000_000n, notiz: null });
});

test('QR: Angaben hinter "#" zählen nicht', () => {
  assert.deepEqual(zahlungAusCode(`yskar:${ADR}#?amount=5`), { adresse: ADR, betrag: null, notiz: null });
  assert.deepEqual(zahlungAusCode(`yskar:${ADR}?amount=2#x?amount=9`), { adresse: ADR, betrag: 200_000_000n, notiz: null });
});
