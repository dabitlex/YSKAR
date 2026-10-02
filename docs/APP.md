# YSKAR Wallet — die Android-App

Die App ist eine native Hülle (Capacitor) um die Mini App. Sie lädt die
Oberfläche von `https://yskar.vercel.app`; jede Änderung an der Web-App ist
sofort in der App. Eine neue APK braucht es nur, wenn sich die Hülle ändert:
Rechte, Plugins, der Mining-Dienst, das Icon.

Was die App kann, was die Mini App nicht kann:

| | |
|---|---|
| Biometrie | Entsperren und Senden mit Fingerabdruck/Gesicht (PIN bleibt Fallback) |
| Hintergrund-Mining | Vordergrunddienst mit Benachrichtigung und Stopp-Knopf, CPU bleibt wach |
| Push | Wallet-Eingang, Bestätigung, Blockfund, Neuigkeiten — auch bei geschlossener App |
| Updates | Hinweis in der App, sobald ein neues Release auf GitHub liegt |

## Aufbau im Repository

```
capacitor.config.ts        Paketname, Server-URL, Plugins
android/                   das Android-Projekt (Gradle)
android/app/src/main/java/net/yskar/wallet/
  MainActivity.java          registriert das eigene Plugin
  MiningService.java         Vordergrunddienst + WakeLock
  MiningServicePlugin.java   Brücke zur Weboberfläche
native/www/offline.html    Seite ohne Netz
assets/                    Quellbilder für Icon und Splash (npm run app:assets)
src/lib/native/            Plattform, Biometrie, Mining-Dienst, Push, Update
src/lib/push/              FCM (HTTP v1) und Ereignis-Logik
scripts/push-watcher.ts    Dienst neben dem Knoten, der die Meldungen schickt
.github/workflows/android-release.yml   baut und veröffentlicht die APK
```

## Einmalig: Signaturschlüssel

Android akzeptiert ein Update nur, wenn es mit demselben Schlüssel signiert
ist wie die installierte Fassung. **Der Schlüssel darf nie ins Repo und darf
nicht verloren gehen** — sonst müssen alle Nutzer die App neu installieren.

```bash
keytool -genkeypair -v -keystore yskar.jks -alias yskar \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=YSKAR Wallet, O=YSKAR"
base64 -w0 yskar.jks > yskar.jks.b64
```

Dann unter GitHub → Settings → Secrets and variables → Actions anlegen:

| Secret | Inhalt |
|---|---|
| `YSKAR_KEYSTORE_BASE64` | Inhalt von `yskar.jks.b64` |
| `YSKAR_KEYSTORE_PASSWORD` | Passwort aus `keytool` |
| `YSKAR_KEY_ALIAS` | `yskar` |
| `YSKAR_KEY_PASSWORD` | Passwort des Schlüssels (bei keytool meist gleich) |
| `GOOGLE_SERVICES_JSON` | Inhalt von `google-services.json` aus Firebase (siehe Push) |

`yskar.jks` sicher aufheben (Passwort-Manager, verschlüsseltes Backup).

## Eine Version veröffentlichen

```bash
git tag app-v1.0.0
git push origin app-v1.0.0
```

Der Workflow baut, signiert und legt ein Release mit
`yskar-wallet-1.0.0.apk` und Prüfsumme an. Die App prüft beim Start die
Releases (Tags `app-v*`), vergleicht mit ihrer Version und zeigt einen
Hinweis mit Download. Installiert wird über den Browser; beim ersten Mal
verlangt Android die Freigabe „Apps aus dieser Quelle installieren".

Ohne Tag (`workflow_dispatch`) entsteht nur ein Test-Artefakt, kein Release.
Über das Feld `app_url` lässt sich eine Vorschau-Adresse einbauen.

`versionCode` ist die Laufnummer der Actions plus 1000 — streng steigend,
ohne dass jemand sie pflegen muss.

## Push-Benachrichtigungen

Drei Teile, alle nötig:

