"""Berechnet arbeit/ergebnis.json aus eingaben.json.

Aufruf: python3 rechnen.py [rfc8032|slip10]
  rfc8032 (Standard): 'geheim' ist direkt der 32-Byte-Ed25519-Privatschluessel (RFC 8032 seed).
  slip10            : 'geheim' wird wie keypairFromSeed in Abschnitt 14 behandelt (32 Byte als Seed,
                      SLIP-0010 m/44'/9077'/0'/0'/0') - Variante, siehe Annahmen.
"""
import json, os, sys
from v6 import *
from slip10 import slip10_ed25519

mode = sys.argv[1] if len(sys.argv) > 1 else 'rfc8032'
here = os.path.dirname(os.path.abspath(__file__))
FIXTURE = os.path.join(here, '..', '..', '..', 'tests', 'fixtures', 'v6-vektoren.json')
E = json.load(open(FIXTURE))['eingaben']

cid = bytes.fromhex(E['netz']['chainId'])
assert cid == sha256(E['netz']['name'].encode('ascii'))
assert E['forkId'] == FORK_ID_V6

keys = {}
for name, v in E['schluessel'].items():
    s = bytes.fromhex(v['geheim'])
    keys[name] = Key(s if mode == 'rfc8032' else slip10_ed25519(s))

out = {'schluessel': {}, 'skripte': {}}
for name, k in keys.items():
    out['schluessel'][name] = dict(oeffentlich=k.pub.hex(), rohadresse=k.program.hex(),
                                  textMainnet=addr_text('ysr', 0, k.program),
                                  textRegtest=addr_text('rysr', 0, k.program))

# Skripte
ms = THRESH(2, [PK(p) for p in sorted([keys['alice'].pub, keys['bob'].pub, keys['carol'].pub])])
secret = bytes.fromhex(E['skripte']['htlc']['geheimnis'])
assert len(secret) == 32
h = sha256(secret)
htlc = THRESH(1, [THRESH(2, [PK(keys['bob'].pub), HASH(h)]),
                  THRESH(2, [PK(keys['alice'].pub), AFTER(100)])])
scripts = {'multisig': ms, 'htlc': htlc}
for name, node in scripts.items():
    b = ser_script(node)
    parse_script(b)
    prog = sha256(b)
    d = dict(skript=b.hex())
    if name == 'htlc': d['hash'] = h.hex()
    d['rohadresse'] = raw_address(1, prog).hex()
    d['textMainnet'] = addr_text('ysr', 1, prog)
    if name == 'multisig': d['textRegtest'] = addr_text('rysr', 1, prog)
    out['skripte'][name] = d
print('script lens', {n: len(ser_script(s)) for n, s in scripts.items()})

def target(name):
    """-> (version, program)"""
    if name.startswith('skript:'):
        return 1, sha256(ser_script(scripts[name.split(':', 1)[1]]))
    return 0, keys[name].program

def wa(name): return wire_address(*target(name))

# Ueberweisung
U = E['ueberweisung']
t = transfer_v2(cid, keys[U['von']], wa(U['an']), U['betrag'], U['gebuehr'], U['nonce'],
                U['validFrom'], U['validUntil'], U['notiz'].encode('utf-8'))
out['ueberweisung'] = {k: t[k].hex() for k in ('sighash', 'signatur', 'leitung', 'txid')}
print('transfer len', len(t['leitung']))

# Sammelzahlung
S = E['sammelzahlung']
outs = [(wa(o['an']), int(o['betrag'])) for o in S['ausgaenge']]
b = batch(cid, keys[S['von']], outs, S['gebuehr'], S['nonce'], S['validFrom'], S['validUntil'],
          S['notiz'].encode('utf-8'))
# Reihenfolge als Rohform (4.3): v0 = 20 Byte, v1 = 0x01|32 Byte
def wire_to_raw(w): return w[1:] if w[0] == 0 else w
out['sammelzahlung'] = dict(reihenfolge=[wire_to_raw(w).hex() for w, _ in b['outs']],
                            **{k: b[k].hex() for k in ('sighash', 'signatur', 'leitung', 'txid')})
raw_order = sorted([wire_to_raw(w) for w, _ in outs])
print('batch len', len(b['leitung']))
print('order by wire form :', [wire_to_raw(w).hex()[:8] for w, _ in b['outs']])
print('order by raw form  :', [r.hex()[:8] for r in raw_order],
      'SAME' if raw_order == [wire_to_raw(w) for w, _ in b['outs']] else 'DIFFERENT')

def spend(key, E_):
    Z = E[key]
    node = scripts[Z['skript']]
    claims = set()
    pre = {}
    if key == 'htlcEinloesen':
        pre = {h: secret}
    if key == 'htlcZurueck':
        claims = {('AFTER', 100)}
    r = script_spend(cid, node, wa(Z['an']), Z['betrag'], Z['gebuehr'], Z['nonce'], Z['validFrom'],
                     Z['validUntil'], Z['notiz'].encode('utf-8'), [keys[n] for n in Z['unterschreiben']],
                     pre, claims)
    print(key, 'len', len(r['leitung']), 'witness', len(r['witness']))
    return {k: r[k].hex() for k in ('sighash', 'witness', 'leitung', 'txid')}

out['zweiVonDrei'] = spend('zweiVonDrei', E)
out['htlcEinloesen'] = spend('htlcEinloesen', E)
out['htlcZurueck'] = spend('htlcZurueck', E)

# Zustand
accs = []
for a in E['zustand']['konten']:
    v, p = target(a['konto'])
    accs.append((raw_address(v, p), int(a['guthaben']), int(a['nonce'])))
out['zustand'] = dict(wurzel=state_root(accs).hex())

fn = 'ergebnis.json' if mode == 'rfc8032' else 'ergebnis_variante_slip10.json'
json.dump(out, open(os.path.join(here, fn), 'w'), indent=1)

# Vergleich mit den erwarteten Werten -- erst NACH der Rechnung gelesen.
if mode == 'rfc8032':
    erwartet = json.load(open(FIXTURE))['erwartet']
    gleich, anders = 0, []
    def vergleiche(a, b, pfad):
        global gleich
        if isinstance(a, dict):
            for k in a: vergleiche(a[k], (b or {}).get(k), pfad + '.' + k)
        elif a == b: gleich += 1
        else: anders.append(pfad)
    vergleiche(erwartet, out, '')
    print(f'gleich: {gleich}, abweichend: {len(anders)}')
    for p in anders: print('  ABWEICHUNG', p)
    sys.exit(1 if anders else 0)
print('written', fn)
