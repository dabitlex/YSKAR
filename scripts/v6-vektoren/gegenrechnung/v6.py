"""Unabhaengige Gegenrechnung YSKAR Konsensfassung 6 - nur nach spec/CONSENSUS_V6.md und PROTOCOL.md."""
import hashlib
import json
import os
import struct
import sys

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization

# ---------------------------------------------------------------- Grundlagen (PROTOCOL.md Notation)

def sha256(b): return hashlib.sha256(b).digest()
def sha256d(b): return sha256(sha256(b))
def u8(x): return struct.pack('<B', x)
def u16(x): return struct.pack('<H', x)
def u32(x): return struct.pack('<I', x)
def u64(x):
    x = int(x)
    assert 0 <= x < 2**64
    return struct.pack('<Q', x)

FORK_ID_V6 = 6

# ---------------------------------------------------------------- bech32m (BIP 350)
CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
BECH32M_CONST = 0x2bc830a3

def _polymod(values):
    GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
    chk = 1
    for v in values:
        b = chk >> 25
        chk = (chk & 0x1ffffff) << 5 ^ v
        for i in range(5):
            chk ^= GEN[i] if ((b >> i) & 1) else 0
    return chk

def _hrp_expand(hrp):
    return [ord(x) >> 5 for x in hrp] + [0] + [ord(x) & 31 for x in hrp]

def bech32m_encode(hrp, data5):
    values = _hrp_expand(hrp) + data5
    pm = _polymod(values + [0] * 6) ^ BECH32M_CONST
    chk = [(pm >> 5 * (5 - i)) & 31 for i in range(6)]
    return hrp + '1' + ''.join(CHARSET[d] for d in data5 + chk)

def bech32m_decode(s):
    s = s.lower()
    pos = s.rfind('1')
    hrp, data = s[:pos], [CHARSET.find(c) for c in s[pos + 1:]]
    assert _polymod(_hrp_expand(hrp) + data) == BECH32M_CONST
    return hrp, data[:-6]

def convertbits(data, frombits, tobits, pad=True):
    acc = 0; bits = 0; ret = []; maxv = (1 << tobits) - 1
    for v in data:
        acc = (acc << frombits) | v
        bits += frombits
        while bits >= tobits:
            bits -= tobits
            ret.append((acc >> bits) & maxv)
    if pad:
        if bits:
            ret.append((acc << (tobits - bits)) & maxv)
    else:
        assert bits < frombits and ((acc << (tobits - bits)) & maxv) == 0
    return ret

# ---------------------------------------------------------------- Adressen (4.1-4.3)

def addr_text(hrp, version, program):
    if version == 0:
        assert len(program) == 20
        return bech32m_encode(hrp, convertbits(program, 8, 5))
    assert 1 <= version <= 15
    return bech32m_encode(hrp, [version] + convertbits(program, 8, 5))

def raw_address(version, program):          # 4.3 raw form
    return program if version == 0 else bytes([version]) + program

def wire_address(version, program):         # 4.3 field form "u8 version | program"
    return bytes([version]) + program

# ---------------------------------------------------------------- Schluessel

class Key:
    def __init__(self, secret):
        self.sk = Ed25519PrivateKey.from_private_bytes(secret)
        self.pub = self.sk.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        self.program = sha256(self.pub)[:20]
    def sign(self, msg):
        return self.sk.sign(msg)

# ---------------------------------------------------------------- Skripte (7.1)

def PK(pub): return ('PK', pub)
def HASH(h): return ('HASH', h)
def AFTER(n): return ('AFTER', n)
def BEFORE(n): return ('BEFORE', n)
def THRESH(k, children): return ('THRESH', k, children)

def ser_script(node):
    t = node[0]
    if t == 'PK': return b'\x01' + node[1]
    if t == 'THRESH':
        return b'\x02' + u8(node[1]) + u8(len(node[2])) + b''.join(ser_script(c) for c in node[2])
    if t == 'HASH': return b'\x03' + node[1]
    if t == 'AFTER': return b'\x04' + u32(node[1])
    if t == 'BEFORE': return b'\x05' + u32(node[1])
    raise ValueError

