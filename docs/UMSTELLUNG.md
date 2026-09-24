# Umstellung: Die Kette zieht auf den Full Node

Danach entscheidet dein Knoten, welcher Block gültig ist — nicht mehr
Supabase. Supabase bleibt, aber als **Spiegel**: Explorer, Guthaben,
Verlauf, Kennzahlen.

**Die Schritte 1 bis 6 ändern nichts.** Sie lassen sich jederzeit machen und
jederzeit abbrechen. Erst Schritt 7 schaltet um, und er ist in einer Minute
rückgängig.

---

## Der entscheidende Satz

> **Autorität hat, wer die Mining-Jobs ausgibt — nicht, wer die Daten
> speichert.**

Ein Job legt fest: welcher Vorgänger, welche Transaktionen, welche
Zustandswurzel. Das *ist* der Block. Wer ihn baut, bestimmt die Kette. Wer
ihn hinterher nur ablegt, bestimmt gar nichts.

Deshalb ziehen **nur vier Routen** um:

| Route | wohin | warum |
|---|---|---|
| `/session` `/job` `/share` | **Knoten** | Autorität, Frist von 90 s |
| `POST /tx` | **Knoten** | muss in den Mempool des Erbauers |
| `/summary` `/blocks` `/account` `/search` | Supabase | ein paar Sekunden Verzug schaden nicht |

Ein Spiegel darf keine Jobs ausgeben: Ein Job lebt 90 Sekunden und muss auf
dem **aktuellen** Kopf stehen. Ein Spiegel ist definitionsgemäß hinterher —
die Telefone bauten auf einem veralteten Vorgänger, und ihre Treffer wären
`stale_job`.

---

## Schritt 1 — Knoten aufsetzen

Auf dem Zielrechner. Node 22 oder neuer; native Module gibt es keine.

```bash
git clone https://github.com/dabitlex/YSKAR.git
cd YSKAR
npm install
cd node && npm install && npm run build
```

## Schritt 2 — Kette holen und vergleichen

```bash
node dist/yskar-node.cjs sync --data ./knoten --once
node dist/yskar-node.cjs status --data ./knoten
```

**Die Zustandswurzel muss mit der von
`https://yskar.vercel.app/api/v2/summary` übereinstimmen.**

Das ist der eigentliche Beleg: zwei unabhängig gerechnete Zustände, dasselbe
Ergebnis. Stimmen sie nicht überein, hier abbrechen und melden.

## Schritt 3 — Als Dienst starten

```bash
sudo tee /etc/systemd/system/yskar.service > /dev/null <<'EOF'
[Unit]
Description=YSKAR Full Node
After=network-online.target

[Service]
Type=simple
User=yskar
WorkingDirectory=/home/yskar/YSKAR/node
ExecStart=/usr/bin/node dist/yskar-node.cjs mine --data ./knoten \
  --bind 127.0.0.1 --port 8645 --p2p-port 8646
Restart=always
RestartSec=10
ProtectSystem=strict
ReadWritePaths=/home/yskar/YSKAR/node/knoten
PrivateTmp=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable --now yskar
sudo systemctl status yskar
```

`--bind 127.0.0.1` ist Absicht: Der Knoten soll nicht selbst aus dem Netz
erreichbar sein. Davor kommt ein Vorschalt-Server mit TLS.

## Schritt 4 — HTTPS davor

**Ohne das geht es nicht.** Telegram lädt Mini Apps nur über HTTPS, und ein
Aufruf auf `http` scheitert im Browser.

```bash
sudo apt install caddy
sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
knoten.deine-domain.de {
    reverse_proxy 127.0.0.1:8645

    # Die Mini App läuft auf einer anderen Adresse als der Knoten.
    header Access-Control-Allow-Origin "*"
    header Access-Control-Allow-Methods "GET, POST, OPTIONS"
    header Access-Control-Allow-Headers "content-type"

    @options method OPTIONS
    respond @options 204
}
EOF
sudo systemctl reload caddy
```

Der Name muss vorher per DNS auf den Rechner zeigen.

```bash
curl https://knoten.deine-domain.de/api/v2/summary
```

Kommt dieselbe Zustandswurzel wie in Schritt 2, steht der Knoten.

## Schritt 5 — P2P öffnen

```bash
sudo ufw allow 8646/tcp
```

Bei einem Knoten zu Hause zusätzlich im Router weiterleiten. Ein zweiter
Knoten verbindet sich dann mit:

```bash
node dist/yskar-node.cjs mine --data ./knoten --seed knoten.deine-domain.de:8646
```

## Schritt 6 — Mitlaufen lassen und vergleichen

**Noch nichts abschalten.** Der Knoten holt weiter von Vercel und reicht
gefundene Blöcke dorthin. Beide Seiten laufen parallel.

Lass das ein paar Tage so und schau gelegentlich:

```bash
node dist/yskar-node.cjs status --data ./knoten
curl -s https://yskar.vercel.app/api/v2/summary
```

