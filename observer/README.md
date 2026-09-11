# YSKAR Beobachter-Knoten

Holt die Kette über die offene Schnittstelle und **rechnet jeden Block
selbst nach** — Header, Proof of Work, Merkle-Wurzel, Signaturen, Guthaben,
Zustandswurzel und die Difficulty-Regel. Er glaubt dem Server kein einziges
Feld.

## Was er leistet, und was nicht

Er nimmt **keine** Blöcke an und entscheidet **keine** Gabelungen. Das ist
Stufe 3 und der eigentlich schwere Teil.

Trotzdem verschiebt er etwas Wesentliches:

- Er merkt, wenn ein ungültiger Block ausgeliefert wird
- Er merkt, wenn Geschichte nachträglich verändert wird
- Er merkt, wenn zwei Abfragen verschiedene Ketten liefern
- Er hält eine vollständige Kopie, falls der Hauptknoten ausfällt

Damit wandert die Garantie von „dem Server vertrauen" zu „jeder Beobachter
würde es bemerken". Das ist der erste echte Schritt weg von der
Ein-Instanz-Kette.

**Ehrlich dazu:** Mehrere Beobachter bei derselben Person sind technisch
mehrere Knoten, aber weiterhin eine Instanz, der man vertrauen muss. Der
schwierige Teil der Dezentralisierung ist am Ende nicht das Protokoll,
sondern Leute zu finden, die einen Knoten betreiben.

---

## Raspberry Pi einrichten

### Schritt 1 — System

Raspberry Pi OS Lite (64 Bit) reicht völlig. Eine Oberfläche braucht der
Knoten nicht.

**Nimm eine SSD oder einen USB-Stick statt der SD-Karte.** Der Knoten
schreibt bei jedem Block, und SD-Karten sterben an Schreibzyklen — nicht
sofort, sondern nach Monaten. Das ist die unangenehmere Variante.

```bash
sudo apt update && sudo apt upgrade -y
```

### Schritt 2 — Node.js

Gebraucht wird **ab Version 20**:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
```

### Schritt 3 — Knoten holen

```bash
cd ~
git clone https://github.com/dabitlex/YSKAR.git
cd YSKAR/observer
```

### Schritt 4 — Bündeln

```bash
npm install
npm run build
```

Ohne diesen Schritt müsste Node bei jedem Start die Typen aus dem Quelltext
und der gesamten Chain-Bibliothek entfernen — auf einem Pi kostet das
spürbar Zeit.

### Schritt 5 — Erster Lauf

```bash
node dist/yskar-observer.cjs --data ~/yskar-daten --once
```

```
YSKAR Beobachter 0.1.0
────────────────────────────────────────────────────────
  Netz     yskar-main-1
  Server   https://yskar.vercel.app
  Ablage   /home/pi/yskar-daten
────────────────────────────────────────────────────────

Kein Prüfpunkt — beginne bei Block 0.
[14:22:31] ✓ 61 Blöcke geprüft · Höhe 60 · Umlauf 53.375 YSR · 1.4s
```

`--once` holt alles auf und beendet sich. Ohne die Option läuft er weiter und
fragt jede Minute nach.

### Schritt 6 — Dauerbetrieb

`/etc/systemd/system/yskar-observer.service`:

```ini
[Unit]
Description=YSKAR Beobachter-Knoten
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/YSKAR/observer
ExecStart=/usr/bin/node dist/yskar-observer.cjs --data /home/pi/yskar-daten
Restart=always
RestartSec=30
Nice=10

