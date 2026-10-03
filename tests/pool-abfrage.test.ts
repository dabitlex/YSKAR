/**
 * Die Abfrage eines Pools, gegen ECHTE Knoten.
 *
 * pool-verzeichnis.test.ts prueft, was aus einer Antwort wird. Hier geht es
 * darum, dass Frage und Antwort zusammenpassen: Derselbe MiningServer, der
 * beim Betreiber laeuft, wird gefragt -- und daneben das, was kein Pool ist.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

import { ChainStore } from '../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';
import { MiningCoordinator } from '../src/lib/node/fullnode/MiningCoordinator.ts';
import { MiningServer } from '../src/lib/node/fullnode/MiningServer.ts';
import { PoolCoordinator } from '../src/lib/pool/PoolCoordinator.ts';
import { REGTEST } from '../src/lib/core/networks.ts';
import { encodeAddress } from '../src/lib/core/address.ts';
import { poolFragen } from '../src/lib/pool/abfrage.ts';
import { waehlbar } from '../src/lib/pool/verzeichnis.ts';

const adr = (n: number) => encodeAddress(new Uint8Array(20).fill(n));

async function knoten(port: number, pool: { max?: number; fee?: number } | null) {
  const store = new ChainStore(':memory:', { network: REGTEST.network, chainId: REGTEST.chainId });
  const chain = new ChainManager(store, REGTEST);
  const txpool = new TxPool();
  const mining = new MiningCoordinator(chain, store, txpool, REGTEST);
  const server = new MiningServer({ chain, store, pool: txpool, mining }, { params: REGTEST });
  if (pool) {
    server.poolKoordinator = new PoolCoordinator({
      name: 'pool.test', feeBps: pool.fee ?? 0,
      payoutAddress: pool.fee ? new Uint8Array(20).fill(200) : null,
      ...(pool.max ? { maxMiner: pool.max } : {}),
    });
  }
  await server.listen('127.0.0.1', port);
  const host = `http://127.0.0.1:${port}`;
  return {
    eintrag: { host, name: 'Testpool' },
    anmelden: (address: string) => fetch(`${host}/api/v2/session`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address, mode: 'pool' }),
    }).then(r => r.status),
    async zu() { await server.close(); store.close(); },
  };
}

test('Abfrage: offener Pool mit Gebühr', async () => {
  const k = await knoten(18921, { fee: 150 });
  try {
    await k.anmelden(adr(1));
    const s = await poolFragen(k.eintrag);
    assert.equal(s.status, 'offen');
    assert.equal(s.name, 'Testpool');
    assert.equal(s.kette, 'pool.test', 'der Name in den Blöcken kommt vom Knoten');
    assert.equal(s.belegt, 1);
    assert.equal(s.plaetze, 63);
    assert.equal(s.frei, 62);
    assert.equal(s.feeBps, 150);
    assert.equal(s.hashrate, 0);
    assert.equal(waehlbar(s), true);
  } finally { await k.zu(); }
});

test('Abfrage: voller Pool — gesperrt, außer man ist dabei', async () => {
  const k = await knoten(18922, { max: 2 });
  try {
    await k.anmelden(adr(1));
    await k.anmelden(adr(2));

    const fremd = await poolFragen(k.eintrag, { address: adr(3) });
    assert.equal(fremd.status, 'voll');
    assert.equal(fremd.frei, 0);
    assert.equal(fremd.dabei, false);
    assert.equal(waehlbar(fremd), false);

    const dabei = await poolFragen(k.eintrag, { address: adr(1) });
    assert.equal(dabei.status, 'voll');
    assert.equal(dabei.dabei, true);
    assert.equal(waehlbar(dabei), true);

    // Und der Knoten haelt, was die Abfrage sagt.
    assert.equal(await k.anmelden(adr(3)), 409);
    assert.equal(await k.anmelden(adr(1)), 200);
  } finally { await k.zu(); }
});

test('Abfrage: Knoten ohne Pool', async () => {
  const k = await knoten(18923, null);
  try {
    const s = await poolFragen(k.eintrag);
    assert.equal(s.status, 'keinPool');
    assert.equal(waehlbar(s), false);
  } finally { await k.zu(); }
});

test('Abfrage: älterer Knoten, der /pool nicht kennt, bleibt wählbar', async () => {
  // So antwortet der MiningServer vor dieser Änderung auf jede unbekannte Route.
  const alt = createServer((_, res) => {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
  await new Promise<void>(auf => alt.listen(18924, '127.0.0.1', auf));
  try {
    const s = await poolFragen({ host: 'http://127.0.0.1:18924', name: 'Alt', kette: 'alt.pool' });
    assert.equal(s.status, 'unbekannt');
    assert.equal(s.kette, 'alt.pool');
    assert.equal(waehlbar(s), true);
  } finally { await new Promise(auf => alt.close(auf)); }
});

test('Abfrage: niemand da, Unsinn, Umleitung, Schweigen — nie wählbar, nie ein Fehler', async () => {
  // Niemand lauscht.
  assert.equal((await poolFragen({ host: 'http://127.0.0.1:18925', name: 'Tot' })).status, 'aus');

  // Ein echter, offener Pool -- das Ziel der Umleitung. Folgte die Abfrage
  // ihr, kaeme hier "offen" heraus.
  const ziel = await knoten(18927, {});
  let art = 'html';
  const fremd = createServer((_, res) => {
    if (art === 'html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<h1>It works!</h1>'); }
    else if (art === 'um') { res.writeHead(302, { location: 'http://127.0.0.1:18927/api/v2/pool' }); res.end(); }
    else if (art === '500') { res.writeHead(500); res.end('kaputt'); }
    // 'stumm': gar nicht antworten
  });
  await new Promise<void>(auf => fremd.listen(18926, '127.0.0.1', auf));
  try {
    const e = { host: 'http://127.0.0.1:18926', name: 'Fremd' };
    // Ein Webserver, der irgendetwas mit 200 ausliefert, ist kein Pool mit Plaetzen.
    const html = await poolFragen(e);
    assert.equal(html.status, 'keinPool');
    assert.equal(waehlbar(html), false);

    art = 'um';
    assert.equal((await poolFragen(ziel.eintrag)).status, 'offen', 'das Ziel selbst ist ein offener Pool');
    assert.equal((await poolFragen(e)).status, 'aus', 'einer Umleitung wird nicht gefolgt');
    art = '500';
    assert.equal((await poolFragen(e)).status, 'aus');
    art = 'stumm';
    const t0 = Date.now();
    assert.equal((await poolFragen(e, { wartenMs: 300 })).status, 'aus');
    assert.ok(Date.now() - t0 < 2000, 'die Abfrage muss von selbst aufgeben');
  } finally {
    fremd.closeAllConnections();
    await new Promise(auf => fremd.close(auf));
    await ziel.zu();
  }
});
