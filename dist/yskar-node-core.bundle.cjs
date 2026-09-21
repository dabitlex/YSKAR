"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../node_modules/@noble/hashes/_u64.js
function fromBig(n, le = false) {
  if (le)
    return { h: Number(n & U32_MASK64), l: Number(n >> _32n & U32_MASK64) };
  return { h: Number(n >> _32n & U32_MASK64) | 0, l: Number(n & U32_MASK64) | 0 };
}
function split(lst, le = false) {
  const len = lst.length;
  let Ah = new Uint32Array(len);
  let Al = new Uint32Array(len);
  for (let i = 0; i < len; i++) {
    const { h, l } = fromBig(lst[i], le);
    [Ah[i], Al[i]] = [h, l];
  }
  return [Ah, Al];
}
function setU64FromNum(view, byteOffset, n, isLE) {
  const h = fromNumH(n);
  const l = fromNumL(n);
  view.setUint32(byteOffset, isLE ? l : h, isLE);
  view.setUint32(byteOffset + 4, isLE ? h : l, isLE);
}
function add(Ah, Al, Bh, Bl) {
  const l = (Al >>> 0) + (Bl >>> 0);
  return { h: Ah + Bh + (l / 2 ** 32 | 0) | 0, l: l | 0 };
}
var U32_MASK64, _32n, fromNumH, fromNumL, shrSH, shrSL, rotrSH, rotrSL, rotrBH, rotrBL, add3L, add3H, add4L, add4H, add5L, add5H;
var init_u64 = __esm({
  "../node_modules/@noble/hashes/_u64.js"() {
    U32_MASK64 = /* @__PURE__ */ (() => BigInt(2 ** 32 - 1))();
    _32n = /* @__PURE__ */ BigInt(32);
    fromNumH = (n) => n / 2 ** 32 | 0;
    fromNumL = (n) => n >>> 0;
    shrSH = (h, _l, s) => h >>> s;
    shrSL = (h, l, s) => h << 32 - s | l >>> s;
    rotrSH = (h, l, s) => h >>> s | l << 32 - s;
    rotrSL = (h, l, s) => h << 32 - s | l >>> s;
    rotrBH = (h, l, s) => h << 64 - s | l >>> s - 32;
    rotrBL = (h, l, s) => h >>> s - 32 | l << 64 - s;
    add3L = (Al, Bl, Cl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0);
    add3H = (low, Ah, Bh, Ch) => Ah + Bh + Ch + (low / 2 ** 32 | 0) | 0;
    add4L = (Al, Bl, Cl, Dl) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0);
    add4H = (low, Ah, Bh, Ch, Dh) => Ah + Bh + Ch + Dh + (low / 2 ** 32 | 0) | 0;
    add5L = (Al, Bl, Cl, Dl, El) => (Al >>> 0) + (Bl >>> 0) + (Cl >>> 0) + (Dl >>> 0) + (El >>> 0);
    add5H = (low, Ah, Bh, Ch, Dh, Eh) => Ah + Bh + Ch + Dh + Eh + (low / 2 ** 32 | 0) | 0;
  }
});

// ../node_modules/@noble/hashes/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
}
function anumber(n, title = "") {
  if (typeof n !== "number")
    throw new TypeError(atitle(title) + "expected number, got " + typeof n);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new RangeError(atitle(title) + "expected integer >= 0, got " + n);
  return n;
}
function abytes(value, length, title = "") {
  if (isBytes(value) && (length === void 0 || value.length === length))
    return value;
  if (length !== void 0)
    anumber(length, "length");
  const bytes = isBytes(value);
  const ofLen = length !== void 0 ? ` of length ${length}` : "";
  const got = bytes ? `length=${value.length}` : `type=${typeof value}`;
  const message = atitle(title) + "expected Uint8Array" + ofLen + ", got " + got;
  if (!bytes)
    throw new TypeError(message);
  throw new RangeError(message);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("hash was destroyed");
  if (checkFinished && instance.finished)
    throw new Error("digest() was already called");
}
function aoutput(out, instance) {
  abytes(out, void 0, "output");
  const min = instance.outputLen;
  if (!(out.length >= min)) {
    throw new RangeError('"output" expected length >= ' + min);
  }
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
function bytesToHex(bytes) {
  abytes(bytes);
  if (hasHexBuiltin)
    return bytes.toHex();
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += hexes[bytes[i]];
  }
  return hex;
}
function asciiToBase16(ch) {
  return ch >= 48 && ch <= 57 ? ch - 48 : ch >= 65 && ch <= 70 ? ch - (65 - 10) : ch >= 97 && ch <= 102 ? ch - (97 - 10) : void 0;
}
function hexToBytes(hex) {
  if (typeof hex !== "string")
    throw new TypeError("hex string expected, got " + typeof hex);
  if (hasHexBuiltin) {
    try {
      return Uint8Array.fromHex(hex);
    } catch (error) {
      if (error instanceof SyntaxError)
        throw new RangeError(error.message);
      throw error;
    }
  }
  const hl = hex.length;
  const al = hl / 2;
  if (hl % 2)
    throw new RangeError("hex string expected, got unpadded hex of length " + hl);
  const array = new Uint8Array(al);
  for (let ai = 0, hi = 0; ai < al; ai++, hi += 2) {
    const n1 = asciiToBase16(hex.charCodeAt(hi));
    const n2 = asciiToBase16(hex.charCodeAt(hi + 1));
    if (n1 === void 0 || n2 === void 0) {
      const char = hex[hi] + hex[hi + 1];
      throw new RangeError('hex string expected, got non-hex character "' + char + '" at index ' + hi);
    }
    array[ai] = n1 * 16 + n2;
  }
  return array;
}
function concatBytes(...arrays) {
  let sum = 0;
  for (let i = 0; i < arrays.length; i++) {
    const a = arrays[i];
    abytes(a);
    sum += a.length;
  }
  const res = new Uint8Array(sum);
  for (let i = 0, pad = 0; i < arrays.length; i++) {
    const a = arrays[i];
    res.set(a, pad);
    pad += a.length;
  }
  return res;
}
function checkOpts(defaults, opts, title = "opts") {
  aopts(defaults, "defaults");
  if (opts !== void 0)
    aopts(opts, title);
  const merged = Object.assign(/* @__PURE__ */ Object.create(null), defaults, opts);
  return merged;
}
function createHasher(hashCons, info = {}) {
  if (typeof hashCons !== "function")
    throw new TypeError('"hashCons" expected function, got type=' + typeof hashCons);
  info = checkOpts({}, info, "info");
  const hashC = (msg, opts) => hashCons(opts).update(msg).digest();
  const tmp = hashCons(void 0);
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.canXOF = tmp.canXOF;
  hashC.create = (opts) => hashCons(opts);
  Object.assign(hashC, info);
  return Object.freeze(hashC);
}
function randomBytes(bytesLength = 32) {
  anumber(bytesLength, "bytesLength");
  const cr = typeof globalThis === "object" ? globalThis.crypto : null;
  if (typeof cr?.getRandomValues !== "function")
    throw new Error("crypto.getRandomValues must be defined");
  if (bytesLength > 65536)
    throw new RangeError(`"bytesLength" expected <= 65536, got ${bytesLength}`);
  return cr.getRandomValues(new Uint8Array(bytesLength));
}
var atitle, aobject, aopts, hasHexBuiltin, hexes, oidNist;
var init_utils = __esm({
  "../node_modules/@noble/hashes/utils.js"() {
    atitle = (title) => title ? `"${title}" ` : "";
    aobject = (value, label) => {
      if (value === null || typeof value !== "object" || Array.isArray(value))
        throw new TypeError((label === "object" ? "" : `"${label}" `) + "expected object, got type=" + typeof value);
    };
    aopts = (value, label) => {
      aobject(value, label);
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null)
        throw new TypeError(`"${label}" expected plain object`);
      if (Object.hasOwn(value, "__proto__"))
        throw new TypeError(`"${label}.__proto__" is not allowed`);
    };
    hasHexBuiltin = /* @__PURE__ */ (() => (
      // @ts-ignore
      typeof Uint8Array.from([]).toHex === "function" && typeof Uint8Array.fromHex === "function"
    ))();
    hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
    oidNist = (suffix) => ({
      // Current NIST hashAlgs suffixes used here fit in one DER subidentifier octet.
      // Larger suffix values would need base-128 OID encoding and a different length byte.
      oid: Uint8Array.from([6, 9, 96, 134, 72, 1, 101, 3, 4, 2, suffix])
    });
  }
});

// ../node_modules/@noble/hashes/_md.js
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD, SHA256_IV, SHA512_IV;
var init_md = __esm({
  "../node_modules/@noble/hashes/_md.js"() {
    init_u64();
    init_utils();
    HashMD = class {
      blockLen;
      outputLen;
      canXOF = false;
      padOffset;
      isLE;
      // For partial updates less than block size
      buffer;
      view;
      finished = false;
      length = 0;
      pos = 0;
      destroyed = false;
      constructor(blockLen, outputLen, padOffset, isLE) {
        this.blockLen = blockLen;
        this.outputLen = outputLen;
        this.padOffset = padOffset;
        this.isLE = isLE;
        this.buffer = new Uint8Array(blockLen);
        this.view = createView(this.buffer);
      }
      update(data) {
        aexists(this);
        abytes(data);
        const { view, buffer, blockLen } = this;
        const len = data.length;
        let processed = false;
        for (let pos = 0; pos < len; ) {
          const take = Math.min(blockLen - this.pos, len - pos);
          if (take === blockLen) {
            const dataView = createView(data);
            for (; blockLen <= len - pos; pos += blockLen)
              this.process(dataView, pos);
            processed = true;
            continue;
          }
          buffer.set(pos === 0 && take === len ? data : data.subarray(pos, pos + take), this.pos);
          this.pos += take;
          pos += take;
          if (this.pos === blockLen) {
            this.process(view, 0);
            this.pos = 0;
            processed = true;
          }
        }
        this.length += data.length;
        if (processed)
          this.roundClean();
        return this;
      }
      digestInto(out) {
        aexists(this);
        aoutput(out, this);
        this.finished = true;
        const { buffer, view, blockLen, isLE } = this;
        let { pos } = this;
        buffer[pos++] = 128;
        buffer.fill(0, pos);
        if (this.padOffset > blockLen - pos) {
          this.process(view, 0);
          buffer.fill(0);
        }
        setU64FromNum(view, blockLen - 8, this.length * 8, isLE);
        this.process(view, 0);
        this.roundClean();
        const oview = out === buffer ? view : createView(out);
        const len = this.outputLen;
        const outLen = len / 4;
        const state = this.get();
        if (len % 4 || outLen > state.length)
          throw new Error("invalid outputLen");
        for (let i = 0; i < outLen; i++)
          oview.setUint32(4 * i, state[i], isLE);
      }
      digest() {
        const { buffer, outputLen } = this;
        this.digestInto(buffer);
        const res = buffer.slice(0, outputLen);
        this.destroy();
        return res;
      }
      _cloneIntoMeta(to) {
        const { buffer, length, finished, destroyed, pos } = this;
        to.destroyed = destroyed;
        to.finished = finished;
        to.length = length;
        to.pos = pos;
        if (pos)
          to.buffer.set(buffer);
        return to;
      }
      clone() {
        return this._cloneInto();
      }
    };
    SHA256_IV = /* @__PURE__ */ Uint32Array.from([
      1779033703,
      3144134277,
      1013904242,
      2773480762,
      1359893119,
      2600822924,
      528734635,
      1541459225
    ]);
    SHA512_IV = /* @__PURE__ */ Uint32Array.from([
      1779033703,
      4089235720,
      3144134277,
      2227873595,
      1013904242,
      4271175723,
      2773480762,
      1595750129,
      1359893119,
      2917565137,
      2600822924,
      725511199,
      528734635,
      4215389547,
      1541459225,
      327033209
    ]);
  }
});

// ../node_modules/@noble/hashes/sha2.js
var SHA256_K, SHA256_W, SHA2_32B, _SHA256, K512, SHA512_Kh, SHA512_Kl, SHA512_W_H, SHA512_W_L, SHA2_64B, _SHA512, sha256, sha512;
var init_sha2 = __esm({
  "../node_modules/@noble/hashes/sha2.js"() {
    init_md();
    init_u64();
    init_utils();
    SHA256_K = /* @__PURE__ */ Uint32Array.from([
      1116352408,
      1899447441,
      3049323471,
      3921009573,
      961987163,
      1508970993,
      2453635748,
      2870763221,
      3624381080,
      310598401,
      607225278,
      1426881987,
      1925078388,
      2162078206,
      2614888103,
      3248222580,
      3835390401,
      4022224774,
      264347078,
      604807628,
      770255983,
      1249150122,
      1555081692,
      1996064986,
      2554220882,
      2821834349,
      2952996808,
      3210313671,
      3336571891,
      3584528711,
      113926993,
      338241895,
      666307205,
      773529912,
      1294757372,
      1396182291,
      1695183700,
      1986661051,
      2177026350,
      2456956037,
      2730485921,
      2820302411,
      3259730800,
      3345764771,
      3516065817,
      3600352804,
      4094571909,
      275423344,
      430227734,
      506948616,
      659060556,
      883997877,
      958139571,
      1322822218,
      1537002063,
      1747873779,
      1955562222,
      2024104815,
      2227730452,
      2361852424,
      2428436474,
      2756734187,
      3204031479,
      3329325298
    ]);
    SHA256_W = /* @__PURE__ */ new Uint32Array(64);
    SHA2_32B = class extends HashMD {
      // We cannot use array here since array allows indexing by variable
      // which means optimizer/compiler cannot use registers.
      // Numeric initializers matter: starting the fields as `undefined` changes
      // V8's field representation and makes sha256 3x slower (measured).
      A = 0;
      B = 0;
      C = 0;
      D = 0;
      E = 0;
      F = 0;
      G = 0;
      H = 0;
      constructor(outputLen, IV) {
        super(64, outputLen, 8, false);
        this.A = IV[0] | 0;
        this.B = IV[1] | 0;
        this.C = IV[2] | 0;
        this.D = IV[3] | 0;
        this.E = IV[4] | 0;
        this.F = IV[5] | 0;
        this.G = IV[6] | 0;
        this.H = IV[7] | 0;
      }
      get() {
        const { A, B, C, D, E, F, G, H } = this;
        return [A, B, C, D, E, F, G, H];
      }
      // prettier-ignore
      set(A, B, C, D, E, F, G, H) {
        this.A = A | 0;
        this.B = B | 0;
        this.C = C | 0;
        this.D = D | 0;
        this.E = E | 0;
        this.F = F | 0;
        this.G = G | 0;
        this.H = H | 0;
      }
      _cloneInto(to) {
        (to ||= new this.constructor()).set(...this.get());
        return this._cloneIntoMeta(to);
      }
      process(view, offset) {
        for (let i = 0; i < 16; i++, offset += 4)
          SHA256_W[i] = view.getUint32(offset, false);
        for (let i = 16; i < 64; i++) {
          const W15 = SHA256_W[i - 15];
          const W2 = SHA256_W[i - 2];
          const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
          const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
          SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
        }
        let { A, B, C, D, E, F, G, H } = this;
        for (let i = 0; i < 64; i++) {
          const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
          const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
          const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
          const T2 = sigma0 + Maj(A, B, C) | 0;
          H = G;
          G = F;
          F = E;
          E = D + T1 | 0;
          D = C;
          C = B;
          B = A;
          A = T1 + T2 | 0;
        }
        A = A + this.A | 0;
        B = B + this.B | 0;
        C = C + this.C | 0;
        D = D + this.D | 0;
        E = E + this.E | 0;
        F = F + this.F | 0;
        G = G + this.G | 0;
        H = H + this.H | 0;
        this.set(A, B, C, D, E, F, G, H);
      }
      roundClean() {
        clean(SHA256_W);
      }
      destroy() {
        this.destroyed = true;
        this.set(0, 0, 0, 0, 0, 0, 0, 0);
        clean(this.buffer);
      }
    };
    _SHA256 = class extends SHA2_32B {
      constructor() {
        super(32, SHA256_IV);
      }
    };
    K512 = /* @__PURE__ */ (() => split([
      "0x428a2f98d728ae22",
      "0x7137449123ef65cd",
      "0xb5c0fbcfec4d3b2f",
      "0xe9b5dba58189dbbc",
      "0x3956c25bf348b538",
      "0x59f111f1b605d019",
      "0x923f82a4af194f9b",
      "0xab1c5ed5da6d8118",
      "0xd807aa98a3030242",
      "0x12835b0145706fbe",
      "0x243185be4ee4b28c",
      "0x550c7dc3d5ffb4e2",
      "0x72be5d74f27b896f",
      "0x80deb1fe3b1696b1",
      "0x9bdc06a725c71235",
      "0xc19bf174cf692694",
      "0xe49b69c19ef14ad2",
      "0xefbe4786384f25e3",
      "0x0fc19dc68b8cd5b5",
      "0x240ca1cc77ac9c65",
      "0x2de92c6f592b0275",
      "0x4a7484aa6ea6e483",
      "0x5cb0a9dcbd41fbd4",
      "0x76f988da831153b5",
      "0x983e5152ee66dfab",
      "0xa831c66d2db43210",
      "0xb00327c898fb213f",
      "0xbf597fc7beef0ee4",
      "0xc6e00bf33da88fc2",
      "0xd5a79147930aa725",
      "0x06ca6351e003826f",
      "0x142929670a0e6e70",
      "0x27b70a8546d22ffc",
      "0x2e1b21385c26c926",
      "0x4d2c6dfc5ac42aed",
      "0x53380d139d95b3df",
      "0x650a73548baf63de",
      "0x766a0abb3c77b2a8",
      "0x81c2c92e47edaee6",
      "0x92722c851482353b",
      "0xa2bfe8a14cf10364",
      "0xa81a664bbc423001",
      "0xc24b8b70d0f89791",
      "0xc76c51a30654be30",
      "0xd192e819d6ef5218",
      "0xd69906245565a910",
      "0xf40e35855771202a",
      "0x106aa07032bbd1b8",
      "0x19a4c116b8d2d0c8",
      "0x1e376c085141ab53",
      "0x2748774cdf8eeb99",
      "0x34b0bcb5e19b48a8",
      "0x391c0cb3c5c95a63",
      "0x4ed8aa4ae3418acb",
      "0x5b9cca4f7763e373",
      "0x682e6ff3d6b2b8a3",
      "0x748f82ee5defb2fc",
      "0x78a5636f43172f60",
      "0x84c87814a1f0ab72",
      "0x8cc702081a6439ec",
      "0x90befffa23631e28",
      "0xa4506cebde82bde9",
      "0xbef9a3f7b2c67915",
      "0xc67178f2e372532b",
      "0xca273eceea26619c",
      "0xd186b8c721c0c207",
      "0xeada7dd6cde0eb1e",
      "0xf57d4f7fee6ed178",
      "0x06f067aa72176fba",
      "0x0a637dc5a2c898a6",
      "0x113f9804bef90dae",
      "0x1b710b35131c471b",
      "0x28db77f523047d84",
      "0x32caab7b40c72493",
      "0x3c9ebe0a15c9bebc",
      "0x431d67c49c100d4c",
      "0x4cc5d4becb3e42b6",
      "0x597f299cfc657e2a",
      "0x5fcb6fab3ad6faec",
      "0x6c44198c4a475817"
    ].map((n) => BigInt(n))))();
    SHA512_Kh = /* @__PURE__ */ (() => K512[0])();
    SHA512_Kl = /* @__PURE__ */ (() => K512[1])();
    SHA512_W_H = /* @__PURE__ */ new Uint32Array(80);
    SHA512_W_L = /* @__PURE__ */ new Uint32Array(80);
    SHA2_64B = class extends HashMD {
      // We cannot use array here since array allows indexing by variable
      // which means optimizer/compiler cannot use registers.
      // h -- high 32 bits, l -- low 32 bits
      // Numeric initializers matter: starting the fields as `undefined` changes
      // V8's field representation and slows hashing down (measured on sha256).
      Ah = 0;
      Al = 0;
      Bh = 0;
      Bl = 0;
      Ch = 0;
      Cl = 0;
      Dh = 0;
      Dl = 0;
      Eh = 0;
      El = 0;
      Fh = 0;
      Fl = 0;
      Gh = 0;
      Gl = 0;
      Hh = 0;
      Hl = 0;
      constructor(outputLen, IV) {
        super(128, outputLen, 16, false);
        this.Ah = IV[0] | 0;
        this.Al = IV[1] | 0;
        this.Bh = IV[2] | 0;
        this.Bl = IV[3] | 0;
        this.Ch = IV[4] | 0;
        this.Cl = IV[5] | 0;
        this.Dh = IV[6] | 0;
        this.Dl = IV[7] | 0;
        this.Eh = IV[8] | 0;
        this.El = IV[9] | 0;
        this.Fh = IV[10] | 0;
        this.Fl = IV[11] | 0;
        this.Gh = IV[12] | 0;
        this.Gl = IV[13] | 0;
        this.Hh = IV[14] | 0;
        this.Hl = IV[15] | 0;
      }
      // prettier-ignore
      get() {
        const { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
        return [Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl];
      }
      // prettier-ignore
      set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl) {
        this.Ah = Ah | 0;
        this.Al = Al | 0;
        this.Bh = Bh | 0;
        this.Bl = Bl | 0;
        this.Ch = Ch | 0;
        this.Cl = Cl | 0;
        this.Dh = Dh | 0;
        this.Dl = Dl | 0;
        this.Eh = Eh | 0;
        this.El = El | 0;
        this.Fh = Fh | 0;
        this.Fl = Fl | 0;
        this.Gh = Gh | 0;
        this.Gl = Gl | 0;
        this.Hh = Hh | 0;
        this.Hl = Hl | 0;
      }
      _cloneInto(to) {
        (to ||= new this.constructor()).set(...this.get());
        return this._cloneIntoMeta(to);
      }
      process(view, offset) {
        for (let i = 0; i < 16; i++, offset += 4) {
          SHA512_W_H[i] = view.getUint32(offset);
          SHA512_W_L[i] = view.getUint32(offset += 4);
        }
        for (let i = 16; i < 80; i++) {
          const W15h = SHA512_W_H[i - 15] | 0;
          const W15l = SHA512_W_L[i - 15] | 0;
          const s0h = rotrSH(W15h, W15l, 1) ^ rotrSH(W15h, W15l, 8) ^ shrSH(W15h, W15l, 7);
          const s0l = rotrSL(W15h, W15l, 1) ^ rotrSL(W15h, W15l, 8) ^ shrSL(W15h, W15l, 7);
          const W2h = SHA512_W_H[i - 2] | 0;
          const W2l = SHA512_W_L[i - 2] | 0;
          const s1h = rotrSH(W2h, W2l, 19) ^ rotrBH(W2h, W2l, 61) ^ shrSH(W2h, W2l, 6);
          const s1l = rotrSL(W2h, W2l, 19) ^ rotrBL(W2h, W2l, 61) ^ shrSL(W2h, W2l, 6);
          const SUMl = add4L(s0l, s1l, SHA512_W_L[i - 7], SHA512_W_L[i - 16]);
          const SUMh = add4H(SUMl, s0h, s1h, SHA512_W_H[i - 7], SHA512_W_H[i - 16]);
          SHA512_W_H[i] = SUMh | 0;
          SHA512_W_L[i] = SUMl | 0;
        }
        let { Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl } = this;
        for (let i = 0; i < 80; i++) {
          const sigma1h = rotrSH(Eh, El, 14) ^ rotrSH(Eh, El, 18) ^ rotrBH(Eh, El, 41);
          const sigma1l = rotrSL(Eh, El, 14) ^ rotrSL(Eh, El, 18) ^ rotrBL(Eh, El, 41);
          const CHIh = Eh & Fh ^ ~Eh & Gh;
          const CHIl = El & Fl ^ ~El & Gl;
          const T1ll = add5L(Hl, sigma1l, CHIl, SHA512_Kl[i], SHA512_W_L[i]);
          const T1h = add5H(T1ll, Hh, sigma1h, CHIh, SHA512_Kh[i], SHA512_W_H[i]);
          const T1l = T1ll | 0;
          const sigma0h = rotrSH(Ah, Al, 28) ^ rotrBH(Ah, Al, 34) ^ rotrBH(Ah, Al, 39);
          const sigma0l = rotrSL(Ah, Al, 28) ^ rotrBL(Ah, Al, 34) ^ rotrBL(Ah, Al, 39);
          const MAJh = Ah & Bh ^ Ah & Ch ^ Bh & Ch;
          const MAJl = Al & Bl ^ Al & Cl ^ Bl & Cl;
          Hh = Gh | 0;
          Hl = Gl | 0;
          Gh = Fh | 0;
          Gl = Fl | 0;
          Fh = Eh | 0;
          Fl = El | 0;
          ({ h: Eh, l: El } = add(Dh | 0, Dl | 0, T1h | 0, T1l | 0));
          Dh = Ch | 0;
          Dl = Cl | 0;
          Ch = Bh | 0;
          Cl = Bl | 0;
          Bh = Ah | 0;
          Bl = Al | 0;
          const All = add3L(T1l, sigma0l, MAJl);
          Ah = add3H(All, T1h, sigma0h, MAJh);
          Al = All | 0;
        }
        ({ h: Ah, l: Al } = add(this.Ah | 0, this.Al | 0, Ah | 0, Al | 0));
        ({ h: Bh, l: Bl } = add(this.Bh | 0, this.Bl | 0, Bh | 0, Bl | 0));
        ({ h: Ch, l: Cl } = add(this.Ch | 0, this.Cl | 0, Ch | 0, Cl | 0));
        ({ h: Dh, l: Dl } = add(this.Dh | 0, this.Dl | 0, Dh | 0, Dl | 0));
        ({ h: Eh, l: El } = add(this.Eh | 0, this.El | 0, Eh | 0, El | 0));
        ({ h: Fh, l: Fl } = add(this.Fh | 0, this.Fl | 0, Fh | 0, Fl | 0));
        ({ h: Gh, l: Gl } = add(this.Gh | 0, this.Gl | 0, Gh | 0, Gl | 0));
        ({ h: Hh, l: Hl } = add(this.Hh | 0, this.Hl | 0, Hh | 0, Hl | 0));
        this.set(Ah, Al, Bh, Bl, Ch, Cl, Dh, Dl, Eh, El, Fh, Fl, Gh, Gl, Hh, Hl);
      }
      roundClean() {
        clean(SHA512_W_H, SHA512_W_L);
      }
      destroy() {
        this.destroyed = true;
        clean(this.buffer);
        this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      }
    };
    _SHA512 = class extends SHA2_64B {
      constructor() {
        super(64, SHA512_IV);
      }
    };
    sha256 = /* @__PURE__ */ createHasher(
      () => new _SHA256(),
      /* @__PURE__ */ oidNist(1)
    );
    sha512 = /* @__PURE__ */ createHasher(
      () => new _SHA512(),
      /* @__PURE__ */ oidNist(3)
    );
  }
});

// ../src/lib/core/params.ts
function targetFromDifficulty(difficulty) {
  if (difficulty <= 0n) throw new Error("difficulty muss > 0 sein");
  return SHIFT / difficulty;
}
function bytesToBig(b) {
  let v = 0n;
  for (const x of b) v = v << 8n | BigInt(x);
  return v;
}
function rewardAt(height) {
  const era = Math.floor(height / EPOCH_BLOCKS);
  if (era >= MAX_HALVINGS) return 0n;
  return INITIAL_REWARD >> BigInt(era);
}
var NETWORK, CHAIN_ID, UNIT, MAX_SUPPLY, INITIAL_REWARD, EPOCH_BLOCKS, MAX_HALVINGS, TARGET_BLOCK_TIME, DIFFICULTY_UNIT, MIN_DIFFICULTY, GENESIS_DIFFICULTY, LWMA_WINDOW, LWMA_CLAMP, SOLVETIME_CAP, EMERGENCY_FACTOR, MEDIAN_TIME_BLOCKS, MAX_FUTURE_DRIFT, MIN_FEE, MAX_TXS_PER_BLOCK, MAX_MEMO_BYTES, ADDRESS_BYTES, ADDRESS_HRP, SHIFT, COINBASE_V2_HEIGHT, MAX_COINBASE_OUTPUTS, COINBASE_V2;
var init_params = __esm({
  "../src/lib/core/params.ts"() {
    "use strict";
    init_sha2();
    NETWORK = "yskar-main-1";
    CHAIN_ID = sha256(new TextEncoder().encode(NETWORK));
    UNIT = 100000000n;
    MAX_SUPPLY = 21000000n * UNIT;
    INITIAL_REWARD = 875n * UNIT;
    EPOCH_BLOCKS = 12e3;
    MAX_HALVINGS = 63;
    TARGET_BLOCK_TIME = 600n;
    DIFFICULTY_UNIT = 65536n;
    MIN_DIFFICULTY = 4096n;
    GENESIS_DIFFICULTY = 24576n;
    LWMA_WINDOW = 45;
    LWMA_CLAMP = 4n;
    SOLVETIME_CAP = 6n;
    EMERGENCY_FACTOR = 3n;
    MEDIAN_TIME_BLOCKS = 11;
    MAX_FUTURE_DRIFT = 120n;
    MIN_FEE = 100000n;
    MAX_TXS_PER_BLOCK = 2e3;
    MAX_MEMO_BYTES = 32;
    ADDRESS_BYTES = 20;
    ADDRESS_HRP = "ysr";
    SHIFT = (1n << 256n) / DIFFICULTY_UNIT;
    COINBASE_V2_HEIGHT = 2e3;
    MAX_COINBASE_OUTPUTS = 64;
    COINBASE_V2 = 2;
  }
});

// ../src/lib/core/codec.ts
function fromHex(s) {
  const c = s.startsWith("\\x") ? s.slice(2) : s;
  if (c.length % 2) throw new Error("Hex-Laenge ungerade");
  const o = new Uint8Array(c.length / 2);
  for (let i = 0; i < o.length; i++) o[i] = parseInt(c.substr(i * 2, 2), 16);
  return o;
}
var Writer, Reader, toHex;
var init_codec = __esm({
  "../src/lib/core/codec.ts"() {
    "use strict";
    Writer = class {
      parts = [];
      size = 0;
      push(b) {
        this.parts.push(b);
        this.size += b.length;
        return this;
      }
      u8(v) {
        return this.push(Uint8Array.of(v & 255));
      }
      u16(v) {
        const b = new Uint8Array(2);
        new DataView(b.buffer).setUint16(0, v, true);
        return this.push(b);
      }
      u32(v) {
        const b = new Uint8Array(4);
        new DataView(b.buffer).setUint32(0, v >>> 0, true);
        return this.push(b);
      }
      u64(v) {
        if (v < 0n || v > 0xffffffffffffffffn) throw new Error(`u64 ausserhalb des Bereichs: ${v}`);
        const b = new Uint8Array(8);
        new DataView(b.buffer).setBigUint64(0, v, true);
        return this.push(b);
      }
      bytes(b, expect) {
        if (expect !== void 0 && b.length !== expect) {
          throw new Error(`erwartet ${expect} Byte, erhalten ${b.length}`);
        }
        return this.push(b);
      }
      finish() {
        const out = new Uint8Array(this.size);
        let o = 0;
        for (const p of this.parts) {
          out.set(p, o);
          o += p.length;
        }
        return out;
      }
    };
    Reader = class {
      o = 0;
      buf;
      dv;
      // Bewusst keine Konstruktor-Parametereigenschaft: die erzeugt echten Code
      // und laesst sich nicht rein typenentfernend ausfuehren.
      constructor(buf) {
        this.buf = buf;
        this.dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      }
      need(n) {
        if (this.o + n > this.buf.length) throw new Error("Daten zu kurz");
      }
      u8() {
        this.need(1);
        return this.buf[this.o++];
      }
      u16() {
        this.need(2);
        const v = this.dv.getUint16(this.o, true);
        this.o += 2;
        return v;
      }
      u32() {
        this.need(4);
        const v = this.dv.getUint32(this.o, true);
        this.o += 4;
        return v;
      }
      u64() {
        this.need(8);
        const v = this.dv.getBigUint64(this.o, true);
        this.o += 8;
        return v;
      }
      bytes(n) {
        this.need(n);
        const v = this.buf.slice(this.o, this.o + n);
        this.o += n;
        return v;
      }
      get rest() {
        return this.buf.length - this.o;
      }
      get offset() {
        return this.o;
      }
    };
    toHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  }
});

