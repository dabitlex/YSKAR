# Konsensfassung 2 — Coinbase mit mehreren Empfängern

Bis Höhe **2000** hat die Coinbase genau einen Empfänger. Ab dort sind
mehrere zulässig.

Das ist die Voraussetzung für Pool Mining **ohne Verwahrung**: Der Block
selbst zahlt alle Beteiligten aus, und der Pool-Betreiber hält nie fremdes
Geld. Die Alternative — der Pool bekommt den Reward und überweist weiter —
bedeutet Verwahrung mit allem, was daran hängt.

## Was sich ändert

| | |
|---|---|
| Aktivierungshöhe | `COINBASE_V2_HEIGHT = 2000` |
| Höchstzahl Empfänger | `MAX_COINBASE_OUTPUTS = 64` |
| Fassung 1 | unverändert, für immer gültig |
| Fassung 2 | erst ab der Aktivierungshöhe |

**Blöcke 0 bis 1999 bleiben byteweise unverändert.** Nachgewiesen: 15 echte
Blöcke der laufenden Kette werden eingelesen, neu serialisiert und Byte für
Byte verglichen — identisch, ebenso ihre Hashes.

## Kodierung

Fassung 1, unverändert:

```
u16 version(=1) │ u8 type(=0) │ u32 height │ 20 to │ u64 amount │ u8 len │ extra
```

Fassung 2:

```
u16 version(=2) │ u8 type(=0) │ u32 height │ u8 count │ (20 to │ u64 amount)* │ u8 len │ extra
```

Der Unterschied ist genau ein Zählfeld nach der Höhe. Fassung 1 hat keines —
nur dadurch bleiben alte Blöcke identisch.

## Die Regeln, einzeln

Jede davon ist Konsens. Wer eine lockert, ändert die Kette.

**1 bis 64 Empfänger.** Die Obergrenze begrenzt Blockgröße und Prüfaufwand.

**Die Summe muss exakt aufgehen.** `Σ amount == reward(height) + fees`. Ein
Satoshi zu viel oder zu wenig ist kein Rundungsfehler, sondern ein
ungültiger Block. Der Bauhelfer prüft das, statt stillschweigend
anzupassen.

**Adressen streng aufsteigend sortiert.** Ohne diese Regel gäbe es für
dieselbe Auszahlung mehrere gültige Kodierungen — und damit verschiedene
Merkle-Wurzeln für dieselbe Aussage. Die Sortierung erzwingt zugleich, dass
kein Empfänger zweimal vorkommt.

**Kein Empfänger mit Betrag null.** Sonst ließe sich der Block mit leeren
Einträgen aufblähen, die nichts bewirken.

**Fassung 2 vor der Aktivierungshöhe ist ungültig.** Damit bleibt die
Geschichte unveränderlich.

**Fassung 1 bleibt auch danach gültig.** Solo-Mining ändert sich nicht.

## Warum Höhe 2000

Bei rund 500 Sekunden je Block liegen zwischen Höhe 850 und 2000 etwa acht
Tage. Wer einen Knoten oder Miner betreibt, hat damit Zeit zu
aktualisieren, bevor die Regel greift.

Ein Knoten mit altem Code lehnt einen Block der Fassung 2 ab und bleibt auf
seinem Zweig stehen. Deshalb ist die Vorlaufzeit keine Höflichkeit, sondern
notwendig.

## Spiegelung in der Datenbank

Migration `00013_chain2_coinbase_outputs`.

Die Transaktionstabelle hält eine Zeile je Transaktion mit genau einem
`to`-Feld. Bei Fassung 2 bleibt es **leer**, `amount` trägt die
Gesamtsumme, und `coinbase_outputs` hält die Aufteilung als JSON.

„`to` = erster Empfänger, `amount` = Gesamtsumme" wäre die naheliegende
Abkürzung und genau die falsche: Sie liest sich, als hätte der erste alles
bekommen.

Verbindlich ist ohnehin das `raw`-Feld.

## Kontoauskunft und Explorer

Beides war eine Lücke und ist geschlossen.

Die Kontoauskunft (`/api/v2/account/[address]`) suchte nur in `to_addr` —
bei Fassung 2 steht dort nichts. Wer über einen Pool bezahlt wird, hätte
seinen Eingang nirgends gefunden: nicht im Verlauf, nicht in der Zahl der
gefundenen Blöcke. Das Guthaben hätte gestimmt, die Herkunft wäre unsichtbar
gewesen.

Jetzt läuft eine zweite Abfrage über `coinbase_outputs`, und die Ergebnisse
werden nach Höhe in denselben Verlauf eingereiht. Ein Pool-Anteil erscheint
als `kind: 'pool'` mit der Zahl der Beteiligten.

Der Explorer zeigt bei Fassung 2 alle Empfänger mit ihrem Anteil, nicht nur
die Gesamtsumme. Nur die Summe zu zeigen sähe aus, als hätte niemand etwas
bekommen — und das Nachrechnen ist der Sinn einer Auszahlung über die
Kette.

## Noch nicht geändert

Keine. Diese Erweiterung betrifft ausschließlich die Coinbase. Genesis,
Chain-ID, Blockheader, Difficulty-Regel, Adressformat, Signaturschema und
Zustandswurzel bleiben unangetastet.
