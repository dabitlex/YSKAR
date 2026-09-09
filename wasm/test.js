// Prueft die Engine gegen die TypeScript-Serialisierung und Node crypto.
const fs = require('fs');
const crypto = require('crypto');

const M = { HEADER: 0, MIDSTATE: 144, BLOCK3: 176, NONCE: 176,
            BLOCK4: 240, HASH: 304, TARGET: 336, FOUND: 368 };
const HEADER_LEN = 136, NONCE_OFF = 128;

const sha256d = b => crypto.createHash('sha256')
  .update(crypto.createHash('sha256').update(b).digest()).digest();

function header({ height = 1, prevHash, merkleRoot, stateRoot,
                  timestamp = 1788825600n, difficulty = 24576,
                  extranonce = 0n, txCount = 1, nonce = 0n }) {
  const b = Buffer.alloc(HEADER_LEN);
  b.writeUInt32LE(1, 0);
  b.writeUInt32LE(height, 4);
  prevHash.copy(b, 8);
  merkleRoot.copy(b, 40);
  stateRoot.copy(b, 72);
  b.writeBigUInt64LE(timestamp, 104);
  b.writeUInt32LE(difficulty, 112);
  b.writeUInt32LE(txCount, 116);
  b.writeBigUInt64LE(extranonce, 120);
  b.writeBigUInt64LE(nonce, 128);
  return b;
}

function targetBytes(d) {
  const t = (1n << 240n) / BigInt(d);
  const b = Buffer.alloc(32);
  let x = t;
  for (let i = 31; i >= 0; i--) { b[i] = Number(x & 0xffn); x >>= 8n; }
  return b;
}

(async () => {
  const { instance } = await WebAssembly.instantiate(
    fs.readFileSync(__dirname + '/sha256d_miner.wasm'), {});
  const mem = new Uint8Array(instance.exports.memory.buffer);
  const dv = new DataView(instance.exports.memory.buffer);
  const { init_job, mine } = instance.exports;

  let fails = 0;
  const check = (name, ok, extra = '') => {
    console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
    if (!ok) fails++;
  };

  const base = {
    prevHash: crypto.randomBytes(32),
    merkleRoot: crypto.randomBytes(32),
    stateRoot: crypto.randomBytes(32),
    extranonce: 0x0123456789abcdefn,
  };

  // --- Digest gegen Node crypto, ueber viele Nonces ---
  mem.fill(0xff, M.TARGET, M.TARGET + 32);
  let allMatch = true, bad = null;
  for (const n of [0n, 1n, 2n, 42n, 65535n, 0x7fffffffn, 0xffffffffn]) {
    const h = header({ ...base, nonce: n });
    mem.set(h, M.HEADER);
    init_job();
    const r = mine(Number(n & 0xffffffffn) | 0, 1);
    const got = Buffer.from(mem.slice(M.HASH, M.HASH + 32));
    const want = sha256d(h);
    if (r !== 1 || !got.equals(want)) {
      allMatch = false;
      if (!bad) bad = { n, want: want.toString('hex'), got: got.toString('hex') };
    }
  }
  check('Digest identisch mit crypto.sha256d (7 Nonces)', allMatch,
    bad ? `n=${bad.n}\n      erwartet ${bad.want}\n      erhalten ${bad.got}` : '');

  // --- Nonce oberhalb von 2^32 ---
  const hi = header({ ...base, nonce: (5n << 32n) | 7n });
  mem.set(hi, M.HEADER); init_job();
  mine(7, 1);
  check('Nonce > 2^32 wird korrekt gehasht',
    Buffer.from(mem.slice(M.HASH, M.HASH + 32)).equals(sha256d(hi)));

  // --- Midstate haengt nicht von der Nonce ab ---
  mem.set(header({ ...base, nonce: 1n }), M.HEADER); init_job();
  const ms1 = Buffer.from(mem.slice(M.MIDSTATE, M.MIDSTATE + 32));
  mem.set(header({ ...base, nonce: 999n }), M.HEADER); init_job();
  const ms2 = Buffer.from(mem.slice(M.MIDSTATE, M.MIDSTATE + 32));
  check('Midstate haengt nicht von der Nonce ab', ms1.equals(ms2));

  // --- Aber sehr wohl von der extranonce (sie steht im 2. Block) ---
  mem.set(header({ ...base, extranonce: 42n }), M.HEADER); init_job();
  const ms3 = Buffer.from(mem.slice(M.MIDSTATE, M.MIDSTATE + 32));
  check('Midstate aendert sich mit der extranonce', !ms1.equals(ms3));

  // --- Echte Suche ---
  const diff = 64;
  const h = header(base);
  mem.set(h, M.HEADER);
  mem.set(targetBytes(diff), M.TARGET);
  init_job();
  let found = null, scanned = 0;
  for (let b = 0; b < 40_000_000 && found === null; b += 2_000_000) {
    scanned = b + 2_000_000;
    if (mine(b, 2_000_000) === 1) found = dv.getUint32(M.FOUND, true) >>> 0;
  }
  check('Treffer unterhalb des Targets gefunden', found !== null,
    found !== null ? `Nonce ${found} nach ~${scanned.toLocaleString('de-DE')}` : '');

  if (found !== null) {
    const solved = header({ ...base, nonce: BigInt(found) });
    const d = sha256d(solved);
    const v = BigInt('0x' + d.toString('hex'));
    check('Treffer serverseitig nachrechenbar', v <= (1n << 240n) / BigInt(diff),
      d.toString('hex').slice(0, 24) + '...');
  }

  mem.fill(0, M.TARGET, M.TARGET + 32);
  check('Kein Treffer bei Target = 0', mine(0, 200_000) === 0);

  const N = 2_000_000;
  const t0 = process.hrtime.bigint();
  mine(0, N);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`\nDurchsatz hier: ${(N / ms / 1000).toFixed(2)} MH/s (1 Kern, Server-CPU)`);

  process.exit(fails ? 1 : 0);
})();
