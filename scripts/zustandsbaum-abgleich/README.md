# Zustandsbaum gegen die echte Kette

Prüft den Zustandsbaum der Konsensfassung 6 (`docs/CONSENSUS_V6.md` 5.2) an der echten Kette
(Abschnitt 14, „State tree“). Liest nur; weder die Ablage noch das Netz werden verändert.

```bash
# 1. Kette holen (lesend über die öffentliche Schnittstelle, wie jeder Knoten)
cd node && npm start -- sync --once --data ../tmp/mainnet && cd ..
# 2. Nachspielen: nach jedem Block alte und neue Wurzel
node --experimental-strip-types scripts/zustandsbaum-abgleich/nachspielen.ts --data tmp/mainnet --out tmp/abgleich
# 3. Gegenrechnung mit der unabhängigen Python-Umsetzung
python3 scripts/zustandsbaum-abgleich/gegenrechnung.py tmp/abgleich
```

`nachspielen.ts` spielt die Hauptkette ab Genesis nach und prüft nach jedem Block, dass die alte
Wurzel der im Blockkopf entspricht. Es schreibt je Block die geänderten Konten und die neue Wurzel
(`smt.ts`) nach `aenderungen.jsonl`.

`gegenrechnung.py` führt den Zustand aus diesen Änderungen selbst nach und rechnet die neue Wurzel
mit `state_root()` aus `scripts/v6-vektoren/gegenrechnung/v6.py`. Diese Umsetzung entstand am
17.10.2026 allein aus der Spezifikation, ohne den YSKAR-Code; die Hashes kommen aus `hashlib`.
Exit-Code 1, sobald eine Wurzel abweicht.

Ergebnis am 21.10.2026: Höhe 0 bis 5.709, 5.710 von 5.710 alten Wurzeln gleich dem Blockkopf,
5.710 von 5.710 neuen Wurzeln gleich der Gegenrechnung. Ein absichtlich um eine Einheit
verfälschtes Guthaben bei Höhe 3.000 wurde genau dort gemeldet.

Die Leistungsmessung liegt in `scripts/zustandsbaum-messung/messen.ts`.