// ../src/lib/core/hash.ts
function sha256d(data) {
  return sha256(sha256(data));
}
function merkleRoot(leaves) {
  if (leaves.length === 0) return new Uint8Array(32);
  let level = leaves.map((l) => {
    const b = new Uint8Array(1 + l.length);
    b[0] = 0;
    b.set(l, 1);
    return sha256d(b);
  });
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 === level.length) {
        next.push(level[i]);
        continue;
      }
      const b = new Uint8Array(1 + 64);
      b[0] = 1;
      b.set(level[i], 1);
      b.set(level[i + 1], 33);
      next.push(sha256d(b));
    }
    level = next;
  }
  return level[0];
}
var init_hash = __esm({
  "../src/lib/core/hash.ts"() {
    "use strict";
    init_sha2();
  }
});

// ../node_modules/@noble/curves/utils.js
function aarray(item, title, inner = () => {
}) {
  if (!Array.isArray(item))
    throw new TypeError(`"${title}" expected array, got type=${typeof item}`);
  for (let i = 0; i < item.length; i++)
    inner(item[i], `${title}[${i}]`);
  return item;
}
function aobject2(value, title = "object") {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(title === "object" ? "expected valid options object" : `"${title}" expected object, got type=${typeof value}`);
  return value;
}
function afunction(value, title) {
  if (typeof value !== "function")
    throw new TypeError(`"${title}" is invalid: expected function, got ${typeof value}`);
  return value;
}
function abool(value, title = "") {
  if (typeof value !== "boolean")
    throw new TypeError(atitle2(title) + "expected boolean, got type=" + typeof value);
  return value;
}
function abignumber(n) {
  if (typeof n === "bigint") {
    if (!isPosBig(n))
      throw new RangeError("positive bigint expected, got " + n);
  } else
    anumber2(n);
  return n;
}
function asafenumber(value, title = "") {
  if (typeof value !== "number") {
    const prefix = title && `"${title}" `;
    throw new TypeError(prefix + "expected number, got type=" + typeof value);
  }
  if (!Number.isSafeInteger(value)) {
    const prefix = title && `"${title}" `;
    throw new RangeError(prefix + "expected safe integer, got " + value);
  }
}
function hexToNumber(hex) {
  if (typeof hex !== "string")
    throw new TypeError("hex string expected, got " + typeof hex);
  return hex === "" ? _0n : BigInt("0x" + hex);
}
function bytesToNumberBE(bytes) {
  return hexToNumber(bytesToHex(bytes));
}
function bytesToNumberLE(bytes) {
  return hexToNumber(bytesToHex(copyBytes(abytes(bytes)).reverse()));
}
function numberToBytesBE(n, len) {
  anumber(len);
  if (len === 0)
    throw new Error("zero output length is invalid");
  n = abignumber(n);
  const expectedLen = len * 2;
  const hex = n.toString(16);
  if (hex.length > expectedLen)
    throw new RangeError("number is too large");
  return hexToBytes(hex.padStart(expectedLen, "0"));
}
function numberToBytesLE(n, len) {
  return numberToBytesBE(n, len).reverse();
}
function copyBytes(bytes) {
  return Uint8Array.from(abytes2(bytes));
}
function isPosBig(n) {
  return typeof n === "bigint" && _0n <= n;
}
function inRange(n, min, max) {
  return isPosBig(n) && isPosBig(min) && isPosBig(max) && min <= n && n < max;
}
function aInRange(title, n, min, max) {
  if (!inRange(n, min, max))
    throw new RangeError("expected valid " + title + ": " + min + " <= n < " + max + ", got " + n);
}
function bitLen(n) {
  if (n < _0n)
    throw new Error("expected non-negative bigint, got " + n);
  return n === _0n ? 0 : n.toString(2).length;
}
function validateObject(object, fields = {}, optFields = {}, title = "object") {
  aobject2(object, title);
  aobject2(fields, "fields");
  aobject2(optFields, "optFields");
  function checkField(fieldName, expectedType, isOpt) {
    const label = title === "object" ? `param "${String(fieldName)}"` : `"${title}.${String(fieldName)}"`;
    const val = object[fieldName];
    if (!Object.hasOwn(object, fieldName) && (isOpt ? val !== void 0 : expectedType !== "function")) {
      throw new TypeError(`${label} is invalid: expected own property`);
    }
    if (isOpt && val === void 0)
      return;
    const current = typeof val;
    if (current !== expectedType || val === null)
      throw new TypeError(`${label} is invalid: expected ${expectedType}, got ${current}`);
  }
  const iter = (f, isOpt) => Object.entries(f).forEach(([k, v]) => checkField(k, v, isOpt));
  iter(fields, false);
  iter(optFields, true);
}
var abytes2, anumber2, bytesToHex2, concatBytes2, hexToBytes2, isBytes2, randomBytes2, _0n, _1n, atitle2, bitMask;
var init_utils2 = __esm({
  "../node_modules/@noble/curves/utils.js"() {
    init_utils();
    abytes2 = (value, length, title) => abytes(value, length, title);
    anumber2 = anumber;
    bytesToHex2 = bytesToHex;
    concatBytes2 = (...arrays) => concatBytes(...arrays);
    hexToBytes2 = (hex) => hexToBytes(hex);
    isBytes2 = isBytes;
    randomBytes2 = (bytesLength) => randomBytes(bytesLength);
    _0n = /* @__PURE__ */ BigInt(0);
    _1n = /* @__PURE__ */ BigInt(1);
    atitle2 = (title) => title ? `"${title}" ` : "";
    bitMask = (n) => {
      asafenumber(n, "n");
      return (_1n << BigInt(n)) - _1n;
    };
  }
});

// ../node_modules/@noble/curves/abstract/modular.js
function mod(a, b) {
  if (b <= _0n2)
    throw new Error("mod: expected positive modulus, got " + b);
  const result = a % b;
  return result >= _0n2 ? result : b + result;
}
function pow(num, power, modulo) {
  if (modulo <= _1n2)
    throw new Error("pow: expected modulus > 1, got " + modulo);
  if (typeof power !== "bigint")
    throw new TypeError("invalid exponent: expected bigint, got " + typeof power);
  if (power < _0n2)
    throw new Error("invalid exponent, negatives unsupported");
  if (power === _0n2)
    return _1n2;
  if (power === _1n2)
    return num;
  let d = num % modulo;
  if (d < _0n2)
    d += modulo;
  if (power < POW_WINDOWED_MIN) {
    let p2 = _1n2;
    while (power > _0n2) {
      if (power & _1n2)
        p2 = p2 * d % modulo;
      d = d * d % modulo;
      power >>= _1n2;
    }
    return p2;
  }
  const digits = [];
  while (power > _0n2) {
    digits.push(Number(power & _15n));
    power >>= _4n;
  }
  const table = new Array(16);
  table[0] = _1n2;
  table[1] = d;
  for (let i = 2; i < 16; i++)
    table[i] = table[i - 1] * d % modulo;
  let p = table[digits[digits.length - 1]];
  for (let w = digits.length - 2; w >= 0; w--) {
    p = p * p % modulo;
    p = p * p % modulo;
    p = p * p % modulo;
    p = p * p % modulo;
    const digit = digits[w];
    if (digit !== 0)
      p = p * table[digit] % modulo;
  }
  return p;
}
function pow2(x, power, modulo) {
  if (modulo <= _1n2)
    throw new Error("pow2: expected modulus > 1, got " + modulo);
  if (power < _0n2)
    throw new Error("pow2: expected non-negative exponent, got " + power);
  let res = x;
  while (power-- > _0n2) {
    res *= res;
    res %= modulo;
  }
  return res;
}
function invert(number, modulo) {
  if (number === _0n2)
    throw new Error("invert: expected non-zero number");
  if (modulo <= _1n2)
    throw new Error("invert: expected modulus > 1, got " + modulo);
  let a = mod(number, modulo);
  let b = modulo;
  let x = _0n2, u = _1n2;
  while (a !== _0n2) {
    const q = b / a;
    const r = b - a * q;
    const m = x - u * q;
    b = a, a = r, x = u, u = m;
  }
  const gcd = b;
  if (gcd !== _1n2)
    throw new Error("invert: does not exist");
  return mod(x, modulo);
}
function assertIsSquare(Fp2, root, n) {
  const F = Fp2;
  if (!F.eql(F.sqr(root), n))
    throw new Error("Cannot find square root");
}
function aoddModulus(order, fnName) {
  if ((order & _1n2) === _0n2)
    throw new Error(fnName + ": expected odd modulus, got " + order);
}
function sqrt3mod4(Fp2, n) {
  const F = Fp2;
  const p1div4 = (F.ORDER + _1n2) / _4n;
  const root = F.pow(n, p1div4);
  assertIsSquare(F, root, n);
  return root;
}
function sqrt5mod8(Fp2, n) {
  const F = Fp2;
  const p5div8 = (F.ORDER - _5n) / _8n;
  const n2 = F.mul(n, _2n);
  const v = F.pow(n2, p5div8);
  const nv = F.mul(n, v);
  const i = F.mul(F.mul(nv, _2n), v);
  const root = F.mul(nv, F.sub(i, F.ONE));
  assertIsSquare(F, root, n);
  return root;
}
function sqrt9mod16(P) {
  const Fp_ = Field(P);
  const tn = tonelliShanks(P);
  const c1 = tn(Fp_, Fp_.neg(Fp_.ONE));
  const c2 = tn(Fp_, c1);
  const c3 = tn(Fp_, Fp_.neg(c1));
  const c4 = (P + _7n) / _16n;
  return ((Fp2, n) => {
    const F = Fp2;
    let tv1 = F.pow(n, c4);
    let tv2 = F.mul(tv1, c1);
    const tv3 = F.mul(tv1, c2);
    const tv4 = F.mul(tv1, c3);
    const e1 = F.eql(F.sqr(tv2), n);
    const e2 = F.eql(F.sqr(tv3), n);
    tv1 = F.cmov(tv1, tv2, e1);
    tv2 = F.cmov(tv4, tv3, e2);
    const e3 = F.eql(F.sqr(tv2), n);
    const root = F.cmov(tv1, tv2, e3);
    assertIsSquare(F, root, n);
    return root;
  });
}
function tonelliShanks(P) {
  if (P < _3n)
    throw new Error("sqrt is not defined for small field");
  aoddModulus(P, "tonelliShanks");
  let Q = P - _1n2;
  let S = 0;
  while (Q % _2n === _0n2) {
    Q /= _2n;
    S++;
  }
  let Z = _2n;
  const _Fp = Field(P);
  while (FpLegendre(_Fp, Z) === 1) {
    if (Z++ > 1e3)
      throw new Error("Cannot find square root: probably non-prime P");
  }
  if (S === 1)
    return sqrt3mod4;
  let cc = _Fp.pow(Z, Q);
  const Q1div2 = (Q + _1n2) / _2n;
  return function tonelliSlow(Fp2, n) {
    const F = Fp2;
    if (F.is0(n))
      return n;
    if (FpLegendre(F, n) !== 1)
      throw new Error("Cannot find square root");
    let M = S;
    let c = F.mul(F.ONE, cc);
    let t = F.pow(n, Q);
    let R = F.pow(n, Q1div2);
    while (!F.eql(t, F.ONE)) {
      if (F.is0(t))
        throw new Error("Cannot find square root: probably non-prime P");
      let i = 1;
      let t_tmp = F.sqr(t);
      while (!F.eql(t_tmp, F.ONE)) {
        i++;
        t_tmp = F.sqr(t_tmp);
        if (i === M)
          throw new Error("Cannot find square root");
      }
      const exponent = _1n2 << BigInt(M - i - 1);
      const b = F.pow(c, exponent);
      M = i;
      c = F.sqr(b);
      t = F.mul(t, c);
      R = F.mul(R, b);
    }
    return R;
  };
}
function FpSqrt(P) {
  aoddModulus(P, "Fp.sqrt");
  if (P % _4n === _3n)
    return sqrt3mod4;
  if (P % _8n === _5n)
    return sqrt5mod8;
  if (P % _16n === _9n)
    return sqrt9mod16(P);
  return tonelliShanks(P);
}
function validateField(field) {
  aobject2(field, "field");
  if (typeof field.ORDER !== "bigint")
    throw new TypeError('param "ORDER" is invalid: expected bigint, got ' + typeof field.ORDER);
  asafenumber(field.BYTES, "BYTES");
  asafenumber(field.BITS, "BITS");
  for (const name of FIELD_FIELDS)
    afunction(field[name], "field." + name);
  if (field.BYTES < 1 || field.BITS < 1)
    throw new Error("invalid field: expected BYTES/BITS > 0");
  if (field.ORDER <= _1n2)
    throw new Error("invalid field: expected ORDER > 1, got " + field.ORDER);
  return field;
}
function FpInvertBatch(Fp2, nums, passZero = false) {
  validateField(Fp2);
  aarray(nums, "nums");
  abool(passZero, "passZero");
  const F = Fp2;
  const inverted = new Array(nums.length).fill(passZero ? F.ZERO : void 0);
  const multipliedAcc = nums.reduce((acc, num, i) => {
    if (F.is0(num))
      return acc;
    inverted[i] = acc;
    return F.mul(acc, num);
  }, F.ONE);
  const invertedAcc = F.inv(multipliedAcc);
  nums.reduceRight((acc, num, i) => {
    if (F.is0(num))
      return acc;
    inverted[i] = F.mul(acc, inverted[i]);
    return F.mul(acc, num);
  }, invertedAcc);
  return inverted;
}
function FpLegendre(Fp2, n) {
  validateField(Fp2);
  const F = Fp2;
  aoddModulus(F.ORDER, "FpLegendre");
  const p1mod2 = (F.ORDER - _1n2) / _2n;
  const powered = F.pow(n, p1mod2);
  const yes = F.eql(powered, F.ONE);
  const zero = F.eql(powered, F.ZERO);
  const no = F.eql(powered, F.neg(F.ONE));
  if (!yes && !zero && !no)
    throw new Error("invalid Legendre symbol result");
  return yes ? 1 : zero ? 0 : -1;
}
function nLength(n, nBitLength) {
  if (nBitLength !== void 0)
    anumber2(nBitLength);
  if (n <= _0n2)
    throw new Error("invalid n length: expected positive n, got " + n);
  if (nBitLength !== void 0 && nBitLength < 1)
    throw new Error("invalid n length: expected positive bit length, got " + nBitLength);
  const bits = bitLen(n);
  if (nBitLength !== void 0 && nBitLength < bits)
    throw new Error(`invalid n length: expected nBitLength (${nBitLength}) >= bitLen(n) (${bits})`);
  const _nBitLength = nBitLength !== void 0 ? nBitLength : bits;
  const nByteLength = Math.ceil(_nBitLength / 8);
  return { nBitLength: _nBitLength, nByteLength };
}
function Field(ORDER, opts = {}) {
  Object.freeze(_Field.prototype);
  return new _Field(ORDER, opts);
}
var _0n2, _1n2, _2n, _3n, _4n, _5n, _7n, _8n, _9n, _15n, _16n, POW_WINDOWED_MIN, isNegativeLE, FIELD_FIELDS, FIELD_SQRT, _Field;
var init_modular = __esm({
  "../node_modules/@noble/curves/abstract/modular.js"() {
    init_utils2();
    _0n2 = /* @__PURE__ */ BigInt(0);
    _1n2 = /* @__PURE__ */ BigInt(1);
    _2n = /* @__PURE__ */ BigInt(2);
    _3n = /* @__PURE__ */ BigInt(3);
    _4n = /* @__PURE__ */ BigInt(4);
    _5n = /* @__PURE__ */ BigInt(5);
    _7n = /* @__PURE__ */ BigInt(7);
    _8n = /* @__PURE__ */ BigInt(8);
    _9n = /* @__PURE__ */ BigInt(9);
    _15n = /* @__PURE__ */ BigInt(15);
    _16n = /* @__PURE__ */ BigInt(16);
    POW_WINDOWED_MIN = /* @__PURE__ */ BigInt("0x10000000000000000");
    isNegativeLE = (num, modulo) => (mod(num, modulo) & _1n2) === _1n2;
    FIELD_FIELDS = [
      "create",
      "isValid",
      "is0",
      "neg",
      "inv",
      "sqrt",
      "sqr",
      "eql",
      "add",
      "sub",
      "mul",
      "pow",
      "div",
      "addN",
      "subN",
      "mulN",
      "sqrN"
    ];
    FIELD_SQRT = /* @__PURE__ */ new WeakMap();
    _Field = class {
      ORDER;
      BITS;
      BYTES;
      isLE;
      ZERO = _0n2;
      ONE = _1n2;
      _lengths;
      _mod;
      constructor(ORDER, opts = {}) {
        if (ORDER <= _1n2)
          throw new Error("invalid field: expected ORDER > 1, got " + ORDER);
        let _nbitLength = void 0;
        this.isLE = false;
        if (opts != null && typeof opts === "object") {
          if (typeof opts.BITS === "number")
            _nbitLength = opts.BITS;
          if (typeof opts.sqrt === "function")
            Object.defineProperty(this, "sqrt", { value: opts.sqrt, enumerable: true });
          if (typeof opts.isLE === "boolean")
            this.isLE = opts.isLE;
          if (opts.allowedLengths)
            this._lengths = Object.freeze(opts.allowedLengths.slice());
          if (typeof opts.modFromBytes === "boolean")
            this._mod = opts.modFromBytes;
        }
        const { nBitLength, nByteLength } = nLength(ORDER, _nbitLength);
        if (nByteLength > 2048)
          throw new Error("invalid field: expected ORDER of <= 2048 bytes");
        this.ORDER = ORDER;
        this.BITS = nBitLength;
        this.BYTES = nByteLength;
        Object.freeze(this);
      }
      create(num) {
        return mod(num, this.ORDER);
      }
      isValid(num) {
        if (typeof num !== "bigint")
          throw new TypeError("invalid field element: expected bigint, got " + typeof num);
        return _0n2 <= num && num < this.ORDER;
      }
      is0(num) {
        return num === _0n2;
      }
      // is valid and invertible
      isValidNot0(num) {
        return !this.is0(num) && this.isValid(num);
      }
      isOdd(num) {
        return (num & _1n2) === _1n2;
      }
      neg(num) {
        return mod(-num, this.ORDER);
      }
      eql(lhs, rhs) {
        return lhs === rhs;
      }
      sqr(num) {
        return mod(num * num, this.ORDER);
      }
      add(lhs, rhs) {
        return mod(lhs + rhs, this.ORDER);
      }
      sub(lhs, rhs) {
        return mod(lhs - rhs, this.ORDER);
      }
      mul(lhs, rhs) {
        return mod(lhs * rhs, this.ORDER);
      }
      pow(num, power) {
        return pow(num, power, this.ORDER);
      }
      div(lhs, rhs) {
        return mod(lhs * invert(rhs, this.ORDER), this.ORDER);
      }
      // Same as above, but doesn't normalize
      sqrN(num) {
        return num * num;
      }
      addN(lhs, rhs) {
        return lhs + rhs;
      }
      subN(lhs, rhs) {
        return lhs - rhs;
      }
      mulN(lhs, rhs) {
        return lhs * rhs;
      }
      inv(num) {
        return invert(num, this.ORDER);
      }
      sqrt(num) {
        let sqrt = FIELD_SQRT.get(this);
        if (!sqrt)
          FIELD_SQRT.set(this, sqrt = FpSqrt(this.ORDER));
        return sqrt(this, num);
      }
      toBytes(num) {
        return this.isLE ? numberToBytesLE(num, this.BYTES) : numberToBytesBE(num, this.BYTES);
      }
      fromBytes(bytes, skipValidation = false) {
        abytes2(bytes);
        const { _lengths: allowedLengths, BYTES, isLE, ORDER, _mod: modFromBytes } = this;
        if (allowedLengths) {
          if (bytes.length < 1 || !allowedLengths.includes(bytes.length) || bytes.length > BYTES) {
            throw new Error("Field.fromBytes: expected " + allowedLengths + " bytes, got " + bytes.length);
          }
          const padded = new Uint8Array(BYTES);
          padded.set(bytes, isLE ? 0 : padded.length - bytes.length);
          bytes = padded;
        }
        if (bytes.length !== BYTES)
          throw new Error("Field.fromBytes: expected " + BYTES + " bytes, got " + bytes.length);
        let scalar = isLE ? bytesToNumberLE(bytes) : bytesToNumberBE(bytes);
        if (modFromBytes)
          scalar = mod(scalar, ORDER);
        if (!skipValidation) {
          if (!this.isValid(scalar))
            throw new Error("invalid field element: outside of range 0..ORDER");
        }
        return scalar;
      }
      // TODO: we don't need it here, move out to separate fn
      invertBatch(lst) {
        return FpInvertBatch(this, lst, true);
      }
      // We can't move this out because Fp6, Fp12 implement it
      // and it's unclear what to return in there.
      cmov(a, b, condition) {
        abool(condition, "condition");
        return condition ? b : a;
      }
    };
  }
});

// ../node_modules/@noble/curves/abstract/curve.js
function validatePointCons(Point) {
  const pc = Point;
  if (typeof pc !== "function")
    throw new TypeError('"Point" expected constructor, got type=' + typeof Point);
  afunction(pc.fromAffine, "Point.fromAffine");
  afunction(pc.fromBytes, "Point.fromBytes");
  afunction(pc.fromHex, "Point.fromHex");
  aobject2(pc.BASE, "Point.BASE");
  aobject2(pc.ZERO, "Point.ZERO");
  validateField(pc.Fp);
  validateField(pc.Fn);
}
function normalizeZ(c, points) {
  validatePointCons(c);
  validateMSMPoints(points, c);
  const invertedZs = FpInvertBatch(c.Fp, points.map((p) => p.Z));
  return points.map((p, i) => c.fromAffine(p.toAffine(invertedZs[i])));
}
function validateW(W, bits, min = 1) {
  if (!Number.isSafeInteger(W) || W < min || W > bits)
    throw new Error("invalid window size, expected [" + min + ".." + bits + "], got W=" + W);
}
function validateTableBytes(numPoints, fpBytes) {
  const bytes = numPoints * (4 * fpBytes + 128);
  if (bytes > TABLE_BYTES_MAX)
    throw new Error("invalid window size: table would need ~" + Math.ceil(bytes / 2 ** 20) + " MiB, max " + TABLE_BYTES_MAX / 2 ** 20 + " MiB");
}
function probeRandomBytes(randomBytes4, length) {
  if (randomBytes4 === void 0)
    return void 0;
  afunction(randomBytes4, "randomBytes");
  try {
    const probe = randomBytes4(length);
    if (!isBytes2(probe) || probe.length !== length)
      return void 0;
  } catch {
    return void 0;
  }
  return randomBytes4;
}
function validateMSMPoints(points, c) {
  aarray(points, "points");
  points.forEach((p, i) => {
    if (!(p instanceof c))
      throw new Error("invalid point at index " + i);
  });
}
function validateMSMScalars(scalars, field, maxScalar) {
  if (!Array.isArray(scalars))
    throw new Error("array of scalars expected");
  scalars.forEach((s, i) => {
    const ok = maxScalar === void 0 ? field.isValid(s) : isPosBig(s) && s < maxScalar;
    if (!ok)
      throw new Error("invalid scalar at index " + i);
  });
}
function getWindowSize(P) {
  return pointWindowSizes.get(P) || 1;
}
function oddMultiples(p, size) {
  const dbl = p.double();
  const t = [p];
  for (let j = 1; j < size; j++)
    t.push(t[j - 1].add(dbl));
  return t;
}
function wnafDigits(n, W) {
  const size = 2 ** W;
  const half = size / 2;
  const mask = BigInt(size - 1);
  const d = [];
  while (n > _0n3) {
    let w = 0;
    if (n & _1n3) {
      w = Number(n & mask);
      if (w >= half)
        w -= size;
      n -= BigInt(w);
    }
    d.push(w);
    n >>= _1n3;
  }
  return d;
}
function signedWindowDigits(n, W, windows) {
  const size = 2 ** W;
  const half = size / 2;
  const mask = BigInt(size - 1);
  const shiftBy = BigInt(W);
  const d = [];
  for (let w = 0; w < windows; w++) {
    let v = Number(n & mask);
    n >>= shiftBy;
    if (v > half) {
      v -= size;
      n += _1n3;
    }
    d.push(v);
  }
  if (n !== _0n3)
    throw new Error("invalid wnaf");
  return d;
}
function wnafWalk(zero, tables, digits) {
  let max = 0;
  for (const d of digits)
    max = Math.max(max, d.length);
  let acc = zero;
  for (let bit = max - 1; bit >= 0; bit--) {
    if (bit !== max - 1)
      acc = acc.double();
    for (let i = 0; i < digits.length; i++) {
      const w = digits[i][bit];
      if (w) {
        const item = tables[i][Math.abs(w) - 1 >> 1];
        acc = acc.add(w < 0 ? item.negate() : item);
      }
    }
  }
  return acc;
}
function mulAddUnsafe(c, points, scalars, allowOversized = false) {
  validatePointCons(c);
  validateMSMPoints(points, c);
  abool(allowOversized, "allowOversized");
  validateMSMScalars(scalars, c.Fn, allowOversized ? c.Fn.ORDER ** _4n2 : void 0);
  if (points.length !== scalars.length)
    throw new Error("arrays of points and scalars must have equal length");
  const tables = points.map((p) => oddMultiples(p, 4));
  const digits = scalars.map((n) => wnafDigits(n, 4));
  return wnafWalk(c.ZERO, tables, digits);
}
function createField(order, field, isLE) {
  if (field) {
    if (field.ORDER !== order)
      throw new Error("Field.ORDER must match order: Fp == p, Fn == n");
    validateField(field);
    return field;
  } else {
    return Field(order, { isLE });
  }
}
function createCurveFields(type, CURVE, curveOpts = {}, FpFnLE) {
  if (type !== "weierstrass" && type !== "edwards")
    throw new Error('expected curve type "weierstrass" or "edwards"');
  if (FpFnLE === void 0)
    FpFnLE = type === "edwards";
  if (!CURVE || typeof CURVE !== "object")
    throw new Error(`expected valid ${type} CURVE object`);
  validateObject(curveOpts);
  for (const p of ["p", "n", "h"]) {
    const val = CURVE[p];
    if (!(isPosBig(val) && val !== _0n3))
      throw new Error(`CURVE.${p} must be positive bigint`);
  }
  const Fp2 = createField(CURVE.p, curveOpts.Fp, FpFnLE);
  const Fn = createField(CURVE.n, curveOpts.Fn, FpFnLE);
  const _b = type === "weierstrass" ? "b" : "d";
  const params = ["Gx", "Gy", "a", _b];
  for (const p of params) {
    if (!Fp2.isValid(CURVE[p]))
      throw new Error(`CURVE.${p} must be valid field element of CURVE.Fp`);
  }
  CURVE = Object.freeze(Object.assign({}, CURVE));
  return { CURVE, Fp: Fp2, Fn };
}
function createKeygen(randomSecretKey, getPublicKey) {
  return function keygen(seed) {
    const secretKey = randomSecretKey(seed);
    return { secretKey, publicKey: getPublicKey(secretKey) };
  };
}
var _0n3, _1n3, _4n2, BLIND_BYTES, BLIND_BITS, FW_WINDOW, TABLE_BYTES_MAX, pointWindowSizes, ScalarMultiplier;
var init_curve = __esm({
  "../node_modules/@noble/curves/abstract/curve.js"() {
    init_utils2();
    init_modular();
    _0n3 = /* @__PURE__ */ BigInt(0);
    _1n3 = /* @__PURE__ */ BigInt(1);
    _4n2 = /* @__PURE__ */ BigInt(4);
    BLIND_BYTES = 16;
    BLIND_BITS = 128;
    FW_WINDOW = 5;
    TABLE_BYTES_MAX = /* @__PURE__ */ (() => 2 ** 31)();
    pointWindowSizes = /* @__PURE__ */ new WeakMap();
    ScalarMultiplier = class {
      Point;
      BASE;
      ZERO;
      randomBytes;
      wnafPrecomputes = /* @__PURE__ */ new WeakMap();
      baseCanBeBlinded;
      bits;
      // Parametrized with a given Point class (not individual point)
      constructor(Point, randomBytes4) {
        validatePointCons(Point);
        this.randomBytes = probeRandomBytes(randomBytes4, BLIND_BYTES);
        this.Point = Point;
        this.BASE = Point.BASE;
        this.ZERO = Point.ZERO;
        this.bits = Point.Fn.BITS;
      }
      /**
       * Creates a signed fixed-window wNAF precomputation table: for every window w, the
       * multiples `[1..2^(W−1)]⋅2^(w⋅W)⋅P`, flattened. All doublings are baked into the table,
       * so cached multiplication is additions-only. `windows = ceil(bits/W) + 1`: the extra
       * window absorbs the final carry of signed-digit recoding.
       * For a 256-bit curve and W=6, the table is 44⋅32 = 1408 points.
       * @param point - Point instance
       * @param W - window size
       * @param bits - scalar bitlength the table must cover
       */
      buildWnafTable(point, W, bits) {
        const windows = Math.ceil(bits / W) + 1;
        const half = 2 ** (W - 1);
        const comp = [];
        let base = point;
        for (let w = 0; w < windows; w++) {
          let acc = base;
          for (let i = 0; i < half; i++) {
            comp.push(acc);
            acc = acc.add(base);
          }
          base = comp[comp.length - 1].double();
        }
        return { W, bits, windows, comp };
      }
      /**
       * Implements ec multiplication using precomputed signed fixed-window wNAF tables.
       * Constant-time: fixed window count with one table addition per window — zero digits feed
       * the fake accumulator — and no doublings; the lookup scans the whole window slice.
       * Scalar bounds are validated by the public entry points ({@link ScalarMultiplier.mulCT},
       * {@link ScalarMultiplier.mulCTBlinded}, {@link ScalarMultiplier.mulUnsafe});
       * signedWindowDigits throws if `n` exceeds the table.
       * @returns real and fake (for const-time) points
       */
      wnafCachedCT(precomputes, n) {
        const { W, windows, comp } = precomputes;
        const half = 2 ** (W - 1);
        const digits = signedWindowDigits(n, W, windows);
        let p = this.ZERO;
        let f = this.BASE;
        for (let w = 0; w < windows; w++) {
          const digit = digits[w];
          const start = w * half;
          const idx = Math.abs(digit) - 1;
          let sel = comp[start];
          for (let i = 1; i < half; i++)
            sel = i === idx ? comp[start + i] : sel;
          const neg = sel.negate();
          if (digit === 0)
            f = f.add(comp[start]);
          else
            p = p.add(digit < 0 ? neg : sel);
        }
        return { p, f };
      }
      // Cache key is point identity plus (W, bits); at most two entries exist per point (public-width
      // `Fn.BITS` and blinded `Fn.BITS + BLIND_BITS`). Callers must not reuse the same point with
      // incompatible `transform(...)` layouts and expect a separate cache entry.
      getWnafPrecomputes(W, point, bits, transform) {
        let entries = this.wnafPrecomputes.get(point);
        let comp = entries?.find((entry) => entry.W === W && entry.bits === bits);
        if (!comp) {
          comp = this.buildWnafTable(point, W, bits);
          if (typeof transform === "function")
            comp = { ...comp, comp: transform(comp.comp) };
          if (!entries) {
            entries = [];
            this.wnafPrecomputes.set(point, entries);
          }
          entries.push(comp);
        }
        return comp;
      }
      assertPoint(point) {
        if (!(point instanceof this.Point))
          throw new TypeError('"point" expected Point instance, got type=' + typeof point);
      }
      // Shared prologue of the constant-time entry points. Rejects scalar 0: in key/signature-style
      // callers a zero scalar means broken upstream plumbing, and concrete Points already reject it.
      // Uses inRange instead of Fn.isValidNot0: validateField() only certifies the arithmetic subset.
      validateMulInput(point, scalar) {
        this.assertPoint(point);
        if (!inRange(scalar, _1n3, this.Point.Fn.ORDER))
          throw new Error("invalid scalar");
      }
      // Constant-time dispatch shared by mulCT / mulCTBlinded. Un-precomputed points (W===1, e.g.
      // ECDH peer keys) skip building a throwaway cached table in favor of a small fixed-window
      // multiply. `n` must be < 2^bits.
      runCT(point, n, bits, transform) {
        const W = getWindowSize(point);
        if (W === 1)
          return this.fixedWindowCT(point, n, bits);
        return this.wnafCachedCT(this.getWnafPrecomputes(W, point, bits, transform), n);
      }
      mulCT(point, scalar, transform) {
        this.validateMulInput(point, scalar);
        return this.runCT(point, scalar, this.bits, transform);
      }
      mulCTBlinded(point, scalar, transform) {
        this.validateMulInput(point, scalar);
        if (this.randomBytes === void 0)
          throw new Error("randomBytes is required for scalar blinding");
        const bits = this.Point.Fn.BITS + BLIND_BITS;
        const blind = this.randomBytes(BLIND_BYTES);
        if (!isBytes2(blind) || blind.length !== BLIND_BYTES)
          throw new Error("randomBytes returned invalid byte array");
        blind[0] = blind[0] & 63 | 128;
        const n = scalar + bytesToNumberBE(blind) * this.Point.Fn.ORDER;
        return this.runCT(point, n, bits, transform);
      }
      /**
       * Constant-time multiplication `n*point` for an un-precomputed point, via a small fixed window.
       * A cached wNAF table only pays off when reused; a flat 2^FW_WINDOW table (`size-1` adds) is
       * far cheaper to build for a single use. The point-operation sequence is independent of `n`:
       * build the table, then per window exactly FW_WINDOW doublings, a data-oblivious scan over
       * every table entry, and one addition (adds the identity when the window digit is 0 — never
       * skipped).
       *
       * `n` must be `< 2^bits`. Assumes complete addition (adding the identity costs the same as any
       * add), which holds for the Weierstrass/Edwards point types used here. The table is left in
       * projective form (no normalizeZ): normalizing this small a table costs more than the
       * mixed-add savings it would buy for a single multiply.
       * @returns real point `p`; `f` duplicates it only to match {@link wnafCachedCT}'s return shape
       * (this path needs no fake accumulator — its op-count is already scalar-independent).
       */
      fixedWindowCT(point, n, bits) {
        const W = FW_WINDOW;
        const size = 1 << W;
        const mask = bitMask(W);
        const table = new Array(size);
        table[0] = this.ZERO;
        for (let i = 1; i < size; i++)
          table[i] = table[i - 1].add(point);
        const windows = Math.ceil(bits / W);
        let acc = this.ZERO;
        for (let window = windows - 1; window >= 0; window--) {
          if (window !== windows - 1)
            for (let d = 0; d < W; d++)
              acc = acc.double();
          const digit = Number(n >> BigInt(window * W) & mask);
          let sel = table[0];
          for (let i = 1; i < size; i++)
            sel = i === digit ? table[i] : sel;
          acc = acc.add(sel);
        }
        return { p: acc, f: acc };
      }
      shouldBlind(point, cofactor) {
        if (this.randomBytes === void 0)
          return false;
        if (cofactor === _1n3)
          return true;
        if (point !== this.BASE)
          return false;
        if (this.baseCanBeBlinded === void 0)
          this.baseCanBeBlinded = this.mulUnsafe(this.BASE, this.Point.Fn.ORDER).is0();
        return this.baseCanBeBlinded;
      }
      mulSecret(point, scalar, cofactor, transform) {
        return this.shouldBlind(point, cofactor) ? this.mulCTBlinded(point, scalar, transform) : this.mulCT(point, scalar, transform);
      }
      mulUnsafe(point, scalar, transform) {
        this.assertPoint(point);
        if (!isPosBig(scalar))
          throw new Error("invalid scalar");
        const W = getWindowSize(point);
        if (W === 1 || scalar >= this.Point.Fn.ORDER)
          return mulAddUnsafe(this.Point, [point], [scalar], true);
        const precomputes = this.getWnafPrecomputes(W, point, this.bits, transform);
        return this.wnafCachedCT(precomputes, scalar).p;
      }
      // Remembers the window size used for precomputed wNAF multiplication of the given point
      // and drops any previously built tables. Usually only the base point is precomputed.
      // W=1 resets the point to the un-precomputed (table-less) paths.
      // W is additionally capped so tables stay under ~2 GiB ({@link TABLE_BYTES_MAX}).
      setWindowSize(point, W) {
        this.assertPoint(point);
        validateW(W, this.bits);
        const windows = Math.ceil((this.bits + BLIND_BITS) / W) + 1;
        validateTableBytes(windows * 2 ** (W - 1), this.Point.Fp.BYTES);
        pointWindowSizes.set(point, W);
        this.wnafPrecomputes.delete(point);
      }
      // True when a window size is set: tables themselves are built lazily on first multiply.
      hasWindowSize(point) {
        return getWindowSize(point) !== 1;
      }
    };
  }
});

