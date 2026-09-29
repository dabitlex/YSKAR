# YSKAR als Dienst auf dem Raspberry Pi

Bisher lief der Knoten in einer SSH-Shell. Am 29.09.2026 hat sich gezeigt,
was das kostet: Beim Neubauen fiel die Sitzung weg, der Knoten war aus, und
weder Mining noch Wallet funktionierten — bis es jemandem auffiel. Der
Explorer lief weiter, weil er aus dem Supabase-Spiegel liest.

Diese Dateien machen daraus einen Dienst, der Neustarts überlebt.

    yskar-node.service      der Knoten, startet beim Booten mit
    yskar-spiegel.service   ein einzelner "spiegel"-Lauf
    yskar-spiegel.timer     ruft ihn alle 15 Minuten auf
    node.env.beispiel       Vorlage für den Spiegel-Token

Angelegt für Benutzer `yskar`, Ablage
`/home/yskar/YSKAR/node/knoten`, Pool `yskar-main.dynv6.net` ohne
Gebühr — so wie der Knoten bisher von Hand gestartet wurde. Weicht etwas
davon ab, vor dem Kopieren anpassen.


## VORHER: den node-Pfad prüfen

Das ist der Punkt, an dem systemd-Units am häufigsten scheitern.

    which node
    node --version

systemd kennt dein PATH nicht und lädt kein nvm. Steht dort etwas anderes
als `/usr/bin/node`, muss der Pfad in BEIDEN service-Dateien geändert
werden. Die Version muss 22 oder höher sein — der Knoten nutzt
`node:sqlite`, das es vorher nicht gibt.


## Einrichten

    cd ~/YSKAR

    # 1. Läuft noch ein Knoten von Hand? Erst den beenden.
    pkill -INT -f "yskar-node.cjs mine"

    # 2. Units einspielen
    sudo cp deploy/yskar-node.service    /etc/systemd/system/
    sudo cp deploy/yskar-spiegel.service /etc/systemd/system/
    sudo cp deploy/yskar-spiegel.timer   /etc/systemd/system/
    sudo systemctl daemon-reload

    # 3. Knoten starten und beim Booten aktivieren
    sudo systemctl enable --now yskar-node
    systemctl status yskar-node

    # 4. Zusehen, ob er wirklich läuft
    journalctl -u yskar-node -f

Läuft er, von außen gegenprüfen:

    curl -s https://yskar.vercel.app/api/v2/summary | head -c 200

Kommt eine Höhe statt `503 chain_unreachable`, steht der Knoten.

    # 5. Timer für den Spiegel
    sudo systemctl enable --now yskar-spiegel.timer
    systemctl list-timers yskar-spiegel.timer

Einen Lauf sofort auslösen, statt 15 Minuten zu warten:

    sudo systemctl start yskar-spiegel
    journalctl -u yskar-spiegel -n 30 --no-pager


## Danach: den Spiegel abschließen

Erst wenn Knoten und Timer sauber laufen.

    openssl rand -hex 32

    sudo mkdir -p /etc/yskar
    sudo cp deploy/node.env.beispiel /etc/yskar/node.env
    sudo nano /etc/yskar/node.env          # Wert eintragen
    sudo chmod 600 /etc/yskar/node.env
    sudo systemctl restart yskar-node

DANN erst in Vercel `YSKAR_SPIEGEL_TOKEN` auf denselben Wert setzen und neu
deployen. Die Reihenfolge steht in node.env.beispiel begründet — andersherum
bleibt der Spiegel stehen.


## Zwei Dinge, die du wissen solltest

**Der Timer-Lauf liest die Ablage, während der Knoten sie beschreibt.** Das
geht, weil SQLite im WAL-Modus läuft und `spiegel` nur liest. Getestet ist
es bisher nur mit ausgeschaltetem Knoten — beim ersten Timer-Lauf also
einmal ins Journal schauen. Sollte es klemmen, scheitert der eine Lauf und
der nächste holt es nach; die Kette nimmt keinen Schaden.

**`ProtectHome=read-only` mit `ReadWritePaths` auf die Ablage.** Der Dienst
darf in `~/YSKAR/node/knoten` schreiben und sonst nirgends in dein Home.
Verschiebst du die Ablage, muss diese Zeile mit — sonst startet der Knoten
und kann nichts speichern.


## Wenn etwas nicht geht

    systemctl status yskar-node
    journalctl -u yskar-node -n 50 --no-pager

`status=203/EXEC` heißt fast immer: falscher node-Pfad. Siehe oben.

`Read-only file system` beim Schreiben: `ReadWritePaths` zeigt nicht auf die
Ablage, die tatsächlich benutzt wird.

Knoten läuft, aber `/api/v2/summary` gibt 503: Dann liegt es nicht am
Dienst, sondern an Caddy, DNS oder dynv6 davor.
