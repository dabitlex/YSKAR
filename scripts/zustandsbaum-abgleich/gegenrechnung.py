"""
Gegenrechnung des Zustandsbaums (docs/CONSENSUS_V6.md 5.2) gegen die echte Kette.

    python3 scripts/zustandsbaum-abgleich/gegenrechnung.py <ausgabe-ordner>

Liest aenderungen.jsonl aus nachspielen.ts: je Block die geaenderten und
entfernten Konten und die Wurzel, die der YSKAR-Code (smt.ts) gerechnet hat.
Fuehrt den Zustand selbst nach und rechnet die Wurzel nach JEDEM Block mit
state_root() aus scripts/v6-vektoren/gegenrechnung/v6.py -- der Umsetzung,
die am 17.10.2026 allein aus der Spezifikation entstand, ohne den YSKAR-Code.
Hashes kommen aus hashlib, nicht aus @noble/hashes.

Vergleicht erst danach mit dem Wert des YSKAR-Codes.
"""
import json
import os
import sys

HIER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HIER, '..', 'v6-vektoren', 'gegenrechnung'))
from v6 import state_root  # noqa: E402

ordner = sys.argv[1]
zustand = {}          # rohadresse (bytes) -> (guthaben, nonce)
gleich, ungleich = 0, []
erste_wurzel = letzte = None

with open(os.path.join(ordner, 'aenderungen.jsonl')) as f:
    for zeile in f:
        z = json.loads(zeile)
        for a, b, n in z['geaendert']:
            zustand[bytes.fromhex(a)] = (int(b), int(n))
        for a in z['entfernt']:
            zustand.pop(bytes.fromhex(a), None)
        wurzel = state_root([(a, b, n) for a, (b, n) in zustand.items()]).hex()
        if erste_wurzel is None:
            erste_wurzel = wurzel
        letzte = (z['h'], wurzel, len(zustand))
        if wurzel == z['neu']:
            gleich += 1
        else:
            ungleich.append(z['h'])

ergebnis = {
    'bloecke_verglichen': gleich + len(ungleich),
    'gleich': gleich,
    'ungleich_bei': ungleich[:20],
    'ungleich_anzahl': len(ungleich),
    'wurzel_genesis': erste_wurzel,
    'spitze': {'hoehe': letzte[0], 'wurzel': letzte[1], 'konten': letzte[2]},
}
with open(os.path.join(ordner, 'gegenrechnung.json'), 'w') as f:
    json.dump(ergebnis, f, indent=2)
    f.write('\n')
print(json.dumps(ergebnis, indent=2))
sys.exit(0 if not ungleich else 1)
