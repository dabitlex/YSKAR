"""Prueft die eigene Implementierung gegen die in der Spezifikation selbst veroeffentlichten Vektoren."""
from v6 import *

def show(name, got, exp):
    print(('OK   ' if got == exp else 'FAIL ') + name + ': ' + got + ('' if got == exp else '  (Spec: ' + exp + ')'))

# PROTOCOL.md Schluesselableitung -> Adresse/Text
show('PROTOCOL addr text', addr_text('ysr', 0, bytes.fromhex('0e09ac1d8e52421a9417a8511746a700b539e98e')),
     'ysr1pcy6c8vw2fpp49qh4pg3w348qz6nn6vw2fg7f0')
show('PROTOCOL addr', sha256(bytes.fromhex('34792b244cfe851d8b3fc62ccb3033297ea2ca5bc31119b397bc3ec4132a751d'))[:20].hex(),
     '0e09ac1d8e52421a9417a8511746a700b539e98e')
show('PROTOCOL addr2 text', addr_text('ysr', 0, bytes.fromhex('417ac5b716bbeef1b0018eddbddf30319b4f4d00')),
     'ysr1g9avtdckh0h0rvqp3mwmmhesxxd57ngqqmmtz2')

cid = sha256(b'yskar-regtest-v6')
show('chainId regtest-v6', cid.hex(), '491a94b5242e52994ff9cc8d74ecc06073c0690eafcb0677a7ff076525b4640f')

from slip10 import slip10_ed25519
A, B, C = [Key(slip10_ed25519(bytes([i]) * 32)) for i in (1, 2, 3)]
show('V6 Alice pub', A.pub.hex(), '01f5c342bb922ef3b00bc3c78a687c3ce2cb5f269b7c39270958071cc7f2aeb6')
show('V6 Bob pub', B.pub.hex(), 'f94804a21dfa5a45eb8193d7ecc0889bf726c3400e2657664335a158a84ad048')
t = transfer_v2(cid, A, wire_address(0, B.program), 1000, 1000, 7, 5, 50, b'v6')
show('V6 transfer sighash', t['sighash'].hex(), 'd50aa0b8afee28c7fd97133ac5ef0c0bdab7ffabea0a051e3ebe98d26378f977')
show('V6 transfer txid', t['txid'].hex(), '595b251ceb0a88f4f711f3b6d899f7d41203429029c1dc0ebe5ae382e44ed27f')
ks = sorted([A.pub, B.pub, C.pub])
ms = THRESH(2, [PK(k) for k in ks])
show('V6 2-of-3 addr (ysr)', addr_text('ysr', 1, sha256(ser_script(ms))),
     'ysr1pg95f6ku4e4d7us6xnf5l456uwmc8aerjd02ck72eh7szku28qjqqynpjww')
show('V6 state root', state_root([(A.program, 5, 0), (B.program, 7, 0)]).hex(),
     '51be0642ee68cd9f90a66f8e22ed2de2106789d5f6b40b0ce371e5052493df26')
print('len 2of3 text', len(addr_text('ysr', 1, sha256(ser_script(ms)))))
