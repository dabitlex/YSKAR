#!/usr/bin/env python3
"""
Erzeugt sha256d_miner.wat -- die PoW-Engine fuer das Mining-Projekt.

Aufbau:
  - SHA-256 Kompressionsfunktion, 64 Runden vollstaendig entrollt,
    Zustand und Message Schedule in Locals (kein Speicherverkehr im Rundenkern)
  - Midstate: der erste 64-Byte-Block des Headers ist pro Job konstant und
    wird einmal in init_job() komprimiert. Pro Nonce bleiben 2 statt 3
    Kompressionen.
  - mine() laeuft vollstaendig in WASM, ein Aufruf deckt viele Nonces ab.

Header: 116 Byte, Nonce als u64 LE an Offset 108.
        -> Block 1 = Byte 0..64 (konstant), Block 2 = Byte 64..116 + Padding
        -> Nonce liegt in Block 2 an Offset 44

Hash-Konvention: der finale Digest wird als Big-Endian-Zahl gelesen und
byteweise gegen das Target verglichen. Gueltig ist hash <= target.

Speicherlayout:
    0   Header (116 B)                 von JS geschrieben
  128   Midstate (32 B, BE)            von init_job berechnet
  160   Block 2 (64 B)                 Nonce an 204
  256   Block 3 (64 B)                 hash1 an 256..288 + Padding
  320   Finaler Hash (32 B, BE)
  352   Target (32 B, BE)              von JS geschrieben
  384   Gefundene Nonce (i32)
"""

K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]


def s32(x):
    """i32.const erwartet einen vorzeichenbehafteten Wert."""
    x &= 0xFFFFFFFF
    return x - 0x100000000 if x >= 0x80000000 else x


def bswap(x):
    return ((x & 0xFF) << 24) | ((x & 0xFF00) << 8) | \
           ((x >> 8) & 0xFF00) | ((x >> 24) & 0xFF)


def swap_local(name):
    """Byte-Reihenfolge eines i32 in einem Local umdrehen."""
    return (f"(i32.or "
            f"(i32.and (i32.rotl (local.get {name}) (i32.const 8)) "
            f"(i32.const {s32(0x00FF00FF)})) "
            f"(i32.and (i32.rotl (local.get {name}) (i32.const 24)) "
            f"(i32.const {s32(0xFF00FF00)})))")


def xor3(a, b, c):
    return f"(i32.xor (i32.xor {a} {b}) {c})"


def rotr(x, n):
    return f"(i32.rotr {x} (i32.const {n}))"


def shr(x, n):
    return f"(i32.shr_u {x} (i32.const {n}))"