// ../node_modules/@noble/curves/abstract/edwards.js
function isEdValidXY(Fp2, CURVE, x, y) {
  const x2 = Fp2.sqr(x);
  const y2 = Fp2.sqr(y);
  const left = Fp2.add(Fp2.mul(CURVE.a, x2), y2);
  const right = Fp2.add(Fp2.ONE, Fp2.mul(CURVE.d, Fp2.mul(x2, y2)));
  return Fp2.eql(left, right);
}
function edwards(params, extraOpts = {}) {
  validateObject(extraOpts, {}, {}, "extraOpts");
  const opts = extraOpts;
  const validated = createCurveFields("edwards", params, opts, opts.FpFnLE);
  const { Fp: Fp2, Fn } = validated;
  let CURVE = validated.CURVE;
  const { h: cofactor } = CURVE;
  if (FpLegendre(Fp2, CURVE.a) !== 1)
    throw new Error("edwards: CURVE.a must be a square in Fp for complete addition formulas");
  if (FpLegendre(Fp2, CURVE.d) !== -1)
    throw new Error("edwards: CURVE.d must be a non-square in Fp for complete addition formulas");
  validateObject(opts, {}, { uvRatio: "function", randomBytes: "function" });
  const randomBytes4 = opts.randomBytes === void 0 ? randomBytes2 : opts.randomBytes;
  const MASK = _2n2 << BigInt(Fp2.BYTES * 8) - _1n4;
  function isOdd(n) {
    if (!Fp2.isOdd)
      throw new Error("Field does not have .isOdd()");
    return Fp2.isOdd(n);
  }
  const uvRatio2 = opts.uvRatio === void 0 ? (u, v) => {
    try {
      return { isValid: true, value: Fp2.sqrt(Fp2.div(u, v)) };
    } catch (e) {
      return { isValid: false, value: _0n4 };
    }
  } : opts.uvRatio;
  if (!isEdValidXY(Fp2, CURVE, CURVE.Gx, CURVE.Gy))
    throw new Error("bad curve params: generator point");
  const mulA = Fp2.eql(CURVE.a, Fp2.neg(Fp2.ONE)) ? (x) => Fp2.neg(x) : Fp2.eql(CURVE.a, Fp2.ONE) ? (x) => x : (x) => Fp2.mul(CURVE.a, x);
  function acoord(title, n, banZero = false) {
    const min = banZero ? _1n4 : _0n4;
    aInRange("coordinate " + title, n, min, MASK);
    return n;
  }
  function aedpoint(other) {
    if (!(other instanceof Point))
      throw new Error("EdwardsPoint expected");
  }
  class Point {
    static BASE = new Point(CURVE.Gx, CURVE.Gy, Fp2.ONE, Fp2.mul(CURVE.Gx, CURVE.Gy));
    static ZERO = new Point(Fp2.ZERO, Fp2.ONE, Fp2.ONE, Fp2.ZERO);
    static Fp = Fp2;
    static Fn = Fn;
    X;
    Y;
    Z;
    T;
    constructor(X, Y, Z, T) {
      this.X = acoord("x", X);
      this.Y = acoord("y", Y);
      this.Z = acoord("z", Z, true);
      this.T = acoord("t", T);
      Object.freeze(this);
    }
    static CURVE() {
      return CURVE;
    }
    /**
     * Create one extended Edwards point from affine coordinates.
     * Does NOT validate that the point is on-curve or torsion-free.
     * Use `.assertValidity()` on adversarial inputs.
     */
    static fromAffine(p) {
      if (p instanceof Point)
        throw new Error("extended point not allowed");
      const { x, y } = p || {};
      acoord("x", x);
      acoord("y", y);
      return new Point(x, y, Fp2.ONE, Fp2.mul(x, y));
    }
    // Uses algo from RFC8032 5.1.3.
    static fromBytes(bytes, zip215 = false) {
      const len = Fp2.BYTES;
      const { a, d } = CURVE;
      bytes = copyBytes(abytes2(bytes, len, "point"));
      abool(zip215, "zip215");
      const normed = copyBytes(bytes);
      const lastByte = bytes[len - 1];
      normed[len - 1] = lastByte & ~128;
      const y = bytesToNumberLE(normed);
      const max = zip215 ? MASK : Fp2.ORDER;
      aInRange("point.y", y, _0n4, max);
      const y2 = Fp2.sqr(y);
      const u = Fp2.sub(y2, Fp2.ONE);
      const v = Fp2.sub(Fp2.mulN(d, y2), a);
      let { isValid, value: x } = uvRatio2(u, v);
      if (!isValid)
        throw new Error("bad point: invalid y coordinate");
      const isXOdd = isOdd(x);
      const isLastByteOdd = (lastByte & 128) !== 0;
      if (!zip215 && Fp2.is0(x) && isLastByteOdd)
        throw new Error("bad point: x=0 and x_0=1");
      if (isLastByteOdd !== isXOdd)
        x = Fp2.neg(x);
      return Point.fromAffine({ x, y });
    }
    static fromHex(hex, zip215 = false) {
      return Point.fromBytes(hexToBytes2(hex), zip215);
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    precompute(windowSize = 6, isLazy = true) {
      wnaf.setWindowSize(this, windowSize);
      if (!isLazy)
        this.multiply(_2n2);
      return this;
    }
    // Useful in fromAffine() - not for fromBytes(), which always created valid points.
    assertValidity() {
      const p = this;
      const { a, d } = CURVE;
      if (p.is0())
        throw new Error("bad point: ZERO");
      const { X, Y, Z, T } = p;
      const X2 = Fp2.sqr(X);
      const Y2 = Fp2.sqr(Y);
      const Z2 = Fp2.sqr(Z);
      const Z4 = Fp2.sqr(Z2);
      const aX2 = Fp2.mul(X2, a);
      const left = Fp2.mul(Fp2.add(aX2, Y2), Z2);
      const right = Fp2.add(Z4, Fp2.mul(d, Fp2.mul(X2, Y2)));
      if (!Fp2.eql(left, right))
        throw new Error("bad point: equation left != right (1)");
      const XY = Fp2.mul(X, Y);
      const ZT = Fp2.mul(Z, T);
      if (!Fp2.eql(XY, ZT))
        throw new Error("bad point: equation left != right (2)");
    }
    // Compare one point to another.
    equals(other) {
      aedpoint(other);
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const { X: X2, Y: Y2, Z: Z2 } = other;
      const X1Z2 = Fp2.mul(X1, Z2);
      const X2Z1 = Fp2.mul(X2, Z1);
      const Y1Z2 = Fp2.mul(Y1, Z2);
      const Y2Z1 = Fp2.mul(Y2, Z1);
      return Fp2.eql(X1Z2, X2Z1) && Fp2.eql(Y1Z2, Y2Z1);
    }
    is0() {
      return this.equals(Point.ZERO);
    }
    negate() {
      return new Point(Fp2.neg(this.X), this.Y, this.Z, Fp2.neg(this.T));
    }
    // Fast algo for doubling Extended Point.
    // https://hyperelliptic.org/EFD/g1p/auto-twisted-extended.html#doubling-dbl-2008-hwcd
    // Cost: 4M + 4S + 1*a + 6add + 1*2.
    double() {
      const { X: X1, Y: Y1, Z: Z1 } = this;
      const A = Fp2.sqr(X1);
      const B = Fp2.sqr(Y1);
      const C = Fp2.mul(Fp2.sqr(Z1), _2n2);
      const D = mulA(A);
      const x1y1 = Fp2.addN(X1, Y1);
      const E = Fp2.sub(Fp2.subN(Fp2.sqr(x1y1), A), B);
      const G = Fp2.addN(D, B);
      const F = Fp2.subN(G, C);
      const H = Fp2.subN(D, B);
      const X3 = Fp2.mul(E, F);
      const Y3 = Fp2.mul(G, H);
      const T3 = Fp2.mul(E, H);
      const Z3 = Fp2.mul(F, G);
      return new Point(X3, Y3, Z3, T3);
    }
    // Fast algo for adding 2 Extended Points.
    // https://hyperelliptic.org/EFD/g1p/auto-twisted-extended.html#addition-add-2008-hwcd
    // Cost: 9M + 1*a + 1*d + 7add.
    add(other) {
      aedpoint(other);
      const { d } = CURVE;
      const { X: X1, Y: Y1, Z: Z1, T: T1 } = this;
      const { X: X2, Y: Y2, Z: Z2, T: T2 } = other;
      const A = Fp2.mul(X1, X2);
      const B = Fp2.mul(Y1, Y2);
      const C = Fp2.mul(Fp2.mulN(T1, d), T2);
      const D = Fp2.mul(Z1, Z2);
      const E = Fp2.sub(Fp2.subN(Fp2.mulN(Fp2.addN(X1, Y1), Fp2.addN(X2, Y2)), A), B);
      const F = Fp2.subN(D, C);
      const G = Fp2.addN(D, C);
      const H = Fp2.sub(B, mulA(A));
      const X3 = Fp2.mul(E, F);
      const Y3 = Fp2.mul(G, H);
      const T3 = Fp2.mul(E, H);
      const Z3 = Fp2.mul(F, G);
      return new Point(X3, Y3, Z3, T3);
    }
    subtract(other) {
      aedpoint(other);
      return this.add(other.negate());
    }
    // Constant-time multiplication.
    multiply(scalar) {
      if (!Fn.isValidNot0(scalar))
        throw new RangeError("invalid scalar: expected 1 <= sc < curve.n");
      const { p, f } = wnaf.mulSecret(this, scalar, cofactor, normalize);
      return normalize([p, f])[0];
    }
    // Non-constant-time multiplication. Uses double-and-add algorithm.
    // It's faster, but should only be used when you don't care about
    // an exposed private key e.g. sig verification.
    // Keeps the same subgroup-scalar contract: 0 is allowed for public-scalar callers, but
    // n and larger values are rejected instead of being reduced mod n to the identity point.
    multiplyUnsafe(scalar) {
      if (!Fn.isValid(scalar))
        throw new RangeError("invalid scalar: expected 0 <= sc < curve.n");
      if (scalar === _0n4)
        return Point.ZERO;
      if (this.is0() || scalar === _1n4)
        return this;
      return wnaf.mulUnsafe(this, scalar, normalize);
    }
    // Checks if point is of small order.
    // If you add something to small order point, you will have "dirty"
    // point with torsion component.
    // Clears cofactor and checks if the result is 0.
    isSmallOrder() {
      return this.clearCofactor().is0();
    }
    // Multiplies point by curve order and checks if the result is 0.
    // Returns `false` is the point is dirty.
    isTorsionFree() {
      return wnaf.mulUnsafe(this, CURVE.n).is0();
    }
    // Converts Extended point to default (x, y) coordinates.
    // Can accept precomputed Z^-1 - for example, from invertBatch.
    toAffine(invertedZ) {
      const p = this;
      let iz = invertedZ;
      if (iz != null && typeof iz !== "bigint")
        throw new TypeError('"invertedZ" expected bigint, got type=' + typeof iz);
      const { X, Y, Z } = p;
      const is0 = p.is0();
      if (iz == null)
        iz = is0 ? Fp2.create(_8n2) : Fp2.inv(Z);
      const x = Fp2.mul(X, iz);
      const y = Fp2.mul(Y, iz);
      const zz = Fp2.mul(Z, iz);
      if (is0)
        return { x: Fp2.ZERO, y: Fp2.ONE };
      if (!Fp2.eql(zz, Fp2.ONE))
        throw new Error("invZ was invalid");
      return { x, y };
    }
    clearCofactor() {
      if (cofactor === _1n4)
        return this;
      if (cofactor === _2n2)
        return this.double();
      if (cofactor === _4n3)
        return this.double().double();
      if (cofactor === _8n2)
        return this.double().double().double();
      return this.multiplyUnsafe(cofactor);
    }
    toBytes() {
      const { x, y } = this.toAffine();
      const bytes = Fp2.toBytes(y);
      bytes[bytes.length - 1] |= isOdd(x) ? 128 : 0;
      return bytes;
    }
    toHex() {
      return bytesToHex2(this.toBytes());
    }
    toString() {
      return `<Point ${this.is0() ? "ZERO" : this.toHex()}>`;
    }
  }
  const normalize = (points) => normalizeZ(Point, points);
  const wnaf = new ScalarMultiplier(Point, randomBytes4);
  if (wnaf.bits >= 6)
    Point.BASE.precompute(6);
  Object.freeze(Point.prototype);
  Object.freeze(Point);
  return Point;
}
function eddsa(Point, cHash, eddsaOpts = {}) {
  validatePointCons(Point);
  if (typeof cHash !== "function")
    throw new Error('"hash" function param is required');
  const hash = cHash;
  const opts = eddsaOpts;
  validateObject(opts, {}, {
    adjustScalarBytes: "function",
    randomBytes: "function",
    domain: "function",
    prehash: "function",
    zip215: "boolean",
    mapToCurve: "function",
    toMontgomery: "function",
    toMontgomerySecret: "function"
  });
  const { prehash } = opts;
  const { BASE, Fp: Fp2, Fn } = Point;
  const outputLen = hash.outputLen;
  const expectedLen = 2 * Fp2.BYTES;
  if (outputLen !== void 0) {
    asafenumber(outputLen, "hash.outputLen");
    if (outputLen !== expectedLen)
      throw new Error(`hash.outputLen must be ${expectedLen}, got ${outputLen}`);
  }
  const randomBytes4 = opts.randomBytes === void 0 ? randomBytes2 : opts.randomBytes;
  const toMontgomery2 = opts.toMontgomery;
  const toMontgomerySecret2 = opts.toMontgomerySecret;
  const adjustScalarBytes2 = opts.adjustScalarBytes === void 0 ? (bytes) => bytes : opts.adjustScalarBytes;
  const domain = opts.domain === void 0 ? (data, ctx, phflag) => {
    abool(phflag, "phflag");
    if (ctx.length || phflag)
      throw new Error("Contexts/pre-hash are not supported");
    return data;
  } : opts.domain;
  function modN_LE(hash2) {
    return Fn.create(bytesToNumberLE(hash2));
  }
  function getPrivateScalar(key) {
    const len = lengths.secretKey;
    abytes2(key, lengths.secretKey, "secretKey");
    const hashed = abytes2(hash(key), 2 * len, "hashedSecretKey");
    const head = adjustScalarBytes2(hashed.slice(0, len));
    const prefix = hashed.slice(len, 2 * len);
    const scalar = modN_LE(head);
    return { head, prefix, scalar };
  }
  function getExtendedPublicKey(secretKey) {
    const { head, prefix, scalar } = getPrivateScalar(secretKey);
    const point = BASE.multiply(scalar);
    const pointBytes = point.toBytes();
    return { head, prefix, scalar, point, pointBytes };
  }
  function getPublicKey(secretKey) {
    return getExtendedPublicKey(secretKey).pointBytes;
  }
  function hashDomainToScalar(context = Uint8Array.of(), ...msgs) {
    const msg = concatBytes2(...msgs);
    return modN_LE(hash(domain(msg, abytes2(context, void 0, "context"), !!prehash)));
  }
  function sign2(msg, secretKey, options = {}) {
    validateObject(options, {}, {}, "options");
    msg = copyBytes(abytes2(msg, void 0, "message"));
    if (prehash)
      msg = prehash(msg);
    const { prefix, scalar, pointBytes } = getExtendedPublicKey(secretKey);
    const r = hashDomainToScalar(options.context, prefix, msg);
    const R = BASE.multiply(r).toBytes();
    const k = hashDomainToScalar(options.context, R, pointBytes, msg);
    const s = Fn.create(r + k * scalar);
    if (!Fn.isValid(s))
      throw new Error("sign failed: invalid s");
    const rs = concatBytes2(R, Fn.toBytes(s));
    return abytes2(rs, lengths.signature, "result");
  }
  const verifyOpts = {
    zip215: opts.zip215
  };
  function verify(sig, msg, publicKey, options = verifyOpts) {
    validateObject(options);
    const { context } = options;
    const zip215 = options.zip215 === void 0 ? !!verifyOpts.zip215 : options.zip215;
    const len = lengths.signature;
    sig = abytes2(sig, len, "signature");
    msg = abytes2(msg, void 0, "message");
    publicKey = abytes2(publicKey, lengths.publicKey, "publicKey");
    if (zip215 !== void 0)
      abool(zip215, "zip215");
    if (prehash)
      msg = prehash(msg);
    const mid = len / 2;
    const r = sig.subarray(0, mid);
    const s = bytesToNumberLE(sig.subarray(mid, len));
    let A, R, SB;
    try {
      A = Point.fromBytes(publicKey, zip215);
      R = Point.fromBytes(r, zip215);
      SB = BASE.multiplyUnsafe(s);
    } catch (error) {
      return false;
    }
    if (!zip215 && A.isSmallOrder())
      return false;
    const k = hashDomainToScalar(context, r, publicKey, msg);
    const RkA = R.add(A.multiplyUnsafe(k));
    return RkA.subtract(SB).clearCofactor().is0();
  }
  const _size = Fp2.BYTES;
  const lengths = {
    secretKey: _size,
    publicKey: _size,
    signature: 2 * _size,
    seed: _size
  };
  function randomSecretKey(seed) {
    seed = seed === void 0 ? randomBytes4(lengths.seed) : seed;
    return abytes2(seed, lengths.seed, "seed");
  }
  function isValidSecretKey(key) {
    return isBytes2(key) && key.length === lengths.secretKey;
  }
  function isValidPublicKey(key, zip215) {
    try {
      return !!Point.fromBytes(key, zip215 === void 0 ? verifyOpts.zip215 : zip215);
    } catch (error) {
      return false;
    }
  }
  const utils = {
    getExtendedPublicKey,
    randomSecretKey,
    isValidSecretKey,
    isValidPublicKey,
    /** Converts an Edwards public key to a companion Montgomery public key. */
    toMontgomery(publicKey) {
      if (toMontgomery2 === void 0)
        throw new Error("Montgomery conversion is not supported for this curve");
      return toMontgomery2(Point.fromBytes(publicKey));
    },
    toMontgomerySecret(secretKey) {
      if (toMontgomerySecret2 === void 0)
        throw new Error("Montgomery conversion is not supported for this curve");
      return toMontgomerySecret2(secretKey);
    }
  };
  Object.freeze(lengths);
  Object.freeze(utils);
  return Object.freeze({
    keygen: createKeygen(randomSecretKey, getPublicKey),
    getPublicKey,
    sign: sign2,
    verify,
    utils,
    Point,
    lengths
  });
}
var _0n4, _1n4, _2n2, _4n3, _8n2;
var init_edwards = __esm({
  "../node_modules/@noble/curves/abstract/edwards.js"() {
    init_utils2();
    init_curve();
    init_modular();
    _0n4 = /* @__PURE__ */ BigInt(0);
    _1n4 = /* @__PURE__ */ BigInt(1);
    _2n2 = /* @__PURE__ */ BigInt(2);
    _4n3 = /* @__PURE__ */ BigInt(4);
    _8n2 = /* @__PURE__ */ BigInt(8);
  }
});

// ../node_modules/@noble/curves/ed25519.js
function ed25519_pow_2_252_3(x) {
  const _10n = BigInt(10), _20n = BigInt(20), _40n = BigInt(40), _80n = BigInt(80);
  const P = ed25519_CURVE_p;
  const x2 = x * x % P;
  const b2 = x2 * x % P;
  const b4 = pow2(b2, _2n3, P) * b2 % P;
  const b5 = pow2(b4, _1n5, P) * x % P;
  const b10 = pow2(b5, _5n2, P) * b5 % P;
  const b20 = pow2(b10, _10n, P) * b10 % P;
  const b40 = pow2(b20, _20n, P) * b20 % P;
  const b80 = pow2(b40, _40n, P) * b40 % P;
  const b160 = pow2(b80, _80n, P) * b80 % P;
  const b240 = pow2(b160, _80n, P) * b80 % P;
  const b250 = pow2(b240, _10n, P) * b10 % P;
  const pow_p_5_8 = pow2(b250, _2n3, P) * x % P;
  return { pow_p_5_8, b2 };
}
function adjustScalarBytes(bytes) {
  bytes[0] &= 248;
  bytes[31] &= 127;
  bytes[31] |= 64;
  return bytes;
}
function uvRatio(u, v) {
  const P = ed25519_CURVE_p;
  const v3 = mod(v * v * v, P);
  const v7 = mod(v3 * v3 * v, P);
  const pow3 = ed25519_pow_2_252_3(u * v7).pow_p_5_8;
  let x = mod(u * v3 * pow3, P);
  const vx2 = mod(v * x * x, P);
  const root1 = x;
  const root2 = mod(x * ED25519_SQRT_M1, P);
  const useRoot1 = vx2 === u;
  const useRoot2 = vx2 === mod(-u, P);
  const noRoot = vx2 === mod(-u * ED25519_SQRT_M1, P);
  if (useRoot1)
    x = root1;
  if (useRoot2 || noRoot)
    x = root2;
  if (isNegativeLE(x, P))
    x = mod(-x, P);
  return { isValid: useRoot1 || useRoot2, value: x };
}
function toMontgomery(point) {
  const { y } = point;
  return Fp.toBytes(Fp.div(_1n5 + y, _1n5 - y));
}
function toMontgomerySecret(secretKey) {
  const size = ed25519_Point.Fp.BYTES;
  abytes(secretKey, size);
  return adjustScalarBytes(sha512(secretKey.subarray(0, size))).subarray(0, size);
}
function ed(opts) {
  return eddsa(ed25519_Point, sha512, Object.assign({ adjustScalarBytes, toMontgomery, toMontgomerySecret, zip215: true }, opts));
}
var _1n5, _2n3, _5n2, _8n3, ed25519_CURVE_p, ed25519_CURVE, ED25519_SQRT_M1, ed25519_Point, Fp, ed25519;
var init_ed25519 = __esm({
  "../node_modules/@noble/curves/ed25519.js"() {
    init_sha2();
    init_utils();
    init_edwards();
    init_modular();
    _1n5 = /* @__PURE__ */ BigInt(1);
    _2n3 = /* @__PURE__ */ BigInt(2);
    _5n2 = /* @__PURE__ */ BigInt(5);
    _8n3 = /* @__PURE__ */ BigInt(8);
    ed25519_CURVE_p = /* @__PURE__ */ BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed");
    ed25519_CURVE = /* @__PURE__ */ (() => ({
      p: ed25519_CURVE_p,
      n: BigInt("0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed"),
      h: _8n3,
      a: BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffec"),
      d: BigInt("0x52036cee2b6ffe738cc740797779e89800700a4d4141d8ab75eb4dca135978a3"),
      Gx: BigInt("0x216936d3cd6e53fec0a4e231fdd6dc5c692cc7609525a7b2c9562d608f25d51a"),
      Gy: BigInt("0x6666666666666666666666666666666666666666666666666666666666666658")
    }))();
    ED25519_SQRT_M1 = /* @__PURE__ */ BigInt("19681161376707505956807079304988542015446066515923890162744021073123829784752");
    ed25519_Point = /* @__PURE__ */ edwards(ed25519_CURVE, { uvRatio });
    Fp = /* @__PURE__ */ (() => ed25519_Point.Fp)();
    ed25519 = /* @__PURE__ */ ed({});
  }
});

// ../node_modules/@scure/base/index.js
function isBytes3(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in a && a.BYTES_PER_ELEMENT === 1;
}
function abytes3(b) {
  if (!isBytes3(b))
    throw new TypeError("Uint8Array expected");
}
function isArrayOf(isString, arr) {
  if (!Array.isArray(arr))
    return false;
  if (arr.length === 0)
    return true;
  if (isString) {
    return arr.every((item) => typeof item === "string");
  } else {
    return arr.every((item) => Number.isSafeInteger(item));
  }
}
function afn(input) {
  if (typeof input !== "function")
    throw new TypeError("function expected");
  return true;
}
function astr(label, input) {
  if (typeof input !== "string")
    throw new TypeError(`${label}: string expected`);
  return true;
}
function anumber3(n, title = "number") {
  if (typeof n !== "number")
    throw new TypeError(`${title}: expected number, got ${typeof n}`);
  if (!Number.isSafeInteger(n))
    throw new RangeError(`${title}: expected safe integer, got ${n}`);
}
function anumArr(label, input) {
  if (!isArrayOf(false, input))
    throw new TypeError(`${label}: array of numbers expected`);
}
function u8ToNumArr(u8, len = u8.length) {
  const res = new Array(len);
  for (let i = 0; i < len; i++)
    res[i] = u8[i];
  return res;
}
function charcodesToString(codes) {
  const len = codes.length;
  if (asciiDecoder !== void 0 && len >= 12)
    return asciiDecoder.decode(codes);
  if (len <= B2S_CHUNK)
    return String.fromCharCode.apply(null, codes);
  let res = "";
  for (let i = 0; i < len; i += B2S_CHUNK)
    res += String.fromCharCode.apply(null, codes.subarray(i, i + B2S_CHUNK));
  return res;
}
function radix2(bits) {
  anumber3(bits);
  if (bits <= 0 || bits > 8)
    throw new RangeError("radix2: bits should be in (0..8]");
  const mask = powers[bits] - 1;
  return {
    encode: (bytes) => {
      abytes3(bytes);
      const len = bytes.length;
      const res = new Uint8Array(Math.ceil(len * 8 / bits));
      let carry = 0;
      let pos = 0;
      let j = 0;
      for (let i = 0; i < len; ) {
        if (i + 2 < len) {
          carry = carry << 24 | bytes[i] << 16 | bytes[i + 1] << 8 | bytes[i + 2];
          pos += 24;
          i += 3;
        } else {
          carry = (carry << 8 | bytes[i]) & 65535;
          pos += 8;
          i++;
        }
        for (; ; ) {
          pos -= bits;
          res[j++] = carry >> pos & mask;
          if (pos < bits)
            break;
        }
      }
      if (pos > 0)
        res[j] = carry << bits - pos & mask;
      return res;
    },
    decode: (digits) => {
      const len = digits.length;
      const res = new Uint8Array(Math.floor(len * bits / 8));
      let carry = 0;
      let pos = 0;
      let j = 0;
      for (let i = 0; i < len; i++) {
        carry = (carry << bits | digits[i]) & 65535;
        pos += bits;
        for (; pos >= 8; pos -= 8)
          res[j++] = carry >> pos - 8 & 255;
      }
      carry = carry << 8 - pos & 255;
      if (pos >= bits)
        throw new Error("Excess padding");
      if (carry > 0)
        throw new Error(`Non-zero padding: ${carry}`);
      return res;
    }
  };
}
function alphabet(letters, aliases) {
  const len = letters.length;
  if (len > 128)
    throw new Error("alphabet: max 128 letters");
  const encTable = new Uint8Array(len);
  const decTable = new Int8Array(128).fill(-1);
  for (let i = 0; i < len; i++) {
    const code = letters.charCodeAt(i);
    if (letters.codePointAt(i) !== code || code > 127)
      throw new Error("alphabet: single-char ASCII letters only");
    encTable[i] = code;
    decTable[code] = i;
  }
  if (aliases !== void 0) {
    for (const alias of Object.keys(aliases)) {
      const code = alias.charCodeAt(0);
      const target = decTable[aliases[alias].charCodeAt(0)];
      if (alias.length !== 1 || code > 127 || target === void 0 || target === -1)
        throw new Error(`alphabet: invalid alias ${alias}`);
      decTable[code] = target;
    }
  }
  return {
    encode: (digits) => {
      const codes = new Uint8Array(digits.length);
      for (let i = 0; i < digits.length; i++) {
        const d = digits[i];
        const code = encTable[d];
        if (code === void 0)
          throw new Error(`alphabet.encode: invalid digit ${d}`);
        codes[i] = code;
      }
      return charcodesToString(codes);
    },
    decode: (input) => {
      astr("decode", input);
      const slen = input.length;
      const digits = new Uint8Array(slen);
      for (let i = 0; i < slen; i++) {
        const code = input.charCodeAt(i);
        const digit = code < 128 ? decTable[code] : -1;
        if (digit === -1)
          throw new Error(`Unknown letter "${input[i]}". Allowed: ${letters}`);
        digits[i] = digit;
      }
      return digits;
    }
  };
}
function unsafeWrapper(fn) {
  afn(fn);
  return function(...args) {
    try {
      return fn.apply(null, args);
    } catch (e) {
    }
  };
}
function assertBech32Printable(label, value) {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c < 33 || c > 126)
      throw new Error(`${label}: printable ASCII expected`);
  }
}
function wordsToU8(words) {
  const len = words.length;
  const res = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    const w = words[i];
    if (w < 0 || w >= 32)
      throw new Error(`alphabet.encode: invalid digit ${w}`);
    res[i] = w;
  }
  return res;
}
function bech32Polymod(pre) {
  const b = pre >> 25;
  let chk = (pre & 33554431) << 5;
  for (let i = 0; i < POLYMOD_GENERATORS.length; i++) {
    if ((b >> i & 1) === 1)
      chk ^= POLYMOD_GENERATORS[i];
  }
  return chk;
}
function bechChecksum(prefix, words, encodingConst = 1) {
  const len = prefix.length;
  let chk = 1;
  for (let i = 0; i < len; i++) {
    const c = prefix.charCodeAt(i);
    if (c < 33 || c > 126)
      throw new Error(`Invalid prefix (${prefix})`);
    chk = bech32Polymod(chk) ^ c >> 5;
  }
  chk = bech32Polymod(chk);
  for (let i = 0; i < len; i++)
    chk = bech32Polymod(chk) ^ prefix.charCodeAt(i) & 31;
  for (let v of words)
    chk = bech32Polymod(chk) ^ v;
  for (let i = 0; i < 6; i++)
    chk = bech32Polymod(chk);
  chk ^= encodingConst;
  const sum = new Uint8Array(6);
  for (let i = 0; i < 6; i++)
    sum[i] = chk >>> 5 * (5 - i) & 31;
  return BECH_ALPHABET.encode(sum);
}
function genBech32(encoding) {
  const ENCODING_CONST = encoding === "bech32" ? 1 : 734539939;
  const _words = radix2(5);
  const toWords = (from) => {
    abytes3(from);
    const len = from.length;
    const res = new Array(Math.ceil(len * 8 / 5));
    let carry = 0;
    let pos = 0;
    let j = 0;
    for (let i = 0; i < len; i++) {
      carry = carry << 8 | from[i];
      pos += 8;
      for (; pos >= 5; pos -= 5)
        res[j++] = carry >> pos - 5 & 31;
    }
    if (pos > 0)
      res[j] = carry << 5 - pos & 31;
    return res;
  };
  const fromWords = (to) => {
    anumArr("radix2.decode", to);
    const len = to.length;
    const digits = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      const w = to[i];
      if (w < 0 || w >= 32)
        throw new Error(`convertRadix2: invalid word=${w}`);
      digits[i] = w;
    }
    return _words.decode(digits);
  };
  const fromWordsUnsafe = unsafeWrapper(fromWords);
  function encode(prefix, words, limit = 90) {
    astr("bech32.encode prefix", prefix);
    if (limit !== false)
      anumber3(limit, "limit");
    if (isBytes3(words))
      words = u8ToNumArr(words);
    anumArr("bech32.encode", words);
    const plen = prefix.length;
    if (plen === 0)
      throw new TypeError(`Invalid prefix length ${plen}`);
    const actualLength = plen + 7 + words.length;
    if (limit !== false && actualLength > limit)
      throw new TypeError(`Length ${actualLength} exceeds limit ${limit}`);
    assertBech32Printable("bech32.encode prefix", prefix);
    const lowered = prefix.toLowerCase();
    const sum = bechChecksum(lowered, words, ENCODING_CONST);
    return `${lowered}1${BECH_ALPHABET.encode(wordsToU8(words))}${sum}`;
  }
  function decode(str, limit = 90) {
    astr("bech32.decode input", str);
    if (limit !== false)
      anumber3(limit, "limit");
    const slen = str.length;
    if (slen < 8 || limit !== false && slen > limit)
      throw new TypeError(`invalid string length ${slen}, expected (8..${limit})`);
    const lowered = str.toLowerCase();
    if (str !== lowered) {
      if (!BECH_UPPERCASE_PRINTABLE.test(str)) {
        assertBech32Printable("bech32.decode input", str);
        throw new Error(`mixed-case string not allowed`);
      }
    }
    const sepIndex = lowered.lastIndexOf("1");
    if (sepIndex === 0 || sepIndex === -1)
      throw new Error(`invalid separator "1"`);
    const prefix = lowered.slice(0, sepIndex);
    const data = lowered.slice(sepIndex + 1);
    if (data.length < 6)
      throw new Error("invalid data length");
    const digits = BECH_ALPHABET.decode(data);
    const words = u8ToNumArr(digits, digits.length - 6);
    const sum = bechChecksum(prefix, words, ENCODING_CONST);
    if (!data.endsWith(sum))
      throw new Error(`Invalid checksum in ${str}`);
    return { prefix, words };
  }
  const decodeUnsafe = unsafeWrapper(decode);
  function decodeToBytes(str, limit = 90) {
    const { prefix, words } = decode(str, limit);
    return {
      prefix,
      words,
      bytes: fromWords(words)
    };
  }
  function encodeFromBytes(prefix, bytes) {
    return encode(prefix, toWords(bytes));
  }
  return {
    encode,
    decode,
    encodeFromBytes,
    decodeToBytes,
    decodeUnsafe,
    fromWords,
    fromWordsUnsafe,
    toWords
  };
}
var freeze, powers, asciiDecoder, B2S_CHUNK, BECH_ALPHABET, BECH_UPPERCASE_PRINTABLE, POLYMOD_GENERATORS, bech32m;
var init_base = __esm({
  "../node_modules/@scure/base/index.js"() {
    freeze = (fn) => Object.freeze(fn());
    powers = /* @__PURE__ */ (() => {
      let res = [];
      for (let i = 0; i < 40; i++)
        res.push(2 ** i);
      return res;
    })();
    asciiDecoder = /* @__PURE__ */ (() => {
      try {
        const decoder = new TextDecoder();
        return decoder.decode(Uint8Array.of(65, 48, 43, 127)) === "A0+\x7F" ? decoder : void 0;
      } catch (e) {
        return void 0;
      }
    })();
    B2S_CHUNK = 8192;
    BECH_ALPHABET = /* @__PURE__ */ alphabet("qpzry9x8gf2tvdw0s3jn54khce6mua7l");
    BECH_UPPERCASE_PRINTABLE = /^[\x21-\x60\x7b-\x7e]+$/;
    POLYMOD_GENERATORS = [996825010, 642813549, 513874426, 1027748829, 705979059];
    bech32m = /* @__PURE__ */ freeze(() => genBech32("bech32m"));
  }
});

