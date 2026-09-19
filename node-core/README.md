# YSKAR Node Core — Windows Test Build

Dieses Verzeichnis ist **zusätzlich** zum bestehenden YSKAR-Repo. Es verändert keine bestehende Datei des Full Nodes.

## Was es macht

- nutzt die vorhandenen `ChainStore`, `ChainManager`, `PeerManager`, `SyncManager`, `MiningServer` und `MiningCoordinator`
- richtet einen lokalen Full Node über einen 3-Schritte-Assistenten ein
- verwendet standardmäßig `80.145.153.251:8646` als Seed (Node #1)
- speichert standardmäßig unter `%LOCALAPPDATA%\\YSKAR\\Node`
- startet die bestehende Node-API auf `127.0.0.1:8645`
- startet P2P auf `0.0.0.0:8646`
- synchronisiert ausschließlich über das P2P-Netz
- öffnet eine lokale Dashboard-Oberfläche über Microsoft Edge im App-Modus
- kein Windows-Service, kein Autostart, keine Hintergrundfunktion in dieser Testversion

## Windows Build

Voraussetzung: Node.js >= 25.5.0. Node 26 ist geeignet.

Im Ordner `node-core`:

```powershell
npm install
npm run build
```

Danach:

```text
node-core\\dist\\YSKAR-Node-Core.exe
```

Die vorhandene Full-Node-Implementierung wird dabei nicht verändert. Node.js unterstützt seit 25.5 die Erstellung von Single-Executable-Anwendungen über `--build-sea`; Windows wird dabei unterstützt.

## Wichtig

Der erste Test sollte mit dem bereits laufenden Raspberry Node #1 als Seed durchgeführt werden:

```text
80.145.153.251:8646
```

Wenn Node #1 auf dem Raspberry läuft, sollte der Windows Node nach dem Start eine Peer-Verbindung aufbauen und die Chain lokal synchronisieren.