**Stimmen Höhe und Zustandswurzel über Tage überein, ist der Knoten reif für
Schritt 7.** Vorher nicht.

---

## Schritt 7 — Umschalten

Eine Umgebungsvariable in Vercel:

```
NEXT_PUBLIC_MINING_BASE = https://knoten.deine-domain.de
```

**Settings → Environment Variables**, dann neu bauen lassen.

Was passiert: `/session`, `/job`, `/share` und `POST /tx` gehen ab sofort an
deinen Knoten. Alles andere bleibt unverändert bei Supabase.

**Zurück geht es genauso:** Variable löschen, neu bauen. Die Kette nimmt
dabei keinen Schaden — sie liegt auf beiden Seiten vollständig.

## Schritt 8 — Die alte Autorität stilllegen

**Erst jetzt, und erst wenn Schritt 7 nachweislich läuft.**

Zwei Autoritäten dürfen nie gleichzeitig Jobs ausgeben. Sonst entstehen zwei
Zweige, die beide „gültig" sind, und die Kette spaltet sich.

Solange niemand mehr gegen Vercel mint, passiert nichts — die Routen liegen
nur brach. Sicherer ist es trotzdem, sie zu schließen: In
`src/app/api/v2/session/route.ts`, `job` und `share` am Anfang der Funktion

```ts
return NextResponse.json(
  { error: 'moved', detail: 'Mining läuft jetzt über die Full Nodes.' },
  { status: 410, headers: CORS });
```

Vorher prüfen, dass wirklich niemand mehr dort mint:

```sql
select count(*) from chain2.sessions
where status = 'active' and last_share_at > now() - interval '1 hour';
```

## Schritt 9 — Beobachten

| | |
|---|---|
| Kommen noch Blöcke? | Explorer oder `status` |
| Sehen die Miner ihre Shares? | Netz-Reiter zeigt „Gemessen, live" |
| Läuft der Knoten? | `systemctl status yskar`, `journalctl -u yskar -f` |
| Bleibt der Spiegel dran? | Höhe in Supabase gegen `status` |

Bei Problemen: Variable weg, neu bauen, zurück auf Supabase.

---

## Wie der Spiegel gefüllt wird

Dein Knoten schickt **jeden angenommenen Block** an Vercel — den selbst
gefundenen wie den, der über P2P hereinkam. Vercel rechnet ihn nach und
schreibt ihn fest.

Dass Supabase dabei weiter jeden Block prüft, ist kein Widerspruch, sondern
nützlich: Ein Spiegel, der prüft, was er spiegelt, kann keinen Unsinn
aufnehmen.

```
Full Node  =  die Wahrheit
   ├── P2P zu anderen Knoten
   ├── Mining + Transaktionen   ← Telefone direkt
   └── jeder Block              → Supabase = Spiegel
                                       ↑
                               Explorer, Guthaben, Verlauf
```

**Fällt der Spiegel aus, läuft die Kette weiter.** Fehler beim Weitergeben
werden gemeldet, nicht behandelt — der Spiegel darf die Kette nie aufhalten.
Er holt auch nicht von selbst auf; dafür gibt es den Abgleich von der
anderen Seite.

## Was du dabei aufgibst

Ehrlich, damit du es vorher weißt.

**Der Knoten wird zum Einzelpunkt.** Fällt er aus, stehen alle Miner. Heute
fällt bei einem Ausfall deines Rechners nichts aus, weil Supabase
weiterläuft.

Das wird erst besser, wenn **mehrere Knoten** laufen und die App bei einem
Ausfall auf einen anderen wechseln kann. Dafür bräuchte es eine Liste
mehrerer Adressen in der App — das ist noch nicht gebaut.

**Du übernimmst den Betrieb.** Updates, Zertifikat, Festplatte, Strom. Ein
Raspberry mit einer müden SD-Karte ist eine schlechtere Grundlage als ein
VPS.

**Vercel bleibt trotzdem nötig** — für die Mini App selbst. Umgestellt wird
nur, woher sie ihre Mining-Jobs holt.

## Was du gewinnst

**Der Konsens liegt auf einem Rechner, den du kontrollierst**, mit offenem
Code — nicht in einer Datenbank bei einem Anbieter.

**Jeder kann einen zweiten Knoten aufsetzen** und dasselbe nachrechnen.

**Blöcke verbreiten sich direkt** zwischen Knoten. Das ist der Unterschied
zwischen einer Kette, der man glauben muss, und einer, die man nachrechnen
kann.

---

## Kurzfassung

```
1. Knoten aufsetzen       npm install && npm run build
2. Kette holen            sync --once, Zustandswurzel vergleichen
3. Als Dienst starten     systemd, --bind 127.0.0.1
4. HTTPS davor            Caddy — ohne TLS kein Telegram
5. P2P öffnen             Port 8646
6. Tagelang vergleichen   Höhe und Wurzel
───────────────────────── bis hier ändert sich nichts
7. Umschalten             NEXT_PUBLIC_MINING_BASE setzen
8. Alte Routen schließen  erst wenn 7 läuft
9. Beobachten
```