// ../src/lib/core/address.ts
function addressFromPublicKey(pubkey) {
  if (pubkey.length !== 32) {
    throw new Error(`pubkey muss 32 Byte sein, ist ${pubkey.length}`);
  }
  return sha256(pubkey).slice(0, ADDRESS_BYTES);
}
function encodeAddress(raw) {
  if (raw.length !== ADDRESS_BYTES) {
    throw new Error(`Adresse muss ${ADDRESS_BYTES} Byte sein, ist ${raw.length}`);
  }
  return bech32m.encode(ADDRESS_HRP, bech32m.toWords(raw));
}
function decodeAddress(text) {
  const { prefix, words } = bech32m.decode(text);
  if (prefix !== ADDRESS_HRP) {
    throw new Error(`falsches Praefix: ${prefix}, erwartet ${ADDRESS_HRP}`);
  }
  const raw = bech32m.fromWords(words);
  if (raw.length !== ADDRESS_BYTES) {
    throw new Error(`Adresse hat ${raw.length} Byte, erwartet ${ADDRESS_BYTES}`);
  }
  return Uint8Array.from(raw);
}
var ZERO_ADDRESS;
var init_address = __esm({
  "../src/lib/core/address.ts"() {
    "use strict";
    init_sha2();
    init_base();
    init_params();
    ZERO_ADDRESS = new Uint8Array(ADDRESS_BYTES);
  }
});

// ../src/lib/core/wallet.ts
function sign(message, privateKey) {
  return ed25519.sign(message, privateKey);
}
function verifySignature(signature, message, publicKey) {
  try {
    return ed25519.verify(signature, message, publicKey);
  } catch {
    return false;
  }
}
var ED25519_DOMAIN;
var init_wallet = __esm({
  "../src/lib/core/wallet.ts"() {
    "use strict";
    init_ed25519();
    init_address();
    ED25519_DOMAIN = new TextEncoder().encode("ed25519 seed");
  }
});

// ../src/lib/core/tx.ts
var tx_exports = {};
__export(tx_exports, {
  TX_COINBASE: () => TX_COINBASE,
  TX_TRANSFER: () => TX_TRANSFER,
  TX_VERSION: () => TX_VERSION,
  buildTransfer: () => buildTransfer,
  checkTransfer: () => checkTransfer,
  coinbaseTotal: () => coinbaseTotal,
  deserializeTx: () => deserializeTx,
  serializeTx: () => serializeTx,
  sighash: () => sighash,
  signingBytes: () => signingBytes,
  txid: () => txid,
  txidHex: () => txidHex
});
function coinbaseTotal(cb) {
  let summe = 0n;
  for (const o of cb.outputs) summe += o.amount;
  return summe;
}
function signingBytes(t) {
  if (t.memo.length > MAX_MEMO_BYTES) throw new Error("memo zu lang");
  return new Writer().bytes(CHAIN_ID, 32).u16(t.version).u8(TX_TRANSFER).bytes(t.from, ADDRESS_BYTES).bytes(t.to, ADDRESS_BYTES).u64(t.amount).u64(t.fee).u64(t.nonce).u32(t.validUntil).u8(t.memo.length).bytes(t.memo).finish();
}
function sighash(t) {
  return sha256d(signingBytes(t));
}
function serializeTx(t) {
  const w = new Writer().u16(t.version).u8(t.type);
  if (t.type === TX_COINBASE) {
    w.u32(t.height);
    if (t.version === COINBASE_V2) {
      w.u8(t.outputs.length);
      for (const o of t.outputs) w.bytes(o.to, ADDRESS_BYTES).u64(o.amount);
    } else {
      const einziger = t.outputs[0];
      if (!einziger || t.outputs.length !== 1) {
        throw new Error("Coinbase der Fassung 1 hat genau einen Empfaenger");
      }
      w.bytes(einziger.to, ADDRESS_BYTES).u64(einziger.amount);
    }
    return w.u8(t.extra.length).bytes(t.extra).finish();
  }
  return w.bytes(t.from, ADDRESS_BYTES).bytes(t.to, ADDRESS_BYTES).u64(t.amount).u64(t.fee).u64(t.nonce).u32(t.validUntil).u8(t.memo.length).bytes(t.memo).bytes(t.publicKey, 32).bytes(t.signature, 64).finish();
}
function deserializeTx(bytes) {
  const r = new Reader(bytes);
  const version = r.u16();
  const type = r.u8();
  if (type === TX_COINBASE) {
    const height = r.u32();
    const outputs = [];
    if (version === COINBASE_V2) {
      const anzahl = r.u8();
      if (anzahl < 1 || anzahl > MAX_COINBASE_OUTPUTS) {
        throw new Error(`Coinbase mit ${anzahl} Empfaengern ist unzulaessig`);
      }
      for (let i = 0; i < anzahl; i++) {
        outputs.push({ to: r.bytes(ADDRESS_BYTES), amount: r.u64() });
      }
    } else {
      outputs.push({ to: r.bytes(ADDRESS_BYTES), amount: r.u64() });
    }
    const extra = r.bytes(r.u8());
    return { type: TX_COINBASE, version, height, outputs, extra };
  }
  if (type !== TX_TRANSFER) throw new Error(`unbekannter Transaktionstyp ${type}`);
  const from = r.bytes(ADDRESS_BYTES);
  const to = r.bytes(ADDRESS_BYTES);
  const amount = r.u64();
  const fee = r.u64();
  const nonce = r.u64();
  const validUntil = r.u32();
  const memo = r.bytes(r.u8());
  const publicKey = r.bytes(32);
  const signature = r.bytes(64);
  return {
    type: TX_TRANSFER,
    version,
    from,
    to,
    amount,
    fee,
    nonce,
    validUntil,
    memo,
    publicKey,
    signature
  };
}
function txid(t) {
  return sha256d(serializeTx(t));
}
function txidHex(t) {
  return toHex(txid(t));
}
function buildTransfer(params) {
  const base = {
    type: TX_TRANSFER,
    version: TX_VERSION,
    from: params.from,
    to: params.to,
    amount: params.amount,
    fee: params.fee,
    nonce: params.nonce,
    validUntil: params.validUntil ?? 0,
    memo: params.memo ?? new Uint8Array(0)
  };
  return {
    ...base,
    publicKey: params.publicKey,
    signature: sign(sighash(base), params.privateKey)
  };
}
function checkTransfer(t, atHeight) {
  if (t.version !== TX_VERSION) return "bad_version";
  if (t.amount <= 0n) return "bad_amount";
  if (t.fee < MIN_FEE) return "fee_too_low";
  if (t.memo.length > MAX_MEMO_BYTES) return "memo_too_long";
  if (t.validUntil !== 0 && atHeight !== void 0 && atHeight > t.validUntil) return "expired";
  const derived = addressFromPublicKey(t.publicKey);
  if (toHex(derived) !== toHex(t.from)) return "pubkey_mismatch";
  if (toHex(t.from) === toHex(t.to)) return "self_transfer";
  const { signature, publicKey, ...unsigned } = t;
  if (!verifySignature(signature, sighash(unsigned), publicKey)) return "bad_signature";
  return null;
}
var TX_TRANSFER, TX_COINBASE, TX_VERSION;
var init_tx = __esm({
  "../src/lib/core/tx.ts"() {
    "use strict";
    init_codec();
    init_hash();
    init_wallet();
    init_address();
    init_params();
    TX_TRANSFER = 1;
    TX_COINBASE = 0;
    TX_VERSION = 1;
  }
});

// src/main.ts
var import_node_http2 = require("node:http");
var import_node_fs2 = require("node:fs");
var import_node_path2 = require("node:path");
var import_node_os = require("node:os");
var import_node_child_process = require("node:child_process");

// ../src/lib/node/fullnode/ChainStore.ts
var import_node_sqlite = require("node:sqlite");
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
init_params();
init_codec();