def gen_compress():
    L = []
    a = L.append
    a("  ;; Ein SHA-256 Kompressionsschritt.")
    a("  ;; $sp: Zustand (8 Woerter, Big-Endian im Speicher), wird gelesen und")
    a("  ;;      wieder zurueckgeschrieben. $dp: 64 Byte Eingabeblock.")
    a("  (func $compress (param $sp i32) (param $dp i32)")
    for i in range(8):
        a(f"    (local $v{i} i32)")
    for i in range(64):
        a(f"    (local $w{i} i32)")
    a("    (local $t1 i32) (local $t2 i32) (local $tmp i32)")

    a("    ;; Message Schedule, Woerter 0..15 aus dem Block (BE)")
    for i in range(16):
        a(f"    (local.set $tmp (i32.load offset={i*4} (local.get $dp)))")
        a(f"    (local.set $w{i} {swap_local('$tmp')})")

    a("    ;; Message Schedule, Woerter 16..63")
    for i in range(16, 64):
        s0 = xor3(rotr(f"(local.get $w{i-15})", 7),
                  rotr(f"(local.get $w{i-15})", 18),
                  shr(f"(local.get $w{i-15})", 3))
        s1 = xor3(rotr(f"(local.get $w{i-2})", 17),
                  rotr(f"(local.get $w{i-2})", 19),
                  shr(f"(local.get $w{i-2})", 10))
        a(f"    (local.set $w{i} (i32.add (i32.add (i32.add "
          f"(local.get $w{i-16}) {s0}) (local.get $w{i-7})) {s1}))")

    a("    ;; Zustand laden (BE -> nativ)")
    for i in range(8):
        a(f"    (local.set $tmp (i32.load offset={i*4} (local.get $sp)))")
        a(f"    (local.set $v{i} {swap_local('$tmp')})")

    # m[0..7] bildet a..h auf Local-Indizes ab
    m = list(range(8))
    a("    ;; 64 Runden, entrollt; die Rollen a..h rotieren ueber die Locals")
    for i in range(64):
        A, B, C, D = f"$v{m[0]}", f"$v{m[1]}", f"$v{m[2]}", f"$v{m[3]}"
        E, F, G, H = f"$v{m[4]}", f"$v{m[5]}", f"$v{m[6]}", f"$v{m[7]}"
        S1 = xor3(rotr(f"(local.get {E})", 6),
                  rotr(f"(local.get {E})", 11),
                  rotr(f"(local.get {E})", 25))
        ch = (f"(i32.xor (i32.and (local.get {E}) (local.get {F})) "
              f"(i32.and (i32.xor (local.get {E}) (i32.const -1)) "
              f"(local.get {G})))")
        a(f"    (local.set $t1 (i32.add (i32.add (i32.add (i32.add "
          f"(local.get {H}) {S1}) {ch}) (i32.const {s32(K[i])})) "
          f"(local.get $w{i})))")
        S0 = xor3(rotr(f"(local.get {A})", 2),
                  rotr(f"(local.get {A})", 13),
                  rotr(f"(local.get {A})", 22))
        maj = (f"(i32.xor (i32.xor "
               f"(i32.and (local.get {A}) (local.get {B})) "
               f"(i32.and (local.get {A}) (local.get {C}))) "
               f"(i32.and (local.get {B}) (local.get {C})))")
        a(f"    (local.set $t2 (i32.add {S0} {maj}))")
        # d wird zu e, h wird zu a; alles andere rutscht eine Position weiter
        a(f"    (local.set {D} (i32.add (local.get {D}) (local.get $t1)))")
        a(f"    (local.set {H} (i32.add (local.get $t1) (local.get $t2)))")
        m = [m[7], m[0], m[1], m[2], m[3], m[4], m[5], m[6]]

    a("    ;; Zustand addieren und wieder als BE ablegen")
    for i in range(8):
        a(f"    (local.set $tmp (i32.load offset={i*4} (local.get $sp)))")
        a(f"    (local.set $tmp (i32.add {swap_local('$tmp')} "
          f"(local.get $v{m[i]})))")
        a(f"    (i32.store offset={i*4} (local.get $sp) "
          f"{swap_local('$tmp')})")
    a("  )")
    return L


def gen_init_job():
    L = []
    a = L.append
    a("  ;; Bereitet einen Job vor: Midstate aus Block 1, Block 2 mit Padding,")
    a("  ;; Block 3 mit Padding fuer den zweiten Hash.")
    a("  (func $init_job (export \"init_job\")")
    a("    (local $i i32)")
    a("    ;; IV nach 128 schreiben, dann Block 1 des Headers komprimieren")
    for i in range(8):
        a(f"    (i32.store offset={128+i*4} (i32.const 0) "
          f"(i32.const {s32(bswap(IV[i]))}))")
    a("    (call $compress (i32.const 128) (i32.const 0))")
    a("    ;; Header-Byte 64..116 nach Block 2 (160..212)")
    for off in range(0, 48, 8):
        a(f"    (i64.store offset={160+off} (i32.const 0) "
          f"(i64.load offset={64+off} (i32.const 0)))")
    a("    (i32.store offset=208 (i32.const 0) "
      "(i32.load offset=112 (i32.const 0)))")
    a("    ;; Padding Block 2: 0x80, Nullen, Laenge 928 Bit")
    a("    (i64.store offset=212 (i32.const 0) (i64.const 0))")
    a(f"    (i32.store offset=220 (i32.const 0) "
      f"(i32.const {s32(bswap(116*8))}))")
    a("    (i32.store8 offset=212 (i32.const 0) (i32.const 128))")
    a("    ;; Padding Block 3: 0x80, Nullen, Laenge 256 Bit")
    for off in (288, 296, 304, 312):
        a(f"    (i64.store offset={off} (i32.const 0) (i64.const 0))")
    a(f"    (i32.store offset=316 (i32.const 0) "
      f"(i32.const {s32(bswap(256))}))")
    a("    (i32.store8 offset=288 (i32.const 0) (i32.const 128))")
    a("  )")
    return L


