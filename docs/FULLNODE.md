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

## Testlücke, offen benannt

**Ein Reorg durch die volle Validierung hindurch ist nicht getestet.**

Der Grund ist unangenehm konkret: Bei Difficulty 24.576 kostet ein Block
rund 1,6 Milliarden Hashes, also etwa eine Viertelstunde Rechenzeit. Eine
Testkette mit einer Gabelung zu minen ist damit ausgeschlossen.

Geprüft ist stattdessen:

- **Konsens und Zustand** gegen echte Blöcke der laufenden Kette
  (`tests/fixtures/kette-0-14.json`): Validierung, Zustandsaufbau,
  Zustandswurzel, Ablehnung manipulierter Blöcke
- **Gabelung, Arbeitsvergleich, Umschalten** auf Speicherebene mit
  synthetischen Einträgen: die Mechanik, nicht die Validierung

Was fehlt, ist die Verbindung beider: ein echter Fork, der durch
`accept()` läuft.

**Der Weg dorthin ist ein Testnetz** mit eigener Chain-ID und niedriger
Difficulty, wie Bitcoin es mit regtest hat. Dafür müssten `NETWORK`,
`CHAIN_ID` und `GENESIS_DIFFICULTY` aus Konstanten zu Parametern werden —
ein Eingriff in `params.ts`, der die Mainnet-Werte nicht verändert, aber
sorgfältig gemacht werden muss.

Das ist der nächste Schritt, den ich vorschlage, bevor P2P gebaut wird. Ein
Reorg, der nie unter voller Validierung gelaufen ist, darf nicht ins Netz.

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