// ../src/lib/node/fullnode/ChainWork.ts
function blockWork(difficulty) {
  if (difficulty <= 0n) throw new Error("difficulty muss positiv sein");
  return difficulty;
}
function compareTips(a, b) {
  if (a.chainWork > b.chainWork) return 1;
  if (a.chainWork < b.chainWork) return -1;
  for (let i = 0; i < 32; i++) {
    const x = a.hash[i] ?? 0;
    const y = b.hash[i] ?? 0;
    if (x !== y) return x < y ? 1 : -1;
  }
  return 0;
}
function workToBytes(work) {
  if (work < 0n) throw new Error("Arbeit kann nicht negativ sein");
  const out = new Uint8Array(32);
  let x = work;
  for (let i = 31; i >= 0 && x > 0n; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  if (x > 0n) throw new Error("Arbeit passt nicht in 32 Byte");
  return out;
}
function workFromBytes(bytes) {
  let x = 0n;
  for (const b of bytes) x = x << 8n | BigInt(b);
  return x;
}

// ../src/lib/node/fullnode/ChainStore.ts
var STORE_VERSION = 1;
var SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS blocks (
  hash        BLOB PRIMARY KEY,
  height      INTEGER NOT NULL,
  prev_hash   BLOB    NOT NULL,
  -- 32 Byte Big-Endian, damit SQLite direkt danach sortieren kann.
  chain_work  BLOB    NOT NULL,
  difficulty  TEXT    NOT NULL,
  block_time  INTEGER NOT NULL,
  merkle_root BLOB    NOT NULL,
  state_root  BLOB    NOT NULL,
  tx_count    INTEGER NOT NULL,
  body        BLOB    NOT NULL,
  status      TEXT    NOT NULL,
  main_chain  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS blocks_height   ON blocks(height);
CREATE INDEX IF NOT EXISTS blocks_prev     ON blocks(prev_hash);
CREATE INDEX IF NOT EXISTS blocks_main     ON blocks(main_chain, height);
CREATE INDEX IF NOT EXISTS blocks_bestwork ON blocks(status, chain_work DESC);

-- Zustandsmarken. Ohne sie muesste nach jedem Reorg und jedem Neustart die
-- gesamte Kette neu gerechnet werden.
CREATE TABLE IF NOT EXISTS snapshots (
  hash       BLOB PRIMARY KEY,
  height     INTEGER NOT NULL,
  state_root BLOB NOT NULL,
  accounts   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS snapshots_height ON snapshots(height);
`;
var ChainStore = class {
  db;
  constructor(pfad) {
    if (pfad !== ":memory:") (0, import_node_fs.mkdirSync)((0, import_node_path.dirname)(pfad), { recursive: true });
    this.db = new import_node_sqlite.DatabaseSync(pfad);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA synchronous = NORMAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec(SCHEMA);
    this.pruefeIdentitaet();
  }
  /**
   * Netz und Kette festnageln.
   *
   * Eine Ablage, die einmal fuer yskar-main-1 angelegt wurde, darf nie mit
   * Bloecken einer anderen Kette weiterbenutzt werden. Das faellt sonst erst
   * auf, wenn der State Root nicht mehr passt -- und dann ist unklar, ob der
   * Fehler im Code oder in den Daten steckt.
   */
  pruefeIdentitaet() {
    const erwartet = {
      network: NETWORK,
      chain_id: toHex(CHAIN_ID),
      store_version: String(STORE_VERSION)
    };
    for (const [key, wert] of Object.entries(erwartet)) {
      const vorhanden = this.meta(key);
      if (vorhanden === null) this.setMeta(key, wert);
      else if (vorhanden !== wert) {
        throw new Error(
          `Diese Ablage gehoert zu ${key}=${vorhanden}, erwartet wird ${wert}. Falscher Datenordner oder veraltetes Format.`
        );
      }
    }
  }
  meta(key) {
    const zeile = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
    return zeile ? zeile.value : null;
  }
  setMeta(key, value) {
    this.db.prepare(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(key, value);
  }
  // ------------------------------------------------------------- Bloecke
  put(b) {
    this.db.prepare(`
      INSERT INTO blocks (hash, height, prev_hash, chain_work, difficulty,
                          block_time, merkle_root, state_root, tx_count,
                          body, status, main_chain)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(hash) DO UPDATE SET
        status = excluded.status, main_chain = excluded.main_chain
    `).run(
      b.hash,
      b.height,
      b.prevHash,
      workToBytes(b.chainWork),
      b.difficulty.toString(),
      Number(b.blockTime),
      b.merkleRoot,
      b.stateRoot,
      b.txCount,
      b.body,
      b.status,
      b.mainChain ? 1 : 0
    );
  }
  get(hash) {
    const z = this.db.prepare("SELECT * FROM blocks WHERE hash = ?").get(hash);
    return z ? zuBlock(z) : null;
  }
  has(hash) {
    return this.db.prepare("SELECT 1 FROM blocks WHERE hash = ?").get(hash) !== void 0;
  }
  /** Alle bekannten Nachfolger eines Blocks -- die Verzweigungen. */
  children(hash) {
    const zeilen = this.db.prepare("SELECT * FROM blocks WHERE prev_hash = ?").all(hash);
    return zeilen.map((z) => zuBlock(z));
  }
  /** Alle Bloecke einer Hoehe. Mehr als einer bedeutet eine Gabelung. */
  atHeight(height) {
    const zeilen = this.db.prepare("SELECT * FROM blocks WHERE height = ?").all(height);
    return zeilen.map((z) => zuBlock(z));
  }
  /** Block der aktiven Kette auf dieser Hoehe. */
  mainAt(height) {
    const z = this.db.prepare(
      "SELECT * FROM blocks WHERE height = ? AND main_chain = 1"
    ).get(height);
    return z ? zuBlock(z) : null;
  }
  /** Kopf der aktiven Kette. */
  mainTip() {
    const z = this.db.prepare(
      "SELECT * FROM blocks WHERE main_chain = 1 ORDER BY height DESC LIMIT 1"
    ).get();
    return z ? zuBlock(z) : null;
  }
  /**
   * Der gueltige Block mit der meisten Arbeit -- unabhaengig davon, ob er
   * gerade zur aktiven Kette gehoert. Genau hier entscheidet sich, ob ein
   * Reorg noetig ist.
   */
  bestTip() {
    const zeilen = this.db.prepare(`
      SELECT * FROM blocks WHERE status = 'valid'
      ORDER BY chain_work DESC LIMIT 8`).all();
    if (zeilen.length === 0) return null;
    let bester = zuBlock(zeilen[0]);
    for (const z of zeilen.slice(1)) {
      const k = zuBlock(z);
      if (compareTips(alsTip(k), alsTip(bester)) > 0) bester = k;
    }
    return bester;
  }
  /** Alle gueltigen Tips: Bloecke ohne bekannten Nachfolger. */
  tips() {
    const zeilen = this.db.prepare(`
      SELECT b.* FROM blocks b
      WHERE b.status = 'valid'
        AND NOT EXISTS (SELECT 1 FROM blocks c WHERE c.prev_hash = b.hash)
      ORDER BY b.chain_work DESC`).all();
    return zeilen.map((z) => zuBlock(z));
  }
  setMainChain(hash, an) {
    this.db.prepare("UPDATE blocks SET main_chain = ? WHERE hash = ?").run(an ? 1 : 0, hash);
  }
  setStatus(hash, status) {
    this.db.prepare("UPDATE blocks SET status = ? WHERE hash = ?").run(status, hash);
  }
  height() {
    const tip = this.mainTip();
    return tip ? tip.height : -1;
  }
  count() {
    const z = this.db.prepare("SELECT COUNT(*) AS n FROM blocks").get();
    return z.n;
  }
  // -------------------------------------------------------- Zustandsmarken
  putSnapshot(s) {
    this.db.prepare(`
      INSERT INTO snapshots (hash, height, state_root, accounts) VALUES (?,?,?,?)
      ON CONFLICT(hash) DO UPDATE SET accounts = excluded.accounts
    `).run(
      s.hash,
      s.height,
      s.stateRoot,
      JSON.stringify(s.accounts.map(([a, k]) => [a, k.balance.toString(), k.nonce.toString()]))
    );
  }
  getSnapshot(hash) {
    const z = this.db.prepare("SELECT * FROM snapshots WHERE hash = ?").get(hash);
    return z ? zuSnapshot(z) : null;
  }
  /**
   * Die juengste Marke auf der aktiven Kette, die nicht hoeher als `height`
   * liegt. Ausgangspunkt fuer das Nachrechnen nach einem Reorg.
   */
  snapshotAtOrBelow(height) {
    const z = this.db.prepare(`
      SELECT s.* FROM snapshots s
      JOIN blocks b ON b.hash = s.hash
      WHERE s.height <= ? AND b.main_chain = 1
      ORDER BY s.height DESC LIMIT 1`).get(height);
    return z ? zuSnapshot(z) : null;
  }
  /** Marken oberhalb einer Hoehe verwerfen -- sie gehoeren zu einem Zweig,
   *  der nicht mehr gilt. */
  dropSnapshotsAbove(height) {
    this.db.prepare("DELETE FROM snapshots WHERE height > ?").run(height);
  }
  /** Alte Marken ausduennen, die juengsten behalten. */
  pruneSnapshots(behalten) {
    this.db.prepare(`
      DELETE FROM snapshots WHERE height NOT IN (
        SELECT height FROM snapshots ORDER BY height DESC LIMIT ?)`).run(behalten);
  }
  transaktion(fn) {
    this.db.exec("BEGIN");
    try {
      const r = fn();
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  close() {
    this.db.close();
  }
};
function alsBytes(v) {
  if (v instanceof Uint8Array) return v;
  if (typeof v === "string") return fromHex(v);
  throw new Error("Bytefeld hat unerwarteten Typ: " + typeof v);
}
function zuBlock(z) {
  return {
    hash: alsBytes(z.hash),
    height: Number(z.height),
    prevHash: alsBytes(z.prev_hash),
    chainWork: workFromBytes(alsBytes(z.chain_work)),
    difficulty: BigInt(String(z.difficulty)),
    blockTime: BigInt(Number(z.block_time)),
    merkleRoot: alsBytes(z.merkle_root),
    stateRoot: alsBytes(z.state_root),
    txCount: Number(z.tx_count),
    body: alsBytes(z.body),
    status: String(z.status),
    mainChain: Number(z.main_chain) === 1
  };
}
function zuSnapshot(z) {
  const roh = JSON.parse(String(z.accounts));
  return {
    hash: alsBytes(z.hash),
    height: Number(z.height),
    stateRoot: alsBytes(z.state_root),
    accounts: roh.map(([a, b, n]) => [a, { balance: BigInt(b), nonce: BigInt(n) }])
  };
}
function alsTip(b) {
  return { hash: b.hash, height: b.height, chainWork: b.chainWork };
}

// ../src/lib/core/block.ts
init_codec();
init_hash();
init_tx();
init_params();
var HEADER_SIZE = 136;
var BLOCK_VERSION = 1;
function serializeHeader(h) {
  if (h.difficulty <= 0n || h.difficulty > 0xffffffffn) {
    throw new Error(`difficulty muss ein u32 > 0 sein, ist ${h.difficulty}`);
  }
  return new Writer().u32(h.version).u32(h.height).bytes(h.prevHash, 32).bytes(h.merkleRoot, 32).bytes(h.stateRoot, 32).u64(h.timestamp).u32(Number(h.difficulty)).u32(h.txCount).u64(h.extranonce).u64(h.nonce).finish();
}
function deserializeHeader(b) {
  if (b.length !== HEADER_SIZE) {
    throw new Error(`Header muss ${HEADER_SIZE} Byte sein, ist ${b.length}`);
  }
  const r = new Reader(b);
  return {
    version: r.u32(),
    height: r.u32(),
    prevHash: r.bytes(32),
    merkleRoot: r.bytes(32),
    stateRoot: r.bytes(32),
    timestamp: r.u64(),
    difficulty: BigInt(r.u32()),
    txCount: r.u32(),
    extranonce: r.u64(),
    nonce: r.u64()
  };
}
function headerHash(h) {
  return sha256d(serializeHeader(h));
}
function txMerkleRoot(txs) {
  return merkleRoot(txs.map(txid));
}
function serializeBlock(b) {
  const w = new Writer().bytes(serializeHeader(b.header), HEADER_SIZE);
  w.u32(b.txs.length);
  for (const t of b.txs) {
    const bytes = serializeTx(t);
    w.u32(bytes.length).bytes(bytes);
  }
  return w.finish();
}
function deserializeBlock(bytes) {
  const header = deserializeHeader(bytes.slice(0, HEADER_SIZE));
  const r = new Reader(bytes.slice(HEADER_SIZE));
  const count = r.u32();
  if (count > MAX_TXS_PER_BLOCK) throw new Error("zu viele Transaktionen");
  const txs = [];
  for (let i = 0; i < count; i++) txs.push(deserializeTx(r.bytes(r.u32())));
  return { header, txs };
}
function meetsTarget(hash, difficulty) {
  return bytesToBig(hash) <= targetFromDifficulty(difficulty);
}
function checkBlockStructure(b) {
  if (b.header.version !== BLOCK_VERSION) return "bad_version";
  if (b.txs.length > MAX_TXS_PER_BLOCK) return "too_many_txs";
  if (b.header.txCount !== b.txs.length) return "tx_count_mismatch";
  if (b.txs.length === 0 || b.txs[0].type !== TX_COINBASE) return "no_coinbase";
  for (let i = 1; i < b.txs.length; i++) {
    if (b.txs[i].type === TX_COINBASE) return "multiple_coinbase";
  }
  if (b.txs[0].height !== b.header.height) return "coinbase_height";
  const root = txMerkleRoot(b.txs);
  if (bytesToBig(root) !== bytesToBig(b.header.merkleRoot)) return "merkle_mismatch";
  if (!meetsTarget(headerHash(b.header), b.header.difficulty)) return "pow_failed";
  return null;
}

// ../src/lib/core/networks.ts
init_sha2();
init_params();
var MAINNET = {
  network: NETWORK,
  chainId: CHAIN_ID,
  targetBlockTime: TARGET_BLOCK_TIME,
  minDifficulty: MIN_DIFFICULTY,
  genesisDifficulty: GENESIS_DIFFICULTY,
  lwmaWindow: LWMA_WINDOW,
  lwmaClamp: LWMA_CLAMP,
  solvetimeCap: SOLVETIME_CAP,
  coinbaseV2Height: COINBASE_V2_HEIGHT
};
var REGTEST = {
  network: "yskar-regtest",
  chainId: sha256(new TextEncoder().encode("yskar-regtest")),
  targetBlockTime: TARGET_BLOCK_TIME,
  minDifficulty: 1n,
  genesisDifficulty: 1n,
  lwmaWindow: LWMA_WINDOW,
  lwmaClamp: LWMA_CLAMP,
  solvetimeCap: SOLVETIME_CAP,
  // Im Testnetz von Anfang an -- sonst liessen sich die Pool-Regeln nicht
  // pruefen, ohne erst zweitausend Bloecke zu minen.
  coinbaseV2Height: 0
};

// ../src/lib/core/state.ts
init_codec();
init_hash();
init_tx();
init_params();
function emptyState() {
  return /* @__PURE__ */ new Map();
}
function getAccount(s, addr) {
  return s.get(toHex(addr)) ?? { balance: 0n, nonce: 0n };
}
function setAccount(s, addr, a) {
  if (a.balance === 0n && a.nonce === 0n) s.delete(toHex(addr));
  else s.set(toHex(addr), a);
}
function cloneState(s) {
  return new Map([...s].map(([k, v]) => [k, { ...v }]));
}
function stateRoot(s) {
  const leaves = [...s.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([addrHex, acc]) => {
    const addr = new Uint8Array(ADDRESS_BYTES);
    for (let i = 0; i < ADDRESS_BYTES; i++) {
      addr[i] = parseInt(addrHex.substr(i * 2, 2), 16);
    }
    return new Writer().bytes(addr, ADDRESS_BYTES).u64(acc.balance).u64(acc.nonce).finish();
  });
  return merkleRoot(leaves);
}
function applyBlock(state, block, params = MAINNET) {
  const draft = cloneState(state);
  let fees = 0n;
  for (let i = 1; i < block.txs.length; i++) {
    const t = block.txs[i];
    if (t.type !== TX_TRANSFER) return fail(i, "not_transfer");
    const structural = checkTransfer(t, block.header.height);
    if (structural) return fail(i, structural);
    const from = getAccount(draft, t.from);
    if (from.nonce !== t.nonce) return fail(i, `nonce_mismatch:${from.nonce}!=${t.nonce}`);
    const total = t.amount + t.fee;
    if (from.balance < total) return fail(i, "insufficient_funds");
    setAccount(draft, t.from, { balance: from.balance - total, nonce: from.nonce + 1n });
    const to = getAccount(draft, t.to);
    setAccount(draft, t.to, { ...to, balance: to.balance + t.amount });
    fees += t.fee;
  }
  const cb = block.txs[0];
  if (!cb || cb.type !== TX_COINBASE) return fail(0, "no_coinbase");
  if (cb.version === COINBASE_V2) {
    if (block.header.height < params.coinbaseV2Height) {
      return fail(0, `coinbase_v2_zu_frueh:${block.header.height}<${params.coinbaseV2Height}`);
    }
    if (cb.outputs.length < 1 || cb.outputs.length > MAX_COINBASE_OUTPUTS) {
      return fail(0, `coinbase_outputs:${cb.outputs.length}`);
    }
    for (let i = 1; i < cb.outputs.length; i++) {
      if (toHex(cb.outputs[i - 1].to) >= toHex(cb.outputs[i].to)) {
        return fail(0, "coinbase_outputs_unsortiert");
      }
    }
    for (const o of cb.outputs) {
      if (o.amount <= 0n) return fail(0, "coinbase_output_null");
    }
  } else if (cb.outputs.length !== 1) {
    return fail(0, "coinbase_v1_mehrere_empfaenger");
  }
  const expected = rewardAt(block.header.height) + fees;
  const gesamt = coinbaseTotal(cb);
  if (gesamt !== expected) {
    return fail(0, `coinbase_amount:${gesamt}!=${expected}`);
  }
  for (const o of cb.outputs) {
    const konto = getAccount(draft, o.to);
    setAccount(draft, o.to, { ...konto, balance: konto.balance + o.amount });
  }
  if (totalSupply(draft) > MAX_SUPPLY) return fail(0, "supply_exceeded");
  state.clear();
  for (const [k, v] of draft) state.set(k, v);
  return { ok: true, fees };
  function fail(tx, reason) {
    return { ok: false, error: { tx, reason }, fees: 0n };
  }
}
function totalSupply(s) {
  let sum = 0n;
  for (const a of s.values()) sum += a.balance;
  return sum;
}

// ../src/lib/core/difficulty.ts
init_params();
function nextDifficulty(recent, params = MAINNET) {
  if (recent.length === 0) return params.minDifficulty;
  const n = BigInt(Math.min(recent.length, params.lwmaWindow));
  const win = recent.slice(-Number(n));
  const cap = params.solvetimeCap * params.targetBlockTime;
  let weighted = 0n;
  let sumDiff = 0n;
  for (let i = 0; i < win.length; i++) {
    let s = win[i].solveSeconds;
    if (s < 1n) s = 1n;
    if (s > cap) s = cap;
    weighted += s * BigInt(i + 1);
    sumDiff += win[i].difficulty;
  }
  if (weighted <= 0n) return params.minDifficulty;
  const k = n * (n + 1n) / 2n;
  let next = sumDiff * params.targetBlockTime * k / (n * weighted);
  const last = win[win.length - 1].difficulty;
  const upper = last * params.lwmaClamp;
  const lower = last / params.lwmaClamp;
  if (next > upper) next = upper;
  if (next < lower) next = lower;
  return next < params.minDifficulty ? params.minDifficulty : next;
}
function effectiveDifficulty(base, secondsSinceLastBlock, params = MAINNET) {
  const threshold = EMERGENCY_FACTOR * params.targetBlockTime;
  if (secondsSinceLastBlock <= threshold) return base;
  const eased = base * threshold / secondsSinceLastBlock;
  return eased < params.minDifficulty ? params.minDifficulty : eased;
}
function medianTimePast(timestamps) {
  if (timestamps.length === 0) return 0n;
  const w = timestamps.slice(-MEDIAN_TIME_BLOCKS).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  return w[Math.floor(w.length / 2)];
}
function checkTimestamp(ts, previousTimestamps, now) {
  if (previousTimestamps.length > 0 && ts <= medianTimePast(previousTimestamps)) {
    return "too_early";
  }
  if (ts > now + MAX_FUTURE_DRIFT) return "too_far_ahead";
  return null;
}

// ../src/lib/core/validate.ts
init_codec();
function expectedDifficulty(timings, params = MAINNET) {
  if (timings.length === 0) return params.genesisDifficulty;
  return nextDifficulty(timings, params);
}
function validateBlock(block, ctx) {
  const structural = checkBlockStructure(block);
  if (structural) return { code: "structure", detail: structural };
  const h = block.header;
  if (ctx.previous === null) {
    if (h.height !== 0) return { code: "height", detail: "Genesis muss Hoehe 0 haben" };
    if (h.prevHash.some((b) => b !== 0)) {
      return { code: "prev_hash", detail: "Genesis prev_hash muss null sein" };
    }
  } else {
    if (h.height !== ctx.previous.height + 1) {
      return { code: "height", detail: `erwartet ${ctx.previous.height + 1}, erhalten ${h.height}` };
    }
    const want = headerHash(ctx.previous);
    if (toHex(h.prevHash) !== toHex(want)) {
      return { code: "prev_hash", detail: `zeigt nicht auf Block ${ctx.previous.height}` };
    }
  }
  if (ctx.previous !== null) {
    const tsError = checkTimestamp(h.timestamp, ctx.recentTimestamps, ctx.now);
    if (tsError) return { code: "timestamp", detail: tsError };
  }
  if (ctx.previous !== null) {
    const regular = expectedDifficulty(ctx.recentTimings, ctx.params ?? MAINNET);
    const elapsed = h.timestamp > ctx.previous.timestamp ? h.timestamp - ctx.previous.timestamp : 0n;
    const eased = effectiveDifficulty(regular, elapsed, ctx.params ?? MAINNET);
    if (h.difficulty > regular || h.difficulty < eased) {
      return {
        code: "difficulty",
        detail: `${h.difficulty} liegt nicht zwischen ${eased} und ${regular}`
      };
    }
    const untergrenze = (ctx.params ?? MAINNET).minDifficulty;
    if (h.difficulty < untergrenze) {
      return { code: "difficulty", detail: `unter der Untergrenze ${untergrenze}` };
    }
  }
  const draft = cloneState(ctx.state);
  const applied = applyBlock(draft, block, ctx.params ?? MAINNET);
  if (!applied.ok) {
    return { code: "state", detail: `tx ${applied.error?.tx}: ${applied.error?.reason}` };
  }
  const root = stateRoot(draft);
  if (toHex(root) !== toHex(h.stateRoot)) {
    return {
      code: "state_root",
      detail: `berechnet ${toHex(root).slice(0, 16)}\u2026, im Header ${toHex(h.stateRoot).slice(0, 16)}\u2026`
    };
  }
  return null;
}

// ../src/lib/node/fullnode/ChainManager.ts
init_codec();
var SNAPSHOT_INTERVAL = 200;
var ChainManager = class {
  store;
  params;
  /** Zustand am Kopf der AKTIVEN Kette. Wird bei jedem Reorg neu gebaut. */
  zustand = emptyState();
  zustandHoehe = -1;
  zustandHash = null;
  /**
   * Ohne Angabe gilt das Mainnet. Die Parameter gibt es nur, damit Fork-
   * und Reorg-Tests im Testnetz durch die volle Validierung laufen koennen.
   */
  constructor(store, params = MAINNET) {
    this.store = store;
    this.params = params;
    this.zustandHerstellen();
  }
  tip() {
    return this.store.mainTip();
  }
  height() {
    return this.zustandHoehe;
  }
  state() {
    return this.zustand;
  }
  /**
   * Einen Block annehmen.
   *
   * Reihenfolge ist Absicht: erst billige Pruefungen, dann teure. Ein
   * kaputter Header kostet Mikrosekunden, eine Signaturpruefung
   * Millisekunden. Wer das umdreht, macht sich angreifbar.
   */
  accept(roh) {
    let block;
    try {
      block = deserializeBlock(roh);
    } catch (e) {
      return { ok: false, grund: "unlesbar", detail: String(e.message) };
    }
    const hash = headerHash(block.header);
    if (this.store.has(hash)) return { ok: true, stored: false, grund: "bekannt" };
    const strukturfehler = checkBlockStructure(block);
    if (strukturfehler) return { ok: false, grund: "struktur", detail: strukturfehler };
    const istGenesis = block.header.height === 0;
    let vorgaenger = null;
    if (!istGenesis) {
      vorgaenger = this.store.get(block.header.prevHash);
      if (!vorgaenger) {
        return {
          ok: false,
          grund: "vorgaenger_fehlt",
          detail: toHex(block.header.prevHash)
        };
      }
      if (vorgaenger.status !== "valid") {
        return { ok: false, grund: "vorgaenger_ungueltig" };
      }
      if (block.header.height !== vorgaenger.height + 1) {
        return {
          ok: false,
          grund: "hoehe_passt_nicht",
          detail: `${block.header.height} nach ${vorgaenger.height}`
        };
      }
    }
    let ausgangszustand;
    let zeitstempel;
    let timings;
    try {
      const kontext = this.zweigKontext(vorgaenger);
      ausgangszustand = kontext.state;
      zeitstempel = kontext.zeitstempel;
      timings = kontext.timings;
    } catch (e) {
      return { ok: false, grund: "zweig_unlesbar", detail: String(e.message) };
    }
    const fehler = validateBlock(block, {
      previous: vorgaenger ? deserializeBlock(vorgaenger.body).header : null,
      state: ausgangszustand,
      recentTimestamps: zeitstempel.slice(-11),
      recentTimings: timings.slice(-this.params.lwmaWindow - 1),
      now: BigInt(Math.floor(Date.now() / 1e3)),
      params: this.params
    });
    if (fehler) return { ok: false, grund: fehler.code, detail: fehler.detail };
    const nachher = cloneState(ausgangszustand);
    const angewandt = applyBlock(nachher, block, this.params);
    if (!angewandt.ok) {
      return { ok: false, grund: "anwenden", detail: angewandt.error?.reason };
    }
    const meine = stateRoot(nachher);
    if (toHex(meine) !== toHex(block.header.stateRoot)) {
      return {
        ok: false,
        grund: "state_root",
        detail: `errechnet ${toHex(meine).slice(0, 16)}\u2026`
      };
    }
    const arbeit = (vorgaenger?.chainWork ?? 0n) + blockWork(block.header.difficulty);
    this.store.put({
      hash,
      height: block.header.height,
      prevHash: block.header.prevHash,
      chainWork: arbeit,
      difficulty: block.header.difficulty,
      blockTime: block.header.timestamp,
      merkleRoot: block.header.merkleRoot,
      stateRoot: block.header.stateRoot,
      txCount: block.txs.length,
      body: roh,
      status: "valid",
      mainChain: false
    });
    const reorg = this.besteKetteWaehlen();
    return {
      ok: true,
      stored: true,
      reorg,
      height: this.zustandHoehe,
      tip: this.zustandHash ?? new Uint8Array(32)
    };
  }
  /**
   * Die Kette mit der meisten Arbeit zur aktiven machen.
   *
   * Rueckgabe: true, wenn dafuer umgeschaltet werden musste.
   */
  besteKetteWaehlen() {
    const best = this.store.bestTip();
    if (!best) return false;
    const aktuell = this.store.mainTip();
    if (aktuell && toHex(aktuell.hash) === toHex(best.hash)) return false;
    if (aktuell && compareTips(alsTip(best), alsTip(aktuell)) <= 0) return false;
    const warVorhanden = aktuell !== null;
    this.umschalten(best);
    return warVorhanden && toHex(best.prevHash) !== toHex(aktuell.hash);
  }
  /**
   * Auf einen anderen Zweig umschalten.
   *
   * Schritte: gemeinsamen Vorfahren finden, alte Kette abmarkieren, neue
   * markieren, Zustand neu aufbauen, Wurzel gegenpruefen. Nichts wird
   * geloescht -- der alte Zweig bleibt vollstaendig erhalten und koennte
   * spaeter wieder gewinnen.
   */
  umschalten(neuerTip) {
    const neuerPfad = this.pfadZumVerankerten(neuerTip);
    const gabel = neuerPfad.length > 0 ? neuerPfad[0].height - 1 : -1;
    this.store.transaktion(() => {
      let h = this.store.height();
      while (h > gabel) {
        const alt = this.store.mainAt(h);
        if (alt) this.store.setMainChain(alt.hash, false);
        h--;
      }
      for (const b of neuerPfad) this.store.setMainChain(b.hash, true);
      this.store.dropSnapshotsAbove(gabel);
    });
    this.zustandHerstellen();
  }
  /**
   * Der Weg vom neuen Tip abwaerts bis zum ersten Block, der schon zur
   * aktiven Kette gehoert. Von dort aufwaerts sortiert.
   */
  pfadZumVerankerten(tip) {
    const pfad = [];
    let aktuell = tip;
    while (aktuell && !aktuell.mainChain) {
      pfad.push(aktuell);
      if (aktuell.height === 0) break;
      aktuell = this.store.get(aktuell.prevHash);
    }
    return pfad.reverse();
  }
  /**
   * Zustand der aktiven Kette herstellen.
   *
   * Von der juengsten brauchbaren Marke aus vorwaerts rechnen. Gibt es
   * keine, von Block 0 an. Bei einigen hundert Bloecken dauert das
   * Millisekunden; die Marken sind fuer spaeter, wenn es zehntausende sind.
   */
  zustandHerstellen() {
    const tip = this.store.mainTip();
    if (!tip) {
      this.zustand = emptyState();
      this.zustandHoehe = -1;
      this.zustandHash = null;
      return;
    }
    const marke = this.store.snapshotAtOrBelow(tip.height);
    let zustand = emptyState();
    let ab = 0;
    if (marke) {
      for (const [adr, k] of marke.accounts) zustand.set(adr, { ...k });
      if (toHex(stateRoot(zustand)) === toHex(marke.stateRoot)) {
        ab = marke.height + 1;
      } else {
        zustand = emptyState();
      }
    }
    for (let h = ab; h <= tip.height; h++) {
      const b = this.store.mainAt(h);
      if (!b) throw new Error(`Aktive Kette hat eine Luecke bei Hoehe ${h}`);
      const block = deserializeBlock(b.body);
      const r = applyBlock(zustand, block, this.params);
      if (!r.ok) {
        throw new Error(`Block ${h} laesst sich nicht anwenden: ${r.error?.reason}`);
      }
      if (h % SNAPSHOT_INTERVAL === 0) {
        this.store.putSnapshot({
          hash: b.hash,
          height: h,
          stateRoot: stateRoot(zustand),
          accounts: [...zustand].map(([a, k]) => [a, { ...k }])
        });
      }
    }
    const wurzel = stateRoot(zustand);
    if (toHex(wurzel) !== toHex(tip.stateRoot)) {
      throw new Error(
        `Zustandswurzel weicht ab: errechnet ${toHex(wurzel).slice(0, 16)}\u2026, im Block ${toHex(tip.stateRoot).slice(0, 16)}\u2026`
      );
    }
    this.zustand = zustand;
    this.zustandHoehe = tip.height;
    this.zustandHash = tip.hash;
  }
  /**
   * Zustand und Vorgeschichte an einem beliebigen Punkt der Kette.
   *
   * Fuer den aktiven Tip ist das der gehaltene Zustand. Fuer einen
   * Nebenzweig muss gerechnet werden -- das ist selten und darf deshalb
   * teuer sein.
   */
  zweigKontext(vorgaenger) {
    if (!vorgaenger) return { state: emptyState(), zeitstempel: [], timings: [] };
    const kette = [];
    let aktuell = vorgaenger;
    while (aktuell) {
      kette.push(aktuell);
      if (aktuell.height === 0) break;
      aktuell = this.store.get(aktuell.prevHash);
    }
    kette.reverse();
    const amAktivenTip = this.zustandHash && toHex(this.zustandHash) === toHex(vorgaenger.hash);
    let state;
    if (amAktivenTip) {
      state = cloneState(this.zustand);
    } else {
      state = emptyState();
      for (const b of kette) {
        const r = applyBlock(state, deserializeBlock(b.body), this.params);
        if (!r.ok) throw new Error(`Zweig bei ${b.height}: ${r.error?.reason}`);
      }
    }
    const zeitstempel = kette.map((b) => b.blockTime);
    const timings = kette.slice(1).map((b, i) => ({
      solveSeconds: b.blockTime - kette[i].blockTime,
      difficulty: b.difficulty
    }));
    return { state, zeitstempel, timings };
  }
};

// ../src/lib/node/fullnode/TxPool.ts
init_tx();
init_params();
init_codec();
var MAX_POOL_SIZE = 5e3;
var MAX_PER_SENDER = 32;
var TxPool = class {
  nachId = /* @__PURE__ */ new Map();
  /** Je Absender die wartenden Nonces -- fuer Ersetzung und Luecken. */
  nachAbsender = /* @__PURE__ */ new Map();
  size() {
    return this.nachId.size;
  }
  has(id) {
    return this.nachId.has(id);
  }
  get(id) {
    return this.nachId.get(id)?.tx ?? null;
  }
  /** Alle wartenden Transaktionen, fuer den Blockbau. */
  alle() {
    return [...this.nachId.values()].map((e) => e.tx);
  }
  /**
   * Eine Transaktion aufnehmen.
   *
   * Reihenfolge: billig vor teuer. Struktur und Gebuehr kosten
   * Mikrosekunden, die Signaturpruefung Millisekunden. Wer das umdreht,
   * laedt jeden ein, den Knoten mit Muell zu beschaeftigen.
   */
  add(tx, state, height) {
    const id = txidHex(tx);
    if (this.nachId.has(id)) return { ok: false, reason: "duplicate" };
    if (tx.fee < MIN_FEE) {
      return { ok: false, reason: "fee_too_low", detail: `${tx.fee} < ${MIN_FEE}` };
    }
    if (tx.amount <= 0n) {
      return { ok: false, reason: "malformed", detail: "bad_amount" };
    }
    if (tx.validUntil !== 0 && height > tx.validUntil) {
      return { ok: false, reason: "expired", detail: `gueltig bis ${tx.validUntil}` };
    }
    const absender = toHex(tx.from);
    const konto = state.get(absender);
    if (!konto) return { ok: false, reason: "unknown_account" };
    const wartend = this.nachAbsender.get(absender) ?? /* @__PURE__ */ new Map();
    if (tx.nonce < konto.nonce) {
      return {
        ok: false,
        reason: "nonce_too_low",
        detail: `${tx.nonce} < ${konto.nonce}`
      };
    }
    const vorhanden = [...wartend.values()].find((e) => e.nonce === tx.nonce);
    if (vorhanden) {
      if (tx.fee <= vorhanden.fee) {
        return {
          ok: false,
          reason: "fee_not_higher",
          detail: `${tx.fee} <= ${vorhanden.fee}`
        };
      }
    } else {
      const naechste = konto.nonce + BigInt(wartend.size);
      if (tx.nonce > naechste) {
        return {
          ok: false,
          reason: "nonce_gap",
          detail: `${tx.nonce}, erwartet bis ${naechste}`
        };
      }
      if (wartend.size >= MAX_PER_SENDER) {
        return { ok: false, reason: "sender_limit" };
      }
      if (this.nachId.size >= MAX_POOL_SIZE) {
        return { ok: false, reason: "pool_full" };
      }
    }
    const andere = [...wartend.values()].filter((e) => !(vorhanden && e.txid === vorhanden.txid));
    let gebunden = 0n;
    for (const e of andere) gebunden += e.tx.amount + e.tx.fee;
    if (konto.balance < gebunden + tx.amount + tx.fee) {
      return {
        ok: false,
        reason: "insufficient_funds",
        detail: `${konto.balance} deckt ${gebunden + tx.amount + tx.fee} nicht`
      };
    }
    const strukturell = checkTransfer(tx, height);
    if (strukturell) {
      return {
        ok: false,
        reason: strukturell === "bad_signature" ? "bad_signature" : strukturell === "expired" ? "expired" : strukturell === "fee_too_low" ? "fee_too_low" : "malformed",
        detail: strukturell
      };
    }
    const eintrag = {
      tx,
      txid: id,
      from: absender,
      nonce: tx.nonce,
      fee: tx.fee,
      seit: Date.now()
    };
    let ersetzt;
    if (vorhanden) {
      this.nachId.delete(vorhanden.txid);
      wartend.delete(vorhanden.txid);
      ersetzt = vorhanden.txid;
    }
    this.nachId.set(id, eintrag);
    wartend.set(id, eintrag);
    this.nachAbsender.set(absender, wartend);
    return { ok: true, txid: id, ersetzt };
  }
  /** Eine einzelne Transaktion entfernen. */
  remove(id) {
    const e = this.nachId.get(id);
    if (!e) return false;
    this.nachId.delete(id);
    const wartend = this.nachAbsender.get(e.from);
    if (wartend) {
      wartend.delete(id);
      if (wartend.size === 0) this.nachAbsender.delete(e.from);
    }
    return true;
  }
  /**
   * Nach einem angenommenen Block aufraeumen.
   *
   * Entfernt wird, was im Block steht -- und alles, was durch ihn ungueltig
   * geworden ist: zu niedrige Nonce oder keine Deckung mehr.
   */
  nachBlock(enthalten, state) {
    let entfernt = 0;
    for (const t of enthalten) {
      if (this.remove(txidHex(t))) entfernt++;
    }
    let ungueltig = 0;
    for (const [absender, wartend] of [...this.nachAbsender]) {
      const konto = state.get(absender);
      let gebunden = 0n;
      for (const e of [...wartend.values()].sort((a, b) => a.nonce < b.nonce ? -1 : 1)) {
        const weg = !konto || e.nonce < konto.nonce || konto.balance < gebunden + e.tx.amount + e.tx.fee;
        if (weg) {
          this.remove(e.txid);
          ungueltig++;
          continue;
        }
        gebunden += e.tx.amount + e.tx.fee;
      }
    }
    return { entfernt, ungueltig };
  }
  /**
   * Nach einem Reorg: Transaktionen aus verdraengten Bloecken
   * zuruecknehmen.
   *
   * Sie waren einmal gueltig und gehoeren wieder in die Warteschlange --
   * sonst verschwindet eine bezahlte Ueberweisung, weil an anderer Stelle
   * ein Block gewonnen hat. Geprueft wird dabei erneut: Der neue Zweig kann
   * dieselbe Nonce anders belegt haben.
   */
  zurueck(txs, state, height) {
    let aufgenommen = 0;
    for (const t of txs) {
      if (this.add(t, state, height).ok) aufgenommen++;
    }
    return aufgenommen;
  }
  /** Aeltere Eintraege als `sekunden` verwerfen. */
  aufraeumen(sekunden = 3600) {
    const grenze2 = Date.now() - sekunden * 1e3;
    let weg = 0;
    for (const e of [...this.nachId.values()]) {
      if (e.seit < grenze2) {
        this.remove(e.txid);
        weg++;
      }
    }
    return weg;
  }
  leeren() {
    this.nachId.clear();
    this.nachAbsender.clear();
  }
};

// ../src/lib/core/builder.ts
init_tx();
init_params();
init_codec();
function selectTransactions(state, mempool, height, limit = MAX_TXS_PER_BLOCK - 1) {
  const rejected = [];
  const bySender = /* @__PURE__ */ new Map();
  for (const t of mempool) {
    const structural = checkTransfer(t, height);
    if (structural) {
      rejected.push({ txid: toHex(txid(t)), reason: structural });
      continue;
    }
    const key = toHex(t.from);
    const list = bySender.get(key) ?? [];
    list.push(t);
    bySender.set(key, list);
  }
  for (const [key, list] of bySender) {
    list.sort((a, b) => a.nonce === b.nonce ? b.fee > a.fee ? 1 : b.fee < a.fee ? -1 : 0 : a.nonce < b.nonce ? -1 : 1);
    const unique = [];
    for (const t of list) {
      if (unique.length && unique[unique.length - 1].nonce === t.nonce) {
        rejected.push({ txid: toHex(txid(t)), reason: "nonce_conflict" });
        continue;
      }
      unique.push(t);
    }
    bySender.set(key, unique);
  }
  const draft = cloneState(state);
  const cursor = /* @__PURE__ */ new Map();
  const included = [];
  let fees = 0n;
  while (included.length < limit) {
    let best = null;
    for (const [key, list] of bySender) {
      const i = cursor.get(key) ?? 0;
      const t2 = list[i];
      if (!t2) continue;
      const acc = getAccount(draft, t2.from);
      if (t2.nonce !== acc.nonce) continue;
      if (acc.balance < t2.amount + t2.fee) continue;
      if (!best || t2.fee > best.tx.fee) best = { key, tx: t2 };
    }
    if (!best) break;
    const t = best.tx;
    const from = getAccount(draft, t.from);
    draft.set(toHex(t.from), { balance: from.balance - t.amount - t.fee, nonce: from.nonce + 1n });
    const to = getAccount(draft, t.to);
    draft.set(toHex(t.to), { ...to, balance: to.balance + t.amount });
    included.push(t);
    fees += t.fee;
    cursor.set(best.key, (cursor.get(best.key) ?? 0) + 1);
  }
  return { included, rejected, fees };
}
function buildCoinbase(height, to, fees, extra) {
  return {
    type: TX_COINBASE,
    version: TX_VERSION,
    height,
    outputs: [{ to, amount: rewardAt(height) + fees }],
    // Macht den txid eindeutig, auch wenn derselbe Miner zweimal denselben
    // Betrag auf derselben Hoehe bekaeme.
    extra: extra ?? new Uint8Array(0)
  };
}
function buildBlock(p) {
  const { included, rejected, fees } = selectTransactions(p.state, p.mempool, p.height);
  const coinbase = buildCoinbase(p.height, p.minerAddress, fees, p.coinbaseExtra);
  const txs = [coinbase, ...included];
  const after = cloneState(p.state);
  const header = {
    version: BLOCK_VERSION,
    height: p.height,
    prevHash: p.prevHash,
    merkleRoot: txMerkleRoot(txs),
    stateRoot: new Uint8Array(32),
    // gleich ersetzt
    timestamp: p.timestamp,
    difficulty: p.difficulty,
    txCount: txs.length,
    extranonce: p.extranonce,
    nonce: 0n
  };
  const probe = { header, txs };
  const applied = applyBlock(after, probe, p.params ?? MAINNET);
  if (!applied.ok) {
    throw new Error(`Blockbau fehlgeschlagen: ${applied.error?.reason} (tx ${applied.error?.tx})`);
  }
  header.stateRoot = stateRoot(after);
  return {
    block: { header, txs },
    header: serializeHeader(header),
    included,
    rejected,
    fees,
    stateRoot: header.stateRoot
  };
}
function finalizeBlock(built, nonce) {
  return {
    header: { ...built.block.header, nonce },
    txs: built.block.txs
  };
}

// ../src/lib/node/fullnode/MiningCoordinator.ts
init_params();
init_codec();
init_tx();
var JOB_TTL_MS = 9e4;
var MiningCoordinator = class {
  chain;
  store;
  pool;
  params;
  offen = /* @__PURE__ */ new Map();
  /**
   * Hoehe und Difficulty des zuletzt gebauten Jobs.
   *
   * Fuer die Anzeige. Bei jedem Aufruf neu zu rechnen waere teuer -- die
   * Difficulty-Regel liest dafuer knapp sechzig Bloecke aus der Ablage,
   * und die Statuszeile erneuert sich jede Sekunde.
   */
  letzteVorgaben = null;
  jetzt;
  /**
   * @param jetzt  Aktuelle Zeit in Sekunden. Ohne Angabe die Systemuhr.
   *
   * Von aussen setzbar, damit Tests eine Kette mit gleichmaessigen
   * Abstaenden erzeugen koennen. Mit der Systemuhr entstehen Testbloecke in
   * Millisekunden, die Difficulty-Regel sieht Loesungszeiten nahe null und
   * hebt die Difficulty je Block um den Deckelungsfaktor an -- das ist
   * richtig, macht Tests aber von der Maschinenlast abhaengig.
   */
  constructor(chain, store, pool, params = MAINNET, jetzt) {
    this.chain = chain;
    this.store = store;
    this.pool = pool;
    this.params = params;
    this.jetzt = jetzt ?? (() => BigInt(Math.floor(Date.now() / 1e3)));
  }
  /**
   * Einen Job bauen.
   *
   * Der vollstaendige Blockkoerper bleibt hier liegen. Ihn spaeter aus dem
   * Mempool zu rekonstruieren waere ein Fehler: Zwischen Ausgabe und Fund
   * aendert sich der Mempool, und merkle_root wie state_root im Header
   * verpflichten auf GENAU diese Auswahl. Weicht sie um eine Transaktion
   * ab, ist die geleistete Arbeit wertlos.
   */
  createJob(minerAddress, extranonce) {
    const tip = this.chain.tip();
    const hoehe = (tip?.height ?? -1) + 1;
    const state = this.chain.state();
    const { difficulty, zeitstempel } = this.naechsteVorgaben(tip);
    const { included } = selectTransactions(state, this.pool.alle(), hoehe);
    const gebaut = buildBlock({
      height: hoehe,
      prevHash: tip ? tip.hash : new Uint8Array(32),
      state,
      mempool: included,
      minerAddress,
      timestamp: zeitstempel,
      difficulty,
      extranonce,
      coinbaseExtra: new Uint8Array(0),
      params: this.params
    });
    const h = gebaut.block.header;
    const jobId = toHex(headerHash({ ...h, nonce: 0n })).slice(0, 32);
    const job = {
      jobId,
      height: hoehe,
      version: h.version,
      prevHash: toHex(h.prevHash),
      merkleRoot: toHex(h.merkleRoot),
      stateRoot: toHex(h.stateRoot),
      timestamp: h.timestamp.toString(),
      difficulty: Number(h.difficulty),
      txCount: h.txCount,
      extranonce: h.extranonce.toString(),
      header: toHex(serializeHeader({ ...h, nonce: 0n })),
      target: toHex(zielBytes(targetFromDifficulty(h.difficulty))),
      erzeugt: Date.now()
    };
    this.offen.set(jobId, { job, gebaut, enthalten: included });
    this.letzteVorgaben = { height: hoehe, difficulty: h.difficulty };
    this.aufraeumen();
    return job;
  }
  /**
   * Eine gefundene Nonce einreichen.
   *
   * Der Einreicher schickt NUR die Nonce. Der Hash wird hier selbst
   * gerechnet -- aus dem Koerper, der beim Job hinterlegt wurde. Eine
   * Angabe des Miners ueber die erreichte Difficulty wird nie uebernommen.
   */
  submitNonce(jobId, nonce) {
    const offen = this.offen.get(jobId);
    if (!offen) return { ok: false, grund: "job_unknown" };
    if (Date.now() - offen.job.erzeugt > JOB_TTL_MS) {
      this.offen.delete(jobId);
      return { ok: false, grund: "job_expired" };
    }
    const tip = this.chain.tip();
    const erwarteterVorgaenger = tip ? toHex(tip.hash) : toHex(new Uint8Array(32));
    if (offen.job.prevHash !== erwarteterVorgaenger) {
      this.offen.delete(jobId);
      return { ok: false, grund: "stale_job" };
    }
    const block = finalizeBlock(offen.gebaut, nonce);
    const hash = headerHash(block.header);
    const wert = alsZahl(hash);
    const ziel = targetFromDifficulty(block.header.difficulty);
    if (wert > ziel) {
      return { ok: true, block: false, achieved: erreichteDifficulty(wert).toString() };
    }
    const roh = serializeBlock(block);
    const r = this.chain.accept(roh);
    if (!r.ok) return { ok: false, grund: r.grund, detail: r.detail };
    const coinbase = block.txs[0];
    this.offen.delete(jobId);
    this.pool.nachBlock(offen.enthalten, this.chain.state());
    return {
      ok: true,
      block: true,
      height: block.header.height,
      hash: toHex(hash),
      reward: coinbaseTotal(coinbase).toString()
    };
  }
  /** Alle Jobs verwerfen -- nach einem Reorg oder fremden Block noetig. */
  invalidate() {
    this.offen.clear();
    this.letzteVorgaben = null;
  }
  /**
   * Woran gerade gearbeitet wird -- Hoehe und Difficulty des naechsten
   * Blocks, nicht des letzten fertigen.
   *
   * Das sind zwei verschiedene Zahlen, und die Verwechslung ist naheliegend:
   * Block 839 kann Difficulty 63.980 haben, waehrend an Block 840 mit
   * 65.736 gearbeitet wird. Die Regel errechnet die Difficulty jedes Blocks
   * neu aus den Loesungszeiten davor.
   */
  aktuelleArbeit() {
    return this.letzteVorgaben;
  }
  offeneJobs() {
    return this.offen.size;
  }
  /**
   * Difficulty und Zeitstempel fuer den naechsten Block.
   *
   * Beides muss GENAU den Regeln folgen, sonst lehnt die eigene
   * Validierung den fertigen Block ab -- nach getaner Arbeit.
   */
  naechsteVorgaben(tip) {
    const jetzt = this.jetzt();
    if (!tip) {
      return { difficulty: this.params.genesisDifficulty, zeitstempel: jetzt };
    }
    const kette = this.aktiveKette(tip.height);
    const timings = kette.slice(1).map((b, i) => ({
      solveSeconds: b.blockTime - kette[i].blockTime,
      difficulty: b.difficulty
    }));
    const regulaer = expectedDifficulty(
      timings.slice(-this.params.lwmaWindow - 1),
      this.params
    );
    const median = medianTimePast(kette.slice(-11).map((b) => b.blockTime));
    let zeitstempel = jetzt;
    if (zeitstempel <= median) zeitstempel = median + 1n;
    const obergrenze = jetzt + MAX_FUTURE_DRIFT - 5n;
    if (zeitstempel > obergrenze) zeitstempel = obergrenze;
    const vergangen = zeitstempel > tip.blockTime ? zeitstempel - tip.blockTime : 0n;
    const difficulty = effectiveDifficulty(regulaer, vergangen, this.params);
    return { difficulty, zeitstempel };
  }
  aktiveKette(bisHoehe) {
    const ab = Math.max(0, bisHoehe - this.params.lwmaWindow - 12);
    const out = [];
    for (let h = ab; h <= bisHoehe; h++) {
      const b = this.store.mainAt(h);
      if (!b) throw new Error(`Aktive Kette hat eine Luecke bei Hoehe ${h}`);
      out.push({ blockTime: b.blockTime, difficulty: b.difficulty });
    }
    return out;
  }
  aufraeumen() {
    const grenze2 = Date.now() - JOB_TTL_MS;
    for (const [id, o] of this.offen) {
      if (o.job.erzeugt < grenze2) this.offen.delete(id);
    }
  }
};
function alsZahl(hash) {
  let v = 0n;
  for (const b of hash) v = v << 8n | BigInt(b);
  return v;
}
function erreichteDifficulty(hashWert) {
  if (hashWert === 0n) return 1n << 240n;
  return (1n << 240n) / hashWert;
}
function zielBytes(ziel) {
  const out = new Uint8Array(32);
  let x = ziel;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

// ../src/lib/node/fullnode/MiningServer.ts
var import_node_http = require("node:http");
var import_node_crypto = require("node:crypto");
init_address();
init_codec();
init_params();

// ../src/lib/node/fullnode/ReadApi.ts
init_tx();
init_address();
init_codec();
init_params();
var VERLAUF_TIEFE = 5e3;
var ReadApi = class {
  t;
  constructor(teile) {
    this.t = teile;
  }
  /**
   * Eine Leseanfrage beantworten.
   *
   * Rueckgabe null heisst: nicht zustaendig. Der Aufrufer versucht es dann
   * mit seinen eigenen Routen.
   */
  behandle(methode, pfad, such) {
    if (methode !== "GET") return null;
    if (pfad === "/summary") return { status: 200, body: this.summary() };
    if (pfad === "/blocks") return { status: 200, body: this.blocks(such) };
    if (pfad === "/sync") return { status: 200, body: this.sync(such) };
    if (pfad === "/search") return { status: 200, body: this.search(such) };
    const block = pfad.match(/^\/blocks\/(\d+)$/);
    if (block) return this.block(Number(block[1]));
    const tx = pfad.match(/^\/tx\/([0-9a-fA-F]{64})$/);
    if (tx) return this.tx(tx[1].toLowerCase());
    const konto = pfad.match(/^\/account\/(ysr1[a-z0-9]+)$/i);
    if (konto) return this.account(konto[1].toLowerCase());
    return null;
  }
  // ------------------------------------------------------------ Kennzahlen
  summary() {
    const tip = this.t.chain.tip();
    const hoehe = tip?.height ?? -1;
    const state = this.t.chain.state();
    return {
      token: { token_name: "YSKAR", token_symbol: "YSR", decimals: 8 },
      height: tip ? tip.height : null,
      nextHeight: hoehe + 1,
      difficulty: tip ? Number(tip.difficulty) : null,
      hashrate: this.t.hashrate?.() ?? this.hashrateAusKette(),
      minerHashrate: this.t.hashrate?.() ?? null,
      targetBlockTime: Number(TARGET_BLOCK_TIME),
      tipHash: tip ? toHex(tip.hash) : null,
      stateHeight: this.t.chain.height(),
      stateRoot: tip ? toHex(stateRoot(state)) : null,
      totalSupply: totalSupply(state).toString(),
      maxSupply: MAX_SUPPLY.toString(),
      nextReward: rewardAt(hoehe + 1).toString(),
      mempool: this.t.pool.size(),
      activeMiners: this.t.aktiveMiner?.() ?? 0,
      // Sitzungen, nicht Adressen -- dasselbe Feld wie auf dem Server.
      miningSessions: this.t.miningSessions?.() ?? 0,
      // Nur der Knoten kennt sie: Die App zeigt sie nicht, der Explorer
      // koennte es. Zusaetzliche Felder stoeren nicht -- fehlende schon.
      chainWork: tip ? tip.chainWork.toString() : "0"
    };
  }
  /**
   * Hashrate aus der Kette selbst -- Arbeit geteilt durch Zeit.
   *
   * Dieselbe Rechnung wie auf dem Server. Unter drei Bloecken ist die
   * Streuung groesser als der Wert; dann lieber nichts anzeigen als etwas
   * Erfundenes.
   */
  hashrateAusKette() {
    const tip = this.t.chain.tip();
    if (!tip || tip.height < 3) return null;
    const ab = Math.max(0, tip.height - 24);
    const erster = this.t.store.mainAt(ab);
    if (!erster) return null;
    const spanne = Number(tip.blockTime - erster.blockTime);
    if (spanne <= 0) return null;
    let arbeit = 0n;
    for (let h = ab + 1; h <= tip.height; h++) {
      const b = this.t.store.mainAt(h);
      if (b) arbeit += b.difficulty;
    }
    return Number(arbeit) * 65536 / spanne;
  }
  // ---------------------------------------------------------------- Bloecke
  blocks(such) {
    const limit = grenze(such.get("limit"), 25, 100);
    const before = such.get("before") !== null ? Number(such.get("before")) : null;
    const tip = this.t.chain.tip();
    if (!tip) return { blocks: [] };
    const start = before !== null && Number.isSafeInteger(before) ? Math.min(before - 1, tip.height) : tip.height;
    const out = [];
    for (let h = start; h >= 0 && out.length < limit; h--) {
      const b = this.t.store.mainAt(h);
      if (!b) break;
      out.push(this.kurz(b));
    }
    return { blocks: out };
  }
  kurz(b) {
    const block = deserializeBlock(b.body);
    const cb = block.txs[0];
    return {
      height: b.height,
      hash: toHex(b.hash),
      prevHash: toHex(b.prevHash),
      timestamp: String(b.blockTime),
      difficulty: Number(b.difficulty),
      txCount: b.txCount,
      reward: coinbaseTotal(cb).toString(),
      minerAddress: cb.outputs.length === 1 ? encodeAddress(cb.outputs[0].to) : null,
      sizeBytes: b.body.length,
      extranonce: String(block.header.extranonce),
      nonce: String(block.header.nonce)
    };
  }
  block(hoehe) {
    const b = this.t.store.mainAt(hoehe);
    if (!b) return { status: 404, body: { error: "not_found" } };
    const block = deserializeBlock(b.body);
    return {
      status: 200,
      body: {
        ...this.kurz(b),
        version: block.header.version,
        merkleRoot: toHex(b.merkleRoot),
        stateRoot: toHex(b.stateRoot),
        header: toHex(b.body.slice(0, 136)),
        chainWork: b.chainWork.toString(),
        txs: block.txs.map((t, idx) => this.txAnsicht(t, idx, b))
      }
    };
  }
  txAnsicht(t, idx, b) {
    const basis = {
      txid: toHex(txid(t)),
      idx,
      type: t.type === TX_COINBASE ? "coinbase" : "transfer"
    };
    if (t.type === TX_COINBASE) {
      const mehrere = t.outputs.length > 1;
      return {
        ...basis,
        from: null,
        to: mehrere ? null : encodeAddress(t.outputs[0].to),
        amount: coinbaseTotal(t).toString(),
        fee: "0",
        nonce: null,
        memo: toHex(t.extra),
        // Bei mehreren Empfaengern gehoert die Aufteilung sichtbar hierher.
        // Nur die Summe zu zeigen saehe aus, als haette niemand etwas
        // bekommen.
        recipients: mehrere ? t.outputs.map((o) => ({
          address: encodeAddress(o.to),
          amount: o.amount.toString()
        })) : null
      };
    }
    return {
      ...basis,
      from: encodeAddress(t.from),
      to: encodeAddress(t.to),
      amount: t.amount.toString(),
      fee: t.fee.toString(),
      nonce: String(t.nonce),
      memo: toHex(t.memo),
      recipients: null
    };
  }
  // ---------------------------------------------------------------- Konten
  account(adresse) {
    let roh;
    try {
      roh = decodeAddress(adresse);
    } catch {
      return { status: 400, body: { error: "bad_address" } };
    }
    const konto = getAccount(this.t.chain.state(), roh);
    const key = toHex(roh);
    const tip = this.t.chain.tip();
    const verlauf = [];
    let gefunden = 0;
    let poolAnteile = 0;
    const bis = tip ? Math.max(0, tip.height - VERLAUF_TIEFE) : 0;
    for (let h = tip?.height ?? -1; h >= bis && verlauf.length < 40; h--) {
      const b = this.t.store.mainAt(h);
      if (!b) continue;
      const block = deserializeBlock(b.body);
      for (const t of block.txs) {
        if (t.type === TX_COINBASE) {
          const meiner = t.outputs.find((o) => toHex(o.to) === key);
          if (!meiner) continue;
          if (t.outputs.length === 1) gefunden++;
          else poolAnteile++;
          verlauf.push({
            txid: toHex(txid(t)),
            height: h,
            timestamp: String(b.blockTime),
            kind: t.outputs.length === 1 ? "reward" : "pool",
            counterparty: null,
            amount: meiner.amount.toString(),
            fee: "0",
            memo: toHex(t.extra),
            shares: t.outputs.length > 1 ? t.outputs.length : void 0
          });
          continue;
        }
        const ein = toHex(t.to) === key;
        const aus = toHex(t.from) === key;
        if (!ein && !aus) continue;
        verlauf.push({
          txid: toHex(txid(t)),
          height: h,
          timestamp: String(b.blockTime),
          kind: ein ? "in" : "out",
          counterparty: encodeAddress(ein ? t.from : t.to),
          amount: t.amount.toString(),
          fee: t.fee.toString(),
          memo: toHex(t.memo)
        });
      }
    }
    const wartend = this.t.pool.alle().filter((t) => toHex(t.from) === key || toHex(t.to) === key).map((t) => ({
      txid: toHex(txid(t)),
      to: encodeAddress(t.to),
      amount: t.amount.toString(),
      fee: t.fee.toString(),
      nonce: String(t.nonce)
    }));
    return {
      status: 200,
      body: {
        address: encodeAddress(roh),
        balance: konto.balance.toString(),
        nonce: konto.nonce.toString(),
        blocksFound: gefunden,
        poolRewards: poolAnteile,
        pending: wartend,
        history: verlauf,
        // Ehrlich dazusagen, wie weit gesucht wurde -- sonst haelt jemand
        // einen abgeschnittenen Verlauf fuer vollstaendig.
        historyDepth: (tip?.height ?? -1) - bis + 1
      }
    };
  }
  // ----------------------------------------------------------------- Suche
  search(such) {
    const q = (such.get("q") ?? "").trim().toLowerCase();
    if (!q) return { kind: "leer" };
    if (q.startsWith("ysr1")) {
      try {
        const roh = decodeAddress(q);
        const konto = getAccount(this.t.chain.state(), roh);
        return {
          kind: "address",
          address: encodeAddress(roh),
          bekannt: konto.balance > 0n || konto.nonce > 0n,
          balance: konto.balance.toString()
        };
      } catch {
        return { kind: "nichts", hinweis: "Keine g\xFCltige YSKAR-Adresse." };
      }
    }
    if (/^\d+$/.test(q)) {
      const h = Number(q);
      return this.t.store.mainAt(h) ? { kind: "block", height: h } : { kind: "nichts", hinweis: `Block ${h} gibt es (noch) nicht.` };
    }
    if (/^[0-9a-f]{64}$/.test(q)) {
      const b = this.t.store.get(fromHex(q));
      if (b) return { kind: "block", height: b.height };
      const gefunden = this.sucheTx(q);
      if (gefunden) return { kind: "tx", txid: q, height: gefunden.hoehe };
      const offen = this.t.pool.get(q);
      if (offen) return { kind: "tx", txid: q, height: null, pending: true };
      return { kind: "nichts", hinweis: "Kein Block und keine Transaktion damit." };
    }
    return { kind: "nichts", hinweis: "Adresse, Transaktion, H\xF6he oder Blockhash." };
  }
  sucheTx(hex) {
    const tip = this.t.chain.tip();
    if (!tip) return null;
    const bis = Math.max(0, tip.height - VERLAUF_TIEFE);
    for (let h = tip.height; h >= bis; h--) {
      const b = this.t.store.mainAt(h);
      if (!b) continue;
      for (const t of deserializeBlock(b.body).txs) {
        if (toHex(txid(t)) === hex) return { hoehe: h, tx: t };
      }
    }
    return null;
  }
  tx(hex) {
    const gefunden = this.sucheTx(hex);
    if (gefunden) {
      const b = this.t.store.mainAt(gefunden.hoehe);
      const block = deserializeBlock(b.body);
      const idx = block.txs.findIndex((t) => toHex(txid(t)) === hex);
      return {
        status: 200,
        body: {
          ...this.txAnsicht(gefunden.tx, idx, b),
          status: "confirmed",
          height: gefunden.hoehe,
          blockHash: toHex(b.hash),
          timestamp: String(b.blockTime)
        }
      };
    }
    const offen = this.t.pool.get(hex);
    if (offen) {
      return {
        status: 200,
        body: {
          txid: hex,
          status: "pending",
          height: null,
          blockHash: null,
          timestamp: null,
          type: "transfer",
          from: encodeAddress(offen.from),
          to: encodeAddress(offen.to),
          amount: offen.amount.toString(),
          fee: offen.fee.toString(),
          nonce: String(offen.nonce),
          memo: toHex(offen.memo),
          recipients: null
        }
      };
    }
    return { status: 404, body: { error: "not_found" } };
  }
  // --------------------------------------------------- Rohe Bloecke
  /** Fuer andere Knoten und den Beobachter -- stapelweise rohe Koerper. */
  sync(such) {
    const from = Math.max(0, Number(such.get("from") ?? 0) || 0);
    const count = grenze(such.get("count"), 200, 200);
    const tip = this.t.chain.tip();
    if (!tip) return { from, blocks: [], tip: -1 };
    const out = [];
    for (let h = from; h <= tip.height && out.length < count; h++) {
      const b = this.t.store.mainAt(h);
      if (!b) break;
      out.push({ height: h, hash: toHex(b.hash), body: toHex(b.body) });
    }
    return { from, blocks: out, tip: tip.height };
  }
};
function grenze(roh, vorgabe, max) {
  const n = roh === null ? vorgabe : Number(roh);
  if (!Number.isFinite(n) || n <= 0) return vorgabe;
  return Math.min(Math.floor(n), max);
}

// ../src/lib/node/fullnode/MiningServer.ts
var SHARE_ZIEL_SEKUNDEN = 30;
var SHARE_START = 128n;
var SESSION_TIMEOUT_MS = 3e5;
var MiningServer = class {
  chain;
  store;
  pool;
  mining;
  params;
  lesen;
  sessions = /* @__PURE__ */ new Map();
  naechsteExtranonce = 1n;
  server = (0, import_node_http.createServer)((req, res) => this.behandle(req, res));
  /** Wird bei jedem angenommenen Block gerufen -- fuer die Anzeige. */
  onBlock;
  /** Wird bei einem internen Fehler gerufen -- damit er sichtbar wird. */
  onFehler;
  /**
   * Wohin ein gefundener Block weitergereicht wird.
   *
   * Solange es kein P2P gibt, ist das der Server. Ohne diese Weitergabe
   * laege ein lokal gefundener Block nur hier und wuerde beim naechsten
   * Block der anderen Seite verdraengt -- echte Arbeit fuer nichts.
   */
  upstream;
  onUpstream;
  constructor(teile, opt = {}) {
    this.chain = teile.chain;
    this.store = teile.store;
    this.pool = teile.pool;
    this.mining = teile.mining;
    this.params = opt.params ?? MAINNET;
    this.lesen = new ReadApi({
      chain: teile.chain,
      store: teile.store,
      pool: teile.pool,
      hashrate: () => this.gesamtHashrate() || null,
      aktiveMiner: () => new Set([...this.sessions.values()].map((s) => s.addressHex)).size,
      miningSessions: () => this.aktiveSessions()
    });
  }
  listen(host = "127.0.0.1", port = 8645) {
    return new Promise((auf, ab) => {
      this.server.once("error", ab);
      this.server.listen(port, host, () => auf());
    });
  }
  close() {
    return new Promise((auf) => this.server.close(() => auf()));
  }
  aktiveSessions() {
    this.aufraeumen();
    return this.sessions.size;
  }
  gesamtHashrate() {
    this.aufraeumen();
    let summe = 0;
    for (const s of this.sessions.values()) {
      const r = this.sessionHashrate(s);
      if (r) summe += r;
    }
    return summe;
  }
  // ------------------------------------------------------------ Weiterleitung
  async behandle(req, res) {
    const url = new URL(req.url ?? "/", "http://x");
    const pfad = url.pathname.replace(/^\/api\/v2/, "");
    try {
      if (req.method === "POST" && pfad === "/session") {
        return this.json(res, await this.session(req));
      }
      if (req.method === "POST" && pfad === "/session/stop") {
        const b = await this.body(req);
        this.sessions.delete(String(b.sessionId));
        return this.json(res, { stopped: true });
      }
      if (req.method === "GET" && pfad === "/job") {
        return this.json(res, this.job(url.searchParams.get("session")));
      }
      if (req.method === "POST" && pfad === "/share") {
        return this.json(res, this.share(await this.body(req)));
      }
      const gelesen = this.lesen.behandle(
        req.method ?? "GET",
        pfad,
        url.searchParams
      );
      if (gelesen) return this.json(res, gelesen.body, gelesen.status);
      if (req.method === "GET" && pfad === "/status") {
        return this.json(res, this.status());
      }
      if (req.method === "POST" && pfad === "/tx") {
        return this.json(res, await this.tx(req));
      }
      this.json(res, { error: "not_found" }, 404);
    } catch (e) {
      const fehler = e;
      this.onFehler?.(`${req.method} ${pfad}`, fehler);
      this.json(res, {
        error: "internal",
        detail: fehler.message,
        where: `${req.method} ${pfad}`
      }, 500);
    }
  }
  json(res, daten, status = 200) {
    const text = JSON.stringify(daten);
    res.writeHead(status, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(text)
    });
    res.end(text);
  }
  /**
   * Rumpf einlesen, mit Groessengrenze.
   *
   * Ohne Grenze kann eine einzige Anfrage den Knoten den Speicher kosten.
   * Ein Share ist rund hundert Byte; 64 KB sind grosszuegig.
   */
  body(req) {
    return new Promise((auf, ab) => {
      let roh = "";
      req.on("data", (stueck) => {
        roh += stueck;
        if (roh.length > 65536) {
          req.destroy();
          ab(new Error("Anfrage zu gross"));
        }
      });
      req.on("end", () => {
        try {
          auf(roh ? JSON.parse(roh) : {});
        } catch {
          ab(new Error("kein gueltiges JSON"));
        }
      });
      req.on("error", ab);
    });
  }
  // ----------------------------------------------------------------- Session
  async session(req) {
    const b = await this.body(req);
    if (typeof b.address !== "string") return { error: "missing_address" };
    let roh;
    try {
      roh = decodeAddress(b.address);
    } catch {
      return { error: "bad_address" };
    }
    this.aufraeumen();
    const s = {
      id: (0, import_node_crypto.randomUUID)(),
      address: roh,
      addressHex: toHex(roh),
      // Eindeutig je Session: Sie trennt die Nonce-Raeume. Zwei Miner
      // koennen denselben Treffer dadurch gar nicht finden.
      extranonce: this.naechsteExtranonce++,
      shareDifficulty: SHARE_START,
      proben: [],
      letzterShare: null,
      angenommen: 0,
      abgelehnt: 0,
      gestartet: Date.now(),
      zuletzt: Date.now(),
      platform: typeof b.platform === "string" ? b.platform : null,
      jobId: null
    };
    this.sessions.set(s.id, s);
    const gleiche = [...this.sessions.values()].filter((x) => x.addressHex === s.addressHex).length;
    return {
      sessionId: s.id,
      extranonce: s.extranonce.toString(),
      shareDifficulty: s.shareDifficulty.toString(),
      address: b.address,
      concurrentSessions: gleiche
    };
  }
  // --------------------------------------------------------------------- Job
  job(sessionId) {
    const s = sessionId ? this.sessions.get(sessionId) : null;
    if (!s) return { error: "session_inactive" };
    s.zuletzt = Date.now();
    const job = this.mining.createJob(s.address, s.extranonce);
    s.jobId = job.jobId;
    return {
      jobId: job.jobId,
      height: job.height,
      version: job.version,
      prevHash: job.prevHash,
      merkleRoot: job.merkleRoot,
      stateRoot: job.stateRoot,
      timestamp: job.timestamp,
      difficulty: job.difficulty,
      txCount: job.txCount,
      extranonce: job.extranonce,
      // Der Miner rechnet gegen das SHARE-Ziel, nicht gegen das Blockziel.
      // Sonst saehe er stundenlang keinen Treffer und wuesste nicht, ob er
      // ueberhaupt arbeitet.
      target: toHex(zielBytes2(zielAus(s.shareDifficulty))),
      shareDifficulty: s.shareDifficulty.toString()
    };
  }
  // ------------------------------------------------------------------- Share
  share(b) {
    const s = this.sessions.get(String(b.sessionId));
    if (!s) return { accepted: false, reason: "session_inactive" };
    s.zuletzt = Date.now();
    const jobId = String(b.jobId);
    if (s.jobId !== jobId) {
      return { accepted: false, reason: "job_foreign" };
    }
    let nonce;
    try {
      nonce = BigInt(String(b.nonce));
    } catch {
      return { accepted: false, reason: "malformed" };
    }
    const netzDifficulty = BigInt(this.chain.tip()?.difficulty ?? 0n);
    const r = this.mining.submitNonce(jobId, nonce);
    if (!r.ok) {
      s.abgelehnt++;
      return { accepted: false, reason: r.grund, detail: r.detail };
    }
    if (r.block) {
      const antwort = {
        accepted: true,
        block: true,
        height: r.height,
        reward: r.reward,
        hash: r.hash,
        credited: s.shareDifficulty.toString(),
        shareDifficulty: s.shareDifficulty.toString(),
        achieved: (netzDifficulty > 0n ? netzDifficulty : s.shareDifficulty).toString(),
        required: s.shareDifficulty.toString(),
        blockDifficulty: netzDifficulty.toString()
      };
      try {
        s.angenommen++;
        this.nachShare(s);
        this.mining.invalidate();
        this.onBlock?.(r.height, r.hash, s.addressHex);
      } catch (e) {
        this.onFehler?.("nach Blockfund", e);
      }
      this.weitergeben(r.hash).catch((e) => this.onFehler?.("Weitergabe", e));
      return antwort;
    }
    const erreicht = BigInt(r.achieved);
    if (erreicht < s.shareDifficulty) {
      s.abgelehnt++;
      return {
        accepted: false,
        reason: "low_difficulty",
        achieved: erreicht.toString(),
        required: s.shareDifficulty.toString(),
        blockDifficulty: netzDifficulty.toString()
      };
    }
    s.angenommen++;
    const vorher = s.shareDifficulty;
    this.nachShare(s);
    return {
      accepted: true,
      block: false,
      credited: vorher.toString(),
      shareDifficulty: s.shareDifficulty.toString(),
      achieved: erreicht.toString(),
      required: vorher.toString(),
      blockDifficulty: netzDifficulty.toString()
    };
  }
  /**
   * Share-Ziel nachfuehren.
   *
   * Angestrebt wird ein Share alle 30 Sekunden. Gemessen wird ueber die
   * letzten acht, nicht ueber den einzelnen Abstand: Die Abstaende sind
   * exponentialverteilt, und wer auf jeden einzelnen reagiert, bringt das
   * Ziel zum Schwingen statt es einzuregeln. Diesen Fehler hatten wir in
   * der ersten Fassung schon einmal.
   */
  nachShare(s) {
    const jetzt = Date.now();
    const vorher = s.letzterShare;
    s.letzterShare = jetzt;
    if (vorher === null) return;
    const sekunden = (jetzt - vorher) / 1e3;
    if (!(sekunden > 0)) return;
    s.proben.push(sekunden / Number(s.shareDifficulty));
    if (s.proben.length > 8) s.proben.shift();
    if (s.proben.length < 3) return;
    const mittel = s.proben.reduce((a, b) => a + b, 0) / s.proben.length;
    if (!(mittel > 0)) return;
    const ziel = SHARE_ZIEL_SEKUNDEN / mittel;
    const jetzigeZahl = Number(s.shareDifficulty);
    const faktor = ziel / jetzigeZahl;
    if (faktor > 0.7 && faktor < 1.4) return;
    const gedeckelt = Math.max(0.25, Math.min(4, faktor));
    s.shareDifficulty = BigInt(Math.max(1, Math.round(jetzigeZahl * gedeckelt)));
  }
  /** Hashrate dieser Session aus den normierten Messwerten. */
  sessionHashrate(s) {
    if (s.proben.length < 2) return null;
    const mittel = s.proben.reduce((a, b) => a + b, 0) / s.proben.length;
    return mittel > 0 ? 65536 / mittel : null;
  }
  /**
   * Einen gefundenen Block nach oben reichen.
   *
   * Der Block wird aus der eigenen Ablage gelesen, nicht aus dem
   * Arbeitsspeicher -- so geht genau das hinaus, was lokal geprueft und
   * festgeschrieben wurde.
   */
  async weitergeben(hashHex) {
    if (!this.upstream) return;
    const gespeichert = this.store.get(fromHex(hashHex));
    if (!gespeichert) {
      this.onUpstream?.({ ok: false, grund: "lokal nicht gefunden" });
      return;
    }
    try {
      const res = await fetch(`${this.upstream}/api/v2/block`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ raw: toHex(gespeichert.body) })
      });
      const body = await res.json().catch(() => ({}));
      this.onUpstream?.(body.accepted ? { ok: true, hoehe: body.height } : { ok: false, grund: body.detail ?? body.reason ?? `HTTP ${res.status}` });
    } catch (e) {
      this.onUpstream?.({ ok: false, grund: String(e.message) });
    }
  }
  aufraeumen() {
    const grenze2 = Date.now() - SESSION_TIMEOUT_MS;
    for (const [id, s] of this.sessions) {
      if (s.zuletzt < grenze2) this.sessions.delete(id);
    }
  }
  // ---------------------------------------------------------------- Auskunft
  /** Eine Transaktion in den lokalen Mempool. */
  async tx(req) {
    const b = await this.body(req);
    if (typeof b.raw !== "string" || !/^[0-9a-fA-F]+$/.test(b.raw)) {
      return { accepted: false, reason: "missing_raw" };
    }
    try {
      const { deserializeTx: deserializeTx2 } = await Promise.resolve().then(() => (init_tx(), tx_exports));
      const tx = deserializeTx2(fromHex(b.raw));
      if (tx.type !== 1) return { accepted: false, reason: "not_a_transfer" };
      const r = this.pool.add(tx, this.chain.state(), this.chain.height() + 1);
      return r.ok ? { accepted: true, txid: r.txid, replaced: r.ersetzt ?? null } : { accepted: false, reason: r.reason, detail: r.detail };
    } catch (e) {
      return { accepted: false, reason: "malformed", detail: e.message };
    }
  }
  summary() {
    const tip = this.chain.tip();
    const hoehe = tip?.height ?? -1;
    return {
      token: { token_name: "YSKAR", token_symbol: "YSR", decimals: 8 },
      height: tip ? tip.height : null,
      nextHeight: hoehe + 1,
      difficulty: tip ? Number(tip.difficulty) : null,
      hashrate: this.gesamtHashrate() || null,
      targetBlockTime: Number(TARGET_BLOCK_TIME),
      tipHash: tip ? toHex(tip.hash) : null,
      stateHeight: this.chain.height(),
      stateRoot: tip ? toHex(stateRoot(this.chain.state())) : null,
      totalSupply: totalSupply(this.chain.state()).toString(),
      maxSupply: MAX_SUPPLY.toString(),
      nextReward: rewardAt(hoehe + 1).toString(),
      mempool: this.pool.size(),
      activeMiners: new Set([...this.sessions.values()].map((s) => s.addressHex)).size
    };
  }
  status() {
    const tip = this.chain.tip();
    return {
      network: this.params.network,
      height: tip?.height ?? null,
      bestBlock: tip ? toHex(tip.hash) : null,
      chainWork: tip ? tip.chainWork.toString() : "0",
      difficulty: tip ? Number(tip.difficulty) : null,
      blocksStored: this.store.count(),
      tips: this.store.tips().length,
      mempool: this.pool.size(),
      sessions: this.aktiveSessions(),
      openJobs: this.mining.offeneJobs()
    };
  }
};
var zielAus = (difficulty) => (1n << 240n) / (difficulty > 0n ? difficulty : 1n);
function zielBytes2(ziel) {
  const out = new Uint8Array(32);
  let x = ziel;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

// ../src/lib/node/p2p/PeerManager.ts
var import_node_net = require("node:net");

// ../src/lib/node/p2p/PeerConnection.ts
var import_node_crypto2 = require("node:crypto");

// ../src/lib/node/p2p/wire.ts
init_hash();
init_codec();
var HEADER_SIZE2 = 4 + 12 + 4 + 4;
var MAX_PAYLOAD = 2 * 1024 * 1024;
var COMMAND_SIZE = 12;
var COMMANDS = [
  "version",
  "verack",
  // Handschlag
  "ping",
  "pong",
  // Lebenszeichen
  "getheaders",
  "headers",
  // Kettenabgleich
  "getdata",
  "block",
  "notfound",
  "inv",
  // Ankuendigung
  "tx",
  // Transaktionen
  "getaddr",
  "addr"
  // Peers austauschen
];
var ERLAUBT = new Set(COMMANDS);
var istBefehl = (s) => ERLAUBT.has(s);
function magicFor(chainId) {
  if (chainId.length < 4) throw new Error("Chain-ID ist zu kurz fuer Magic-Bytes");
  return chainId.slice(0, 4);
}
function encodeFrame(magic, command, payload) {
  if (magic.length !== 4) throw new Error("Magic muss vier Byte sein");
  if (!istBefehl(command)) throw new Error(`Unbekannter Befehl: ${command}`);
  if (payload.length > MAX_PAYLOAD) {
    throw new Error(`Nutzlast ${payload.length} ueberschreitet ${MAX_PAYLOAD}`);
  }
  const out = new Uint8Array(HEADER_SIZE2 + payload.length);
  const dv = new DataView(out.buffer);
  out.set(magic, 0);
  for (let i = 0; i < command.length; i++) out[4 + i] = command.charCodeAt(i);
  dv.setUint32(16, payload.length, true);
  out.set(sha256d(payload).slice(0, 4), 20);
  out.set(payload, HEADER_SIZE2);
  return out;
}
function decodeFrame(puffer, magic) {
  if (puffer.length < HEADER_SIZE2) {
    return { t: "unvollstaendig", benoetigt: HEADER_SIZE2 - puffer.length };
  }
  for (let i = 0; i < 4; i++) {
    if (puffer[i] !== magic[i]) {
      return { t: "fehler", grund: "falsches_netz" };
    }
  }
  let ende = COMMAND_SIZE;
  for (let i = 0; i < COMMAND_SIZE; i++) {
    if (puffer[4 + i] === 0) {
      ende = i;
      break;
    }
  }
  let command = "";
  for (let i = 0; i < ende; i++) {
    const c = puffer[4 + i];
    if (c < 32 || c > 126) return { t: "fehler", grund: "befehl_unlesbar" };
    command += String.fromCharCode(c);
  }
  for (let i = ende; i < COMMAND_SIZE; i++) {
    if (puffer[4 + i] !== 0) return { t: "fehler", grund: "befehl_nicht_gefuellt" };
  }
  if (!istBefehl(command)) {
    return { t: "fehler", grund: `befehl_unbekannt:${command}` };
  }
  const dv = new DataView(puffer.buffer, puffer.byteOffset, puffer.byteLength);
  const laenge = dv.getUint32(16, true);
  if (laenge > MAX_PAYLOAD) {
    return { t: "fehler", grund: `zu_gross:${laenge}` };
  }
  const gesamt = HEADER_SIZE2 + laenge;
  if (puffer.length < gesamt) {
    return { t: "unvollstaendig", benoetigt: gesamt - puffer.length };
  }
  const payload = puffer.slice(HEADER_SIZE2, gesamt);
  const soll = sha256d(payload).slice(0, 4);
  for (let i = 0; i < 4; i++) {
    if (puffer[20 + i] !== soll[i]) {
      return { t: "fehler", grund: "pruefsumme" };
    }
  }
  return { t: "frame", frame: { command, payload }, verbraucht: gesamt };
}
var FrameReader = class {
  puffer = new Uint8Array(0);
  magic;
  constructor(magic) {
    if (magic.length !== 4) throw new Error("Magic muss vier Byte sein");
    this.magic = magic;
  }
  /** Gepufferte Bytes -- fuer Grenzen und Messungen. */
  size() {
    return this.puffer.length;
  }
  /**
   * Bytes hinzufuegen und alles herausgeben, was vollstaendig ist.
   *
   * Bei einem Fehler wird abgebrochen: Was danach im Puffer steht, ist
   * nicht mehr einzuordnen.
   */
  push(bytes) {
    const neu = new Uint8Array(this.puffer.length + bytes.length);
    neu.set(this.puffer, 0);
    neu.set(bytes, this.puffer.length);
    this.puffer = neu;
    const frames = [];
    for (; ; ) {
      const r = decodeFrame(this.puffer, this.magic);
      if (r.t === "unvollstaendig") break;
      if (r.t === "fehler") {
        this.puffer = new Uint8Array(0);
        return { frames, fehler: r.grund };
      }
      frames.push(r.frame);
      this.puffer = this.puffer.slice(r.verbraucht);
    }
    return { frames };
  }
  reset() {
    this.puffer = new Uint8Array(0);
  }
};

// ../src/lib/node/p2p/messages.ts
init_codec();
var PROTOCOL_VERSION = 1;
var MAX_INV = 500;
var MAX_HEADERS = 2e3;
var MAX_ADDR = 500;
var MAX_LOCATOR = 32;
var MAX_AGENT = 64;
function encodeVersion(v) {
  if (v.agent.length > MAX_AGENT) throw new Error("Kennung zu lang");
  const netz = new TextEncoder().encode(v.network);
  const agent = new TextEncoder().encode(v.agent);
  const work = new TextEncoder().encode(v.chainWork);
  if (netz.length > 32) throw new Error("Netzname zu lang");
  if (work.length > 96) throw new Error("Chain Work zu lang");
  return new Writer().u32(v.protocol).u8(netz.length).bytes(netz).bytes(v.chainId, 32).u8(agent.length).bytes(agent).u32(v.height).u8(work.length).bytes(work).u64(v.nonce).u32(v.port).u64(v.timestamp).finish();
}
function decodeVersion(b) {
  const r = new Reader(b);
  const protocol = r.u32();
  const network = new TextDecoder().decode(r.bytes(r.u8()));
  const chainId = r.bytes(32);
  const agentLen = r.u8();
  if (agentLen > MAX_AGENT) throw new Error("Kennung zu lang");
  const agent = new TextDecoder().decode(r.bytes(agentLen));
  const height = r.u32();
  const workLen = r.u8();
  if (workLen > 96) throw new Error("Chain Work zu lang");
  const chainWork = new TextDecoder().decode(r.bytes(workLen));
  if (!/^\d+$/.test(chainWork)) throw new Error("Chain Work ist keine Zahl");
  const nonce = r.u64();
  const port = r.u32();
  const timestamp = r.u64();
  return { protocol, network, chainId, agent, height, chainWork, nonce, port, timestamp };
}
var encodePing = (nonce) => new Writer().u64(nonce).finish();
var decodePing = (b) => new Reader(b).u64();
function encodeGetHeaders(g) {
  if (g.locator.length > MAX_LOCATOR) throw new Error("Locator zu lang");
  const w = new Writer().u8(g.locator.length);
  for (const h of g.locator) w.bytes(h, 32);
  return w.bytes(g.stop, 32).finish();
}
function decodeGetHeaders(b) {
  const r = new Reader(b);
  const n = r.u8();
  if (n > MAX_LOCATOR) throw new Error("Locator zu lang");
  const locator = [];
  for (let i = 0; i < n; i++) locator.push(r.bytes(32));
  return { locator, stop: r.bytes(32) };
}
function encodeHeaders(header) {
  if (header.length > MAX_HEADERS) throw new Error("Zu viele Header");
  const w = new Writer().u16(header.length);
  for (const h of header) {
    if (h.length !== 136) throw new Error(`Header hat ${h.length} statt 136 Byte`);
    w.bytes(h, 136);
  }
  return w.finish();
}
function decodeHeaders(b) {
  const r = new Reader(b);
  const n = r.u16();
  if (n > MAX_HEADERS) throw new Error("Zu viele Header");
  const out = [];
  for (let i = 0; i < n; i++) out.push(r.bytes(136));
  return out;
}
var INV_BLOCK = 1;
var INV_TX = 2;
function encodeInv(eintraege) {
  if (eintraege.length > MAX_INV) throw new Error("Zu viele Eintraege");
  const w = new Writer().u16(eintraege.length);
  for (const e of eintraege) w.u8(e.typ).bytes(e.hash, 32);
  return w.finish();
}
function decodeInv(b) {
  const r = new Reader(b);
  const n = r.u16();
  if (n > MAX_INV) throw new Error("Zu viele Eintraege");
  const out = [];
  for (let i = 0; i < n; i++) {
    const typ = r.u8();
    const hash = r.bytes(32);
    if (typ !== INV_BLOCK && typ !== INV_TX) throw new Error(`Unbekannter Typ ${typ}`);
    out.push({ typ, hash });
  }
  return out;
}
var encodeGetData = encodeInv;
var decodeGetData = decodeInv;
var encodeNotFound = encodeInv;
function encodeAddr(liste) {
  if (liste.length > MAX_ADDR) throw new Error("Zu viele Adressen");
  const w = new Writer().u16(liste.length);
  for (const a of liste) {
    const h = new TextEncoder().encode(a.host);
    if (h.length > 255) throw new Error("Hostname zu lang");
    w.u8(h.length).bytes(h).u32(a.port).u64(a.gesehen);
  }
  return w.finish();
}
function decodeAddr(b) {
  const r = new Reader(b);
  const n = r.u16();
  if (n > MAX_ADDR) throw new Error("Zu viele Adressen");
  const out = [];
  for (let i = 0; i < n; i++) {
    const host = new TextDecoder().decode(r.bytes(r.u8()));
    const port = r.u32();
    const gesehen = r.u64();
    if (port === 0 || port > 65535) throw new Error(`Ungueltiger Port ${port}`);
    out.push({ host, port, gesehen });
  }
  return out;
}
var peerKey = (a) => `${a.host.toLowerCase()}:${a.port}`;

// ../src/lib/node/p2p/PeerConnection.ts
init_codec();
var HANDSHAKE_TIMEOUT_MS = 1e4;
var PING_INTERVAL_MS = 6e4;
var IDLE_TIMEOUT_MS = 15e4;
var naechsteId = 1;
var PeerConnection = class {
  id = naechsteId++;
  richtung;
  host;
  port;
  sock;
  params;
  magic;
  leser;
  cb;
  /** Zufallswert dieser Verbindung. */
  eigeneNonce;
  /** Alle Nonces dieses Knotens -- ohne sie faellt keine Selbstverbindung auf. */
  nonces;
  eigeneHoehe;
  eigenerPort;
  agent;
  versionGesehen = false;
  verackGesehen = false;
  versionGesendet = false;
  ready = false;
  geschlossen = false;
  fern = null;
  seit = Date.now();
  empfangen = 0;
  gesendet = 0;
  handshakeTimer = null;
  pingTimer = null;
  idleTimer = null;
  offenesPing = null;
  constructor(opt) {
    this.sock = opt.socket;
    this.richtung = opt.richtung;
    this.params = opt.params;
    this.magic = magicFor(opt.params.chainId);
    this.leser = new FrameReader(this.magic);
    this.cb = opt.callbacks ?? {};
    this.agent = opt.agent;
    this.eigenerPort = opt.listenPort;
    this.eigeneHoehe = opt.eigeneKette;
    this.eigeneNonce = opt.nonce ?? zufallsNonce();
    this.nonces = opt.nonces ?? null;
    this.nonces?.merke(this.eigeneNonce);
    this.host = opt.socket.remoteAddress ?? "?";
    this.port = opt.socket.remotePort ?? 0;
    this.sock.on("data", (b) => this.aufDaten(b));
    this.sock.on("error", (e) => this.schliessen(`socket:${e.message}`));
    this.sock.on("close", () => this.schliessen("getrennt"));
    this.handshakeTimer = setTimeout(
      () => this.schliessen("handschlag_zeit"),
      HANDSHAKE_TIMEOUT_MS
    );
    this.handshakeTimer.unref?.();
    this.wecke();
    if (this.richtung === "aus") this.sendeVersion();
  }
  info() {
    return {
      id: this.id,
      richtung: this.richtung,
      host: this.host,
      port: this.port,
      listenPort: this.fern?.port ?? 0,
      agent: this.fern?.agent ?? "",
      height: this.fern?.height ?? 0,
      chainWork: this.fern ? BigInt(this.fern.chainWork) : 0n,
      seit: this.seit,
      empfangen: this.empfangen,
      gesendet: this.gesendet
    };
  }
  /** Kumulierte Arbeit der Gegenseite -- entscheidet, wer aufholt. */
  fremdeArbeit() {
    return this.fern ? BigInt(this.fern.chainWork) : 0n;
  }
  fremdeHoehe() {
    return this.fern?.height ?? 0;
  }
  nonce() {
    return this.eigeneNonce;
  }
  send(command, payload) {
    if (this.geschlossen) return false;
    try {
      const roh = encodeFrame(this.magic, command, payload);
      this.sock.write(roh);
      this.gesendet += roh.length;
      return true;
    } catch (e) {
      this.schliessen(`senden:${e.message}`);
      return false;
    }
  }
  close(grund = "lokal") {
    this.schliessen(grund);
  }
  // ------------------------------------------------------------- Innereien
  aufDaten(b) {
    if (this.geschlossen) return;
    this.empfangen += b.length;
    this.wecke();
    const { frames, fehler } = this.leser.push(new Uint8Array(b));
    for (const f of frames) {
      if (this.geschlossen) return;
      this.behandle(f);
    }
    if (fehler) this.auffaellig(`rahmen:${fehler}`);
  }
  behandle(f) {
    if (!this.versionGesehen && f.command !== "version") {
      return this.auffaellig(`vor_handschlag:${f.command}`);
    }
    switch (f.command) {
      case "version":
        return this.aufVersion(f.payload);
      case "verack":
        return this.aufVerack();
      case "ping":
        return this.aufPing(f.payload);
      case "pong":
        return this.aufPong(f.payload);
      default:
        if (!this.ready) return this.auffaellig(`vor_verack:${f.command}`);
        this.cb.onMessage?.(this, f);
    }
  }
  sendeVersion() {
    if (this.versionGesendet) return;
    this.versionGesendet = true;
    const k = this.eigeneHoehe();
    this.send("version", encodeVersion({
      protocol: PROTOCOL_VERSION,
      network: this.params.network,
      chainId: this.params.chainId,
      agent: this.agent,
      height: Math.max(0, k.height),
      chainWork: k.chainWork.toString(),
      nonce: this.eigeneNonce,
      port: this.eigenerPort,
      timestamp: BigInt(Math.floor(Date.now() / 1e3))
    }));
  }
  aufVersion(payload) {
    if (this.versionGesehen) return this.auffaellig("version_doppelt");
    let v;
    try {
      v = decodeVersion(payload);
    } catch (e) {
      return this.auffaellig(`version_unlesbar:${e.message}`);
    }
    if (v.network !== this.params.network) {
      return this.schliessen(`fremdes_netz:${v.network}`);
    }
    if (toHex(v.chainId) !== toHex(this.params.chainId)) {
      return this.schliessen("fremde_chain_id");
    }
    if (v.nonce === this.eigeneNonce || this.nonces?.kennt(v.nonce)) {
      if (this.richtung === "ein") this.sendeVersion();
      return this.schliessen("selbstverbindung");
    }
    if (v.protocol !== PROTOCOL_VERSION) {
      return this.schliessen(`protokoll:${v.protocol}`);
    }
    this.fern = v;
    this.versionGesehen = true;
    if (this.richtung === "ein") this.sendeVersion();
    this.send("verack", new Uint8Array(0));
    this.pruefeFertig();
  }
  aufVerack() {
    if (this.verackGesehen) return this.auffaellig("verack_doppelt");
    this.verackGesehen = true;
    this.pruefeFertig();
  }
  pruefeFertig() {
    if (this.ready || !this.versionGesehen || !this.verackGesehen) return;
    this.ready = true;
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
    this.pingTimer = setInterval(() => this.sendePing(), PING_INTERVAL_MS);
    this.pingTimer.unref?.();
    this.cb.onReady?.(this);
  }
  sendePing() {
    if (!this.ready || this.geschlossen) return;
    if (this.offenesPing !== null) {
      return this.schliessen("keine_antwort");
    }
    this.offenesPing = zufallsNonce();
    this.send("ping", encodePing(this.offenesPing));
  }
  aufPing(payload) {
    try {
      this.send("pong", encodePing(decodePing(payload)));
    } catch {
      this.auffaellig("ping_unlesbar");
    }
  }
  aufPong(payload) {
    let n;
    try {
      n = decodePing(payload);
    } catch {
      return this.auffaellig("pong_unlesbar");
    }
    if (this.offenesPing === null) return this.auffaellig("pong_unerwartet");
    if (n !== this.offenesPing) return this.auffaellig("pong_falsch");
    this.offenesPing = null;
  }
  /**
   * Der Ruhe-Wecker.
   *
   * Bei jedem empfangenen Byte neu gestellt. Laeuft er ab, kam lange
   * nichts -- auch kein pong, denn das haette ihn ebenfalls gestellt.
   */
  wecke() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.schliessen("still"), IDLE_TIMEOUT_MS);
    this.idleTimer.unref?.();
  }
  auffaellig(grund) {
    this.schliessen(`auffaellig:${grund}`);
    this.cb.onMisbehave?.(this, grund);
  }
  schliessen(grund) {
    if (this.geschlossen) return;
    this.geschlossen = true;
    this.ready = false;
    for (const t of [this.handshakeTimer, this.idleTimer]) if (t) clearTimeout(t);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.handshakeTimer = this.idleTimer = this.pingTimer = null;
    try {
      this.sock.destroy();
    } catch {
    }
    this.leser.reset();
    this.cb.onClose?.(this, grund);
  }
};
function zufallsNonce() {
  const b = (0, import_node_crypto2.randomBytes)(8);
  let v = 0n;
  for (const x of b) v = v << 8n | BigInt(x);
  return v;
}

// ../src/lib/node/p2p/PeerManager.ts
var MAX_AUS = 8;
var MAX_EIN = 32;
var MAX_BUCH = 1e3;
var VERBINDE_INTERVALL_MS = 15e3;
var VERBINDE_TIMEOUT_MS = 8e3;
var VERMERK_MS = 60 * 60 * 1e3;
var PeerManager = class {
  opt;
  server = null;
  peers = /* @__PURE__ */ new Map();
  buch = /* @__PURE__ */ new Map();
  /** Auffaellige Peers: Schluessel -> bis wann vermerkt. */
  vermerkt = /* @__PURE__ */ new Map();
  /** Laufende Verbindungsversuche -- verhindert doppelte. */
  imAufbau = /* @__PURE__ */ new Set();
  /**
   * Als eigene Adresse erkannt.
   *
   * Ein Knoten bekommt seine eigene Adresse regelmaessig ueber addr
   * zurueck -- ein Peer gibt weiter, wen er kennt, und das sind wir. Ohne
   * dieses Verzeichnis versucht der Knoten immer wieder, sich mit sich
   * selbst zu verbinden: Der Handschlag erkennt es an der Nonce und
   * trennt, aber jeder Versuch belegt kurz einen ausgehenden Platz.
   *
   * Die eigene aeussere Adresse laesst sich nicht zuverlaessig feststellen
   * -- deshalb wird sie nicht geraten, sondern gelernt.
   */
  selbst = /* @__PURE__ */ new Set();
  takt = null;
  laeuft = false;
  /**
   * Versandte Nonces.
   *
   * Begrenzt, damit die Menge nicht endlos waechst -- aeltere fallen
   * heraus. Das schadet nicht: Eine Selbstverbindung faellt beim
   * Handschlag auf, und der liegt Sekunden nach dem Versenden.
   */
  nonceBuch = /* @__PURE__ */ (() => {
    const gesehen = [];
    const menge = /* @__PURE__ */ new Set();
    return {
      merke(n) {
        if (menge.has(n)) return;
        menge.add(n);
        gesehen.push(n);
        while (gesehen.length > 256) {
          const alt = gesehen.shift();
          if (alt !== void 0) menge.delete(alt);
        }
      },
      kennt: (n) => menge.has(n)
    };
  })();
  constructor(opt) {
    this.opt = opt;
    for (const s of opt.seeds ?? []) this.merke(s.host, s.port);
  }
  get maxAus() {
    return this.opt.maxAus ?? MAX_AUS;
  }
  get maxEin() {
    return this.opt.maxEin ?? MAX_EIN;
  }
  log(t) {
    this.opt.onLog?.(t);
  }
  async start() {
    if (this.laeuft) return;
    this.laeuft = true;
    if (this.opt.listenPort && this.opt.listenPort > 0) {
      await this.lausche(this.opt.listenPort, this.opt.host ?? "0.0.0.0");
    }
    this.fuelleAus();
    this.takt = setInterval(() => this.fuelleAus(), VERBINDE_INTERVALL_MS);
    this.takt.unref?.();
  }
  async stop() {
    this.laeuft = false;
    if (this.takt) {
      clearInterval(this.takt);
      this.takt = null;
    }
    for (const p of [...this.peers.values()]) p.close("herunterfahren");
    this.peers.clear();
    if (this.server) {
      await new Promise((auf) => this.server.close(() => auf()));
      this.server = null;
    }
  }
  // ---------------------------------------------------------------- Stand
  alle() {
    return [...this.peers.values()];
  }
  bereite() {
    return this.alle().filter((p) => p.ready);
  }
  zahlAus() {
    return this.alle().filter((p) => p.richtung === "aus").length;
  }
  zahlEin() {
    return this.alle().filter((p) => p.richtung === "ein").length;
  }
  buchGroesse() {
    return this.buch.size;
  }
  info() {
    return this.bereite().map((p) => p.info());
  }
  /** Der Peer mit der meisten Arbeit -- von dem lohnt sich das Aufholen. */
  besterPeer() {
    let best = null;
    for (const p of this.bereite()) {
      if (!best || p.fremdeArbeit() > best.fremdeArbeit()) best = p;
    }
    return best;
  }
  /** An alle senden. Mit `ausser` laesst sich der Absender auslassen. */
  sendeAllen(command, payload, ausser) {
    let n = 0;
    for (const p of this.bereite()) {
      if (p === ausser) continue;
      if (p.send(command, payload)) n++;
    }
    return n;
  }
  /** Einen Block oder eine Transaktion ankuendigen. */
  kuendigeAn(typ, hash, ausser) {
    return this.sendeAllen("inv", encodeInv([{ typ, hash }]), ausser);
  }
  // ------------------------------------------------------------ Eingehend
  lausche(port, host) {
    return new Promise((auf, ab) => {
      const srv = (0, import_node_net.createServer)((sock) => this.nimmAn(sock));
      srv.on("error", ab);
      srv.listen(port, host, () => {
        this.server = srv;
        this.log(`lauscht auf ${host}:${port}`);
        auf();
      });
    });
  }
  nimmAn(sock) {
    if (!this.laeuft) {
      sock.destroy();
      return;
    }
    if (this.zahlEin() >= this.maxEin) {
      const opfer = this.verdraengungsopfer();
      if (!opfer) {
        sock.destroy();
        return;
      }
      opfer.close("verdraengt");
    }
    this.nimmVerbindung(sock, "ein");
  }
  /**
   * Wen verdraengen?
   *
   * Zuerst einen vermerkten Peer. Gibt es keinen, den mit der laengsten
   * Verbindung ohne abgeschlossenen Handschlag -- der belegt einen Platz,
   * ohne etwas beizutragen. Sonst niemanden.
   */
  verdraengungsopfer() {
    const ein = this.alle().filter((p) => p.richtung === "ein");
    const vermerkt = ein.find((p) => this.istVermerkt(p.host));
    if (vermerkt) return vermerkt;
    const unfertig = ein.filter((p) => !p.ready).sort((a, b) => a.info().seit - b.info().seit);
    return unfertig[0] ?? null;
  }
  // ------------------------------------------------------------ Ausgehend
  /**
   * Ausgehende Plaetze auffuellen.
   *
   * Nur EIN Versuch je Takt: Ein Schwall gleichzeitiger Verbindungen
   * wuerde den eigenen Knoten belasten und faellt bei der Gegenseite als
   * Muster auf.
   */
  fuelleAus() {
    if (!this.laeuft) return;
    if (this.zahlAus() + this.imAufbau.size >= this.maxAus) return;
    const ziel = this.naechstesZiel();
    if (!ziel) return;
    this.verbinde(ziel.host, ziel.port);
  }
  naechstesZiel() {
    const jetzt = Date.now();
    const verbunden = new Set(this.alle().map((p) => peerKey({
      host: p.host,
      port: p.info().listenPort || p.port
    })));
    const kandidaten = [...this.buch.values()].filter((e) => {
      const k = peerKey(e);
      if (verbunden.has(k) || this.imAufbau.has(k)) return false;
      const wartezeit = Math.min(2 ** e.fehlversuche, 64) * 3e4;
      return jetzt - e.zuletztVersucht >= wartezeit;
    });
    if (kandidaten.length === 0) return null;
    kandidaten.sort((a, b) => a.fehlversuche !== b.fehlversuche ? a.fehlversuche - b.fehlversuche : b.gesehen - a.gesehen);
    return kandidaten[0];
  }
  /** Von aussen anstossbar -- fuer eine feste Adresse. */
  verbinde(host, port) {
    const k = peerKey({ host, port });
    if (this.imAufbau.has(k)) return;
    this.imAufbau.add(k);
    const eintrag = this.buch.get(k);
    if (eintrag) eintrag.zuletztVersucht = Date.now();
    const sock = (0, import_node_net.connect)({ host, port });
    sock.setTimeout(VERBINDE_TIMEOUT_MS);
    const scheitern = (grund) => {
      this.imAufbau.delete(k);
      const e = this.buch.get(k);
      if (e) e.fehlversuche++;
      try {
        sock.destroy();
      } catch {
      }
      this.log(`${k} nicht erreichbar: ${grund}`);
    };
    sock.once("error", (e) => scheitern(e.message));
    sock.once("timeout", () => scheitern("Zeit abgelaufen"));
    sock.once("connect", () => {
      sock.setTimeout(0);
      sock.removeAllListeners("timeout");
      this.imAufbau.delete(k);
      const e = this.buch.get(k);
      if (e) {
        e.fehlversuche = 0;
        e.gesehen = Date.now();
      }
      this.nimmVerbindung(sock, "aus", port);
    });
  }
  // ------------------------------------------------------------- Gemeinsam
  nimmVerbindung(sock, richtung, zielPort = 0) {
    const p = new PeerConnection({
      socket: sock,
      richtung,
      params: this.opt.params,
      agent: this.opt.agent,
      listenPort: this.opt.listenPort ?? 0,
      eigeneKette: this.opt.kette,
      nonces: this.nonceBuch,
      callbacks: {
        onReady: (peer) => this.aufBereit(peer, zielPort),
        onMessage: (peer, f) => this.aufNachricht(peer, f),
        onClose: (peer, grund) => {
          this.peers.delete(peer.id);
          if (grund.includes("selbstverbindung") && zielPort > 0) {
            const k = peerKey({ host: peer.host, port: zielPort });
            this.selbst.add(k);
            this.buch.delete(k);
            this.log(`${k} ist die eigene Adresse -- aus dem Buch genommen`);
          }
          this.opt.onClose?.(peer, grund);
        },
        onMisbehave: (peer, grund) => {
          this.vermerke(peer.host);
          this.log(`${peer.host} auffaellig: ${grund}`);
        }
      }
    });
    this.peers.set(p.id, p);
  }
  aufBereit(p, zielPort) {
    const port = p.info().listenPort || zielPort;
    if (port > 0) this.merke(p.host, port);
    p.send("getaddr", new Uint8Array(0));
    this.opt.onReady?.(p);
  }
  aufNachricht(p, f) {
    if (f.command === "getaddr") return this.aufGetAddr(p);
    if (f.command === "addr") return this.aufAddr(p, f.payload);
    this.opt.onMessage?.(p, f);
  }
  aufGetAddr(p) {
    const jetzt = Date.now();
    const liste = [...this.buch.values()].filter((e) => jetzt - e.gesehen < 3 * 60 * 60 * 1e3 && e.fehlversuche === 0).sort((a, b) => b.gesehen - a.gesehen).slice(0, MAX_ADDR).map((e) => ({ host: e.host, port: e.port, gesehen: BigInt(Math.floor(e.gesehen / 1e3)) }));
    if (liste.length > 0) p.send("addr", encodeAddr(liste));
  }
  aufAddr(p, payload) {
    let liste;
    try {
      liste = decodeAddr(payload);
    } catch (e) {
      p.close(`addr_unlesbar:${e.message}`);
      this.vermerke(p.host);
      return;
    }
    const jetzt = Date.now();
    for (const a of liste) {
      const gesehen = Number(a.gesehen) * 1e3;
      if (gesehen > jetzt + 10 * 60 * 1e3) continue;
      if (jetzt - gesehen > 7 * 24 * 60 * 60 * 1e3) continue;
      if (!plausiblerHost(a.host)) continue;
      this.merke(a.host, a.port, gesehen);
    }
  }
  // -------------------------------------------------------------- Adressbuch
  merke(host, port, gesehen = Date.now()) {
    if (port <= 0 || port > 65535) return;
    const k = peerKey({ host, port });
    if (this.selbst.has(k)) return;
    const vorhanden = this.buch.get(k);
    if (vorhanden) {
      if (gesehen > vorhanden.gesehen) vorhanden.gesehen = gesehen;
      return;
    }
    if (this.buch.size >= MAX_BUCH) {
      let aeltester = null;
      for (const e of this.buch) {
        if (!aeltester || e[1].gesehen < aeltester[1].gesehen) aeltester = e;
      }
      if (!aeltester || aeltester[1].gesehen >= gesehen) return;
      this.buch.delete(aeltester[0]);
    }
    this.buch.set(k, { host, port, gesehen, fehlversuche: 0, zuletztVersucht: 0 });
  }
  vermerke(host) {
    this.vermerkt.set(host, Date.now() + VERMERK_MS);
  }
  istVermerkt(host) {
    const bis = this.vermerkt.get(host);
    if (bis === void 0) return false;
    if (Date.now() > bis) {
      this.vermerkt.delete(host);
      return false;
    }
    return true;
  }
  /** Adressen im Buch -- fuer Anzeige und Tests. */
  buchSchluessel() {
    return [...this.buch.keys()];
  }
  /** Als eigene erkannte Adressen. */
  eigeneAdressen() {
    return [...this.selbst];
  }
  /** Nur fuer Anzeige und Tests. */
  vermerkteAnzahl() {
    for (const [h, bis] of [...this.vermerkt]) {
      if (Date.now() > bis) this.vermerkt.delete(h);
    }
    return this.vermerkt.size;
  }
};
function plausiblerHost(h) {
  if (h.length === 0 || h.length > 255) return false;
  return /^[a-zA-Z0-9.:_-]+$/.test(h);
}

// ../src/lib/node/p2p/SyncManager.ts
init_params();
init_hash();
init_codec();
var BLOCK_FENSTER = 16;
var ANFRAGE_TIMEOUT_MS = 3e4;
var SyncManager = class {
  chain;
  store;
  peers;
  params;
  opt;
  /** Angeforderte Bloecke: Hash -> von wem und seit wann. */
  offen = /* @__PURE__ */ new Map();
  /**
   * Header, deren Koerper noch fehlen -- in der Reihenfolge der Kette.
   *
   * Bloecke muessen in Reihenfolge angewandt werden; ein Block ohne
   * Vorgaenger wird abgelehnt. Diese Liste haelt fest, was in welcher
   * Reihenfolge noch gebraucht wird.
   */
  warteschlange = [];
  laeuft = false;
  takt = null;
  constructor(o) {
    this.chain = o.chain;
    this.store = o.store;
    this.peers = o.peers;
    this.params = o.params ?? MAINNET;
    this.opt = o;
  }
  log(t) {
    this.opt.onLog?.(t);
  }
  start() {
    if (this.laeuft) return;
    this.laeuft = true;
    this.takt = setInterval(() => this.pruefeOffene(), 5e3);
    this.takt.unref?.();
  }
  stop() {
    this.laeuft = false;
    if (this.takt) {
      clearInterval(this.takt);
      this.takt = null;
    }
    this.offen.clear();
    this.warteschlange = [];
  }
  offeneAnfragen() {
    return this.offen.size;
  }
  fehlendeBloecke() {
    return this.warteschlange.length;
  }
  // ------------------------------------------------------- Einstiegspunkte
  /**
   * Ein Peer ist bereit.
   *
   * Hat er mehr Arbeit, wird aufgeholt. Nicht mehr Hoehe -- mehr ARBEIT:
   * Eine laengere Kette aus leichten Bloecken ist nicht die bessere.
   */
  aufPeer(p) {
    const tip = this.chain.tip();
    const eigene = tip ? tip.chainWork : 0n;
    if (p.fremdeArbeit() > eigene) {
      this.log(`${p.host} hat mehr Arbeit (${p.fremdeArbeit()} > ${eigene})`);
      this.frageHeader(p);
    }
  }
  /** Eine Nachricht von einem Peer. */
  aufNachricht(p, f) {
    try {
      switch (f.command) {
        case "getheaders":
          return this.aufGetHeaders(p, f.payload);
        case "headers":
          return this.aufHeaders(p, f.payload);
        case "getdata":
          return this.aufGetData(p, f.payload);
        case "block":
          return this.aufBlock(p, f.payload);
        case "inv":
          return this.aufInv(p, f.payload);
        case "notfound":
          return this.aufNotFound(p, f.payload);
      }
    } catch (e) {
      p.close(`nachricht_unlesbar:${f.command}:${e.message}`);
    }
  }
  /** Einen selbst gefundenen Block ankuendigen. */
  kuendigeAn(hash, ausser) {
    return this.peers.kuendigeAn(INV_BLOCK, hash, ausser);
  }
  // ------------------------------------------------------------ Anfragen
  /**
   * Den Locator bauen.
   *
   * Dicht am Kopf, dann mit wachsendem Abstand nach hinten, zuletzt der
   * Genesis. Die Gegenseite sucht den ersten, den sie kennt.
   *
   * Nur die Hoehe zu senden waere einfacher und falsch: Nach einer
   * Gabelung haben beide Seiten dieselbe Hoehe mit verschiedenen Bloecken.
   */
  baueLocator() {
    const tip = this.chain.tip();
    if (!tip) return [];
    const out = [];
    let hoehe = tip.height;
    let schritt = 1;
    while (hoehe >= 0 && out.length < 30) {
      const b = this.store.mainAt(hoehe);
      if (b) out.push(b.hash);
      if (out.length >= 10) schritt *= 2;
      hoehe -= schritt;
    }
    const genesis = this.store.mainAt(0);
    if (genesis && out.length > 0 && toHex(out[out.length - 1].slice(0, 4)) !== toHex(genesis.hash.slice(0, 4))) {
      out.push(genesis.hash);
    }
    return out;
  }
  frageHeader(p) {
    p.send("getheaders", encodeGetHeaders({
      locator: this.baueLocator(),
      stop: new Uint8Array(32)
    }));
  }
  // ---------------------------------------------------------- Beantworten
  aufGetHeaders(p, payload) {
    const g = decodeGetHeaders(payload);
    let ab = 0;
    for (const h of g.locator) {
      const b = this.store.get(h);
      if (b && b.mainChain) {
        ab = b.height + 1;
        break;
      }
    }
    const tip = this.chain.tip();
    if (!tip) return;
    const header = [];
    for (let hoehe = ab; hoehe <= tip.height && header.length < MAX_HEADERS; hoehe++) {
      const b = this.store.mainAt(hoehe);
      if (!b) break;
      header.push(b.body.slice(0, 136));
      if (g.stop.some((x) => x !== 0) && toHex(b.hash) === toHex(g.stop)) break;
    }
    if (header.length > 0) p.send("headers", encodeHeaders(header));
  }
  aufGetData(p, payload) {
    const wunsch = decodeGetData(payload);
    const fehlt = [];
    for (const e of wunsch) {
      if (e.typ !== INV_BLOCK) {
        fehlt.push(e);
        continue;
      }
      const b = this.store.get(e.hash);
      if (!b) {
        fehlt.push(e);
        continue;
      }
      p.send("block", b.body);
    }
    if (fehlt.length > 0) p.send("notfound", encodeNotFound(fehlt));
  }
  // ----------------------------------------------------------- Empfangen
  aufHeaders(p, payload) {
    const roh = decodeHeaders(payload);
    if (roh.length === 0) return;
    const neu = [];
    for (const h of roh) {
      let kopf;
      try {
        kopf = deserializeHeader(h);
      } catch {
        return void p.close("header_unlesbar");
      }
      const hash = sha256d(h);
      const ziel = targetFromDifficulty(kopf.difficulty);
      let wert = 0n;
      for (const b of hash) wert = wert << 8n | BigInt(b);
      if (wert > ziel) {
        return void p.close("header_ohne_arbeit");
      }
      if (this.store.has(hash)) continue;
      neu.push({ hash, hoehe: kopf.height });
    }
    if (neu.length === 0) return;
    this.log(`${neu.length} neue Header von ${p.host}`);
    neu.sort((a, b) => a.hoehe - b.hoehe);
    for (const n of neu) {
      if (!this.warteschlange.some((w) => toHex(w.hash) === toHex(n.hash))) {
        this.warteschlange.push(n);
      }
    }
    this.warteschlange.sort((a, b) => a.hoehe - b.hoehe);
    this.frageBloecke(p);
    if (roh.length >= MAX_HEADERS) this.frageHeader(p);
  }
  /**
   * Die naechsten Koerper anfragen.
   *
   * Nur ein begrenztes Fenster gleichzeitig: Alle auf einmal anzufragen
   * wuerde bei einer langen Kette hunderte Megabyte gleichzeitig anfordern.
   */
  frageBloecke(p) {
    const wunsch = [];
    for (const w of this.warteschlange) {
      if (this.offen.size + wunsch.length >= BLOCK_FENSTER) break;
      const k = toHex(w.hash);
      if (this.offen.has(k) || this.store.has(w.hash)) continue;
      wunsch.push({ typ: INV_BLOCK, hash: w.hash });
      this.offen.set(k, { peer: p, seit: Date.now() });
    }
    if (wunsch.length > 0) p.send("getdata", encodeGetData(wunsch));
  }
  aufBlock(p, roh) {
    let hash;
    try {
      hash = toHex(headerHash(deserializeBlock(roh).header));
    } catch {
      return void p.close("block_unlesbar");
    }
    this.offen.delete(hash);
    this.warteschlange = this.warteschlange.filter((w) => toHex(w.hash) !== hash);
    const r = this.chain.accept(roh);
    if (!r.ok) {
      if (r.grund === "vorgaenger_fehlt") {
        this.frageHeader(p);
        return;
      }
      this.log(`Block von ${p.host} abgelehnt: ${r.grund} ${r.detail ?? ""}`);
      p.close(`ungueltiger_block:${r.grund}`);
      return;
    }
    if (r.stored) {
      this.opt.onBlock?.(r.height, hash, p.host);
      this.kuendigeAn(headerHash(deserializeBlock(roh).header), p);
    }
    if (this.warteschlange.length > 0) this.frageBloecke(p);
  }
  aufInv(p, payload) {
    const eintraege = decodeInv(payload);
    const wunsch = eintraege.filter((e) => e.typ === INV_BLOCK && !this.store.has(e.hash) && !this.offen.has(toHex(e.hash)));
    if (wunsch.length === 0) return;
    for (const w of wunsch) {
      this.offen.set(toHex(w.hash), { peer: p, seit: Date.now() });
    }
    p.send("getdata", encodeGetData(wunsch));
  }
  aufNotFound(p, payload) {
    for (const e of decodeNotFoundSicher(payload)) {
      this.offen.delete(toHex(e.hash));
    }
    const anderer = this.peers.bereite().find((x) => x !== p);
    if (anderer && this.warteschlange.length > 0) this.frageBloecke(anderer);
  }
  /**
   * Abgelaufene Anfragen freigeben.
   *
   * Ein Peer, der nicht liefert, blockiert sonst einen Platz im Fenster --
   * und der Block wuerde nie von jemand anderem geholt.
   */
  pruefeOffene() {
    const jetzt = Date.now();
    let frei = 0;
    for (const [k, a] of [...this.offen]) {
      if (jetzt - a.seit > ANFRAGE_TIMEOUT_MS) {
        this.offen.delete(k);
        frei++;
      }
    }
    if (frei === 0) return;
    this.log(`${frei} Anfragen ohne Antwort freigegeben`);
    const p = this.peers.besterPeer();
    if (p && this.warteschlange.length > 0) this.frageBloecke(p);
  }
};
function decodeNotFoundSicher(b) {
  try {
    return decodeInv(b);
  } catch {
    return [];
  }
}

// src/main.ts
init_params();
init_codec();
var VERSION = "0.2.2";
var GUI_PORT = 8650;
var DEFAULT_NODE_PORT = 8645;
var DEFAULT_P2P_PORT = 8646;
var DEFAULT_SEED = "80.145.155.104:8646";
function defaultDataDir() {
  if (process.platform === "win32") {
    return (0, import_node_path2.join)(process.env.LOCALAPPDATA || (0, import_node_path2.join)((0, import_node_os.homedir)(), "AppData", "Local"), "YSKAR", "Node");
  }
  return (0, import_node_path2.join)((0, import_node_os.homedir)(), ".yskar", "node");
}
function json(res, value, status = 200) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  res.end(body);
}
function html(res, body) {
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 65536) {
        req.destroy();
        reject(new Error("Anfrage zu gro\xDF"));
      }
    });
    req.on("end", () => {
      try {
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Ung\xFCltiges JSON"));
      }
    });
    req.on("error", reject);
  });
}
var NodeCoreApp = class {
  store = null;
  chain = null;
  pool = null;
  mining = null;
  miningServer = null;
  peers = null;
  sync = null;
  guiServer = (0, import_node_http2.createServer)((req, res) => this.handleGui(req, res));
  configured = false;
  running = false;
  startedAt = 0;
  logs = [];
  configPath;
  config;
  constructor() {
    const base = process.platform === "win32" ? (0, import_node_path2.join)(process.env.LOCALAPPDATA || (0, import_node_path2.join)((0, import_node_os.homedir)(), "AppData", "Local"), "YSKAR", "Node Core") : (0, import_node_path2.join)((0, import_node_os.homedir)(), ".yskar", "node-core");
    (0, import_node_fs2.mkdirSync)(base, { recursive: true });
    this.configPath = (0, import_node_path2.join)(base, "config.json");
    this.config = {
      dataDir: defaultDataDir(),
      nodePort: DEFAULT_NODE_PORT,
      p2pPort: DEFAULT_P2P_PORT,
      seed: DEFAULT_SEED
    };
    if ((0, import_node_fs2.existsSync)(this.configPath)) {
      try {
        const saved = JSON.parse((0, import_node_fs2.readFileSync)(this.configPath, "utf8"));
        this.config = { ...this.config, ...saved };
        this.config.dataDir = String(this.config.dataDir || defaultDataDir());
        this.config.nodePort = Number(this.config.nodePort || DEFAULT_NODE_PORT);
        this.config.p2pPort = Number(this.config.p2pPort || DEFAULT_P2P_PORT);
        this.config.seed = String(this.config.seed || "");
        this.configured = true;
      } catch {
        this.log("Konfiguration konnte nicht gelesen werden. Standardwerte werden verwendet.");
      }
    }
  }
  log(text) {
    const line = `[${(/* @__PURE__ */ new Date()).toLocaleTimeString("de-DE")}] ${text}`;
    this.logs.push(line);
    if (this.logs.length > 200) this.logs.shift();
    console.log(line);
  }
  async startGui() {
    await new Promise((resolveGui, reject) => {
      this.guiServer.once("error", reject);
      this.guiServer.listen(GUI_PORT, "127.0.0.1", resolveGui);
    });
    this.log(`GUI erreichbar unter http://127.0.0.1:${GUI_PORT}`);
    this.openBrowser();
  }
  openBrowser() {
    const url = `http://127.0.0.1:${GUI_PORT}/`;
    if (process.platform !== "win32") return;
    const candidates = [
      (0, import_node_path2.join)(process.env.ProgramFiles || "C:\\Program Files", "Microsoft", "Edge", "Application", "msedge.exe"),
      (0, import_node_path2.join)(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe")
    ];
    const edge = candidates.find(import_node_fs2.existsSync);
    if (edge) {
      (0, import_node_child_process.execFile)(edge, [`--app=${url}`, "--new-window"], () => {
      });
    } else {
      (0, import_node_child_process.execFile)("cmd.exe", ["/c", "start", "", url], () => {
      });
    }
  }
  async configure(body) {
    const dataDir = String(body.dataDir || this.config.dataDir).trim();
    const nodePort = Number(body.nodePort || this.config.nodePort);
    const p2pPort = Number(body.p2pPort || this.config.p2pPort);
    const seed = String(body.seed ?? this.config.seed).trim();
    if (!dataDir) throw new Error("Datenordner fehlt.");
    if (!Number.isInteger(nodePort) || nodePort < 1024 || nodePort > 65535) throw new Error("Ung\xFCltiger Node-Port.");
    if (!Number.isInteger(p2pPort) || p2pPort < 1024 || p2pPort > 65535) throw new Error("Ung\xFCltiger P2P-Port.");
    if (nodePort === p2pPort) throw new Error("Node-Port und P2P-Port m\xFCssen unterschiedlich sein.");
    this.config = { dataDir, nodePort, p2pPort, seed };
    (0, import_node_fs2.mkdirSync)(dataDir, { recursive: true });
    (0, import_node_fs2.writeFileSync)(this.configPath, JSON.stringify(this.config, null, 2));
    this.configured = true;
    this.log(`Konfiguration gespeichert. Daten: ${dataDir}`);
  }
  async startNode() {
    if (this.running) return;
    if (!this.configured) throw new Error("Assistent noch nicht abgeschlossen.");
    const db = (0, import_node_path2.join)((0, import_node_path2.resolve)(this.config.dataDir), "chain.db");
    this.store = new ChainStore(db);
    this.chain = new ChainManager(this.store, MAINNET);
    this.pool = new TxPool();
    this.mining = new MiningCoordinator(this.chain, this.store, this.pool, MAINNET);
    this.miningServer = new MiningServer({ chain: this.chain, store: this.store, pool: this.pool, mining: this.mining }, {
      host: "127.0.0.1",
      port: this.config.nodePort,
      params: MAINNET
    });
    this.miningServer.onBlock = (height, hash, address) => {
      this.log(`BLOCK GEFUNDEN #${height} \xB7 ${hash.slice(0, 32)}\u2026 \xB7 ${address.slice(0, 16)}\u2026`);
      this.sync?.kuendigeAn(this.hexToBytes(hash));
    };
    this.miningServer.onFehler = (where, e) => this.log(`Fehler ${where}: ${e.message}`);
    this.miningServer.onUpstream = (result) => this.log(result.ok ? `Block weitergegeben: H\xF6he ${result.hoehe}` : `Block nicht weitergegeben: ${result.grund}`);
    this.peers = new PeerManager({
      params: MAINNET,
      agent: `yskar-node-core/${VERSION}`,
      listenPort: this.config.p2pPort,
      seeds: this.config.seed ? [this.parseSeed(this.config.seed)] : [],
      kette: () => {
        const tip = this.chain.tip();
        return { height: tip?.height ?? -1, chainWork: tip?.chainWork ?? 0n };
      },
      onReady: (p) => {
        this.log(`Peer verbunden: ${p.host}:${p.port} \xB7 H\xF6he ${p.fremdeHoehe()}`);
        this.sync?.aufPeer(p);
      },
      onMessage: (p, frame) => this.sync?.aufNachricht(p, frame),
      onClose: (p, reason) => this.log(`Peer getrennt: ${p.host}:${p.port} \xB7 ${reason}`),
      onLog: (text) => this.log(text)
    });
    this.sync = new SyncManager({
      chain: this.chain,
      store: this.store,
      peers: this.peers,
      params: MAINNET,
      onBlock: (height, hash, from) => {
        this.mining?.invalidate();
        this.log(`Block #${height} von ${from} \xB7 ${hash.slice(0, 32)}\u2026`);
      },
      onLog: (text) => this.log(text)
    });
    await this.peers.start();
    this.sync.start();
    await this.miningServer.listen("127.0.0.1", this.config.nodePort);
    this.running = true;
    this.startedAt = Date.now();
    this.log(`Full Node gestartet \xB7 ${NETWORK} \xB7 P2P :${this.config.p2pPort} \xB7 API :${this.config.nodePort}`);
  }
  parseSeed(seed) {
    const i = seed.lastIndexOf(":");
    if (i < 1) throw new Error(`Seed "${seed}" muss host:port sein.`);
    const port = Number(seed.slice(i + 1));
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Ung\xFCltiger Seed-Port.");
    return { host: seed.slice(0, i), port };
  }
  hexToBytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  async stopNode() {
    if (!this.running) return;
    this.sync?.stop();
    await this.peers?.stop();
    await this.miningServer?.close();
    this.running = false;
    this.log("Full Node gestoppt.");
  }
  status() {
    const tip = this.chain?.tip() ?? null;
    const peers = this.peers?.info() ?? [];
    const state = this.chain?.state();
    const targetHeight = peers.length ? Math.max(...peers.map((p) => p.height)) : null;
    const currentHeight = tip?.height ?? -1;
    const syncing = targetHeight !== null && targetHeight > currentHeight;
    const progress = targetHeight !== null && targetHeight >= 0 ? Math.max(0, Math.min(100, Math.round((currentHeight + 1) / Math.max(1, targetHeight + 1) * 100))) : null;
    return {
      version: VERSION,
      network: NETWORK,
      running: this.running,
      configured: this.configured,
      dataDir: this.config.dataDir,
      nodePort: this.config.nodePort,
      p2pPort: this.config.p2pPort,
      seed: this.config.seed,
      height: tip?.height ?? null,
      nextHeight: currentHeight + 1,
      targetHeight,
      syncProgress: progress,
      syncing,
      tipHash: tip ? toHex(tip.hash) : null,
      chainWork: tip?.chainWork?.toString() ?? "0",
      difficulty: tip?.difficulty?.toString() ?? null,
      blocksStored: this.store?.count() ?? 0,
      tips: this.store?.tips().length ?? 0,
      totalSupply: state ? totalSupply(state).toString() : "0",
      stateRoot: tip && state ? toHex(stateRoot(state)) : null,
      peers: peers.map((p) => ({ host: p.host, port: p.port, direction: p.richtung, height: p.height, chainWork: p.chainWork.toString() })),
      peerCount: peers.length,
      outboundPeers: this.peers?.zahlAus() ?? 0,
      inboundPeers: this.peers?.zahlEin() ?? 0,
      peerBook: this.peers?.buchGroesse() ?? 0,
      syncPending: this.sync?.fehlendeBloecke() ?? 0,
      syncRequests: this.sync?.offeneAnfragen() ?? 0,
      uptimeSeconds: this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1e3) : 0
    };
  }
  recentBlocks(limit = 12) {
    const out = [];
    const tip = this.chain?.tip();
    if (!tip || !this.store) return out;
    const max = Math.min(limit, tip.height + 1);
    for (let i = 0; i < max; i++) {
      const b = this.store.mainAt(tip.height - i);
      if (!b) continue;
      out.push({
        height: b.height,
        hash: toHex(b.hash),
        time: new Date(Number(b.blockTime) * 1e3).toISOString(),
        txCount: b.txCount,
        difficulty: b.difficulty.toString()
      });
    }
    return out;
  }
  async handleGui(req, res) {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/") return html(res, UI);
      if (req.method === "GET" && url.pathname === "/wizard/2") return html(res, UI_WIZARD_2);
      if (req.method === "GET" && url.pathname === "/api/status") return json(res, this.status());
      if (req.method === "GET" && url.pathname === "/api/logs") return json(res, { logs: this.logs });
      if (req.method === "GET" && url.pathname === "/api/blocks") return json(res, { blocks: this.recentBlocks() });
      if (req.method === "POST" && url.pathname === "/api/configure") {
        await this.configure(await readBody(req));
        return json(res, { ok: true, config: this.config });
      }
      if (req.method === "POST" && url.pathname === "/api/start") {
        await this.startNode();
        return json(res, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/api/stop") {
        await this.stopNode();
        return json(res, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/api/shutdown") {
        json(res, { ok: true });
        setTimeout(async () => {
          await this.stopNode();
          this.guiServer.close();
          process.exit(0);
        }, 50).unref();
        return;
      }
      json(res, { error: "not_found" }, 404);
    } catch (e) {
      json(res, { error: e.message }, 400);
    }
  }
};
var UI = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>YSKAR Node Core</title>
<style>
:root{font-family:Inter,Segoe UI,Arial,sans-serif;color:#eef2f8;background:#06080d;--line:#202735;--muted:#8b95a8;--card:#0d1119;--card2:#0a0e15;--accent:#5b8def;--cyan:#22d3ee;--good:#45d483;--warn:#eab65c;--bad:#ff7f8a}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 12% 0%,#121c32 0,#070a10 36%,#05070b 100%)}
button,input,.button{font:inherit}.wrap{width:min(1180px,calc(100% - 32px));margin:28px auto 48px}.top{display:flex;justify-content:space-between;align-items:center;gap:18px;margin-bottom:18px}.brand{font-size:24px;font-weight:760;letter-spacing:.1px}.sub{font-size:12px;color:var(--muted);margin-top:5px}.badge{border:1px solid var(--line);border-radius:999px;padding:8px 12px;color:var(--muted);font-size:12px;white-space:nowrap}.badge.good{color:var(--good);border-color:#245a3d;background:#0a1710}.badge.warn{color:var(--warn);border-color:#5d4920;background:#171207}.card{background:rgba(13,17,25,.94);border:1px solid var(--line);border-radius:16px;padding:22px;box-shadow:0 18px 70px #0007}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.stat{border:1px solid var(--line);border-radius:12px;padding:15px;background:var(--card2);min-width:0}.label{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.09em}.value{font-size:20px;margin-top:8px;font-weight:680;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wide{grid-column:1/-1}.half{grid-column:span 2}.row{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.actions{display:flex;justify-content:space-between;gap:10px;margin-top:22px}.right{justify-content:flex-end}h1{font-size:25px;margin:0 0 8px}h2{font-size:15px;margin:0 0 13px}p{color:#aeb7c7;line-height:1.55}label{display:block;color:#aeb7c7;font-size:13px;margin:15px 0 7px}input{width:100%;padding:11px 12px;border-radius:10px;border:1px solid #2a3040;background:#090d14;color:#eef2f8;outline:none}input:focus{border-color:#466fbe}button,.button{border:0;border-radius:10px;padding:10px 15px;background:var(--accent);color:#fff;font-weight:680;cursor:pointer;text-decoration:none;display:inline-block}button.secondary{background:#151b27;border:1px solid #2a3040}button.danger{background:#32181c;border:1px solid #5b252c;color:#ffb7bd}.hidden{display:none}.muted{color:var(--muted)}.error{color:var(--bad);margin-top:12px}.hint{font-size:12px;color:var(--muted)}.steps{display:flex;gap:8px;margin-bottom:24px}.step{height:4px;flex:1;background:#222938;border-radius:9px}.step.on{background:var(--accent)}
.progress{height:9px;background:#151b25;border-radius:99px;overflow:hidden;border:1px solid #252c39}.progress>i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--accent),var(--cyan));transition:width .4s ease}.syncmeta{display:flex;justify-content:space-between;gap:12px;margin:9px 0 0;font-size:12px;color:var(--muted)}
.table{width:100%;border-collapse:collapse;font-size:12px}.table th{text-align:left;color:var(--muted);font-weight:500;padding:9px 8px;border-bottom:1px solid var(--line)}.table td{padding:10px 8px;border-bottom:1px solid #1b212d}.table tr:last-child td{border-bottom:0}.mono{font-family:Consolas,monospace}.hash{max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pill{font-size:10px;padding:4px 8px;border-radius:999px;background:#13251b;color:var(--good);display:inline-block}.peer{padding:10px 0;border-bottom:1px solid #1c2230;display:flex;justify-content:space-between;gap:12px}.peer:last-child{border-bottom:0}.log{height:220px;overflow:auto;background:#070a10;border:1px solid var(--line);border-radius:10px;padding:12px;font:12px Consolas,monospace;white-space:pre-wrap;color:#b7c0cf}.toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.sectionTitle{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.small{font-size:11px;color:var(--muted)}
@media(max-width:900px){.grid{grid-template-columns:repeat(2,1fr)}.half{grid-column:span 2}}@media(max-width:620px){.wrap{width:min(100% - 18px,1180px);margin-top:14px}.grid{grid-template-columns:1fr}.half,.wide{grid-column:1}.top{align-items:flex-start}.toolbar{align-items:flex-start;flex-direction:column}.hash{max-width:180px}}
</style></head><body><div class="wrap">
<div class="top"><div><div class="brand">YSKAR Node Core</div><div class="sub">Full Node \xB7 Mainnet \xB7 Version 0.2.2</div></div><div id="badge" class="badge">Nicht gestartet</div></div>
<div id="wizard" class="card"><div class="steps"><div class="step on"></div><div class="step"></div><div class="step"></div></div>
<section id="w1"><h1>Willkommen bei YSKAR</h1><p>Dieser Assistent richtet den bestehenden YSKAR Full Node f\xFCr deinen Windows-Test ein. Die Blockchain-, Validierungs- und P2P-Implementierung des Repositories bleibt unver\xE4ndert.</p><p class="hint">Der Standard-Seed zeigt auf deinen bereits getesteten Node #1.</p><div class="actions"><span></span><a class="button" href="/wizard/2">Einrichtung starten</a></div></section>
<section id="w2" class="hidden"><h1>Node konfigurieren</h1><label>Datenordner</label><input id="dataDir"><div class="hint">Hier wird die lokale chain.db gespeichert.</div><label>Node-API-Port (localhost)</label><input id="nodePort" type="number" value="8645"><label>P2P-Port</label><input id="p2pPort" type="number" value="8646"><label>Seed</label><input id="seed" value="80.145.153.251:8646"><div id="err" class="error"></div><div class="actions"><button id="backToWelcomeButton" class="secondary" type="button">Zur\xFCck</button><button id="saveSetupButton" type="button">Weiter</button></div></section>
<section id="w3" class="hidden"><h1>Bereit f\xFCr den Start</h1><p>Der Node startet auf YSKAR Mainnet, \xF6ffnet den P2P-Port und synchronisiert die Kette. Jeder empfangene Block wird vom lokalen Full Node selbst gepr\xFCft.</p><div class="stat"><div class="label">Datenordner</div><div id="confirmData" class="value" style="font-size:14px;word-break:break-all"></div></div><div class="row" style="margin-top:14px"><span class="pill">P2P aktiviert</span><span class="pill">Mainnet</span></div><div class="actions"><button id="backToConfigButton" class="secondary" type="button">Zur\xFCck</button><button id="startNodeButton" type="button">Full Node starten</button></div></section></div>

<div id="dash" class="hidden">
<div class="card" style="margin-bottom:12px"><div class="toolbar"><div><h1>Netzwerk\xFCbersicht</h1><div id="syncText" class="sub">Warte auf Status\u2026</div></div><div class="row"><button id="refreshButton" class="secondary" type="button">Aktualisieren</button><button id="stopNodeButton" class="secondary" type="button">Node stoppen</button><button id="shutdownButton" class="danger" type="button">Programm beenden</button></div></div>
<div class="progress"><i id="progressBar"></i></div><div class="syncmeta"><span id="syncLeft">Synchronisation wird gepr\xFCft\u2026</span><span id="syncPct">\u2014</span></div></div>
<div class="grid">
<div class="stat"><div class="label">Blockh\xF6he</div><div id="height" class="value">\u2014</div></div><div class="stat"><div class="label">Netzwerkziel</div><div id="target" class="value">\u2014</div></div><div class="stat"><div class="label">Peers</div><div id="peers" class="value">\u2014</div></div><div class="stat"><div class="label">Gespeicherte Bl\xF6cke</div><div id="blocks" class="value">\u2014</div></div>
<div class="stat"><div class="label">Chain Work</div><div id="work" class="value">\u2014</div></div><div class="stat"><div class="label">Difficulty</div><div id="difficulty" class="value">\u2014</div></div><div class="stat"><div class="label">P2P</div><div id="p2p" class="value">\u2014</div></div><div class="stat"><div class="label">Uptime</div><div id="uptime" class="value">\u2014</div></div>
<div class="stat half"><div class="sectionTitle"><h2>Verbindungen</h2><span id="peerMeta" class="small"></span></div><div id="peerList" class="muted">Keine verbundenen Peers.</div></div>
<div class="stat half"><div class="sectionTitle"><h2>Lokaler Node</h2><span class="small">Status</span></div><div class="small">Node API</div><div id="api" class="mono" style="margin:4px 0 12px">\u2014</div><div class="small">Datenordner</div><div id="dataPath" class="mono hash" style="margin-top:4px">\u2014</div></div>
<div class="stat wide"><div class="sectionTitle"><h2>Letzte Bl\xF6cke</h2><span id="blockMeta" class="small"></span></div><div style="overflow:auto"><table class="table"><thead><tr><th>H\xF6he</th><th>Hash</th><th>Zeit</th><th>TX</th><th>Difficulty</th></tr></thead><tbody id="blockRows"><tr><td colspan="5" class="muted">Noch keine Daten.</td></tr></tbody></table></div></div>
<div class="stat wide"><div class="sectionTitle"><h2>Node-Log</h2><span class="small">Live</span></div><div id="logs" class="log"></div></div>
</div></div></div>
<script>
const $=id=>document.getElementById(id);let timer=null;
async function api(path,opt){const r=await fetch(path,opt);const b=await r.json();if(!r.ok||b.error)throw new Error(b.error||'Fehler');return b}
function fmt(n){return n===null||n===undefined?'\u2014':Number(n).toLocaleString('de-DE')}
function duration(sec){sec=Number(sec||0);const d=Math.floor(sec/86400);sec%=86400;const h=Math.floor(sec/3600);sec%=3600;const m=Math.floor(sec/60);const s=sec%60;return (d?d+'T ':'')+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')}
async function init(){try{const s=await api('/api/status');$('dataDir').value=s.dataDir;$('nodePort').value=s.nodePort;$('p2pPort').value=s.p2pPort;$('seed').value=s.seed||'';if(s.configured){showStep(3);$('confirmData').textContent=s.dataDir}}catch(e){$('err').textContent=e.message}}
function showStep(n){[1,2,3].forEach(i=>$('w'+i).classList.toggle('hidden',i!==n));document.querySelectorAll('.step').forEach((x,i)=>x.classList.toggle('on',i<n))}
async function saveAndNext(){try{$('err').textContent='';const b=await api('/api/configure',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({dataDir:$('dataDir').value,nodePort:Number($('nodePort').value),p2pPort:Number($('p2pPort').value),seed:$('seed').value})});$('confirmData').textContent=b.config.dataDir;showStep(3)}catch(e){$('err').textContent=e.message}}
async function startNode(){try{await api('/api/start',{method:'POST'});$('wizard').classList.add('hidden');$('dash').classList.remove('hidden');refresh();if(!timer)timer=setInterval(refresh,1500)}catch(e){alert(e.message)}}
async function stopNode(){try{await api('/api/stop',{method:'POST'});refresh()}catch(e){alert(e.message)}}
async function refresh(){try{const s=await api('/api/status');$('badge').textContent=s.running?(s.syncing?'\u25CF Synchronisiere':'\u25CF Node l\xE4uft'):'Nicht gestartet';$('badge').className='badge '+(s.running?(s.syncing?'warn':'good'):'');$('height').textContent=fmt(s.height);$('target').textContent=fmt(s.targetHeight);$('peers').textContent=fmt(s.peerCount);$('blocks').textContent=fmt(s.blocksStored);$('work').textContent=s.chainWork;$('difficulty').textContent=s.difficulty||'\u2014';$('p2p').textContent='0.0.0.0:'+s.p2pPort;$('api').textContent='127.0.0.1:'+s.nodePort;$('uptime').textContent=duration(s.uptimeSeconds);$('dataPath').textContent=s.dataDir;$('peerMeta').textContent=s.outboundPeers+' ausgehend \xB7 '+s.inboundPeers+' eingehend \xB7 Buch '+s.peerBook;$('syncText').textContent=s.running?(s.syncing?'Synchronisiere Blockchain\u2026':'Mainnet \xB7 Synchronisiert \xB7 '+s.peerCount+' Peer'+(s.peerCount===1?'':'s')):'Node gestoppt';$('syncLeft').textContent=s.targetHeight!==null?(s.syncing?(fmt(Math.max(0,s.targetHeight-s.height))+' Bl\xF6cke offen'):'Chain aktuell'):'Warte auf Peer';$('syncPct').textContent=s.syncProgress===null?'\u2014':s.syncProgress+' %';$('progressBar').style.width=(s.syncProgress===null?0:s.syncProgress)+'%';$('peerList').innerHTML=s.peers.length?s.peers.map(p=>'<div class="peer"><span>'+p.host+':'+p.port+' <span class="pill">'+p.direction+'</span></span><span>H\xF6he '+fmt(p.height)+'</span></div>').join(''):'Keine verbundenen Peers.';const b=await api('/api/blocks');$('blockMeta').textContent=b.blocks.length+' angezeigt';$('blockRows').innerHTML=b.blocks.length?b.blocks.map(x=>'<tr><td>'+fmt(x.height)+'</td><td class="mono hash" title="'+x.hash+'">'+x.hash+'</td><td>'+new Date(x.time).toLocaleString('de-DE')+'</td><td>'+fmt(x.txCount)+'</td><td class="mono">'+x.difficulty+'</td></tr>').join(''):'<tr><td colspan="5" class="muted">Noch keine Bl\xF6cke.</td></tr>';const l=await api('/api/logs');$('logs').textContent=l.logs.join('\\n');$('logs').scrollTop=$('logs').scrollHeight}catch(e){$('syncText').textContent='Statusfehler: '+e.message}}
async function shutdown(){if(confirm('YSKAR Node Core wirklich beenden?'))await api('/api/shutdown',{method:'POST'})}
function bindUi(){
  $('backToWelcomeButton').addEventListener('click',()=>showStep(1));
  $('saveSetupButton').addEventListener('click',saveAndNext);
  $('backToConfigButton').addEventListener('click',()=>showStep(2));
  $('startNodeButton').addEventListener('click',startNode);
  $('refreshButton').addEventListener('click',refresh);
  $('stopNodeButton').addEventListener('click',stopNode);
  $('shutdownButton').addEventListener('click',shutdown);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{bindUi();init()});else{bindUi();init()}

</script></body></html>`;
var UI_WIZARD_2 = UI.replace(
  '<section id="w1"><h1>Willkommen bei YSKAR</h1>',
  '<section id="w1" class="hidden"><h1>Willkommen bei YSKAR</h1>'
).replace(
  '<section id="w2" class="hidden"><h1>Node konfigurieren</h1>',
  '<section id="w2"><h1>Node konfigurieren</h1>'
);
var app = new NodeCoreApp();
async function main() {
  await app.startGui();
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
/*! Bundled license information:

@noble/curves/utils.js:
@noble/curves/abstract/modular.js:
@noble/curves/abstract/curve.js:
@noble/curves/abstract/edwards.js:
@noble/curves/ed25519.js:
  (*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@scure/base/index.js:
  (*! scure-base - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/
