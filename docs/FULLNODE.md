# Full Node — Stand und Architektur

Dieser Teil loest YSKAR schrittweise von Supabase als Autorität. Was hier
liegt, hat der Knoten selbst geprüft.

## Was fertig ist

| Baustein | Datei | Zustand |
|---|---|---|
| Chain Work | `src/lib/node/fullnode/ChainWork.ts` | fertig, getestet |
| Blockspeicher | `src/lib/node/fullnode/ChainStore.ts` | fertig, getestet |
| Block-Index | in `ChainStore` | fertig, getestet |
| Kettenverwaltung | `src/lib/node/fullnode/ChainManager.ts` | fertig |
| Fork-Erkennung | in `ChainManager` | Mechanik getestet |
| Reorg | in `ChainManager` | Mechanik gebaut, siehe Testlücke |

Noch nicht gebaut: Mempool, P2P, Mining am lokalen Knoten, Pool.

## Chain Work

Die Auswahl zwischen konkurrierenden Ketten läuft über kumulierte Arbeit,
nicht über die Höhe. Eine längere Kette aus leichten Blöcken enthält
weniger Arbeit als eine kürzere aus schweren — wer nach Höhe entscheidet,
lässt sich mit billigen Blöcken überholen.

Bei YSKAR ist die Umrechnung trivial, und das ist kein Zufall:

```
target     = 2^240 / difficulty
blockWork  = difficulty
chainWork  = chainWork(Vorgänger) + blockWork
```

Die erwartete Zahl der Versuche ist `2^256 / target`, also proportional zur
Difficulty. Die Difficulty **ist** bereits das lineare Arbeitsmaß. Ein
Umweg über das Target wäre eine Division und eine Multiplikation, die sich
aufheben — mit dem Nachteil, dass dabei gerundet würde.

Gerechnet wird ausschließlich in BigInt. Ein Gleitkommawert wäre hier
fatal: Zwei Knoten könnten bei derselben Kette zu verschiedenen Summen
kommen und blieben dauerhaft uneinig.

### Gleichstand

Bei exakt gleicher Arbeit gewinnt der **kleinere Blockhash**.

„Wer zuerst da war" wäre die naheliegende Regel und ist **nicht
deterministisch**: Zwei Knoten sehen dieselben Blöcke in verschiedener
Reihenfolge und blieben auf verschiedenen Ketten. Der Hash ist ein Wert,
den jeder Knoten unabhängig berechnet und der für alle gleich ist.

Nebenbei ist die Regel sinnvoll: Ein kleinerer Hash bedeutet mehr führende
Nullen, im Mittel also mehr geleistete Arbeit.

## Speicher

`node:sqlite`, seit Node 22 eingebaut. Kein natives Modul, kein
Kompilieren auf dem Raspberry, keine Abhängigkeit, die in zwei Jahren nicht
mehr baut. Eine Datei, die man kopieren und sichern kann.

Der Beobachter legt Blöcke nach Höhe als Dateien ab. Für einen Full Node
reicht das nicht: Er muss **mehrere Blöcke auf derselben Höhe** halten
können, sonst lässt sich eine Gabelung nicht einmal darstellen. Dafür
braucht es Abfragen — „alle Blöcke mit diesem Vorgänger", „der Tip mit der
meisten Arbeit".

`chain_work` liegt als 32 Byte Big-Endian, damit SQLite direkt danach
sortieren kann. Als Dezimaltext wäre die Sortierung falsch, weil `9`
größer als `10` ist.

Die Ablage nagelt Netz und Chain-ID fest. Eine Datei, die für
`yskar-main-1` angelegt wurde, nimmt keine Blöcke einer anderen Kette an.

## Zustandsmarken

Alle 200 Blöcke wird der Kontostand der aktiven Kette gesichert. Ohne das
müsste nach jedem Neustart und jedem Reorg die gesamte Kette neu gerechnet
werden.

Die Marke ist eine Abkürzung, kein Beweis. Beim Laden wird geprüft, ob ihre
Zustandswurzel zu ihrem Inhalt passt; stimmt sie nicht, wird von Block 0 an
gerechnet.

Marken oberhalb einer Gabelung werden verworfen — sie gehören zu einem
Zweig, der nicht mehr gilt.

