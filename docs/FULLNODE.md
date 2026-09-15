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
| Reorg | in `ChainManager` | fertig, durch volle Validierung getestet |
| Mempool | `src/lib/node/fullnode/TxPool.ts` | fertig, getestet |
| Blockbau und Job | `src/lib/node/fullnode/MiningCoordinator.ts` | fertig, getestet |

| Mining-Schnittstelle | `src/lib/node/fullnode/MiningServer.ts` | fertig, getestet |

Noch nicht gebaut: P2P, Pool.

## Gegen den eigenen Knoten minen

```bash
# Ein Fenster: Knoten mit eigenem Testnetz
node dist/yskar-node.cjs mine --regtest --data ./testnetz

# Zweites Fenster: der GANZ NORMALE Miner
cd ../miner
node src/cli.mjs --address ysr1… --api http://127.0.0.1:8645
```

**Der bestehende Miner ändert sich um keine Zeile.** Der Knoten spricht
dasselbe Protokoll wie der Server — `/session`, `/job`, `/share`,
`/session/stop`, `/summary`. Nur die Adresse ist eine andere.

Ein zweiter Miner wäre die Verdopplung gewesen, die in diesem Projekt schon
zweimal zugeschlagen hat: einmal beim Blockheader, einmal beim
WASM-Zwischenspeicher. Beide Male liefen die Kopien lautlos auseinander und
es fiel erst nach Stunden auf.

Der Knoten baut die Jobs selbst, prüft jeden Share nach und nimmt gefundene
Blöcke über dieselbe vollständige Validierung an wie fremde. Ohne Server,
ohne Supabase.

### Was dabei beachtet ist

| | |
|---|---|
| Extranonce | je Session eindeutig — getrennte Nonce-Räume |
| Fremde Jobs | abgewiesen, sonst doppelte Gutschrift für dieselbe Arbeit |
| Share-Ziel | nachgeführt über acht Messwerte, nicht je Einzelwert |
| Bindung | nur `127.0.0.1`, solange nichts anderes angegeben wird |
| Anfragegröße | auf 64 KB begrenzt |

Die Nachführung über mehrere Messwerte ist kein Detail: Die Abstände
zwischen Shares sind exponentialverteilt. Wer auf jeden einzelnen reagiert,
bringt das Ziel zum Schwingen statt es einzuregeln — genau dieser Fehler
steckte in der ersten Fassung der Kette.

## Blöcke einreichen

`POST /api/v2/block  { raw: "<hex>" }`

Damit kann ein Full Node auf der echten Kette **mitproduzieren** statt nur
zu prüfen. Vorher lag ein lokal gefundener Block auf dem Rechner seines
Finders und wurde beim nächsten Block der anderen Seite verdrängt — echte
Arbeit für nichts.

**Dem Einreicher wird nichts geglaubt.** Kein Feld aus seiner Anfrage wird
übernommen, nur die rohen Bytes. Höhe, Difficulty, Merkle-Wurzel,
Signaturen, Guthaben und Zustandswurzel rechnet der Server selbst nach —
mit derselben `validateBlock`, die auch eigene Blöcke prüft.

Deshalb braucht die Route keine Anmeldung: Sie gewährt nichts, was nicht
durch Arbeit gedeckt wäre. Wer einen gültigen Block einreicht, hat ihn
gemint.

Reihenfolge wieder billig vor teuer: Größe, Hex, Struktur und Proof of Work
kosten Mikrosekunden, die Signaturen Millisekunden, die Datenbank noch
mehr.

| Antwort | Bedeutung |
|---|---|
| `accepted` | angenommen, mit Höhe und Hash |
| `stale` | zu spät, die Kette ist weiter — kein Fehler des Einreichers |
| `height_gap` | es fehlen Blöcke dazwischen |
| `wrong_parent` | zeigt auf einen anderen Vorgänger |
| `commit_failed` | zwischen Prüfung und Festschreiben hat ein anderer gewonnen |

Der Knoten reicht gefundene Blöcke automatisch weiter (`--upstream`, per
Vorgabe an `--api`). Die Weitergabe läuft nebenher — der Miner bekommt
seine Antwort sofort und wartet nicht darauf. Eine Ablehnung wird gemeldet,
nicht verschluckt; lokal bleibt der Block gültig, denn die Gegenstelle kann
sich irren.

```bash
# Auf der echten Kette mitproduzieren
node dist/yskar-node.cjs sync --data ./knoten --once     # erst aufholen
node dist/yskar-node.cjs mine --data ./knoten            # dann minen
```

Ohne `--regtest` gilt das Mainnet, und gefundene Blöcke gehen an
`https://yskar.vercel.app`. Mit `--no-upstream` bleiben sie lokal.

