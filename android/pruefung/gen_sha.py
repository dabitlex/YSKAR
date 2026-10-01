#!/usr/bin/env python3
"""
Erzeugt die ausgerollten Kompressionen fuer Sha256d.java.

Wie die WASM-Engine (wasm/gen_wat.py): 64 Runden ausgerollt, Zustand in
lokalen Variablen, kein Umkopieren zwischen den Runden. Zusaetzlich werden
konstante Teile des Message Schedule vorab gefaltet: Im dritten Block sind
nur die beiden Nonce-Woerter variabel, im zweiten Hash nur die acht
Digest-Woerter -- alles andere ist Padding und steht fest.

Aufruf: python3 gen_sha.py > ../app/src/main/java/net/yskar/wallet/Sha256dKern.java
"""
K = [
 0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
 0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
 0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
 0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
 0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
 0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
 0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
 0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]
M = 0xffffffff
def rotr(x, n): return ((x >> n) | (x << (32 - n))) & M
def s0c(x): return rotr(x,7) ^ rotr(x,18) ^ (x >> 3)
def s1c(x): return rotr(x,17) ^ rotr(x,19) ^ (x >> 10)
def lit(v):
    v &= M
    return '0x%08x' % v if v < 0x80000000 else '0x%08x' % v  # Java int-Literal in Hex ist vorzeichenlos zulaessig

def schedule(w):
    """w: Liste mit int (Konstante) oder str (Variable). Liefert 64 Eintraege + Code."""
    code = []
    w = list(w)
    for i in range(16, 64):
        a, b, c, d = w[i-15], w[i-2], w[i-16], w[i-7]
        if all(isinstance(x, int) for x in (a, b, c, d)):
            w.append((c + s0c(a) + d + s1c(b)) & M)
            continue
        teile = []
        konst = 0
        if isinstance(c, int): konst += c
        else: teile.append(c)
        if isinstance(d, int): konst += d
        else: teile.append(d)
        if isinstance(a, int): konst += s0c(a)
        else: teile.append(f'(Integer.rotateRight({a}, 7) ^ Integer.rotateRight({a}, 18) ^ ({a} >>> 3))')
        if isinstance(b, int): konst += s1c(b)
        else: teile.append(f'(Integer.rotateRight({b}, 17) ^ Integer.rotateRight({b}, 19) ^ ({b} >>> 10))')
        konst &= M
        if konst: teile.append(lit(konst))
        name = f'w{i}'
        code.append(f'        final int {name} = {" + ".join(teile)};')
        w.append(name)
    return w, code

def runden(w, ein, aus):
    """ein: 8 Ausdruecke fuer a..h; aus: Funktion, die die 8 Endwerte (inkl. Addition) schreibt."""
    code = []
    n = 0
    v = list(ein)  # aktuelle Namen fuer a..h
    for i in range(64):
        a, b, c, d, e, f, g, h = v
        kw = (K[i] + w[i]) & M if isinstance(w[i], int) else None
        kterm = lit(kw) if kw is not None else f'{lit(K[i])} + {w[i]}'
        t1 = f't1_{i}'
        code.append(f'        final int {t1} = {h} + (Integer.rotateRight({e}, 6) ^ Integer.rotateRight({e}, 11) ^ Integer.rotateRight({e}, 25)) + (({e} & {f}) ^ (~{e} & {g})) + {kterm};')
        ne, na = f'e{i}', f'a{i}'
        code.append(f'        final int {ne} = {d} + {t1};')
        code.append(f'        final int {na} = {t1} + (Integer.rotateRight({a}, 2) ^ Integer.rotateRight({a}, 13) ^ Integer.rotateRight({a}, 22)) + (({a} & {b}) ^ ({a} & {c}) ^ ({b} & {c}));')
        v = [na, a, b, c, ne, e, f, g]
    return code, v

GRUPPE = 16

def gruppe(w, i0, n):
    """n Runden ab i0; Zustand a..h aus z[] lesen und zurueckschreiben."""
    code = ['        int a = z[0], b = z[1], c = z[2], d = z[3], e = z[4], f = z[5], g = z[6], h = z[7];']
    v = ['a','b','c','d','e','f','g','h']
    for i in range(i0, i0 + n):
        a, b, c, d, e, f, g, h = v
        if isinstance(w[i], int):
            kterm = lit((K[i] + w[i]) & M)
        elif w[i].startswith('w') and w[i][1:].isdigit() and int(w[i][1:]) >= 16:
            kterm = f'{lit(K[i])} + w[{int(w[i][1:])}]'
        else:
            kterm = f'{lit(K[i])} + {w[i]}'
        t1 = f't{i}'
        code.append(f'        final int {t1} = {h} + (Integer.rotateRight({e}, 6) ^ Integer.rotateRight({e}, 11) ^ Integer.rotateRight({e}, 25)) + (({e} & {f}) ^ (~{e} & {g})) + {kterm};')
        ne, na = f'e{i}', f'a{i}'
        code.append(f'        final int {ne} = {d} + {t1};')
        code.append(f'        final int {na} = {t1} + (Integer.rotateRight({a}, 2) ^ Integer.rotateRight({a}, 13) ^ Integer.rotateRight({a}, 22)) + (({a} & {b}) ^ ({a} & {c}) ^ ({b} & {c}));')
        v = [na, a, b, c, ne, e, f, g]
    for k, x in enumerate(v):
        code.append(f'        z[{k}] = {x};')
    return code

