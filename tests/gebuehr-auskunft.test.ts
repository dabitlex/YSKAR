/**
 * Gebuehrenauskunft der Wallet (src/lib/wallet/gebuehrAuskunft.ts).
 *
 * Antwortet die Route der App nicht, fragt die Wallet den Knoten, an den sie
 * ohnehin sendet. Gesperrt wird nur in den drei Bloecken vor der
 * Aktivierungshoehe -- oder wenn keine der beiden Quellen antwortet.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { auskunftHolen, sendeStand } from '../src/lib/wallet/gebuehrAuskunft.ts';
import { V6_HEIGHT_UNSET } from '../src/lib/core/params.ts';

const markt = (x: Record<string, unknown> = {}) => ({ minFee: '100000', wartend: 0, andrang: false,
  stufen: { langsam: { fee: '1', block: 1 }, normal: { fee: '1', block: 1 }, schnell: { fee: '1', block: 1 } },
  hinweis: '', ...x });

function abruf(antworten: Record<string, unknown | Error>) {
  const gefragt: string[] = [];
  const f = async (url: string) => {
    gefragt.push(url);
    const a = antworten[url];
    if (a === undefined || a instanceof Error) throw a ?? new Error('nicht erreichbar');
    return { json: async () => a } as Response;
  };
  return { f: f as unknown as typeof fetch, gefragt };
}

test('auskunftHolen: zuerst die App, bei Fehler der Knoten', async () => {
  const ok = abruf({ '/api/v2/fees': markt({ fassung: 1 }) });
  assert.equal((await auskunftHolen('https://knoten.example', ok.f))?.fassung, 1);
  assert.deepEqual(ok.gefragt, ['/api/v2/fees']);

  // Route der App antwortet mit Fehler (503 vom Durchreichen) -> Knoten.
  const ersatz = abruf({ '/api/v2/fees': { error: 'fullnode_nicht_erreichbar' },
    'https://knoten.example/api/v2/fees': markt({ fassung: 1, hoehe: 9_000 }) });
  assert.equal((await auskunftHolen('https://knoten.example', ersatz.f))?.hoehe, 9_000);
  assert.deepEqual(ersatz.gefragt, ['/api/v2/fees', 'https://knoten.example/api/v2/fees']);

  // Netzfehler bei der App -> Knoten.
  const netz = abruf({ '/api/v2/fees': new Error('offline'), 'https://knoten.example/api/v2/fees': markt() });
  assert.ok(await auskunftHolen('https://knoten.example', netz.f));

  // Beide stumm -> null. Ohne eigene Knotenadresse wird nur die App gefragt.
  assert.equal(await auskunftHolen('https://knoten.example', abruf({}).f), null);
  const ohne = abruf({});
  assert.equal(await auskunftHolen('', ohne.f), null);
  assert.deepEqual(ohne.gefragt, ['/api/v2/fees']);
});

test('sendeStand: mit Auskunft entscheidet der Knoten, gesperrt nur in der Pause', () => {
  assert.deepEqual(sendeStand(markt({ fassung: 1, sendepause: false }), 10_000), { fassung: 1, pause: false, unbekannt: false });
  assert.deepEqual(sendeStand(markt({ fassung: 1, sendepause: true }), 10_000), { fassung: 1, pause: true, unbekannt: false });
  assert.deepEqual(sendeStand(markt({ fassung: 2, sendepause: false }), 10_000), { fassung: 2, pause: false, unbekannt: false });
  // Aeltere Knoten nennen keine Fassung: Fassung 1, keine Pause.
  assert.deepEqual(sendeStand(markt(), 10_000), { fassung: 1, pause: false, unbekannt: false });
});

test('sendeStand: ohne jede Auskunft nur ohne gesetzte Hoehe senden', () => {
  assert.deepEqual(sendeStand(null, V6_HEIGHT_UNSET), { fassung: 1, pause: false, unbekannt: false });
  assert.deepEqual(sendeStand(null, 10_000), { fassung: 1, pause: false, unbekannt: true });
});

test('auskunftHolen: jede Abfrage hat eine Frist', async () => {
  const signale: unknown[] = [];
  const f = (async (_url: string, opt?: RequestInit) => {
    signale.push(opt?.signal);
    throw new Error('offline');
  }) as unknown as typeof fetch;
  assert.equal(await auskunftHolen('https://knoten.example', f), null);
  assert.equal(signale.length, 2);
  for (const s of signale) assert.ok(s instanceof AbortSignal);
});
