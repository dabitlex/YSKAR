/**
 * Die Rechnung des GPU-Miners gegen eine fremde Umsetzung.
 *
 * gpu/yskar_sha256.h ist die Datei, die nvcc fuer die Karte und gcc fuer
 * diese Pruefung uebersetzt. Seit sie fuer die Karte ganz ausgerollt wird
 * (Nachrichtenplan als Fenster aus 16 Woertern, Hash und Ziel als Woerter),
 * reicht der Genesis-Block allein nicht mehr als Beleg. Hier rechnet sie
 * tausende zufaellige Header und Nonces -- und node:crypto rechnet dasselbe
 * noch einmal, ohne eine Zeile gemeinsamen Codes.
 *
 * Geprueft wird auch der Zielvergleich, vor allem an der Grenze: Ziel gleich
 * Hash, ein Bit darueber, ein Bit darunter, an jeder Byte-Stelle.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const GPU = join(import.meta.dirname, '..', 'gpu');
const gcc = spawnSync('gcc', ['--version']);
const opt = { skip: gcc.status === 0 ? false : 'gcc fehlt' };

function sha256d(b: Buffer): Buffer {
  return createHash('sha256').update(createHash('sha256').update(b).digest()).digest();
}

/** hash <= ziel, byteweise von vorn -- wie submitNonce(). */
const erfuellt = (h: Buffer, z: Buffer) => Buffer.compare(h, z) <= 0;

test('SHA-256d und Zielvergleich stimmen mit node:crypto ueberein', opt, () => {
  const prog = join(mkdtempSync(join(tmpdir(), 'yskar-sha-')), 'test_sha');
  const bau = spawnSync('gcc', ['-O2', '-Wall', '-Wextra', '-Werror', '-o', prog, join(GPU, 'test', 'test_sha.c')], { encoding: 'utf8' });
  assert.equal(bau.status, 0, bau.stderr);

  type Fall = { header: Buffer; nonce: bigint; ziel: Buffer; hash: Buffer };
  const faelle: Fall[] = [];
  const nonceZufall = () => randomBytes(8).readBigUInt64LE(0);
  const besondere = [0n, 1n, 0xffn, 0x100n, 0xffffffffn, 0x100000000n, 0xffffffffffffffffn, 50773796n];

  for (let i = 0; i < 2500; i++) {
    const header = randomBytes(136);
    const nonce = i < besondere.length ? besondere[i] : nonceZufall();
    const voll = Buffer.from(header);
    voll.writeBigUInt64LE(nonce, 128);
    const hash = sha256d(voll);

    // Ziele: zufaellig, gleich dem Hash, und knapp daneben an einer zufaelligen Stelle.
    const ziele = [randomBytes(32), Buffer.from(hash)];
    const stelle = i % 32;
    const hoeher = Buffer.from(hash), tiefer = Buffer.from(hash);
    if (hoeher[stelle] < 0xff) { hoeher[stelle]++; ziele.push(hoeher); }
    if (tiefer[stelle] > 0) { tiefer[stelle]--; ziele.push(tiefer); }
    // Fuehrende Nullen wie bei echten Zielen.
    const echt = Buffer.alloc(32); echt[3 + (i % 4)] = 1 + (i % 250); ziele.push(echt);

    for (const ziel of ziele) faelle.push({ header, nonce, ziel, hash });
  }

  const eingabe = faelle.map(f => `${f.header.toString('hex')} ${f.nonce} ${f.ziel.toString('hex')}`).join('\n') + '\n';
  const lauf = spawnSync(prog, ['--vektoren'], { input: eingabe, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  assert.equal(lauf.status, 0, lauf.stderr);
  const zeilen = lauf.stdout.trim().split('\n');
  assert.equal(zeilen.length, faelle.length);

  let erfuellteFaelle = 0;
  for (let i = 0; i < faelle.length; i++) {
    const [hash, bytes, woerter] = zeilen[i].split(' ');
    const f = faelle[i];
    assert.equal(hash, f.hash.toString('hex'), `Hash weicht ab bei Nonce ${f.nonce}`);
    const soll = erfuellt(f.hash, f.ziel) ? '1' : '0';
    assert.equal(bytes, soll, `Bytevergleich falsch bei Ziel ${f.ziel.toString('hex')}`);
    assert.equal(woerter, soll, `Wortvergleich falsch bei Ziel ${f.ziel.toString('hex')}`);
    if (soll === '1') erfuellteFaelle++;
  }
  // Beide Ausgaenge muessen oft genug vorkommen, sonst prueft der Test nichts.
  assert.ok(erfuellteFaelle > 2000 && faelle.length - erfuellteFaelle > 2000, `${erfuellteFaelle} von ${faelle.length}`);
});