def leaves(node):
    if node[0] == 'THRESH':
        out = []
        for c in node[2]: out += leaves(c)
        return out
    return [node]

# ---------------------------------------------------------------- 7.2 Wohlgeformtheit (Selbstpruefung)

def parse_script(b):
    keys = []
    def parse(i, depth):
        tag = b[i]
        if tag == 1:
            assert depth <= 3; keys.append(b[i+1:i+33]); assert len(b[i+1:i+33]) == 32
            return ('PK', b[i+1:i+33]), i + 33
        if tag == 2:
            assert depth <= 2
            k, n = b[i+1], b[i+2]; assert 1 <= k <= n <= 16
            i += 3; ch = []
            for _ in range(n):
                c, i = parse(i, depth + 1); ch.append(c)
            return ('THRESH', k, ch), i
        if tag == 3:
            assert depth <= 3; return ('HASH', b[i+1:i+33]), i + 33
        if tag in (4, 5):
            assert depth <= 3
            h = struct.unpack('<I', b[i+1:i+5])[0]; assert h >= 1
            return (('AFTER' if tag == 4 else 'BEFORE'), h), i + 5
        raise ValueError('tag')
    assert 1 <= len(b) <= 1024
    node, end = parse(0, 0)
    assert end == len(b)
    assert len(keys) <= 16 and len(set(keys)) == len(keys)
    def needs_key(n):
        if n[0] == 'PK': return True
        if n[0] == 'THRESH':
            return sum(1 for c in n[2] if not needs_key(c)) < n[1]
        return False
    assert needs_key(node)
    return node

# ---------------------------------------------------------------- 7.3 / 7.4 Witness

def build_witness(script_node, sigs, preimages, claims):
    """sigs: pub->sig, preimages: hash->x, claims: set of (tag,height) claimed."""
    out = b''
    for lf in leaves(script_node):
        if lf[0] == 'PK':
            out += (b'\x01' + sigs[lf[1]]) if lf[1] in sigs else b'\x00'
        elif lf[0] == 'HASH':
            out += (b'\x01' + preimages[lf[1]]) if lf[1] in preimages else b'\x00'
        else:
            out += b'\x01' if (lf[0], lf[1]) in claims else b'\x00'
    return out

def evaluate(script_node, witness, sighash, validFrom, validUntil):
    """Gibt True zurueck, wenn die Wurzel erfuellt ist; wirft sonst. Selbstpruefung nach 7.4."""
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    slots = []; i = 0
    for lf in leaves(script_node):
        flag = witness[i]; i += 1
        assert flag in (0, 1), 'bad_witness'
        if flag == 0: slots.append(None); continue
        if lf[0] == 'PK': slots.append(witness[i:i+64]); assert len(slots[-1]) == 64; i += 64
        elif lf[0] == 'HASH': slots.append(witness[i:i+32]); assert len(slots[-1]) == 32; i += 32
        else: slots.append(True)
    assert i == len(witness), 'bad_witness'
    it = iter(slots)
    def ev(n):  # returns (touched, satisfied)
        if n[0] != 'THRESH':
            s = next(it)
            if s is None: return (False, False)
            if n[0] == 'PK':
                try: Ed25519PublicKey.from_public_bytes(n[1]).verify(s, sighash); return (True, True)
                except Exception: return (True, False)
            if n[0] == 'HASH': return (True, sha256(s) == n[1])
            if n[0] == 'AFTER': return (True, validFrom >= n[1])
            if n[0] == 'BEFORE': return (True, validUntil != 0 and validUntil <= n[1])
        res = [ev(c) for c in n[2]]
        t = sum(1 for r in res if r[0])
        if t == 0: return (False, False)
        if t > n[1]: raise ValueError('witness_excess')
        if t < n[1]: raise ValueError('script_unsatisfied')
        return (True, all(r[1] for r in res if r[0]))
    touched, sat = ev(script_node)
    if not sat: raise ValueError('script_unsatisfied')
    return True

