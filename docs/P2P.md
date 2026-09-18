# P2P — Entwurf und Stand

Aufgebaut nach Bitcoins Vorbild, weil sich dessen Entwurf seit 2009 im Feld
bewährt hat und jeder, der Bitcoin kennt, ihn sofort liest.

## Stand

| Baustein | Datei | |
|---|---|---|
| Rahmung | `src/lib/node/p2p/wire.ts` | fertig, 17 Tests |
| Nachrichten | `src/lib/node/p2p/messages.ts` | fertig, 18 Tests |
| Verbindung | — | noch nicht |
| Peer-Verwaltung | — | noch nicht |
| Abgleich | — | noch nicht |

Beides sind reine Funktionen ohne Netzwerkzugriff — prüfbar, ohne dass
etwas läuft. Das war bei `ChainWork` und der Pool-Abrechnung schon so und
hat sich bewährt.

## Rahmung

```
magic(4) │ command(12) │ length(4) │ checksum(4) │ payload
```

Byte für Byte Bitcoins Kopf.

**Magic** benennt das Netz. Bei YSKAR sind es die ersten vier Byte der
Chain-ID — also nichts Zusätzliches zu pflegen, und Mainnet und Testnetz
können gar nicht erst miteinander reden.

**Command** zwölf Byte ASCII, mit Nullbytes aufgefüllt. Lesbar im
Mitschnitt, feste Länge beim Einlesen. Eine **Positivliste**: Was nicht
daraufsteht, wird abgewiesen, bevor die Nutzlast gelesen wird.

**Checksum** die ersten vier Byte von SHA-256d über die Nutzlast.

Zur Prüfsumme ehrlich: TCP hat bereits eine, und sie fängt keinen gezielten
Angriff ab — wer die Nutzlast ändert, rechnet sie mit. Ihr eigentlicher
Nutzen ist ein anderer: Sie erkennt, wenn der Leser aus dem Takt geraten
ist und Bytes an der falschen Stelle liest.

**Höchste Nutzlast: 2 MB.** Bitcoin hat 4 MB; der größte mögliche
YSKAR-Block liegt bei rund 400 KB. Entscheidend ist nicht die Zahl, sondern
dass die Grenze **vor dem Puffern** greift: Eine angekündigte Riesenlänge
wird abgewiesen, ohne dass ein Byte gespeichert wird. Genau dort würde ein
Angreifer sonst beliebig viel Speicher binden.

**TCP kennt keine Nachrichtengrenzen.** Der `FrameReader` sammelt Bytes und
gibt heraus, was vollständig ist — geprüft mit einer Nachricht, die Byte
für Byte ankommt, und mit drei Nachrichten in einem Stück.

## Nachrichten

| | |
|---|---|
| `version` / `verack` | Handschlag |
| `ping` / `pong` | Lebenszeichen |
| `getheaders` / `headers` | Kettenabgleich |
| `inv` / `getdata` / `block` / `notfound` | Verbreitung |
| `tx` | Transaktionen |
| `getaddr` / `addr` | Peers austauschen |

### Die Regel über allem

**Keine Nachricht trägt eine Aussage über Gültigkeit.** Ein Peer liefert
Daten; ob sie gelten, entscheidet der eigene Knoten.

Deshalb gibt es kein Feld `valid`, kein `accepted` und keine Fehlermeldung
über fremde Blöcke — solche Felder würden dazu verleiten, ihnen zu glauben.
Ein Test liest die Quelldatei und schlägt an, falls doch eines
hineingerät.

### Header zuerst

Bei 2.000 Headern sind das 272 KB; dieselben Blöcke wären bis zu 800 MB.
Erst wenn feststeht, welcher Zweig mehr Arbeit hat, werden die Körper
geholt — sonst lädt man Blöcke herunter, die man gleich wieder verwirft.

### Der Locator

`getheaders` trägt eine Liste eigener Blockhashes, dicht am Kopf und mit
wachsendem Abstand nach hinten. Die Gegenseite sucht den ersten, den sie
kennt, und antwortet ab dort.

Nur die Höhe zu senden wäre einfacher und falsch: Nach einem Fork haben
beide Seiten dieselbe Höhe mit verschiedenen Blöcken. Der Locator findet
den gemeinsamen Vorfahren in wenigen Schritten.

### Alles mit Grenzen

```
inv         500 Einträge
headers    2000
addr        500
locator      32
Kennung      64 Zeichen
```

Die Rahmung allein reicht nicht: Zwei Megabyte sind sehr viele kleine
Einträge.

## Was von Bitcoin nicht übernommen wird

**Sperren.** Bitcoin Core hat sich davon über Jahre wegbewegt — automatische
Sperren wurden durch einen Entmutigungsfilter ersetzt, mit der Begründung,
dass weder Sperren noch Entmutigung vor DoS schützen, weil ein Angreifer
sich trivial mit anderen Adressen neu verbindet. Zuletzt wurde im August
2025 sogar die Bestrafung für konsensungültige Transaktionen ganz entfernt.

YSKAR wird es genauso halten: bei Fehlverhalten trennen, bei der nächsten
Verdrängung bevorzugt aussortieren — aber nicht dauerhaft sperren.

**Drei Adressformate.** Bitcoin brauchte für IPv4, IPv6, Onion und BIP155
vier Varianten. Hier ist der Host schlicht Text; bei diesen
Größenordnungen wäre das Sparen an der falschen Stelle.

## Noch nicht entschieden

**Verschlüsselung.** Bitcoin hat sie mit BIP324 nachgerüstet. Für YSKAR ist
sie nicht dringend — die Kette ist öffentlich, es gibt nichts
Geheimzuhaltendes. Sie verhindert aber, dass ein Zwischengeschalteter
Blöcke unterschlägt. Das gehört auf die Liste, nicht in den ersten Wurf.

**Peer Discovery.** Für den Anfang feste Seed-Adressen plus `addr`. DNS-Seeds
wären der nächste Schritt.
