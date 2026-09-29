# YSKAR Wallet auf einem Android-Gerät testen — Schritt für Schritt

Zwei Wege. **Weg A** braucht keinen Schlüssel und keine Installation auf
deinem PC — nur GitHub und dein Telefon. Damit prüfst du, ob die App
läuft. **Weg B** ist der echte Weg mit Signatur und GitHub Release; erst
damit funktioniert später der Update-Hinweis in der App.

Fang mit A an.

---

## Weg A — Test-APK ohne Schlüssel (ca. 15 Minuten)

### 1. Bau anstoßen

1. Öffne im Browser `https://github.com/dabitlex/YSKAR/actions`.
2. Links in der Liste auf **„Android-App bauen und veröffentlichen"** tippen.
3. Rechts erscheint ein grauer Kasten *„This workflow has a workflow_dispatch
   event trigger"* mit dem Knopf **Run workflow**. Antippen.
4. Im Aufklappmenü: Branch `main` lassen, das Feld *app_url* leer lassen.
   Grünen Knopf **Run workflow** drücken.
5. Nach ein paar Sekunden erscheint oben ein neuer Eintrag mit gelbem Punkt.
   Antippen. Der Bau dauert beim ersten Mal **8–15 Minuten** (Android-SDK
   wird geladen).

**Wird der Punkt rot:** Eintrag öffnen → auf den Job **apk** → der rote
Schritt ist aufgeklappt. Die letzten ~40 Zeilen kopieren und mir schicken.
Beim ersten Lauf ist das wahrscheinlich; ich behebe es dann.

### 2. APK herunterladen

1. Wenn der Punkt grün ist: Eintrag öffnen, nach unten scrollen zu
   **Artifacts**.
2. Dort liegt `yskar-wallet-0.0.<Nummer>-test-debug.apk`. Antippen → lädt
   eine **ZIP-Datei**. (GitHub verpackt Artefakte immer als ZIP. Du musst
   dafür bei GitHub angemeldet sein.)
3. Am einfachsten machst du das **direkt auf dem Telefon** im Browser —
   dann sparst du das Übertragen. Sonst: ZIP am PC laden und per Kabel,
   Google Drive oder Telegram („Gespeicherte Nachrichten") ans Telefon.

### 3. Auf dem Telefon installieren

1. Die ZIP im Dateimanager („Dateien"/„Eigene Dateien") öffnen → sie
   enthält die `.apk`. Auf die `.apk` tippen.
2. Android fragt: **„Aus dieser Quelle installieren erlauben?"** → in die
   Einstellungen springen, Schalter für den Dateimanager/Browser
   einschalten, zurück.
3. **Installieren** tippen. Kommt eine Warnung *„Unbekannte App / Play
   Protect"* → **Trotzdem installieren** (bei Debug-Bauten normal, weil der
   Schlüssel Google nicht bekannt ist).
4. App öffnen: **YSKAR Wallet** mit dem Kristall-Symbol.

### 4. Was du prüfen solltest

Gehe die Punkte durch und notiere, was nicht klappt:

