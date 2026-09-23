# Gebühren

**Keine Konsensregel.** Alles hier ist Auskunft, nicht Vorschrift. Wer
weniger zahlt als empfohlen, wartet länger — abgelehnt wird er nicht. Die
einzige harte Grenze bleibt `MIN_FEE` in `params.ts`.

Würde eine Empfehlung zur Regel, hätten verschiedene Knoten verschiedene
Regeln — und die Kette spaltete sich an einer Zahl, die niemand
festgeschrieben hat.

## Warum kein Satz je Byte

| | Spannweite der Größe | knappe Ressource | Gebühr je |
|---|---|---|---|
| Bitcoin | 141 bis 3.300 vB (**2.300 %**) | Blockgewicht | vByte |
| YSKAR | 168 bis 200 Byte (**19 %**) | 2.000 Plätze | **Transaktion** |

Bei Bitcoin frisst eine Transaktion mit 50 Eingängen zwanzigmal so viel
Blockraum wie eine kleine — ohne Bytepreis könnte jemand für dieselbe
Gebühr den Block verstopfen.

Eine YSKAR-Überweisung ist fast immer gleich groß, und die Blockgrenze
zählt **Transaktionen**, nicht Bytes. Knapp ist also ein *Platz*, und dessen
Preis ist genau die absolute Gebühr, die es schon gibt. Nach Byte zu
sortieren gäbe fast dieselbe Reihenfolge — die Komplexität ohne das Problem.

**Wann sich das ändert:** sobald Transaktionen unterschiedlich groß werden
*und* die Blockgrenze in Bytes zählt. Beides wäre eine Konsensänderung mit
Aktivierungshöhe. Das Feld `fee` bliebe dabei unverändert — die Rate ist nur
die Rechnung `fee ÷ vbytes`. Kein Bruch mit bestehenden Blöcken.

## Wie die Empfehlung entsteht

Nicht aus festen Stufen, sondern aus der **tatsächlichen Warteschlange**:

```
Mempool
  ↓
selectTransactions()  — dieselbe Auswahl wie im echten Blockbau
  ↓  Block 1 voll? Zustand fortschreiben, nächster Block
Verteilung: Block 1: 5 | Block 2: 5 | Block 3: 2
```

Die Vorhersage benutzt **dieselbe Funktion wie der Blockbau**. Eine
nachgebaute Sortierung könnte anders entscheiden, und die Vorhersage wäre
systematisch falsch.

Daraus:

| Stufe | | |
|---|---|---|
| **Schnell** | Kappung + ein Schritt | Block 1 |
| **Normal** | niedrigste Gebühr in Block 2 | Block 2 |
| **Langsam** | Mindestgebühr | letzter vorhergesagter Block |

Die *Kappung* ist die schwächste Gebühr, die es noch in den nächsten Block
schafft. Steigt der Andrang, steigt sie von selbst. Das ist der Markt.

## Ohne Andrang gibt es nichts zu wählen

Wird der nächste Block nicht voll, sind alle drei Stufen gleich der
Mindestgebühr — und die App zeigt **keine Auswahl**, sondern den Grund:

> Kein Andrang — die Mindestgebühr genügt für den nächsten Block.

Drei Knöpfe anzubieten, die dasselbe tun, wäre irreführend. Der Nutzer
zahlte mehr, ohne etwas dafür zu bekommen.

## „Voraussichtlich" ist keine Floskel

Die Schätzung gilt unter der Annahme, dass nichts Neues dazukommt. Kommt
gleich jemand mit höherer Gebühr, rutscht man nach hinten.

Deshalb steht in jeder Antwort ein `hinweis`, und die App zeigt ihn. Eine
Zusage „nächster Block, sicher" wäre bei 3.000 Wartenden eine Lüge — und
wenn alle „Schnell" wählten, zahlten alle mehr und niemand käme schneller
durch.

## Die Nonce-Kette

Der Unterschied zum UTXO-Modell, und er hat echte Folgen:

```js
if (t.nonce !== acc.nonce) continue;   // noch nicht fällig
```

Im Kontenmodell hängen die Transaktionen eines Absenders aneinander. Nonce 5
kann nicht vor Nonce 4 in einen Block — **egal, was sie zahlt.** Eine reine
Gebührensortierung wäre schlicht falsch.

Für die Anzeige heißt das: Steckt die erste fest, stecken alle dahinter
fest. `blockiertDurch()` findet das heraus, damit die App es sagen kann —
sonst zahlt jemand für Nonce 7 viel und wundert sich.

## Wenn der Markt nicht mehr reicht

Kommen dauerhaft mehr als 2.000 Transaktionen je Block an, entscheidet der
Gebührenmarkt nur noch, **wer** durchkommt — nicht **wie viele**. Der
Rückstau bliebe, die Gebühren stiegen ohne Ende.

Dann ist die Blockgrenze selbst die Frage, und das ist eine Konsensänderung.
Bitcoin hat darüber Jahre gestritten.

Damit diese Entscheidung später mit Daten fällt und nicht mit Gefühl, liefert
die API die Verteilung mit: Wie viele passten in Block 1, wie viele nicht.
Solange alles in Block 1 passt, gibt es kein Problem.

## Schnittstelle

```
GET /api/v2/fees[?fee=<betrag>]
```

Auf dem Server **und** im Knoten, mit identischer Antwort:

```json
{
  "minFee": "100000",
  "wartend": 12,
  "andrang": true,
  "kappung": "800000",
  "stufen": {
    "langsam": { "fee": "100000", "block": 3 },
    "normal":  { "fee": "300000", "block": 2 },
    "schnell": { "fee": "810000", "block": 1 }
  },
  "bloecke": [{ "block": 1, "anzahl": 5, "minFee": "800000" }],
  "eigene": { "fee": "300000", "rang": 8, "von": 13 },
  "hinweis": "Voraussichtlich, unter der Annahme dass nichts Neues dazukommt."
}
```

Mit `?fee=` kommt die eigene Position in der Warteschlange dazu.

## Dateien

```
src/lib/core/feemarket.ts      Vorhersage, Stufen, Position, Nonce-Kette
src/app/api/v2/fees/route.ts   Server
src/lib/node/fullnode/ReadApi.ts  Knoten, gleiche Antwort
src/components/wallet/Send.tsx    Auswahl in der App
tests/feemarket.test.ts           9 Tests
```