def sched_code(w, eingang):
    """Schedule w16..w63 ins Array w[] schreiben; Variablen aus Eingang/Array."""
    w2, code = schedule(w)
    # Namen w16.. stehen im Array; lokale Ausdruecke ersetzen
    zeilen = []
    for z in code:
        name = z.split('final int ')[1].split(' =')[0]
        ausdruck = z.split(' = ', 1)[1].rstrip(';')
        zeilen.append(f'        final int {name} = {ausdruck};')
        zeilen.append(f'        w[{name[1:]}] = {name};')
    # Konstante Eintraege ab 16 ebenfalls ins Array (falls von Runden gebraucht -- werden gefaltet, also nicht)
    return w2, zeilen

out = []
out.append('package net.yskar.wallet;')
out.append('')
out.append('/**')
out.append(' * ERZEUGT von android/pruefung/gen_sha.py -- nicht von Hand aendern.')
out.append(' *')
out.append(' * Die zwei Kompressionen je Nonce: Runden ausgerollt, konstante Teile')
out.append(' * des Message Schedule gefaltet. In Gruppen zu 16 Runden aufgeteilt, damit')
out.append(' * jede Methode klein genug bleibt, dass der JIT sie uebersetzt -- eine')
out.append(' * einzige riesige Methode laeuft sonst im Interpreter, 40-mal langsamer')
out.append(' * (gemessen). Geprueft in android/pruefung/ShaPruefung.java.')
out.append(' */')
out.append('final class Sha256dKern {')
out.append('    private Sha256dKern() {}')
out.append('')

# ---- Block 3
w3 = ['w0', 'w1', 0x80000000] + [0]*12 + [1088]
w3full, sc = sched_code(w3, None)
out.append('    private static void plan3(final int w0, final int w1, final int[] w) {')
out += sc
out.append('    }')
for g in range(0, 64, GRUPPE):
    out.append(f'    private static void r3_{g}(final int w0, final int w1, final int[] w, final int[] z) {{')
    out += gruppe(w3full, g, GRUPPE)
    out.append('    }')
out.append('')
out.append('    /** Dritter Block auf den Midstate: erster Hash nach z. w ist Arbeitsspeicher (64). */')
out.append('    static void block3(final int[] mid, final int w0, final int w1, final int[] w, final int[] z) {')
out.append('        plan3(w0, w1, w);')
out.append('        System.arraycopy(mid, 0, z, 0, 8);')
for g in range(0, 64, GRUPPE):
    out.append(f'        r3_{g}(w0, w1, w, z);')
out.append('        for (int i = 0; i < 8; i++) z[i] += mid[i];')
out.append('    }')
out.append('')

# ---- Zweiter Hash: w0..w7 aus s[]
IV = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]
w2 = ['s[0]','s[1]','s[2]','s[3]','s[4]','s[5]','s[6]','s[7]', 0x80000000, 0,0,0,0,0,0, 256]
# schedule() erwartet Variablennamen; s[i] als Ausdruck funktioniert genauso
w2full, sc2 = sched_code(w2, None)
out.append('    private static void plan2(final int[] s, final int[] w) {')
out += sc2
out.append('    }')
for g in range(0, 64, GRUPPE):
    out.append(f'    private static void r2_{g}(final int[] s, final int[] w, final int[] z) {{')
    out += gruppe(w2full, g, GRUPPE)
    out.append('    }')
out.append('')
out.append('    /** Zweiter Hash ueber die 32 Byte aus s: Ergebnis nach o. */')
out.append('    static void zweiter(final int[] s, final int[] w, final int[] o) {')
out.append('        plan2(s, w);')
for i, x in enumerate(IV):
    out.append(f'        o[{i}] = {lit(x)};')
for g in range(0, 64, GRUPPE):
    out.append(f'        r2_{g}(s, w, o);')
for i, x in enumerate(IV):
    out.append(f'        o[{i}] += {lit(x)};')
out.append('    }')
out.append('}')
print('\n'.join(out))
