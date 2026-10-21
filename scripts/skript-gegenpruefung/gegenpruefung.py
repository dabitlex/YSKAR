"""
Skript-Pruefer gegen eine zweite Umsetzung (docs/CONSENSUS_V6.md 14) -- Teil 2.

    python3 scripts/skript-gegenpruefung/gegenpruefung.py <faelle.jsonl>

Liest die Faelle aus erzeugen.ts (rohe Skript- und Witness-Bytes, Sighash,
Gueltigkeitsfenster) und entscheidet jeden Fall mit parse_script() und
evaluate() aus scripts/v6-vektoren/gegenrechnung/v6.py -- der Umsetzung, die
am 17.10.2026 allein aus der Spezifikation entstand, ohne den YSKAR-Code.
Signaturen prueft sie mit `cryptography` (RFC 8032), nicht mit @noble.

Verglichen wird danach:
  Entscheidung  wohlgeformt ja/nein, erfuellt ja/nein -- das, worauf sich
                alle Knoten einigen muessen. Jede Abweichung ist ein Befund.
  Fehlername    welcher Fehler (bad_witness, script_unsatisfied, ...). Nur
                zur Auskunft: Fuer den Konsens zaehlt, dass abgelehnt wird.

Exit-Code 1, sobald eine Entscheidung abweicht.
"""
import json
import os
import sys
from collections import Counter

HIER = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HIER, '..', 'v6-vektoren', 'gegenrechnung'))
from v6 import parse_script, evaluate  # noqa: E402

BEKANNT = {'bad_witness', 'script_unsatisfied', 'witness_excess'}


def entscheide(skript, witness, sighash, vf, vu):
    try:
        knoten = parse_script(skript)
    except Exception:  # noqa: BLE001 -- jede Ausnahme heisst: nicht wohlgeformt
        return 'nicht_wohlgeformt'
    try:
        evaluate(knoten, witness, sighash, vf, vu)
        return 'erfuellt'
    except (AssertionError, ValueError) as e:
        name = str(e)
        return name if name in BEKANNT else 'bad_witness'
    except IndexError:
        return 'bad_witness'   # Witness kuerzer als die Blaetter verlangen


faelle = 0
abweichend = []
namen = Counter()
ergebnisse = Counter()
with open(sys.argv[1]) as f:
    for zeile in f:
        z = json.loads(zeile)
        faelle += 1
        ich = entscheide(bytes.fromhex(z['skript']), bytes.fromhex(z['witness']),
                         bytes.fromhex(z['sighash']), z['validFrom'], z['validUntil'])
        yskar = z['yskar']
        ergebnisse[yskar] += 1
        def klasse(e):
            return 'nicht_wohlgeformt' if e == 'nicht_wohlgeformt' else ('erfuellt' if e == 'erfuellt' else 'abgelehnt')
        if klasse(ich) != klasse(yskar):
            abweichend.append({'i': z['i'], 'yskar': yskar, 'gegenrechnung': ich,
                               'skript': z['skript'], 'witness': z['witness']})
        elif ich != yskar:
            namen[(yskar, ich)] += 1

ergebnis = {
    'faelle': faelle,
    'yskar_ergebnisse': dict(ergebnisse),
    'entscheidung_abweichend': len(abweichend),
    'erste_abweichungen': abweichend[:10],
    'nur_fehlername_anders': {f'{a} / {b}': n for (a, b), n in namen.most_common()},
}
print(json.dumps(ergebnis, indent=2))
sys.exit(1 if abweichend else 0)
