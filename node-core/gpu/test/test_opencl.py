"""
Prueft den OpenCL-Kernel von yskar-opencl gegen hashlib -- ohne eine Zeile
gemeinsamen Codes.

Der Kernel-Quelltext ist derselbe, den yskar-opencl dem Treiber gibt
(gpu/opencl-quelle.mjs: yskar_sha256.h + yskar_opencl.cl). Gerechnet wird
auf jedem OpenCL-Geraet, das der Rechner hat -- ohne Grafikkarte etwa mit
der CPU-Laufzeit PoCL:

    pip install pyopencl pocl-binary-distribution
    python3 gpu/test/test_opencl.py

Geprueft wird wie in test/sha-vektoren.test.ts:
  - der Hash von 2.500 zufaelligen Headern und Nonces, bitgenau,
  - der Zielvergleich an der Grenze (Ziel = Hash, ein Schritt darueber und
    darunter, zufaellige Ziele, Ziele mit fuehrenden Nullen),
  - dass ein voller Stapel jede Nonce genau einmal prueft (Treffer an einer
    bekannten Stelle wird gefunden, auch am Ende des Stapels).

Der Midstate entsteht hier mit einer eigenen, getrennt geschriebenen
SHA-256-Kompression in Python und wird gegen hashlib abgesichert.
"""
import hashlib
import os
import struct
import subprocess
import sys

import numpy as np
import pyopencl as cl

HIER = os.path.dirname(os.path.abspath(__file__))
GPU = os.path.dirname(HIER)

K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]
M = 0xFFFFFFFF


def rotr(x, n):
    return ((x >> n) | (x << (32 - n))) & M


def kompression(s, block):
    w = list(struct.unpack('>16I', block))
    for i in range(16, 64):
        s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3)
        s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10)
        w.append((w[i - 16] + s0 + w[i - 7] + s1) & M)
    a, b, c, d, e, f, g, h = s
    for i in range(64):
        t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) & M
        t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) & M
        h, g, f, e, d, c, b, a = g, f, e, (d + t1) & M, c, b, a, (t1 + t2) & M
    return [(x + y) & M for x, y in zip(s, [a, b, c, d, e, f, g, h])]


INIT = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]


def midstate(header):
    return kompression(kompression(INIT, header[:64]), header[64:128])


def sha256d(b):
    return hashlib.sha256(hashlib.sha256(b).digest()).digest()


def ziel_woerter(z):
    return np.array(struct.unpack('>8I', z), dtype=np.uint32)


