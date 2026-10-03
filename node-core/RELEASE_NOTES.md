**YSKAR Node Core 0.5.0** — der vollständige YSKAR-Knoten für Windows mit eigenem Fenster: Wallet, Mining (solo, im Pool oder als Betreiber eines Pools), Blockchain-Ansicht und Peers.

## Neu in 0.5.0

- **Wallet im Programm.** 12 Wörter, verschlüsselt auf diesem PC. Senden mit Prüfschritt, Empfangen mit QR-Code, Kontakte, Verlauf. Vor jeder Überweisung wird das Passwort verlangt.
- **Mining im Pool.** Dieselbe Pool-Liste wie in der App, dazu jede andere Pool-Adresse. Nimmt der Pool dich nicht mehr auf, stoppt das Mining und sagt warum – es rechnet nie stillschweigend solo weiter.
- **Eigenen Pool betreiben.** Name, Gebühr von 0 bis 5 %, Zahl der Plätze. Der Knoten zahlt jeden Block selbst aus.
- **Programm.** Start mit Windows, Weiterlaufen im Infobereich neben der Uhr, Mining nach dem Start fortsetzen, Hinweis auf neue Versionen. Deutsch und Englisch.
- **Sicherheit.** Drei Fehler in der Schnittstelle des Knotens sind behoben: Eine bestimmte Anfrage konnte den Knoten beenden, ein Share konnte im Pool mehrfach gutgeschrieben werden, und Meldungen über Miner konnten den Arbeitsspeicher füllen. Wer einen Knoten oder Pool betreibt, sollte aktualisieren.

## Installieren

1. `YSKAR-Node-Core-Setup-0.5.0.exe` herunterladen und starten.
2. Der Installer ist nicht signiert. Windows zeigt deshalb „Der Computer wurde durch Windows geschützt“ – dort „Weitere Informationen“ und „Trotzdem ausführen“ wählen.
3. Läuft schon ein Node Core, ihn vorher beenden – auch im Infobereich neben der Uhr.

Wer sichergehen will, vergleicht die Prüfsumme mit der Datei `.sha256`:

```powershell
Get-FileHash .\YSKAR-Node-Core-Setup-0.5.0.exe -Algorithm SHA256
```

**Voraussetzungen:** Windows 10 oder 11 (64 Bit). Für Mining mit der Grafikkarte eine NVIDIA-Karte mit aktuellem Treiber; ohne sie rechnet der Prozessor.

**Vor Blockhöhe 4.000 aktualisieren:** Ab dieser Höhe gilt die Konsensfassung 3. Ältere Knoten bleiben dort stehen. Einzelheiten in `docs/CONSENSUS_V3.md`.

---

**YSKAR Node Core 0.5.0** — the full YSKAR node for Windows with its own window: wallet, mining (solo, in a pool, or running a pool), blockchain view and peers.

## New in 0.5.0

- **Wallet in the program.** 12 words, encrypted on this PC. Send with a review step, receive with QR code, contacts, history. The password is asked before every transfer.
- **Mining in a pool.** The same pool list as in the app, plus any other pool address. If the pool no longer accepts you, mining stops and says why – it never silently continues solo.
- **Run your own pool.** Name, fee from 0 to 5 %, number of places. The node pays out every block itself.
- **Program.** Start with Windows, keep running in the notification area, resume mining after start, notice about new versions. German and English.
- **Security.** Three bugs in the node's interface are fixed: a certain request could end the node, a share could be credited repeatedly in a pool, and reports about miners could fill the memory. Anyone running a node or pool should update.

## Install

1. Download and run `YSKAR-Node-Core-Setup-0.5.0.exe`.
2. The installer is not signed. Windows therefore shows “Windows protected your PC” – choose “More info” and “Run anyway”.
3. If a Node Core is already running, quit it first – also in the notification area.

To be sure, compare the checksum with the `.sha256` file (command above).

**Requirements:** Windows 10 or 11 (64-bit). For GPU mining an NVIDIA card with a current driver; without it the processor does the work.

**Update before block height 4,000:** from that height consensus revision 3 applies. Older nodes stop there. Details in `docs/CONSENSUS_V3.md`.
