# Von Vercel auf den eigenen Knoten

Schritt für Schritt. **Nichts davon ändert die laufende Kette** — die Mini
App läuft weiter, bis du im letzten Schritt umschaltest, und der Weg zurück
ist eine Zeile.

Lies vorher den Abschnitt „Was du dabei aufgibst" ganz unten.

---

## Was du brauchst

Einen Rechner, der **durchläuft** und **von außen erreichbar** ist. Ein
Raspberry im Wohnzimmer geht, ein kleiner VPS für 4 bis 6 Euro im Monat ist
zuverlässiger.

Dazu einen Namen mit HTTPS. Telegram Mini Apps verlangen ein gültiges
Zertifikat — ohne das lädt die App gar nicht erst.

---

## Schritt 1 — Knoten aufsetzen

Auf dem Zielrechner:

```bash
git clone https://github.com/dabitlex/YSKAR.git
cd YSKAR/node
npm install
npm run build
```

Node 22 oder neuer. Native Module gibt es keine, SQLite ist eingebaut.

## Schritt 2 — Kette holen

```bash
node dist/yskar-node.cjs sync --data ./knoten --once
node dist/yskar-node.cjs status --data ./knoten
```

**Die Zustandswurzel muss mit der von `https://yskar.vercel.app/api/v2/summary`
übereinstimmen.** Das ist der Beleg, dass der Knoten dieselbe Kette hat und
sie selbst nachgerechnet hat.

Stimmen sie nicht überein, brich hier ab und melde es.

## Schritt 3 — Dauerhaft laufen lassen

Als Dienst, damit er einen Neustart übersteht. Auf Linux:

```bash
sudo tee /etc/systemd/system/yskar.service > /dev/null <<'EOF'
[Unit]
Description=YSKAR Full Node
After=network-online.target

[Service]
Type=simple
User=yskar
WorkingDirectory=/home/yskar/YSKAR/node
ExecStart=/usr/bin/node dist/yskar-node.cjs mine --data ./knoten --bind 127.0.0.1 --port 8645
Restart=always
RestartSec=10

# Der Knoten braucht nur seinen eigenen Ordner.
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

**`--bind 127.0.0.1` ist Absicht.** Der Knoten soll nicht selbst aus dem
Netz erreichbar sein — davor kommt ein Vorschalt-Server mit TLS.

## Schritt 4 — HTTPS davor

Mit Caddy, weil es das Zertifikat selbst besorgt:

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

Prüfen:

```bash
curl https://knoten.deine-domain.de/api/v2/summary
```

Kommt dieselbe Zustandswurzel wie in Schritt 2, steht der Knoten.

## Schritt 5 — P2P öffnen

Damit andere Knoten ihn finden:

```bash
# in der systemd-Zeile ergänzen:
--p2p-port 8646
```

Port 8646 in der Firewall öffnen. Bei einem Knoten zu Hause zusätzlich im
Router weiterleiten.

```bash
sudo ufw allow 8646/tcp
```

Ein zweiter Knoten verbindet sich dann mit:

```bash
node dist/yskar-node.cjs mine --data ./knoten --seed knoten.deine-domain.de:8646
```

## Schritt 6 — Mit Supabase verbunden lassen

**Noch nichts abschalten.** Der Knoten holt weiter von Vercel und reicht
gefundene Blöcke dorthin — so laufen beide Seiten parallel, und du kannst
vergleichen.

Lass ihn ein paar Tage so laufen und schau gelegentlich:

```bash
node dist/yskar-node.cjs status --data ./knoten
```

Höhe und Zustandswurzel müssen mit dem Server übereinstimmen. **Wenn sie
über Tage übereinstimmen, ist der Knoten vertrauenswürdig genug für den
nächsten Schritt.**

## Schritt 7 — Die Mini App umstellen

Erst jetzt, und es ist eine Zeile.

Die App spricht ihre API über `/api/v2` auf derselben Adresse an. Für die
Umstellung bekommt sie eine Umgebungsvariable:

```
NEXT_PUBLIC_API_BASE=https://knoten.deine-domain.de
```

In Vercel unter **Settings → Environment Variables** eintragen und neu
bauen lassen.

**Zurück geht es genauso:** Variable löschen, neu bauen. Die App spricht
dann wieder mit Supabase.

> Der Code dafür ist noch nicht eingebaut. Sag Bescheid, wenn du bei
> Schritt 7 angekommen bist — es sind wenige Zeilen, aber sie gehören
> geprüft, bevor sie live gehen.

## Schritt 8 — Beobachten

Nach der Umstellung:

**Kommen noch Blöcke?** Im Explorer oder über `status`.

**Sehen die Miner ihre Shares?** Der Netz-Reiter zeigt „Gemessen, live".

**Läuft der Knoten stabil?** `systemctl status yskar` und
`journalctl -u yskar -f`.

Bei Problemen: Variable weg, neu bauen, zurück auf Supabase. Die Kette
selbst nimmt dabei keinen Schaden — sie liegt auf beiden Seiten
vollständig.

---

## Was du dabei aufgibst

Ehrlich, damit du es vorher weißt.

**Der Knoten wird zum Einzelpunkt.** Fällt er aus, stehen alle Miner. Heute
fällt bei einem Ausfall deines Rechners nichts aus, weil Supabase
weiterläuft.

Das wird erst besser, wenn **mehrere Knoten** laufen und die App bei einem
Ausfall auf einen anderen wechseln kann. Dafür braucht es eine Liste
mehrerer Adressen in der App — auch das ist gebaut, aber noch nicht
eingebaut.

**Du übernimmst den Betrieb.** Updates, Zertifikat, Festplatte, Strom. Ein
Raspberry mit einer müden SD-Karte ist eine schlechtere Grundlage als ein
VPS.

**Vercel bleibt trotzdem nötig** — für die Mini App selbst. Umgestellt wird
nur, woher sie ihre Daten holt.

---

## Was du gewinnst

**Der Konsens liegt auf einem Rechner, den du kontrollierst**, mit offenem
Code. Nicht in einer Datenbank bei einem Anbieter.

**Jeder kann einen zweiten Knoten aufsetzen** und dasselbe nachrechnen. Das
ging vorher nicht — bis vor kurzem stand nicht einmal das Datenbankschema
im Repository.

**Blöcke verbreiten sich direkt** zwischen Knoten. Das ist der Unterschied
zwischen „eine Kette, der man glauben muss" und einer, die man nachrechnen
kann.

---

## Kurzfassung

```
1. Knoten aufsetzen          npm install && npm run build
2. Kette holen               sync --once, Zustandswurzel vergleichen
3. Als Dienst starten        systemd, --bind 127.0.0.1
4. HTTPS davor               Caddy mit eigenem Namen
5. P2P öffnen                --p2p-port 8646, Firewall
6. Tagelang mitlaufen        Höhe und Wurzel vergleichen
7. App umstellen             NEXT_PUBLIC_API_BASE setzen
8. Beobachten                Blöcke, Shares, Dienst
```

Schritte 1 bis 6 kannst du jederzeit machen — sie ändern nichts. Erst
Schritt 7 schaltet um, und er ist in einer Minute rückgängig.