- [ ] Splash mit dem Markenbild, dann Willkommensscreen (nicht „YSKAR
      läuft in Telegram").
- [ ] Wallet erstellen oder mit zwölf Wörtern wiederherstellen; PIN setzen.
- [ ] Home zeigt Guthaben und Kette (Block-Nummer ist keine Strichlinie).
- [ ] **Einstellungen → Sicherheit → Fingerabdruck/Gesicht → Einschalten**:
      PIN eingeben → Systemdialog erscheint → danach steht „aktiv".
- [ ] App komplett schließen, neu öffnen: Der Sensor-Dialog kommt sofort,
      Entsperren ohne PIN klappt.
- [ ] **Wallet → Senden**: „Mit Fingerabdruck / Gesicht senden" statt
      PIN-Feld (mit einem kleinen Betrag an eine zweite Wallet testen).
- [ ] **Senden → Scannen**: Kamera-Erlaubnis kommt, QR eines anderen
      Geräts (Empfangen) wird erkannt und übernommen.
- [ ] **Mining starten**, dann Home-Taste drücken und Bildschirm sperren:
      In der Benachrichtigungsleiste steht „YSKAR rechnet · … kH/s". Nach
      zwei Minuten entsperren — die Hashrate lief weiter (Share-Diagramm
      hat neue Balken). Stopp-Knopf in der Benachrichtigung beendet es.
- [ ] Einstellungen → App zeigt Version `0.0.<Nummer>-test`.

Was bei Weg A **nicht** geht: Push-Benachrichtigungen (kein Firebase im
Test-Bau) und der Update-Hinweis (kein Release). Beides kommt mit Weg B.

---

## Weg B — signiertes Release (einmalig ca. 45 Minuten)

### 1. Java auf dem PC installieren (nur für `keytool`)

Windows: `https://adoptium.net` → **Temurin 21 (LTS)** → `.msi` laden,
installieren, dabei den Haken **„Set JAVA_HOME"** und „Add to PATH" setzen.
Danach Eingabeaufforderung (`cmd`) **neu** öffnen und prüfen:

```
keytool -version
```

Es muss eine Versionsnummer erscheinen.

### 2. Signaturschlüssel erzeugen

In `cmd` (Windows) — alles in **einer** Zeile:

```
keytool -genkeypair -v -keystore yskar.jks -alias yskar -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=YSKAR Wallet, O=YSKAR"
```

Du wirst zweimal nach einem Passwort gefragt (Keystore, dann Schlüssel —
nimm dasselbe). Es entsteht `yskar.jks` im aktuellen Ordner.

**Diese Datei und das Passwort sind das Wichtigste an der ganzen App.**
Geht sie verloren, kann keine bestehende Installation mehr aktualisiert
werden — alle Nutzer müssten neu installieren. Lege sie in deinen
Passwort-Manager oder auf zwei verschlüsselte Sticks. Niemals ins Repo.

Dann in Text umwandeln, damit sie in ein Secret passt:

- Windows: `certutil -encode yskar.jks yskar.b64` → Datei `yskar.b64`
  öffnen, die Zeilen `-----BEGIN CERTIFICATE-----` und `-----END
  CERTIFICATE-----` löschen, den Rest **ohne Zeilenumbrüche** kopieren
  (Editor: alles markieren, dann Zeilenumbrüche entfernen — oder in
  PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("yskar.jks")) | Set-Clipboard`,
  das kopiert direkt).
- Mac/Linux: `base64 -w0 yskar.jks | pbcopy` bzw. `| xclip`.

### 3. Secrets bei GitHub anlegen

`https://github.com/dabitlex/YSKAR/settings/secrets/actions` → **New
repository secret**, viermal:

| Name | Wert |
|---|---|
| `YSKAR_KEYSTORE_BASE64` | der lange Text aus Schritt 2 |
| `YSKAR_KEYSTORE_PASSWORD` | dein Passwort |
| `YSKAR_KEY_ALIAS` | `yskar` |
| `YSKAR_KEY_PASSWORD` | dein Passwort |

### 4. Firebase (für Push) — kann auch später kommen

1. `https://console.firebase.google.com` → **Projekt hinzufügen** → Name
   „YSKAR" → Google Analytics **aus** → erstellen.
2. Im Projekt: Android-Symbol **„App hinzufügen"** → Paketname
   **`net.yskar.wallet`** (genau so) → Registrieren →
   **google-services.json herunterladen** → weitere Schritte überspringen.
3. Inhalt der Datei als Secret `GOOGLE_SERVICES_JSON` anlegen (Datei im
   Editor öffnen, alles kopieren).
4. Für den Watcher: Zahnrad → **Projekteinstellungen → Dienstkonten →
   Neuen privaten Schlüssel generieren**. Die JSON kommt auf den Rechner,
   der den Knoten betreibt (siehe `docs/APP.md`, Abschnitt Push).
5. Migration `supabase/migrations/00018_push_und_news.sql` im Supabase-SQL-
   Editor ausführen.

Ohne Schritt 4 baut die App trotzdem — nur ohne Push.

### 5. Release auslösen

Am PC im Repo-Ordner:

```
git pull
git tag app-v1.0.0
git push origin app-v1.0.0
```

Nach dem Bau liegt unter `https://github.com/dabitlex/YSKAR/releases`
ein Release **„YSKAR Wallet 1.0.0"** mit `yskar-wallet-1.0.0.apk`. Diese
Datei kannst du direkt vom Telefon aus laden und wie in Weg A
installieren — **vorher die Debug-Fassung deinstallieren**, weil sie einen
anderen Schlüssel hat.

### 6. Update-Hinweis testen

Nach einer Änderung: `git tag app-v1.0.1 && git push origin app-v1.0.1`.
Die installierte 1.0.0 zeigt beim nächsten Start oben den Banner
„Update 1.0.1 verfügbar" → **Laden** → Android installiert über die alte
Fassung, Daten und Wallet bleiben erhalten.

---

## Wenn etwas schiefgeht

| Symptom | Ursache | Was tun |
|---|---|---|
| Actions-Run rot | Build-Fehler | Log der letzten 40 Zeilen an mich |
| „App nicht installiert" | Andere Signatur schon installiert | Alte YSKAR Wallet deinstallieren |
| App zeigt „Keine Verbindung" | Kein Netz oder Vercel down | Netz prüfen, „Erneut versuchen" |
| Weißer Bildschirm länger als 10 s | Web-App lädt nicht | Am PC `https://yskar.vercel.app` öffnen — geht sie dort? |
| Biometrie-Eintrag zeigt „kein Sensor" | Gerät ohne Fingerabdruck/Face | Erwartet, PIN bleibt |
| Mining stoppt bei gesperrtem Bildschirm | Akku-Optimierung des Herstellers | Einstellungen → Apps → YSKAR Wallet → Akku → „Nicht optimieren" |
| Kein Kamerabild beim Scannen | Erlaubnis verweigert | Einstellungen → Apps → YSKAR Wallet → Berechtigungen → Kamera |

Schick mir bei jedem Punkt, der nicht klappt, Screenshot oder Log — ich
korrigiere und du startest den Workflow einfach neu.
