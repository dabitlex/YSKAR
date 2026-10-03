/**
 * Pool-Verzeichnis: was die App aus der Antwort eines Pool-Knotens macht.
 *
 * Die Antwort kommt von einem fremden Rechner. Geprueft wird deshalb vor
 * allem, was passiert, wenn sie NICHT so aussieht wie erwartet.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { POOLS, standAusAntwort, waehlbar, vorschlag, hostAusEingabe, poolBasis,
         type PoolStand } from '../src/lib/pool/verzeichnis.ts';
import { finderName, nameToExtra } from '../src/lib/chain/finderName.ts';
import { toHex } from '../src/lib/core/codec.ts';

const E = { host: 'pool.test', name: 'Testpool', kette: 'pool.test' };
const gut = { name: 'pool.test', feeBps: 100, miner: 4, belegt: 5, plaetze: 63,
              frei: 58, voll: false, hashrate: 1.5e8 };

test('Liste: jeder Eintrag hat Adresse und Namen, keine Adresse doppelt', () => {
  assert.ok(POOLS.length >= 1);
  const hosts = new Set<string>();
  for (const p of POOLS) {
    assert.equal(hostAusEingabe(p.host), p.host, `${p.host} ist keine saubere Adresse`);
    assert.ok(p.name.trim().length >= 3);
    assert.ok(!hosts.has(p.host), `${p.host} steht doppelt in der Liste`);
    hosts.add(p.host);
    // Der Name in den Bloecken muss einer sein, den die Kette auch zeigt.
    if (p.kette) assert.equal(finderName(toHex(nameToExtra(p.kette))), p.kette);
  }
});

test('Stand: ein offener Pool', () => {
  const s = standAusAntwort(E, 200, gut);
  assert.equal(s.status, 'offen');
  assert.equal(s.belegt, 5);
  assert.equal(s.plaetze, 63);
  assert.equal(s.frei, 58);
  assert.equal(s.feeBps, 100);
  assert.equal(s.hashrate, 1.5e8);
  assert.equal(s.kette, 'pool.test');
  assert.equal(s.name, 'Testpool', 'der Anzeigename kommt aus der Liste');
  assert.equal(s.dabei, undefined);
});

test('Stand: voll -- und "dabei" nur, wenn der Pool es sagt', () => {
  const voll = standAusAntwort(E, 200, { ...gut, belegt: 63 });
  assert.equal(voll.status, 'voll');
  assert.equal(voll.frei, 0);
  assert.equal(waehlbar(voll), false);

  const dabei = standAusAntwort(E, 200, { ...gut, belegt: 63, dabei: true });
  assert.equal(waehlbar(dabei), true, 'ein zweites Geraet braucht keinen zweiten Platz');

  assert.equal(waehlbar(standAusAntwort(E, 200, { ...gut, belegt: 63, dabei: 'ja' })), false);
});

test('Stand: "voll" ergibt sich aus den Zahlen, nicht aus einer Behauptung', () => {
  assert.equal(standAusAntwort(E, 200, { ...gut, voll: true }).status, 'offen');
  assert.equal(standAusAntwort(E, 200, { ...gut, belegt: 63, voll: false }).status, 'voll');
});

test('Stand: mehr belegt als Plaetze wird zu "voll", nie zu negativen Plaetzen', () => {
  const s = standAusAntwort(E, 200, { ...gut, belegt: 70 });
  assert.equal(s.status, 'voll');
  assert.equal(s.belegt, 63);
  assert.equal(s.frei, 0);
});

test('Stand: aelterer Knoten ohne /pool bleibt waehlbar, nur ohne Zahlen', () => {
  const s = standAusAntwort(E, 404, { error: 'not_found' });
  assert.equal(s.status, 'unbekannt');
  assert.equal(s.plaetze, null);
  assert.equal(s.kette, 'pool.test', 'der Name aus der Liste gilt weiter');
  assert.equal(waehlbar(s), true);
});

test('Stand: Knoten ohne Pool und stumme Knoten sind nicht waehlbar', () => {
  const kein = standAusAntwort(E, 404, { error: 'pool_unavailable' });
  assert.equal(kein.status, 'keinPool');
  assert.equal(waehlbar(kein), false);

  for (const [http, body] of [[null, null], [500, {}], [502, 'Bad Gateway'], [404, null],
                              [404, '<html>'], [301, {}]] as const) {
    const s = standAusAntwort(E, http, body);
    assert.equal(s.status, 'aus', `HTTP ${http}`);
    assert.equal(waehlbar(s), false);
  }
});

test('Stand: unbrauchbare Zahlen werden verworfen, nicht angezeigt', () => {
  for (const kaputt of [
    { plaetze: 0 }, { plaetze: 65 }, { plaetze: 1.5 }, { plaetze: 'viele' }, { plaetze: null },
    { belegt: -1 }, { belegt: 2.5 }, { belegt: undefined },
  ]) {
    const s = standAusAntwort(E, 200, { ...gut, ...kaputt });
    assert.equal(s.status, 'keinPool', JSON.stringify(kaputt));
    assert.equal(waehlbar(s), false);
    assert.equal(s.plaetze, null);
    assert.equal(s.frei, null);
  }
  assert.equal(standAusAntwort(E, 200, { ...gut, hashrate: Infinity }).hashrate, null);
  assert.equal(standAusAntwort(E, 200, { ...gut, hashrate: -5 }).hashrate, null);
  assert.equal(standAusAntwort(E, 200, { ...gut, hashrate: '9e9' }).hashrate, null);
  assert.equal(standAusAntwort(E, 200, { ...gut, feeBps: 501 }).feeBps, null);
  assert.equal(standAusAntwort(E, 200, { ...gut, feeBps: -1 }).feeBps, null);
  // 200 ohne Pool-Angaben: irgendein Webserver, kein Pool.
  assert.equal(standAusAntwort(E, 200, 'ok').status, 'keinPool');
  assert.equal(standAusAntwort(E, 200, null).status, 'keinPool');
});

test('Stand: ein Name, der so nicht in einem Block stehen kann, wird nicht geglaubt', () => {
  for (const name of ['', 'ab', 'x'.repeat(33), 'Zeile\numbruch', 'Ümlaut-Pool', 42, null]) {
    assert.equal(standAusAntwort(E, 200, { ...gut, name }).kette, 'pool.test', String(name));
  }
  assert.equal(standAusAntwort({ host: 'h.test', name: 'Ohne' }, 200, { ...gut, name: '' }).kette, null);
  assert.equal(standAusAntwort(E, 200, { ...gut, name: 'anderer.name' }).kette, 'anderer.name',
    'meldet der Knoten einen gueltigen Namen, gilt der');
});

test('Vorschlag: der erste offene, sonst der erste, der antwortet', () => {
  const p = (host: string, status: PoolStand['status']): PoolStand => ({
    host, name: host, kette: null, status, belegt: null, plaetze: null, frei: null,
    hashrate: null, feeBps: null, bloecke: null });
  assert.equal(vorschlag([p('a', 'voll'), p('b', 'unbekannt'), p('c', 'offen')])?.host, 'c');
  assert.equal(vorschlag([p('a', 'voll'), p('b', 'unbekannt'), p('c', 'aus')])?.host, 'b');
  assert.equal(vorschlag([p('a', 'voll'), p('b', 'aus'), p('c', 'keinPool')]), null);
  assert.equal(vorschlag([]), null);
});

test('Eigene Adresse: gesaeubert oder abgelehnt', () => {
  assert.equal(hostAusEingabe('pool.example.net'), 'pool.example.net');
  assert.equal(hostAusEingabe('  Pool.Example.NET/  '), 'pool.example.net');
  assert.equal(hostAusEingabe('https://pool.example.net'), 'pool.example.net');
  assert.equal(hostAusEingabe('https://pool.example.net:8443/'), 'pool.example.net:8443');
  assert.equal(hostAusEingabe('http://192.168.1.20:8645'), 'http://192.168.1.20:8645');
  // Wie bisher moeglich: ein Pfad vor der Schnittstelle, und IPv6.
  assert.equal(hostAusEingabe('Pool.example.net/Yskar/'), 'pool.example.net/Yskar');
  assert.equal(hostAusEingabe('http://[::1]:8645'), 'http://[::1]:8645');
  assert.equal(hostAusEingabe('[2001:DB8::1]'), '[2001:db8::1]');
  for (const falsch of ['', '   ', 'pool example.net', 'ftp://pool.net',
                        'pool.net?x=1', 'pool.net#a', '-pool.net', 'pool_.net', 'pool.net:',
                        'javascript:alert(1)', 'user@pool.net', 'https://', 'pool.net/a b',
                        'pool.net/<script>', 'pool.net//doppelt', '[::1', 'pool.net:123456',
                        'pool.net/..', 'pool.net/a/../b', 'pool.net/.', 'pool.net\\x', 'a%2fb.net', 'pool.net%40evil.net']) {
    assert.equal(hostAusEingabe(falsch), null, falsch);
  }
  // Was durchgeht, ergibt eine Adresse, die sich als URL lesen laesst --
  // und zwar genau mit dem Rechner, der eingetippt wurde.
  for (const [ein, rechner, pfad] of [
    ['pool.example.net', 'pool.example.net', '/api/v2/pool'],
    ['pool.example.net:8443/x', 'pool.example.net', '/x/api/v2/pool'],
    ['pool.example.net/a.b/c', 'pool.example.net', '/a.b/c/api/v2/pool'],
    ['http://[::1]:8645', '[::1]', '/api/v2/pool']] as const) {
    const url = new URL(poolBasis(hostAusEingabe(ein)!) + '/api/v2/pool');
    assert.equal(url.hostname, rechner);
    assert.equal(url.pathname, pfad, 'der Pfad bleibt, wie er eingetippt wurde');
    assert.equal(url.username + url.password, '', 'keine Zugangsdaten in der Adresse');
  }
});

test('Basis-URL: HTTPS, ausser http steht ausdruecklich da', () => {
  assert.equal(poolBasis('pool.example.net'), 'https://pool.example.net');
  assert.equal(poolBasis('pool.example.net/'), 'https://pool.example.net');
  assert.equal(poolBasis('http://192.168.1.20:8645'), 'http://192.168.1.20:8645');
  assert.equal(poolBasis('https://pool.example.net'), 'https://pool.example.net');
});