**1. Firebase-Projekt** (kostenlos, nur Messaging wird genutzt).
Projekt anlegen → Android-App hinzufügen mit Paketname `net.yskar.wallet`
→ `google-services.json` herunterladen → als Secret `GOOGLE_SERVICES_JSON`
ablegen. Dann unter Projekteinstellungen → Dienstkonten → „Neuen privaten
Schlüssel generieren" → die JSON auf den Rechner legen, der den Watcher
betreibt (z.B. `/etc/yskar/fcm.json`, nur root lesbar).

**2. Datenbank.** Migration `supabase/migrations/00018_push_und_news.sql`
einspielen. Sie legt `chain2.push_geraete`, `chain2.push_versendet`,
`chain2.push_stand` und `chain2.news` an.

**3. Watcher** auf einem Rechner mit Zugang zum Full Node — am einfachsten
neben dem Knoten selbst:

```ini
# /etc/systemd/system/yskar-push.service
[Unit]
Description=YSKAR Push-Watcher
After=network-online.target

[Service]
WorkingDirectory=/opt/yskar
Environment=NEXT_PUBLIC_SUPABASE_URL=https://….supabase.co
Environment=SUPABASE_SERVICE_ROLE_KEY=…
Environment=YSKAR_FULLNODE_URL=https://yskar-main.dynv6.net
Environment=FCM_SERVICE_ACCOUNT_FILE=/etc/yskar/fcm.json
ExecStart=/usr/bin/node --experimental-strip-types scripts/push-watcher.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Der Watcher fragt alle 8 Sekunden: neue Blöcke (→ „erhalten", „Block
gefunden"), den Mempool je angemeldeter Adresse (→ „unterwegs") und
Neuigkeiten mit `push=true`. Jedes Ereignis geht genau einmal je Gerät
(`push_versendet`). Tokens, die FCM als tot meldet, werden gelöscht.

**Datenschutz.** `push_geraete` verknüpft eine Adresse mit einem Gerät —
mehr, als die Kette weiß. Deshalb Opt-in in den Einstellungen, jederzeit
abschaltbar; Abschalten löscht den Token beim Server.

## Sprachen

Die Oberfläche gibt es in sechs Sprachen: Englisch, Deutsch, Spanisch,
Portugiesisch (BR), Russisch, Türkisch. Alle Texte liegen in
`src/i18n/<code>.ts` mit identischen Schlüsseln (`de.ts` ist die Quelle) —
fehlt einer, bricht der Build. Nur Deutsch und Englisch sind von Hand
geprüft; die anderen vier stammen aus maschineller Übersetzung und sollten
vor einer Vorstellung in dem Markt einmal gegengelesen werden. Artikel, FAQ und Neuigkeiten liegen je Sprache in
`src/content/entdecken.<sprache>.ts`. Vorbelegung: gemerkte Wahl, sonst
Telegram `language_code`, sonst Systemsprache, sonst Englisch. Wählbar auf
dem ersten Bildschirm und in den Einstellungen. Push-Texte folgen der
gemeldeten Sprache des Geräts (`push_geraete.sprache`); die
Benachrichtigung des Mining-Dienstes folgt der Android-Systemsprache
(`res/values`, `res/values-de`).

Eine weitere Sprache: `src/i18n/<code>.ts` und
`src/content/entdecken.<code>.ts` anlegen, in `src/i18n/index.tsx` und
`src/content/entdecken.ts` eintragen, Texte in `src/lib/push/ereignisse.ts`
und `native/www/offline.html` ergänzen.

## Neuigkeiten pflegen

Statt im Quelltext (`src/content/entdecken.ts`) jetzt in `chain2.news`.
Anlegen per API mit dem Token aus `YSKAR_ADMIN_TOKEN` (Vercel-Umgebung):

```bash
curl -X POST https://yskar.vercel.app/api/v2/news \
  -H "authorization: Bearer $YSKAR_ADMIN_TOKEN" \
  -H "content-type: application/json" \
  -d '{"titel":"Pool #2 ist online","text":"…","titel_en":"Pool #2 is online","text_en":"…","link":"https://…","push":true}'
