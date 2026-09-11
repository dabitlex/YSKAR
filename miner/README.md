# YSKAR Miner

Eigenständiger Miner für Windows, macOS und Linux. Er braucht **nur eine
Adresse** — keinen privaten Schlüssel, keine Wallet, keine Anmeldung.

Die Coinbase eines gefundenen Blocks geht direkt an die Adresse, die du
angibst. Mehr muss der Miner über dich nicht wissen. Deshalb kannst du ihn
bedenkenlos auf einem fremden Rechner laufen lassen — und deshalb kann auch
jemand anderes für dich minen, ohne dass du ihm etwas anvertraust.

---

## Schritt 1 — Node.js installieren

Der Miner braucht **Node.js ab Version 20**. Prüf zuerst, ob du es schon hast:

```bash
node --version
```

Kommt eine Zahl ab `v20`, überspring diesen Schritt.

**Windows** — [nodejs.org](https://nodejs.org) öffnen, die LTS-Fassung
herunterladen, Installer durchklicken. Danach ein **neues**
Eingabeaufforderungs-Fenster öffnen, sonst kennt es `node` noch nicht.

**macOS** — entweder von [nodejs.org](https://nodejs.org), oder per Homebrew:

```bash
brew install node
```

**Linux** — über den Paketmanager der Distribution, oder:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

---

## Schritt 2 — Miner holen

Den Ordner `miner/` aus dem Repo kopieren, oder das ganze Projekt klonen:

```bash
git clone https://github.com/dabitlex/YSKAR.git
cd YSKAR/miner
```

**Es gibt nichts zu installieren.** Der Miner hat keine Abhängigkeiten —
kein `npm install` nötig. Alles, was er braucht, liegt im Ordner:
`src/` und die Datei `miner.<hash>.wasm`.

---

## Schritt 3 — Prüfen, ob alles passt

```bash
node src/selbsttest.mjs
```

Erwartete Ausgabe:

```
Engine      miner.57f237a2a4.wasm
Selbsttest  bestanden (Genesis-Hash stimmt)
Ein Kern    1.72 MH/s
Kerne       8
Erwartet    12.04 MH/s mit 7 Threads
```

Der Selbsttest rechnet den Genesis-Block der Kette nach und vergleicht mit
dem bekannten Ergebnis. Besteht er, passen Engine und Serialisierung
zusammen — und du weißt außerdem schon, was dein Rechner leistet.

Schlägt er fehl, stimmt etwas an der Installation nicht. Dann bringt es
nichts, trotzdem zu minen: Der Miner würde mit voller Geschwindigkeit
rechnen und nie einen Share abliefern.

---

## Schritt 4 — Adresse besorgen

Du brauchst eine YSKAR-Adresse. Sie sieht so aus:

```
ysr1at4jxzcln84ys38s0spw23l0wn7pquz5w6eyf4
```

Die bekommst du in der Telegram Mini App unter **Wallet → Empfangen**.
Kopieren und bereithalten.

Wenn du noch keine Wallet hast: In der Mini App eine anlegen, die zwölf
Wörter auf Papier notieren, und danach die Adresse kopieren.

**Die Adresse ist öffentlich.** Sie weiterzugeben ist unbedenklich — im
Gegensatz zu den zwölf Wörtern, die niemand sonst sehen darf.

---

## Schritt 5 — Loslegen

```bash
node src/cli.mjs --address ysr1at4jxzcln84ys38s0spw23l0wn7pquz5w6eyf4
```

Oder ohne alles — dann fragt der Miner nach der Adresse:

```bash
node src/cli.mjs
```

```
YSKAR Miner 0.1.0
────────────────────────────────────────────────────
Der Reward eines gefundenen Blocks geht an diese Adresse.
Zu finden in der Telegram Mini App unter Wallet → Empfangen.

YSKAR-Adresse: ysr1at4jxz…

Adresse merken, damit die Frage künftig entfällt? [J/n]
```

Wer ja sagt, legt eine Datei `yskar-miner.json` **neben dem Programm** ab.
Ab dann genügt ein Doppelklick. Gelöscht wird sie mit `--forget`.

Darin steht nur, was ohnehin öffentlich ist: Adresse, Threadzahl,
Intensität. Der Miner kennt keine Schlüssel und kann deshalb auch keine
verlieren.

Das war's. Der Miner nimmt automatisch alle Kerne bis auf einen — der bleibt
für das Betriebssystem, damit der Rechner bedienbar bleibt.

```
YSKAR Miner 0.1.0
────────────────────────────────────────────────────
  Adresse     ysr1at4jxzcln84ys38s0spw23l0wn7pquz5w6eyf4
  Server      https://yskar.vercel.app
  Threads     7 von 8 Kernen
  Intensität  100 %
────────────────────────────────────────────────────

[14:22:31] 12.04 MH/s · 12 angenommen, 0 abgelehnt · Block #58 · Diff 18.150
[14:24:07] BLOCK GEFUNDEN  #59   +875 YSR
           000000a91c4d8e2f7b3a19c05e6d8f41a2b7c93e5d0f6a8b1c4e7d2f9a3b5c8e
```

Beenden mit **Strg+C**. Der Miner schließt dabei seine Sitzung sauber ab und
zeigt eine Zusammenfassung.

---

## Mehrere Miner auf eine Adresse

Ausdrücklich vorgesehen: Handy und Rechner gleichzeitig, mehrere Rechner,
oder ein Rechner mit mehreren Instanzen. Alle Rewards gehen an dieselbe
Adresse.

Jede Sitzung bekommt vom Server einen eigenen Nonce-Bereich, die Miner
kommen sich also nicht ins Gehege und doppelte Arbeit entsteht nicht.

Höchstens **acht gleichzeitig** je Adresse. Wird der Deckel erreicht, sagt
der Miner das beim Start. Abgestürzte Sitzungen schließen sich nach fünf
Minuten von selbst.

## Optionen

| Option | Kurz | Bedeutung | Vorgabe |
|---|---|---|---|
| `--address` | `-a` | Zieladresse für den Reward | **Pflicht** |
| `--workers` | `-w` | Rechen-Threads | Kerne minus 1 |
| `--intensity` | `-i` | Anteil der Rechenzeit, 1–100 | 100 |
| `--api` | | Server | `https://yskar.vercel.app` |

```bash
# Nebenbei minen, ohne dass der Rechner zäh wird
node src/cli.mjs -a ysr1… -w 2 -i 50

# Alles geben
node src/cli.mjs -a ysr1… -w 8 -i 100
```

`--intensity` ist ehrlich umgesetzt: Der Miner rechnet und schläft anteilig.
50 Prozent heißt halb so viele Hashes, nicht eine kleinere Anzeige.

---

## Eigenständige Datei bauen (ohne Node beim Empfänger)

Wenn der Miner an Leute gehen soll, die kein Node installieren wollen, lässt
sich daraus **eine einzelne Datei** bauen — unter Windows eine `.exe`, die
man doppelklickt.

```bash
cd YSKAR/miner
npm install            # einmalig, nur zum Bauen (esbuild + postject)
npm run build:exe
```

**Unter Windows mit PowerShell** hängst du `.cmd` an. PowerShell führt
standardmäßig keine Skripte aus, und npm liegt dort als `npm.ps1` vor:

```powershell
npm.cmd install
npm.cmd run build:exe
```

Alternativ einmalig freischalten — das ist die von Microsoft für
Arbeitsplätze empfohlene Einstellung und braucht keine Administratorrechte:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

In der Eingabeaufforderung (`cmd`) statt PowerShell tritt das Problem gar
nicht auf.

Ergebnis: `dist/yskar-miner.exe` (Windows) beziehungsweise `dist/yskar-miner`
(macOS, Linux). Rund 120 MB — darin steckt die komplette Node-Laufzeit.

```
dist\yskar-miner.exe --address ysr1…
```

**Gebaut wird immer für das System, auf dem gebaut wird.** Eine `.exe` für
Windows kann nur auf Windows entstehen, weil dafür Windows' eigene `node.exe`
als Grundlage dient. Wer für mehrere Systeme ausliefern will, baut auf jedem
einmal — oder lässt es von einem Dienst wie GitHub Actions erledigen.

Zum Bauen wird Node gebraucht. Zum **Ausführen** der fertigen Datei nicht.

Beim ersten Start kann Windows SmartScreen anschlagen: Eine frisch gebaute,
unsignierte Datei, die ins Netz geht, ist genau das Muster, bei dem es
vorsichtig ist. Für den eigenen Rechner durchwinken. Soll die Datei an
andere gehen, bräuchte sie eine Codesignatur — das kostet Geld und ist ein
eigenes Thema.

### Was dabei passiert

Node kann seit Fassung 20 ein Skript in seine eigene Binärdatei einbetten.
Drei Dinge muss der Bau dafür lösen:

- Alles muss in **einer** Datei liegen. Der Bündler fasst den Quelltext zu
  einer CommonJS-Datei zusammen.
- Eine Binärdatei hat kein Dateisystem daneben. Die WASM-Engine wird deshalb
  als base64 eingebettet.
- Rechen-Threads können keine Datei nachladen. Ihr Quelltext wird
  mitgebündelt und als Zeichenkette übergeben.

Das Einfügen des Datenblocks ruft `postject` über seine
Programmierschnittstelle auf, nicht über `npx`. Node verweigert seit einer
Sicherheitskorrektur das Starten von `.cmd`-Dateien ohne Shell — der Umweg
über `npx.cmd` scheitert dort mit `EINVAL`.

Der Quelltext bleibt dabei derselbe wie im Ordnerbetrieb — `cli.mjs` erkennt
beide Fälle selbst. Zwei getrennte Fassungen wären eine Verdopplung, und
genau daran ist in diesem Projekt schon zweimal etwas zerbrochen.

---

## Als Befehl einrichten (optional)

Damit `yskar-miner` von überall funktioniert:

```bash
cd YSKAR/miner
npm link
yskar-miner -a ysr1…
```

Rückgängig mit `npm unlink -g yskar-miner`.

---

## Dauerbetrieb

**Linux mit systemd** — `/etc/systemd/system/yskar-miner.service`:

```ini
[Unit]
Description=YSKAR Miner
After=network-online.target

[Service]
ExecStart=/usr/bin/node /pfad/zu/YSKAR/miner/src/cli.mjs --address ysr1… --intensity 80
Restart=always
RestartSec=15
User=dein-benutzer
Nice=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now yskar-miner
journalctl -u yskar-miner -f
```

`Nice=10` gibt anderen Programmen Vorrang — der Rechner bleibt bedienbar.

**Raspberry Pi** — läuft, aber rechne mit deutlich weniger Leistung als auf
einem Desktop. Für einen Pi 4 sind ein bis zwei Threads sinnvoll; mehr bringt
wenig und macht ihn heiß.

---

## Wenn etwas nicht stimmt

**„Verbindung fehlgeschlagen"** — prüf, ob der Server erreichbar ist:

```bash
curl https://yskar.vercel.app/api/v2/summary
```

**„Das sieht nicht nach einer YSKAR-Adresse aus"** — die Adresse beginnt mit
`ysr1` und ist rund 42 Zeichen lang. Beim Kopieren gern mal ein Leerzeichen
oder Zeilenumbruch mitgenommen.

**Selbsttest schlägt fehl** — die Datei `miner.<hash>.wasm` fehlt oder ist
beschädigt. Ordner neu holen.

**Viele abgelehnte Shares** — einzelne Ablehnungen sind normal, sie
entstehen, wenn der Server das Share-Ziel gerade anpasst. Werden es mehr als
etwa jeder zehnte, stimmt etwas nicht; dann melde dich mit der Ausgabe.

**Keine Shares, obwohl die Hashrate läuft** — dann rechnet der Miner gegen
ein falsches Ziel. Das sollte der Selbsttest abfangen; wenn nicht, ist es
ein Fehler und ich will davon wissen.

---

## Was der Miner nicht tut

Er fasst **keine Schlüssel** an, kann **kein Guthaben bewegen** und speichert
nichts außer dem, was auf dem Bildschirm steht. Er kennt nur eine Adresse und
rechnet Hashes.

Was er tut, ist nachprüfbar: Der Quelltext liegt offen, und jeder Share, den
er einreicht, wird vom Server unabhängig nachgerechnet. Er kann nichts
behaupten, was nicht stimmt.
