# P2P — Entwurf und Stand

Aufgebaut nach Bitcoins Vorbild, weil sich dessen Entwurf seit 2009 im Feld
bewährt hat und jeder, der Bitcoin kennt, ihn sofort liest.

## Stand

| Baustein | Datei | |
|---|---|---|
| Rahmung | `src/lib/node/p2p/wire.ts` | fertig, 17 Tests |
| Nachrichten | `src/lib/node/p2p/messages.ts` | fertig, 18 Tests |
| Verbindung | `src/lib/node/p2p/PeerConnection.ts` | fertig, 11 Tests |
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

## Die Verbindung

Zuständig für Handschlag, Lebenszeichen, Rahmung und Grenzen. Sie weiß
nichts über Blöcke und prüft keine Kette — das ist die Ebene darüber.

### Handschlag

```
aus  →  version
     ←  version
     ←  verack
aus  →  verack
        bereit
```

Beide Seiten nennen Netz, Chain-ID, Höhe und kumulierte Arbeit. Drei
Prüfungen trennen sofort:

**Netz und Chain-ID.** Die Magic-Bytes decken nur vier Byte ab — die
vollständige Chain-ID schließt aus, dass zwei Netze mit zufällig gleichem
Anfang zusammenfinden.

**Die eigene Nonce.** Kommt sie zurück, reden wir mit uns selbst. Das
passiert leicht, wenn die eigene Adresse über `addr` zurückkommt, und wäre
sonst eine Verbindung, die ewig hält und nichts bringt.

**Die Protokollfassung.** Solange es nur eine gibt, wäre Nachsicht geraten.

### Reihenfolge ist Teil des Schutzes

Vor dem Handschlag wird **nur `version`** angenommen, zwischen `version` und
`verack` nichts anderes. Sonst könnte ein Peer sofort Blöcke schicken —
ungeprüft, ohne dass feststeht, ob er überhaupt zum selben Netz gehört.

### Drei Fristen

| | |
|---|---|
| Handschlag | 10 s |
| Lebenszeichen | alle 60 s |
| Stille | 150 s |

Die Handschlagfrist ist die wichtigste: Ohne sie könnte jemand
Verbindungen öffnen und nie etwas senden — die Plätze wären belegt, ohne
dass ein einziges Byte kommt. Das kostet den Angreifer nichts.

Ein offenes `ping` und schon kommt das nächste: Die Gegenseite antwortet
nicht mehr, die Verbindung wird getrennt. Ein `pong` ohne `ping` gilt als
auffällig — sonst ließe sich eine tote Verbindung lebendig aussehen lassen.

### Getestet über echtes TCP

Auf Loopback, nicht mit Attrappen. Eine nachgebaute Verbindung würde genau
die Fehler verschweigen, um die es geht: Bytes in Stücken, halbe
Handschläge, Gegenseiten die nicht antworten.

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
