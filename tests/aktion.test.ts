/**
 * Hilf YSKAR beim Wachsen: Regeln, initData-Pruefung, Ziehung.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { pruefeInitData, fingerabdruck } from '../src/lib/aktion/initData.ts';
import { PREISE_USD, TOPF_USD, lose, fristFuer, codeAusAdresse, codeAusStartParam, ENDE, PRUEF_ENDE } from '../src/lib/aktion/regeln.ts';
import { ziehen, losliste } from '../src/lib/aktion/ziehung.ts';

function initData(token: string, felder: Record<string, string>): string {
  const paare = Object.entries(felder).map(([k, v]) => `${k}=${v}`).sort();
  const geheim = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', geheim).update(paare.join('\n')).digest('hex');
  const p = new URLSearchParams(felder); p.set('hash', hash);
  return p.toString();
}

test('Preise ergeben genau 1.000 USD, 10 Gewinner', () => {
  assert.equal(PREISE_USD.length, 10);
  assert.equal(PREISE_USD.reduce((a, b) => a + b, 0), TOPF_USD);
  assert.deepEqual(PREISE_USD.slice(0, 3), [300, 200, 150]);
});

test('Fristen in UTC', () => {
  assert.equal(new Date(ENDE).toISOString(), '2027-01-31T00:00:00.000Z');
  assert.equal(new Date(PRUEF_ENDE).toISOString(), '2027-02-14T00:00:00.000Z');
  // 14 Tage, aber nie ueber das Pruefende hinaus.
  assert.equal(fristFuer(Date.UTC(2026, 10, 1)), Date.UTC(2026, 10, 15));
  assert.equal(fristFuer(Date.UTC(2027, 0, 30)), Date.UTC(2027, 1, 13));
  assert.equal(fristFuer(Date.UTC(2027, 1, 5)), PRUEF_ENDE);
});

test('Lose: je bestaetigte Empfehlung 1, eigene Bestaetigung 1, hoechstens 20', () => {
  assert.equal(lose(0, false), 0);
  assert.equal(lose(3, true), 4);
  assert.equal(lose(40, true), 20);
});

test('Empfehlungscode wie im bisherigen Einladungslink', () => {
  assert.equal(codeAusAdresse('ysr1q8x0abcdefgh12'), 'q8x0abcd');
  assert.equal(codeAusStartParam('ref_q8x0abcd'), 'q8x0abcd');
  assert.equal(codeAusStartParam('claim_W_7K2Q_AB12'), null);
});

test('initData: echt, gefaelscht, zu alt', () => {
  const token = '123:ABC';
  const jetzt = 1_800_000_000;
  const gut = initData(token, { auth_date: String(jetzt - 60), user: JSON.stringify({ id: 4242, first_name: 'K' }) });
  assert.equal(pruefeInitData(gut, token, 86400, jetzt), 4242);
  assert.equal(pruefeInitData(gut, '999:ANDERS', 86400, jetzt), null);
  assert.equal(pruefeInitData(gut.replace('4242', '4243'), token, 86400, jetzt), null);
  const alt = initData(token, { auth_date: String(jetzt - 200_000), user: JSON.stringify({ id: 1 }) });
  assert.equal(pruefeInitData(alt, token, 86400, jetzt), null);
  assert.notEqual(fingerabdruck(1, 'a'.repeat(32)), fingerabdruck(2, 'a'.repeat(32)));
});

test('Ziehung: nachvollziehbar, jede Adresse hoechstens einmal', () => {
  const eintraege = Array.from({ length: 30 }, (_, i) => ({ adresse: `ysr1a${String(i).padStart(3, '0')}`, lose: (i % 5) + 1 }));
  const hash = 'ab'.repeat(32);
  const a = ziehen(eintraege, hash);
  const b = ziehen([...eintraege].reverse(), hash);
  assert.deepEqual(a, b); // Reihenfolge der Eingabe egal
  assert.equal(a.length, 10);
  assert.equal(new Set(a.map(g => g.adresse)).size, 10);
  assert.equal(new Set(a.map(g => g.code)).size, 10);
  assert.deepEqual(a.map(g => g.betrag_usd), [...PREISE_USD]);
  assert.notDeepEqual(ziehen(eintraege, 'cd'.repeat(32)).map(g => g.adresse), a.map(g => g.adresse));
});

test('Ziehung mit weniger Teilnehmern als Plaetzen', () => {
  const g = ziehen([{ adresse: 'ysr1x', lose: 2 }, { adresse: 'ysr1y', lose: 0 }], 'ff'.repeat(32));
  assert.equal(g.length, 1);
});

test('Losliste: sortiert, Hash stabil', () => {
  const l1 = losliste([{ adresse: 'ysr1b', lose: 2 }, { adresse: 'ysr1a', lose: 1 }, { adresse: 'ysr1c', lose: 0 }]);
  assert.equal(l1.text, 'ysr1a 1\nysr1b 2');
  assert.match(l1.hash, /^[0-9a-f]{64}$/);
});
