# GPU-Mining (CUDA)

Ein eigenständiges Programm, `yskar-cuda.exe`, das der Node Core als
Kindprozess startet. Es rechnet Hashes und meldet Nonces, deren Hash das Ziel
erfüllt. **Ob daraus ein Block wird, entscheidet der Knoten** — über
`MiningCoordinator.submitNonce()` und dieselbe vollständige Prüfung wie für
jeden anderen Block.

## Was geprüft ist und was nicht

Ehrlich, damit du weißt, worauf du dich verlassen kannst.

**Geprüft, ohne Grafikkarte:**

| | |
|---|---|
| SHA-256d für den 136-Byte-Header | bitgenau gegen den echten Genesis (`gcc`, dieselbe Datei wie für die GPU) |
| Nonce an Offset 128, Little-Endian | ebenso |
| Zielvergleich byteweise von vorn | wie `submitNonce()` |
| Protokoll zum Node Core | Job, Treffer, Fortschritt, Fehler |
| Jobwechsel, veraltete Jobs, Neustart | mit der CPU-Nachbildung |
| Treffer werden echte Blöcke | vom Knoten vollständig geprüft und angenommen |
| Absturz, fehlendes Programm, falsch rechnende Karte | Knoten läuft weiter |

**Nicht geprüft, weil hier keine NVIDIA-Karte vorhanden ist:**

- dass `nvcc` die Datei unter Windows übersetzt
- dass der Kernel auf einer echten Karte läuft
- wie schnell er auf der 940MX ist

Das zeigt erst der Selbsttest auf deinem Rechner — Schritt 3 unten. **Er ist
kein Beiwerk, sondern der eigentliche Beweis.**

## Warum ein eigenes Programm

Kein natives Node-Modul, aus drei Gründen:

**Ein Treiberabsturz reißt nur dieses Programm mit**, nicht den Knoten. Der
Node Core meldet dann „GPU nicht verfügbar" und läuft weiter.

**Kein Neubau bei jedem Node- oder Electron-Update.** Ein natives Modul muss
genau zur Laufzeit passen, ein Programm nicht.

**Ohne CUDA fehlt einfach diese Datei.** Der Node Core baut und startet
trotzdem.

## Schritt für Schritt auf deinem Rechner

Alle Befehle in PowerShell, im Ordner `node-core` des Repositorys.

### 1. Bauen

```powershell
powershell -ExecutionPolicy Bypass -File gpu\build-gpu.ps1 -Nvcc "C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v11.8\bin\nvcc.exe"
```

Der Pfad ist der Standardort von CUDA 11.8. Liegt es woanders, dort anpassen.

**Warum 11.8 und nicht 12 oder 13:** Deine 940MX hat Compute Capability 5.0.
Neuere CUDA-Fassungen können diese Architektur nicht mehr übersetzen. Das
Skript fragt `nvcc` selbst, welche Architekturen es kennt, und überspringt
den Rest mit einer Meldung — es rät nicht.

**Visual Studio 2026:** CUDA 11.8 kennt diese Fassung nicht und bricht mit
„unsupported Microsoft Visual Studio version" ab. Das Skript versucht es
dann ein zweites Mal mit `-allow-unsupported-compiler`. Das ist ein
offizieller Schalter, der nur die Versionsprüfung abschaltet. Der Kernel
benutzt auf der GPU keine Standardbibliothek, das Risiko ist daher gering —
aber es ist eines, und genau deshalb gibt es Schritt 3.

Das Skript sucht Visual Studio selbst über `vswhere` und übernimmt die
Umgebung. Du musst keine „Developer PowerShell" öffnen.

Ergebnis: `gpu\bin\yskar-cuda.exe`. Am Ende zeigt das Skript, welche Karte es
findet.

### 2. Karte erkennen

```powershell
.\gpu\bin\yskar-cuda.exe --probe
```

Erwartet für die 940MX etwa:

```
{"t":"device","id":0,"name":"NVIDIA GeForce 940MX","cc":"5.0","vram":2147483648,"sm":3}
```

### 3. Selbsttest — der entscheidende Schritt

```powershell
.\gpu\bin\yskar-cuda.exe --selftest --device 0
```

Die **Karte selbst** rechnet den Genesis-Hash und vergleicht ihn Bit für Bit.
Dazu: Erkennt der Kernel die Genesis-Nonce als Treffer, und die daneben
nicht?

Bestanden sieht so aus:

```
{"t":"selftest","hash":"000000090a14a03f1562d11113d539c1208b8078c6391da6c48f6bcf72c33c66","expected":"000000090a14a03f..."}
{"t":"selftest","ok":true,"check":"Genesis-Hash bitgenau"}
{"t":"selftest","ok":true,"check":"Genesis-Nonce als Treffer erkannt"}
{"t":"selftest","ok":true,"check":"Nonce daneben ist kein Treffer"}
{"t":"selftest","result":"PASSED"}
```

**Steht dort `FAILED`, bitte nicht minen** und mir die Ausgabe schicken. Der
Node Core lehnt eine solche Karte ohnehin ab: Er führt diesen Test vor jedem
GPU-Start selbst aus.

### 4. Leistung messen

```powershell
.\gpu\bin\yskar-cuda.exe --bench 10 --device 0
```

Zehn Sekunden, die ersten zwei zum Einregeln nicht mitgezählt. Das Ziel ist
unerreichbar, damit kein Treffer die Zählung stört:

