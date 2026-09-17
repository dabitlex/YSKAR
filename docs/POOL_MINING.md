# Pool Mining

Drei geprüfte Bausteine, noch nicht angeschlossen:

| Datei | |
|---|---|
| `src/lib/pool/pplns.ts` | welche Arbeit zählt |
| `src/lib/pool/settlement.ts` | wie der Betrag aufgeteilt wird |
| `src/lib/pool/PoolCoordinator.ts` | was der Betreiber darf |

38 Tests.

## Grundsatz

**Der Pool hält nie fremdes Geld.** Die Aufteilung wird zur Coinbase des
Blocks; die Kette selbst zahlt jeden Beteiligten direkt aus. Der Betreiber
entscheidet nur, *wie* aufgeteilt wird, und das steht anschließend für
jeden nachrechenbar im Block.

Voraussetzung dafür ist die Coinbase mit mehreren Empfängern
(`docs/CONSENSUS_V2.md`), gültig ab Höhe 2000.

## PPLNS statt proportional

Bezahlt werden immer die **letzten N Arbeitseinheiten** — über Blockfunde
hinweg. N ist standardmäßig das Doppelte der Netz-Difficulty.

Bei proportionaler Verteilung je Runde beginnt nach jedem Block eine neue
Zählung. Wer kurz nach einem Fund einsteigt und bald wieder geht, hat einen
großen Anteil an einer kleinen Runde und bekommt im Mittel mehr, als seine
Arbeit wert ist. Bezahlt wird das von denen, die durchhalten. Das ist als
Pool-Hopping bekannt und lohnt sich messbar.

Das PPLNS-Fenster kennt keine Rundengrenze. Es wandert mit. Damit ist der
Zeitpunkt des Einstiegs gleichgültig — eine Einheit Arbeit ist eine Einheit
Arbeit.

Der Preis, und er ist fair: Wer neu dazukommt, muss das Fenster erst
füllen. Wer aufhört, bekommt noch eine Weile etwas — genau so lange, wie es
beim Einstieg gefehlt hat.

**Der älteste Eintrag im Fenster zählt nur anteilig.** Ihn ganz mitzunehmen
würde die tatsächliche Fenstergröße davon abhängig machen, wie groß
zufällig der Share an der Grenze war — und zwei Knoten kämen zu
verschiedenen Ergebnissen.

## Aufteilung

**Die Invariante:** `Σ outputs == brutto`. Immer, exakt. Geprüft am Ende der
Funktion, die sonst wirft. Der Test läuft über tausend zufällige Runden.

Ausschließlich BigInt. `0.1 + 0.2` ist in IEEE 754 nicht `0.3`, und zwei
Knoten kämen bei derselben Runde zu verschiedenen Ergebnissen.

**Größte-Reste-Verfahren:** Zuerst der abgerundete Anteil, der Rest an die
mit dem größten Bruchteil. Bei gleichem Rest entscheidet die kleinere
Adresse — ohne diesen zweiten Schlüssel hinge das Ergebnis von der
Eingabereihenfolge ab.

**Übertrag:** Die Coinbase fasst 64 Empfänger, mit Gebühr bleiben 63. Wer
nicht hineinpasst, behält seine Arbeit für die nächste Runde. Sie verfallen
zu lassen wäre Diebstahl an den Kleinsten — also an denen, für die ein Pool
überhaupt gebaut wird.

## Gebühr

**0 bis 500 Basispunkte**, also 0,00 % bis 5,00 %. Frei einstellbar.

**Abgerundet, zugunsten der Miner.** Der Rest einer Division fällt den
Arbeitenden zu.

**Eine Änderung wirkt erst ab dem nächsten Block.** Die Arbeit im aktuellen
Fenster wurde unter der alten Gebühr geleistet; sie nachträglich zu erhöhen
wäre ein Griff in fremde Taschen.

Ein Pool ohne Gebühr ist zulässig und braucht dann keine Auszahlungsadresse.

## Auszahlungsadresse

Wird **beim Share festgeschrieben**, nicht erst bei der Abrechnung
nachgeschlagen. Sonst ließe sich Arbeit nachträglich umleiten — vom Miner
selbst oder vom Betreiber.

## Solo bleibt gleichberechtigt

Wer allein mint, bekommt weiterhin eine Coinbase der Fassung 1 mit genau
einem Empfänger. Der Pool ist ein Angebot, keine Voraussetzung, und beide
Modi laufen am selben Knoten nebeneinander.

## Was noch fehlt

- Anbindung an `MiningServer`: Modus je Sitzung, Shares in den Pool leiten
- Tabellen für Pools, Verlauf und Auszahlungen
- ein öffentlich erreichbarer Knoten, damit Telefone den Pool erreichen

Erledigt: Kontoauskunft und Explorer finden Empfänger einer
Fassung-2-Coinbase. Die Umschaltung Solo/Pool steht in der Mini App und ist
bis zur Aktivierung mit „bald" gekennzeichnet.