## Reorg

```
1. besten Tip nach Arbeit bestimmen
2. Weg vom neuen Tip abwärts bis zum ersten Block der aktiven Kette
3. alles oberhalb der Gabelung aus der aktiven Kette nehmen
4. neuen Pfad markieren
5. Marken oberhalb der Gabelung verwerfen
6. Zustand von der jüngsten gültigen Marke aus neu rechnen
7. Zustandswurzel gegen den Block prüfen
```

**Nichts wird gelöscht.** Der alte Zweig bleibt vollständig erhalten und
könnte später wieder gewinnen, wenn er mehr Arbeit bekommt.

Ein Block auf einem Nebenzweig wird gegen den Zustand **dieses Zweigs**
geprüft, nicht gegen den aktiven Tip. Genau daran scheitern Gabelungen
sonst.

## Testnetz

Die Lücke von gestern ist geschlossen. Forks und Reorgs laufen jetzt durch
die **volle Validierung**.

Der Grund für die Lücke war konkret: Bei Difficulty 24.576 kostet ein Block
rund 1,6 Milliarden Hashes, also eine Viertelstunde Rechenzeit. Eine
Testkette mit Gabelung war damit nicht minbar.

`src/lib/core/networks.ts` führt Netzparameter ein:

```ts
MAINNET   Difficulty 24.576, chain_id 952ee402…   (exakt params.ts)
REGTEST   Difficulty 1,      chain_id bbb27f1b…   (nur für Tests)
```

Bei Difficulty 1 ist das Target 2^240, es trifft also etwa jeder
65.536-ste Hash. Ein Testblock kostet rund 500 ms statt einer
Viertelstunde.

**Am Mainnet ändert sich nichts.** `MAINNET` enthält exakt die Werte aus
`params.ts`, und jede Funktion ohne übergebene Parameter rechnet weiterhin
damit — die Änderungen an `difficulty.ts` und `validate.ts` sind rein
additiv. Ein Test prüft Feld für Feld, dass `MAINNET` und `params.ts`
übereinstimmen.

Gemint wird im Testnetz **echt**: derselbe Header, dieselbe Hashfunktion,
derselbe `ChainManager`, dieselbe `validateBlock`. Nur das Ziel ist
niedriger. Die Tests prüfen damit genau die Regel, die im echten Netz
läuft.

### Was geprüft ist

| Test | |
|---|---|
| gerade Kette | vollständig angenommen, Zustandswurzel stimmt |
| zweiter Block auf derselben Höhe | gespeichert, Gleichstand über den Hash entschieden |
| längerer Zweig mit mehr Arbeit | Reorg wird gemeldet und ausgeführt |
| Zustand nach dem Reorg | passt zum neuen Zweig, Guthaben je Miner stimmt |
| kürzerer Zweig | übernimmt **nicht**, wird aber gespeichert |
| Reorg zurück | der alte Zweig gewinnt wieder, alle drei Zweige bleiben erhalten |
| ungültiger Block auf Nebenzweig | abgelehnt, nichts gespeichert |
| Zustand nach Reorg neu berechnen | identische Wurzel |

Dazu die Prüfung gegen **echte Blöcke** der laufenden Kette
(`tests/fixtures/kette-0-14.json`) — Validierung, Zustandsaufbau,
Zustandswurzel, Ablehnung manipulierter Blöcke.

`REGTEST` darf in keinem ausgelieferten Pfad vorkommen. Die eigene
Chain-ID stellt sicher, dass seine Blöcke im echten Netz nicht einmal
gelesen werden können.

## Messwerte

Auf der Entwicklungsmaschine, 15 echte Blöcke:

| | |
|---|---|
| Prüfen und speichern | 33 ms |
| Neustart aus der Datei | 1 ms |

## Was noch an Supabase hängt

Alles in diesem Verzeichnis ist unabhängig. Der bestehende Knoten unter
`src/lib/node/` (Job-Erzeugung, Share-Prüfung, Blockübernahme) arbeitet
weiterhin gegen Supabase und bleibt vorerst unverändert — er betreibt die
laufende Kette.

Die Ablösung erfolgt, wenn der Full Node Mining-Jobs selbst erzeugen kann.
Bis dahin laufen beide nebeneinander.