```
{"t":"bench","hashes":...,"seconds":10.0,"hashrate":...,"mhs":...}
```

**Das ist gemessen, nicht geschätzt** — gezählte Hashes durch gemessene
Zeit. Mit diesem Wert und deiner CPU-Hashrate (rund 2,5 MH/s) hast du den
Vergleich.

### 5. Node Core bauen und starten

```powershell
npm install
npm run build
npm start
```

Der Build legt die Mining-Engine nach `dist\` und meldet, ob er
`gpu\bin\yskar-cuda.exe` gefunden hat. In der App unter **Mining** erscheint
die Karte dann mit Namen, Compute Capability und VRAM.

### 6. Installer

```powershell
npm run dist
```

Liegt `gpu\bin\yskar-cuda.exe` vor, legt der Installer sie neben die App —
außerhalb des asar-Archivs, weil sich Programme daraus nicht starten lassen.
Fehlt sie, entsteht ein Installer ohne GPU-Mining. **Beides ist gültig.**

## Warum drei Dateien statt einer

Neuere MSVC-Fassungen weigern sich, ihre C++-Standardbibliothek mit CUDA
vor 12.4 zu übersetzen:

```
yvals_core.h: error STL1002: Unexpected compiler version, expected CUDA 12.4 or newer
```

CUDA 12.4 kann aber Compute Capability 5.0 nicht mehr — dafür braucht es
11.8. Beides zugleich geht nur, wenn `nvcc` die Standardbibliothek gar nicht
erst zu sehen bekommt.

Deshalb baut das Skript in drei Schritten:

```
nvcc  -c yskar_gpu.cu     nur der Kernel, keine Standardbibliothek
cl    /c yskar_host.cpp   Protokoll und Fäden, kein CUDA
nvcc  verbindet beide
```

Dazwischen liegt `yskar_backend.h`, eine schmale C-Schnittstelle. Über sie
geht keine Standardbibliothek. Dieselbe Schnittstelle bedient auch
`yskar_cpu.cpp`, die Nachbildung zum Prüfen ohne Grafikkarte.

## Wie der Kernel arbeitet

**Midstate.** Der Header ist 136 Byte: zwei volle SHA-256-Blöcke und acht
Byte im dritten. Die Nonce liegt ganz im dritten. Der Zustand nach den
ersten beiden Blöcken ist also für einen ganzen Job gleich und wird einmal
gerechnet. Je Versuch bleiben zwei Kompressionen statt vier — die
WASM-Engine macht genau dasselbe.

**Konstantenspeicher.** Midstate und Ziel lesen alle Threads, keiner
schreibt. Genau dafür ist der Konstantenspeicher da.

**Gitterschritt.** Benachbarte Threads prüfen benachbarte Nonces. Am Ende
eines Stapels ist ein lückenloser Bereich abgearbeitet.

**Stapelgröße 100 bis 250 ms**, selbst nachgeregelt. Kürzer lässt die Karte
auf den Rechner warten. Länger verzögert neue Jobs — und unter Windows
beendet der Treiber Kernel, die länger als rund zwei Sekunden laufen,
besonders auf einer Karte, die auch den Bildschirm betreibt.

**Nach einem Treffer rechnet der Thread weiter.** Früher stieg er aus, und
der Rechner zählte trotzdem alle seine Nonces als geprüft — die gemeldete
Hashrate war zu hoch. Gefunden in der CPU-Nachbildung, die 82 MH/s auf
einem Kern meldete.

## CPU und GPU gleichzeitig

Jeder Miner bekommt eine **eigene Extranonce** und damit einen eigenen Job.
Die Header unterscheiden sich ab Byte 120 — beide können dieselbe Nonce gar
nicht doppelt prüfen. Neue Konsensregeln braucht es dafür nicht; es ist
dieselbe Mechanik, mit der der MiningCoordinator ohnehin Miner trennt.

Der GPU-Miner belegt einen CPU-Faden, um die Karte zu versorgen. Im Modus
CPU + GPU deshalb einen Kern frei lassen.

## Compute Capabilities

Gebaut wird für alle, die das vorhandene `nvcc` kennt, aus dieser Liste:

```
50  Maxwell    940MX, GTX 750
52  Maxwell    GTX 9xx
60  Pascal     Tesla P100
61  Pascal     GTX 10xx
70  Volta
75  Turing     GTX 16xx, RTX 20xx
80  Ampere     A100
86  Ampere     RTX 30xx
89  Ada        RTX 40xx
90  Hopper
```

Dazu PTX der höchsten, damit neuere Karten den Code beim ersten Start selbst
übersetzen können. Eigene Auswahl:

```powershell
powershell -ExecutionPolicy Bypass -File gpu\build-gpu.ps1 -Arch 50,61,86
```

## Dateien

```
gpu/yskar_sha256.h     SHA-256d, übersetzbar mit nvcc UND gcc
gpu/yskar_gpu.cu       Kernel und CUDA-Zugriff -- OHNE C++-Standardbibliothek
gpu/yskar_host.cpp     Protokoll, Selbsttest, Messung -- ohne CUDA
gpu/yskar_cpu.cpp      CPU-Nachbildung zum Prüfen
gpu/yskar_backend.h    die schmale C-Schnittstelle dazwischen
gpu/build-gpu.ps1      Windows-Build
gpu/test/test_sha.c    Prüfung gegen den Genesis, ohne GPU
gpu/bin/               Ergebnis, nicht im Repository
```