def main():
    subprocess.run(['node', os.path.join(GPU, 'opencl-quelle.mjs')], check=True, stdout=subprocess.DEVNULL)
    with open(os.path.join(GPU, 'yskar_sha256.h')) as f1, open(os.path.join(GPU, 'yskar_opencl.cl')) as f2:
        quelle = f1.read() + '\n' + f2.read()

    # Selbstpruefung der Python-Kompression: sha256 ueber 128 Byte = Midstate + Polsterblock.
    probe = os.urandom(128)
    pol = b'\x80' + b'\x00' * 55 + struct.pack('>Q', 1024)
    assert struct.pack('>8I', *kompression(midstate(probe), pol)) == hashlib.sha256(probe).digest()

    geraete = [d for p in cl.get_platforms() for d in p.get_devices()]
    if not geraete:
        print('Kein OpenCL-Geraet -- Pruefung uebersprungen')
        return 0
    gesamt_fehler = 0
    for dev in geraete:
        ctx = cl.Context([dev])
        q = cl.CommandQueue(ctx)
        prg = cl.Program(ctx, quelle).build()
        kern = cl.Kernel(prg, 'yskar_kernel')
        einzel = cl.Kernel(prg, 'yskar_einzel')
        mf = cl.mem_flags
        mid_b = cl.Buffer(ctx, mf.READ_ONLY, 32)
        ziel_b = cl.Buffer(ctx, mf.READ_ONLY, 32)
        tref_b = cl.Buffer(ctx, mf.READ_WRITE, 12)
        aus_b = cl.Buffer(ctx, mf.READ_WRITE, 32)
        null3 = np.zeros(3, dtype=np.uint32)

        def eine(basis, iters, global_):
            cl.enqueue_copy(q, tref_b, null3)
            kern.set_args(np.uint64(basis), np.uint32(iters), mid_b, ziel_b, tref_b)
            cl.enqueue_nd_range_kernel(q, kern, (global_,), None)
            t = np.zeros(3, dtype=np.uint32)
            cl.enqueue_copy(q, t, tref_b)
            q.finish()
            return (int(t[2]) << 32 | int(t[1])) if t[0] else None

        fehler = 0
        faelle = 0
        besondere = [0, 1, 0xff, 0x100, 0xffffffff, 0x100000000, 0xffffffffffffffff, 50773796]
        for i in range(2500):
            header = os.urandom(136)
            nonce = besondere[i] if i < len(besondere) else int.from_bytes(os.urandom(8), 'little')
            voll = header[:128] + struct.pack('<Q', nonce)
            soll = sha256d(voll)
            mid = np.array(midstate(header), dtype=np.uint32)
            cl.enqueue_copy(q, mid_b, mid)

            ist = np.zeros(32, dtype=np.uint8)
            einzel.set_args(np.uint64(nonce), mid_b, aus_b)
            cl.enqueue_nd_range_kernel(q, einzel, (1,), (1,))
            cl.enqueue_copy(q, ist, aus_b)
            q.finish()
            if bytes(ist) != soll:
                fehler += 1
                print(f'  Hash falsch: nonce={nonce} ist={bytes(ist).hex()} soll={soll.hex()}')
                continue

            ziele = [os.urandom(32), soll]
            stelle = i % 32
            hoeher, tiefer = bytearray(soll), bytearray(soll)
            if hoeher[stelle] < 0xff:
                hoeher[stelle] += 1
                ziele.append(bytes(hoeher))
            if tiefer[stelle] > 0:
                tiefer[stelle] -= 1
                ziele.append(bytes(tiefer))
            echt = bytearray(32)
            echt[3 + (i % 4)] = 1 + (i % 250)
            ziele.append(bytes(echt))
            for z in ziele:
                cl.enqueue_copy(q, ziel_b, ziel_woerter(z))
                treffer = eine(nonce, 1, 1)
                erwartet = soll <= z
                faelle += 1
                if (treffer == nonce) != erwartet or (treffer is not None and treffer != nonce):
                    fehler += 1
                    print(f'  Zielvergleich falsch: nonce={nonce} ziel={z.hex()} treffer={treffer}')

        # Voller Stapel: jede Nonce genau einmal. Ziel = Hash einer bekannten
        # Nonce; jede andere Nonce mit kleinerem Hash waere auch ein Treffer,
        # deshalb nehmen wir die kleinste Nonce des Bereichs mit Hash <= Ziel.
        global_, iters, basis = 64, 8, 1000
        header = os.urandom(136)
        cl.enqueue_copy(q, mid_b, np.array(midstate(header), dtype=np.uint32))
        hashes = {n: sha256d(header[:128] + struct.pack('<Q', n)) for n in range(basis, basis + global_ * iters)}
        for stelle in [basis, basis + 17, basis + global_ * iters - 1]:
            z = hashes[stelle]
            treffer_moeglich = {n for n, h in hashes.items() if h <= z}
            cl.enqueue_copy(q, ziel_b, ziel_woerter(z))
            t = eine(basis, iters, global_)
            faelle += 1
            if t not in treffer_moeglich:
                fehler += 1
                print(f'  Stapel: Treffer {t} nicht unter {sorted(treffer_moeglich)[:5]}')
        nach = basis + global_ * iters
        cl.enqueue_copy(q, ziel_b, ziel_woerter(sha256d(header[:128] + struct.pack('<Q', nach))))
        t = eine(basis, iters, global_)
        if t is not None and t >= nach:
            fehler += 1
            print(f'  Stapel: Nonce {t} ausserhalb des Bereichs geprueft')

        print(f'{dev.name}: 2500 Hashes, {faelle} Zielvergleiche, {fehler} Fehler')
        gesamt_fehler += fehler
    return 1 if gesamt_fehler else 0


if __name__ == '__main__':
    sys.exit(main())
