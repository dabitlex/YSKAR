# P2P — Entwurf und Stand

Aufgebaut nach Bitcoins Vorbild, weil sich dessen Entwurf seit 2009 im Feld
bewährt hat und jeder, der Bitcoin kennt, ihn sofort liest.

## Stand

| Baustein | Datei | |
|---|---|---|
| Rahmung | `src/lib/node/p2p/wire.ts` | fertig, 17 Tests |
| Nachrichten | `src/lib/node/p2p/messages.ts` | fertig, 18 Tests |
| Verbindung | `src/lib/node/p2p/PeerConnection.ts` | fertig, 11 Tests |
| Peer-Verwaltung | `src/lib/node/p2p/PeerManager.ts` | fertig, 12 Tests |
| Abgleich | `src/lib/node/p2p/SyncManager.ts` | fertig, 8 Tests |
| Knoten-CLI | `src/lib/node/fullnode/cli.ts` | `--seed`, `--p2p-port` |

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

## Peer-Verwaltung

Hält die Verbindungen, sucht neue, nimmt eingehende an und entscheidet, wer
gehen muss, wenn es eng wird.

### Plätze sind der Schutz, nicht Sperren

```
ausgehend    8
eingehend   32
```

**Getrennt gezählt, und das ist der Punkt.** Wer nur eingehende
Verbindungen hätte, könnte von einem Angreifer vollständig umstellt werden
— alle Plätze belegt, kein Kontakt zum echten Netz. Ausgehende Verbindungen
sucht der Knoten selbst aus.

Sind die eingehenden voll, wird **ein** Platz frei gemacht: zuerst bei
einem vermerkten Peer, sonst bei dem, der am längsten ohne abgeschlossenen
Handschlag herumsteht. Gäbe es keine Verdrängung, könnte ein Angreifer alle
Plätze belegen und danach niemanden mehr hereinlassen.

### Vermerken statt sperren

Ein auffälliger Peer wird getrennt und für eine Stunde vermerkt — er wird
beim nächsten Gedränge zuerst verdrängt. **Ausgesperrt wird er nicht**, und
der Vermerk überlebt keinen Neustart.

Ein eigener Test hält das fest: Nach dem Fehlverhalten darf sich derselbe
Peer sofort wieder verbinden. Wäre die Tür zu, wäre es eine Sperre.

### Adressbuch

Bis zu 1.000 Einträge. Weitergegeben wird nur, was in den letzten drei
Stunden gesehen wurde und keine Fehlversuche hat — alte Adressen zu
verbreiten schickt andere in dieselbe Sackgasse.

Drei Filter beim Annehmen fremder Adressen:

**Aus der Zukunft** wird verworfen. Der Zeitstempel kommt von einem
Fremden; weit in der Zukunft stünde er in jeder Sortierung ganz oben und
könnte echte Peers aus dem Buch drängen.

**Älter als eine Woche** ebenfalls.

**Unplausible Hosts** kommen nicht hinein — ein grober Filter, keine
Namensauflösung.

Ist das Buch voll, weicht der älteste Eintrag — aber nur, wenn der neue
jünger ist. Ohne diese Bedingung könnte ein Peer mit einem Schwall alter
Adressen das ganze Buch austauschen.

### Die eigene Adresse

Ein Knoten bekommt seine eigene Adresse regelmäßig über `addr` zurück — ein
Peer gibt weiter, wen er kennt, und das sind wir.

Sie wird **gelernt, nicht geraten**: Die eigene äußere Adresse lässt sich
nicht zuverlässig feststellen. Fällt bei einem Verbindungsversuch die
eigene Nonce zurück, wird die Adresse als eigene vermerkt und aus dem Buch
genommen.

Dafür führt der Knoten ein **Verzeichnis seiner versandten Nonces**. Jede
Verbindung würfelt eine eigene — eine feste wäre ein
Wiedererkennungsmerkmal über wechselnde Adressen hinweg. Bitcoin macht es
genauso.

Im Fall der Selbstverbindung antwortet die empfangende Seite noch einmal,
bevor sie trennt: Nur die aufbauende Seite kennt den Zielport, also die
Adresse, die aus dem Buch gehört. Bei einem **fremden Netz** wird
ausdrücklich nicht geantwortet — dort wäre jede Antwort eine Auskunft an
jemanden, der hier nichts verloren hat.

## Kettenabgleich

Verbindet die Peers mit der eigenen Kette: holt fehlende Blöcke,
beantwortet Anfragen, verbreitet Neues.

**Die Regel, die alles trägt:** Ein Peer liefert Daten, nichts weiter. Jeder
Block läuft durch dieselbe vollständige Prüfung wie ein selbst gebauter,
über `ChainManager.accept()`. Es gibt keine Abkürzung für
„vertrauenswürdige" Peers, weil es keine gibt.

### Aufgeholt wird nach Arbeit, nicht nach Höhe

Eine längere Kette aus leichten Blöcken ist nicht die bessere. Verglichen
wird die kumulierte Arbeit aus dem Handschlag.

### Proof of Work am Header, sofort

Der wichtigste Schutz beim Aufholen. Header sind billig zu erfinden, wenn
man die Arbeit weglässt — ein Peer könnte zweitausend schicken und uns dazu
bringen, zweitausend Blockkörper anzufragen.

Der Hash kostet Mikrosekunden und macht genau das unmöglich: Wer einen
Header mit gültigem PoW liefert, hat dafür gearbeitet. Die **volle** Prüfung
kommt erst mit dem Körper — hier geht es nur darum, Arbeit von Behauptung
zu trennen.

### Begrenztes Fenster

Höchstens 16 Blockkörper gleichzeitig. Alle auf einmal anzufragen würde bei
einer langen Kette hunderte Megabyte gleichzeitig anfordern.

Anfragen ohne Antwort werden nach 30 Sekunden freigegeben — sonst
blockierte ein Peer, der nicht liefert, einen Platz, und der Block würde
nie von jemand anderem geholt.

### Getestet zwischen echten Knoten

Zwei vollständige Knoten auf Loopback, echte Kette, echtes TCP:

| | |
|---|---|
| Ein leerer Knoten holt die ganze Kette | und rechnet den Zustand **selbst** |
| Ein neuer Block wandert weiter | Ankündigung, Anfrage, Prüfung |
| Über einen Knoten hinweg bis zum dritten | A↔B↔C, A und C nie verbunden |
| Der Zweig mit mehr Arbeit setzt sich durch | Reorg über das Netz |
| Header ohne Arbeit | Verbindung getrennt |
| Ungültiger Block | Verbindung getrennt, nichts übernommen |
| Dreifache Ankündigung | nur eine Anfrage |

Es gibt **keine Nachricht, die einen Zustand überträgt** — ein eigener Test
hält fest, dass der aufholende Knoten dieselbe Zustandswurzel selbst
errechnet.

### Im Knoten

```bash
node dist/yskar-node.cjs mine --data ./knoten --seed 203.0.113.5:8646
```

Das Knotennetz läuft neben der Mining-Schnittstelle und unabhängig von ihr:
Ein Knoten ohne Miner ist ein vollwertiger Teilnehmer, ein Miner ohne Peers
arbeitet weiter. Fällt das Netz aus, prüft der Knoten seine Kette trotzdem.

Selbst gefundene Blöcke gehen automatisch ins Netz.

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