def gen_mine():
    L = []
    a = L.append
    a("  ;; Durchlaeuft $iters Nonces ab $start. Liefert 1, wenn ein Hash")
    a("  ;; das Target erfuellt (Nonce steht dann an Adresse 384), sonst 0.")
    a("  (func $mine (export \"mine\") (param $start i32) (param $iters i32) "
      "(result i32)")
    a("    (local $n i32) (local $i i32) (local $t1 i32) (local $t2 i32)")
    a("    (local.set $n (local.get $start))")
    a("    (block $done")
    a("      (loop $next")
    a("        (br_if $done (i32.ge_u (local.get $i) (local.get $iters)))")
    a("        (i32.store offset=204 (i32.const 0) (local.get $n))")
    a("        ;; Midstate als Startzustand des zweiten Blocks")
    for off in range(0, 32, 8):
        a(f"        (i64.store offset={256+off} (i32.const 0) "
          f"(i64.load offset={128+off} (i32.const 0)))")
    a("        (call $compress (i32.const 256) (i32.const 160))")
    a("        ;; zweiter SHA-256 ueber den ersten Digest")
    for i in range(8):
        a(f"        (i32.store offset={320+i*4} (i32.const 0) "
          f"(i32.const {s32(bswap(IV[i]))}))")
    a("        (call $compress (i32.const 320) (i32.const 256))")
    a("        ;; hash <= target ? (byteweise Big-Endian)")
    a("        (block $nf")
    a("          (block $fd")
    for i in range(8):
        a(f"            (local.set $t1 (i32.load offset={320+i*4} "
          f"(i32.const 0)))")
        a(f"            (local.set $t1 {swap_local('$t1')})")
        a(f"            (local.set $t2 (i32.load offset={352+i*4} "
          f"(i32.const 0)))")
        a(f"            (local.set $t2 {swap_local('$t2')})")
        a("            (br_if $fd (i32.lt_u (local.get $t1) "
          "(local.get $t2)))")
        a("            (br_if $nf (i32.gt_u (local.get $t1) "
          "(local.get $t2)))")
    a("            (br $fd)")
    a("          )")
    a("          (i32.store offset=384 (i32.const 0) (local.get $n))")
    a("          (return (i32.const 1))")
    a("        )")
    a("        (local.set $n (i32.add (local.get $n) (i32.const 1)))")
    a("        (local.set $i (i32.add (local.get $i) (i32.const 1)))")
    a("        (br $next)")
    a("      )")
    a("    )")
    a("    (i32.const 0)")
    a("  )")
    return L


def main():
    out = ["(module", "  (memory (export \"memory\") 1)"]
    out += gen_compress()
    out += gen_init_job()
    out += gen_mine()
    out.append(")")
    with open("sha256d_miner.wat", "w") as f:
        f.write("\n".join(out) + "\n")
    print(f"sha256d_miner.wat geschrieben, {len(out)} Zeilen")


if __name__ == "__main__":
    main()