**Das ist noch kein P2P.** Es bleibt ein sternförmiges Netz mit Supabase in
der Mitte: Der Knoten holt Blöcke von dort und gibt seine dorthin. Echte
Dezentralisierung wird es erst, wenn Knoten direkt miteinander reden.

## Mempool

Wartende Transaktionen, vollständig gegen den aktuellen Zustand geprüft.

Der Mempool ist eine **Angriffsfläche**, und das prägt fast jede
Entscheidung darin: Er nimmt Daten von Fremden entgegen, bevor sie in einem
Block stehen, hält sie im Arbeitsspeicher und gibt sie weiter. Ohne
Obergrenze lässt sich ein Knoten mit wertlosen Transaktionen aushungern;
etwas Ungeprüftes weiterzureichen hieße, den Angriff für den Angreifer zu
verteilen.

Deshalb erst prüfen, dann aufnehmen, dann erst weitergeben.

| Regel | |
|---|---|
| Reihenfolge | kostenlose Prüfungen zuerst, Signatur zuletzt |
| Nonce | lückenlos an Kontostand und Wartende anschließend |
| Ersetzung | nur mit höherer Gebühr |
| Deckung | Summe **aller** wartenden Beträge plus Gebühren |
| Obergrenzen | 5.000 gesamt, 32 je Absender |
| Nach dem Block | Enthaltene raus, ungültig Gewordene auch |
| Nach dem Reorg | Verdrängte Transaktionen kommen zurück — erneut geprüft |

Die Reihenfolge ist keine Kosmetik: Eine Ed25519-Prüfung ist rund
tausendmal teurer als ein Kartenzugriff. Wer sie vorn ansetzt, lädt jeden
ein, den Knoten mit Müll zu beschäftigen.

## Mining am lokalen Knoten

Bis hierher kam jeder Mining-Job von Supabase. Das war der letzte Punkt, an
dem der Knoten etwas glauben musste: Wer den Job baut, bestimmt, in welchem
Block die Arbeit landet und wer die Coinbase bekommt.

Jetzt erzeugt der Knoten den Job selbst — aus eigenem Kettenkopf, eigenem
Zustand, eigenem Mempool. Ohne Verbindung nach außen.

**Er glaubt auch sich selbst nicht.** Ein gefundener Block läuft durch
dieselbe vollständige Prüfung wie ein fremder, über `ChainManager.accept()`.
Das kostet Millisekunden und fängt jeden Fehler in der Blockerzeugung ab,
bevor er in die Kette kommt.

Der vollständige Blockkörper bleibt beim Job liegen. Ihn später aus dem
Mempool zu rekonstruieren wäre ein Fehler: Zwischen Ausgabe und Fund ändert
sich der Mempool, und `merkle_root` wie `state_root` im Header verpflichten
auf **genau diese** Auswahl. Weicht sie um eine Transaktion ab, ist die
geleistete Arbeit wertlos.

Der Einreicher schickt nur die Nonce. Der Hash wird im Knoten selbst
gerechnet; eine Angabe des Miners über die erreichte Difficulty wird nie
übernommen.

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

## Knoten starten

```bash
cd node
npm install          # esbuild und die Kryptobibliotheken
npm run build
node dist/yskar-node.cjs sync --data ./knoten
```

Unter Windows `npm.cmd` statt `npm`.

Der Ordner ist eigenständig: Ein `npm install` im Projektwurzelverzeichnis
ist nicht nötig. Der Bau bündelt Quelltext aus `../src/lib/core`, und
`nodePaths` in `build.mjs` sorgt dafür, dass die Bibliotheken dafür
gefunden werden — esbuild sucht `node_modules` sonst ausgehend vom
Verzeichnis der importierten Datei und würde hier nie nachsehen.

Befehle: `sync` holt die Kette und prüft jeden Block selbst, `status` zeigt
den Stand, `chain` die letzten Blöcke, `tips` alle bekannten Zweigenden.

Bis P2P steht, kommen die Blöcke über die öffentliche Leseschnittstelle.
**Geprüft werden sie trotzdem vollständig** — Header, Proof of Work,
Merkle-Wurzel, Signaturen, Guthaben, Zustandswurzel, Difficulty-Regel. Der
Knoten glaubt dem Server kein Feld.

Liefert der Server etwas Falsches, hält er an:

```
BLOCK ABGELEHNT
  Höhe 5: struktur
  merkle_mismatch

  Der Server liefert etwas, das der Kette widerspricht.
  Lokal geprüft bis Höhe 4.
```

Rückgabewert 2. Das ist der Zweck des Programms.

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