# ---------------------------------------------------------------- 6.2 Praeambel

def prefix(chain_id, tx_type, version, flags=0):
    return u8(tx_type) + u32(FORK_ID_V6) + chain_id + u16(version) + u8(flags)

# ---------------------------------------------------------------- 6.3 Transfer v2

def transfer_v2(chain_id, sender, to_wire, amount, fee, nonce, vf, vu, memo):
    assert len(memo) <= 32
    body = sender.program + to_wire + u64(amount) + u64(fee) + u64(nonce) + u32(vf) + u32(vu) + u8(len(memo)) + memo
    pre = prefix(chain_id, 1, 2) + body
    sh = sha256d(pre)
    sig = sender.sign(sh)
    wire = u16(2) + u8(1) + u8(0) + body + sender.pub + sig
    assert int(fee) >= len(wire)
    return dict(preimage=pre, sighash=sh, signatur=sig, leitung=wire, txid=sha256d(wire))

# ---------------------------------------------------------------- 6.4 Batch

def batch(chain_id, sender, outputs, fee, nonce, vf, vu, memo):
    """outputs: list of (wire_addr, amount); sorted by wire_addr bytes (6.4)."""
    outs = sorted(outputs, key=lambda o: o[0])
    for a, b in zip(outs, outs[1:]): assert a[0] < b[0]
    body = sender.program + u16(len(outs)) + b''.join(a + u64(v) for a, v in outs) \
        + u64(fee) + u64(nonce) + u32(vf) + u32(vu) + u8(len(memo)) + memo
    pre = prefix(chain_id, 3, 1) + body
    sh = sha256d(pre)
    sig = sender.sign(sh)
    wire = u16(1) + u8(3) + u8(0) + body + sender.pub + sig
    assert int(fee) >= len(wire)
    return dict(outs=outs, preimage=pre, sighash=sh, signatur=sig, leitung=wire, txid=sha256d(wire))

# ---------------------------------------------------------------- 6.5 Script spend

def script_spend(chain_id, script_node, to_wire, amount, fee, nonce, vf, vu, memo, signers, preimages, claims):
    script = ser_script(script_node)
    parse_script(script)
    frm = sha256(script)
    body = frm + to_wire + u64(amount) + u64(fee) + u64(nonce) + u32(vf) + u32(vu) + u8(len(memo)) + memo \
        + u16(len(script)) + script
    pre = prefix(chain_id, 2, 1) + body
    sh = sha256d(pre)
    sigs = {k.pub: k.sign(sh) for k in signers}
    wit = build_witness(script_node, sigs, preimages, claims)
    evaluate(script_node, wit, sh, vf, vu)
    wire = u16(1) + u8(2) + u8(0) + body + wit
    assert int(fee) >= len(wire)
    return dict(preimage=pre, sighash=sh, witness=wit, leitung=wire, txid=sha256d(wire))

# ---------------------------------------------------------------- 5.1 / 5.2 Zustand

def record(balance, nonce):
    return u8(1) + u64(balance) + u64(nonce) + bytes(32) + bytes(32)

def bit(key, d):
    return (key[d // 8] >> (7 - (d % 8))) & 1

def smt_hash(d, items):  # items: list of (key, rec)
    if not items: return bytes(32)
    if len(items) == 1:
        k, r = items[0]
        return sha256d(b'\x00' + k + r)
    s0 = [x for x in items if bit(x[0], d) == 0]
    s1 = [x for x in items if bit(x[0], d) == 1]
    return sha256d(b'\x01' + smt_hash(d + 1, s0) + smt_hash(d + 1, s1))

def state_root(accounts):  # accounts: list of (raw_address, balance, nonce)
    items = [(sha256(raw), record(b, n)) for raw, b, n in accounts if not (int(b) == 0 and int(n) == 0)]
    return smt_hash(0, items)