```

`titel_en`/`text_en` sind die englische Fassung (Migration 00019). Alle
nicht-deutschen Geräte bekommen sie; fehlt sie, den deutschen Text.

`push: true` → der Watcher schickt die Meldung an alle Geräte. Ohne
`YSKAR_ADMIN_TOKEN` in der Umgebung antwortet die Route mit 401 — dann
Einträge direkt in Supabase anlegen. Ist die Tabelle leer, zeigt die App
weiter die Meldungen aus dem Code.

## Widget

Homescreen-Widget (4×2, ab APK 1.0.10): eine Mining-Übersicht. Das
Wallet-Guthaben zeigt es bewusst nicht.

- **Mining läuft:** „verdient in dieser Sitzung", Stopp-Knopf, darunter
  Hashrate · Laufzeit · angenommene Shares.
- **Mining gestoppt:** Stand des Netzes — Block · Netz-Hashrate · Belohnung.

Tipp auf die Fläche öffnet die App, der Pfeil holt sofort vom Server, „Stopp"
beendet das Mining (derselbe Weg wie „Stoppen" in der Benachrichtigung). Hell
oder Dunkel wählt der Nutzer unter Einstellungen → App → Widget
(`WidgetPlugin.thema`, je Darstellung ein Layout: `widget.xml`,
`widget_dunkel.xml` — gleicher Aufbau, gleiche Kennungen, Änderungen immer
in beiden).

Quellen (`YskarWidget`, `WidgetDaten`):

- **Mining-Werte** schreibt der `MiningService` alle vier Sekunden in die
  Ablage; er merkt sich auch den Beginn der Sitzung.
- **Verdienst der Sitzung:** `/api/v2/account/<adresse>/verlauf` ab
  Sitzungsbeginn, gezählt werden Blockbelohnungen und Pool-Anteile. Gefragt
  wird nach einem Blockwechsel (der Miner sieht ihn an der Höhe seines Jobs)
  und sonst alle zehn Minuten. Die Kette weiß nicht, welches Gerät gerechnet
  hat: Mint dieselbe Adresse gleichzeitig woanders, zählt das mit.
- **Stand des Netzes:** `/api/v2/summary` — alle 30 Minuten (`onUpdate`),
  beim Pfeil, nach dem Stopp, und höchstens alle fünf Minuten, solange die
  App offen ist.
- Die Oberfläche liefert über das Plugin `Widget` die Adresse.

Passt nicht alles in die Höhe (kleine Launcher-Raster, große Systemschrift),
lässt `YskarWidget.einpassen` erst die Unterzeile, dann die Beschriftung der
Felder, dann die Felder weg. Das Widget lässt sich auch in der Höhe ziehen.

## Gestaltung, zweite Generation

Bausteine in `src/components/ui/Bausteine.tsx`: `Zahl` (grosse Zahl,
Nachkommastellen gedimmt), `Etikett`, `Karte`, `Kachel`, `Aktion`, `Pille`,
`Segment`, `Kurve` (Hashrate-Verlauf, 90 s aus `useMining().hashVerlauf`),
`Ring`, `Identicon` (Farbkachel aus der Adresse, kein Sicherheitsmerkmal),
`Blatt` (Bottom-Sheet) und `BlattKopf`. Regel: Die eine Zahl eines
Bildschirms steht auf dem Grund, Karten sind fuer Sekundaeres; Radien ab
16 px; schwebende Tab-Leiste; Senden und Empfangen sind Blaetter ueber dem
Reiter. Die alten Primitives bleiben fuer Onboarding, Einstellungen, Artikel.

## Darstellung: hell und dunkel

Einstellungen -> Darstellung: System / Hell / Dunkel, gemerkt unter
`yskar.thema` (derselbe Schluessel wie im Explorer). "System" folgt dem
Geraet, im Telegram-Client dessen Farbschema. Die Farben stehen als
Token in `globals.css` (`:root[data-thema="dunkel"]`); ein Startskript im
Layout setzt das Attribut vor dem ersten Zeichnen. Der Web-Splash nimmt
`public/marke/splash-dunkel.jpg`, der native Android-Splash die
`drawable-*-night`-Varianten (aus `assets/splash-dark.png`; folgt der
Systemeinstellung, nicht der App-Wahl -- er laeuft, bevor die Oberflaeche
geladen ist). Die Systemleisten faerbt das Plugin `Oberflaeche`
(`leisten({dunkel})`), Telegram-Rahmen ueber `telegramFarben(dunkel)`.

## Hinweis auf die App (Telegram, Browser)

Wer YSKAR auf einem Android-Geraet in Telegram oder im Browser benutzt,
bekommt einmal ein Pop-up mit der Android-App: Version und Groesse der
neuesten APK (GitHub Releases), eine Anleitung in drei Schritten -- samt
der Freigabe "Unbekannte Apps installieren" fuer Telegram bzw. Chrome --
und dem Grund dafuer. "Spaeter" verschiebt um sieben Tage, "Nicht mehr
zeigen" fuer immer (`yskar.apk.hinweis`). Ausserdem als Eintrag in den
Einstellungen. In der App selbst und auf iPhone/Desktop erscheint nichts.
Texte in allen sechs Sprachen (`apk.*`).

## Update aus der App heraus

Der Banner „Update x.y.z verfügbar" lädt die APK über den DownloadManager
(Plugin `AppUpdate`: `laden`, `stand`, `installieren`) und öffnet danach den
Installer; der Nutzer bestätigt nur noch. Beim ersten Mal verlangt Android
die Freigabe „Apps aus dieser Quelle installieren" — die App öffnet die
Einstellungsseite und bittet, danach erneut zu tippen. Ohne das Plugin
(ältere Hülle) oder bei einem Fehler bleibt der Weg über den Browser.
Vollautomatisch ohne Bestätigung geht außerhalb des Play Store nicht.

## Biometrie, ehrlich

Der Tresor bleibt mit der PIN verschlüsselt. Wer Biometrie einschaltet,
hinterlegt seine PIN im geschützten Speicher der App (Android Keystore,
EncryptedSharedPreferences). Entsperren und Senden verlangen erst die
biometrische Bestätigung des Systems und lesen die PIN danach aus.

Das schützt vor dem entsperrten Telefon in fremder Hand. Es schützt nicht
vor einem Gerät mit Root-Zugriff — dort ließe sich der Speicher lesen. Das
gilt für die PIN genauso. Wer das nicht will, lässt Biometrie aus.

Passt die hinterlegte PIN nicht mehr zum Tresor (Wiederherstellung mit
neuer PIN), schaltet sich Biometrie beim nächsten Versuch selbst ab.

## Hintergrund-Mining

Startet der Nutzer das Mining in der App, startet `MiningService` als
Vordergrunddienst (Typ `specialUse`, Begründung im Manifest). Er hält einen
`PARTIAL_WAKE_LOCK` — CPU an, Bildschirm darf aus — und zeigt eine stille
Benachrichtigung mit Hashrate und Stopp-Knopf. Die Worker laufen weiter im
WebView. Stopp aus der Benachrichtigung meldet sich an die Oberfläche, die
Session und Worker ordentlich beendet.

Grenzen: Akku-Optimierung einzelner Hersteller (Xiaomi, Huawei, Samsung im
Sparmodus) kann den Dienst trotzdem beenden. Dann hilft nur, die App in den
Systemeinstellungen von der Optimierung auszunehmen. Und: Mining im
Hintergrund kostet Akku und Wärme — das ist kein Fehler, das ist Rechnen.

## Lokal bauen

```bash
npm ci
npx cap sync android
cd android && ./gradlew assembleDebug        # unsigniert, zum Testen
```

Braucht Android Studio oder das SDK mit Build-Tools und Java 21. Der
Debug-Bau lädt ebenfalls den Betrieb; mit `YSKAR_APP_URL=http://192.168.…:3000
npx cap sync android` lädt er einen lokalen `next dev` (dann in
`capacitor.config.ts` vorübergehend `cleartext: true` setzen — nicht committen).

## Was noch nicht da ist

- iOS: dasselbe Capacitor-Projekt, aber ohne Mac kein Bau und ohne
  Developer-Account keine Verteilung.
- Play Store: der Vordergrunddienst-Typ `specialUse` braucht bei Google eine
  Begründung im Formular; die Datenschutzerklärung fehlt noch.
