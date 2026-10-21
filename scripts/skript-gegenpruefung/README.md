# Skript-Prüfer gegen eine zweite Umsetzung

Prüft die Bedingungsskripte der Konsensfassung 6 (`docs/CONSENSUS_V6.md` Abschnitt 7) mit
Zufallsfällen gegen eine unabhängige Umsetzung (Abschnitt 14, „Script checker“).

```bash
pip install cryptography     # Ed25519 für die Gegenrechnung
node --experimental-strip-types scripts/skript-gegenpruefung/erzeugen.ts --out tmp/faelle.jsonl --anzahl 50000 --seed 1
python3 scripts/skript-gegenpruefung/gegenpruefung.py tmp/faelle.jsonl
```

`erzeugen.ts` baut zufällige Skripte und Witnesses und lässt den YSKAR-Code entscheiden
(`decodeScript`, `decodeWitness`, `evaluateScript`). Ein Teil der Witnesses soll das Skript
erfüllen (in jedem THRESH genau k Kinder), ein Teil liegt knapp daneben (ein Slot zu viel oder zu
wenig, ein Bit falsch), ein Teil ist zufällig. Das Gültigkeitsfenster liegt meist genau auf, unter
oder über den Höhen im Skript, damit die Grenzen von AFTER und BEFORE getroffen werden. Dazu kommen
beschädigte Skript- und Witness-Bytes und alle Grenzwerte aus 7.2.

`gegenpruefung.py` entscheidet dieselben Bytes mit `parse_script()` und `evaluate()` aus
`scripts/v6-vektoren/gegenrechnung/v6.py`. Diese Umsetzung entstand am 17.10.2026 allein aus der
Spezifikation, ohne den YSKAR-Code; sie prüft Signaturen mit `cryptography`. Verglichen wird die
Entscheidung (wohlgeformt, erfüllt, abgelehnt); jede Abweichung lässt das Skript mit Exit-Code 1
enden. Abweichende Fehlernamen bei gleicher Entscheidung werden nur gezählt.

Nicht abgedeckt: konstruierte Grenzfall-Signaturen. Dort unterscheiden sich RFC 8032
(Gegenrechnung) und die Regel aus 7.8 (YSKAR) absichtlich; das prüft `tests/zip215.test.ts`.

Gegenprobe: Sieben absichtlich in `script.ts` eingebaute Fehler (Grenzen von AFTER und BEFORE,
überzählige Belegungen, Höhe 0, die Regel „jeder Pfad braucht eine Signatur“, doppelte Schlüssel,
Rest-Bytes) wurden schon bei 3.000 Fällen alle als Abweichung gemeldet.