# Ein Beobachter braucht nichts außer seinem Datenordner.
ProtectSystem=strict
ReadWritePaths=/home/pi/yskar-daten
PrivateTmp=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now yskar-observer
journalctl -u yskar-observer -f
```

`Nice=10` gibt anderen Programmen Vorrang. Die drei `Protect`-Zeilen sind
kein Zierrat: Der Knoten braucht Schreibzugriff auf genau einen Ordner, und
alles andere kann ihm das System verwehren.

---

## Was auf dem Pi 4 zu erwarten ist

| | |
|---|---|
| Blöcke je Jahr | rund 50.000 bei zehn Minuten Blockzeit |
| Speicher je Block | 188 Byte ohne Zahlungen, wenige hundert mit |
| Ein Jahr Kette | einige zehn Megabyte |
| Arbeitsspeicher | der Zustand, wenige Megabyte bei tausenden Konten |
| Rechenlast | Signaturprüfung, sonst nichts Nennenswertes |

Der Pi langweilt sich dabei. Der einzige Punkt, an dem er ins Schwitzen
käme, wären volle Blöcke mit tausenden Signaturen — und selbst dann hätte er
zehn Minuten Zeit für ein bis zwei Sekunden Arbeit.

---

## Optionen

| Option | Bedeutung | Vorgabe |
|---|---|---|
| `--api <url>` | Server | `https://yskar.vercel.app` |
| `--data <ordner>` | Ablage für Blöcke und Prüfpunkte | `./daten` |
| `--interval <sek>` | Abstand zwischen Abfragen | 60 |
| `--from-scratch` | Ablage verwerfen, bei Block 0 beginnen | |
| `--once` | Einmal aufholen und beenden | |

---

## Was in der Ablage liegt

```
daten/
  pruefpunkt.json          Zustand und Höhe, damit Neustarts schnell sind
  beobachter.log           Protokoll aller Meldungen
  bloecke/0000/00000000.bin
  bloecke/0000/00000001.bin
  …
```

Blöcke liegen in Tausenderordnern — ein Verzeichnis mit 50.000 Einträgen
bringt manche Dateisysteme spürbar aus dem Tritt.

Der Prüfpunkt ist eine Abkürzung, kein Beweis. Wer ihm nicht traut, startet
mit `--from-scratch`; dann wird alles erneut gerechnet. Beim Laden wird
ohnehin geprüft, ob der gespeicherte Zustand zu seiner eigenen Wurzel passt.

---

## Wenn er etwas findet

```
ABWEICHUNG GEFUNDEN
  Block 3: hash_stimmt_nicht
  Server nennt ffffffffffffffff…, errechnet 00000001fe2320a6…

  Der Server liefert etwas, das der Kette widerspricht.
  Geprüft bis Höhe 2. Die Blöcke bis dahin liegen in
  /home/pi/yskar-daten/bloecke und lassen sich nachrechnen.
```

Der Knoten hält dann an und beendet sich mit Rückgabewert 2. Das ist
Absicht: Ab einer Abweichung ist jede weitere Aussage wertlos.

Geprüft wurde das mit vier Manipulationen an echten Blöcken:

| Manipulation | Erkannt als |
|---|---|
| Hash erfunden | `hash_stimmt_nicht` |
| Byte in der Transaktion gekippt | `merkle_mismatch` |
| Nonce geändert, Hash mitgezogen | `pow_failed` |
| Coinbase-Betrag verdoppelt | `merkle_mismatch` |

---

## Nächste Stufen

**Stufe 2** — Blöcke einreichen. Der Beobachter darf Blöcke an den
Hauptknoten weiterreichen, Miner können auf ihn zeigen. Braucht ein
Protokoll zwischen Knoten, aber noch keine Gabelungsentscheidung.

**Stufe 3** — echtes P2P mit Fork-Wahl und Reorgs. Zwei Knoten finden
gleichzeitig einen Block, die Kette gabelt sich, und jeder muss entscheiden,
welcher Zweig gilt: Blöcke zurücknehmen, Zustand rückwärts rechnen,
Transaktionen zurück in den Mempool. Dort steckt der Großteil der Arbeit und
praktisch jeder Fehler, den Kryptoprojekte in diesem Bereich machen.

Vorbereitet ist einiges: `validateBlock` prüft einen fremden Block
vollständig, `cumulativeWork` entscheidet zwischen konkurrierenden Ketten,
`chain2.rollback_to` kann Höhen zurücknehmen, und der Konsens rechnet
ausschließlich ganzzahlig.
