# yskar.app — die offizielle Website

Reines HTML, CSS und JavaScript. Kein Framework, kein Build-Schritt:
Vercel liefert die Dateien so aus, wie sie hier liegen.

```
index.html          Startseite
anleitungen.html    Mining, Android-App, PC-Miner, Wallet, Fullnode
whitepaper.html     Whitepaper (Deutsch und Englisch, druckbar als PDF)
impressum.html      Community-Projekt, kein einzelner Verantwortlicher
datenschutz.html    was die Website technisch tut; Community-Projekt
assets/style.css    alle Stile
assets/site.js      Sprache, Menü, Live-Werte
assets/i18n/*.js    Texte je Sprache (en ist Vorgabe und Rückfall)
assets/fonts/       Manrope und IBM Plex Mono, selbst gehostet (OFL)
assets/img/         Logo, App-Bilder, Node Core (echte Oberfläche mit Beispielzahlen)
vercel.json         saubere URLs, Header, Build nur bei Änderungen hier
```

## Sprachen

Englisch, Deutsch, Spanisch, Portugiesisch, Französisch, Italienisch,
Polnisch, Russisch, Türkisch, Chinesisch. Die Seite erkennt die Sprache
des Browsers; der Besucher kann sie oben rechts wechseln. Die Wahl wird
im Browser gemerkt (`localStorage`, Schlüssel `yskar.sprache`).

Ein neuer Text braucht drei Dinge: ein Element mit `data-t="schluessel"`
(oder `data-th` für HTML, `data-ta="attribut:schluessel"` für Attribute)
im HTML, den englischen Text in `assets/i18n/en.js` und die Übersetzung in
den anderen Dateien. Fehlt eine Übersetzung, erscheint Englisch.

Sprachdateien, `site.js` und `style.css` darf der Browser nicht auf Vorrat
behalten (`vercel.json`: `max-age=0, must-revalidate`) — sonst zeigt er nach
einer Textänderung die neue Seite mit alten Texten, und neue Abschnitte
erscheinen auf Englisch. Zusätzlich tragen die Adressen im HTML ein `?v=…`,
das `site.js` an die Sprachdateien weitergibt. Erhöhen muss man es nur, wenn
Besucher eine Änderung sofort sehen sollen, obwohl ihr Browser noch eine
ältere Fassung mit längerer Haltbarkeit gespeichert hat.

Das Whitepaper gibt es auf Deutsch und Englisch; alle anderen Sprachen
sehen die englische Fassung mit einem Hinweis. Impressum und Datenschutz
sind nach deutschem Recht auf Deutsch.

## Live-Werte

Die Startseite holt Blockhöhe, Hashrate und Umlaufmenge jede Minute von
`https://yskar.vercel.app/api/v2/summary`. Fällt das aus, zeigt sie „—“
und einen Hinweis; die Seite selbst funktioniert weiter.

## Explorer unter /explorer

Der Explorer gehört zur App (`public/explorer.html` im App-Projekt). Diese
Website reicht ihn nur durch (`rewrites` in `vercel.json`): `/explorer`,
dazu seine Datenabrufe `/api/v2/…`, das Logo `/marke/…` und die Schriften
`/schrift/…`. In der Adressleiste steht `www.yskar.app/explorer`; es gibt
weiter nur einen Explorer. `yskar.vercel.app` bleibt unverändert.

## Lokal ansehen

```bash
cd website
python3 -m http.server 8080
```

Dann `http://localhost:8080/index.html` öffnen. Saubere URLs wie
`/anleitungen` funktionieren erst bei Vercel.

## Node Core

Der Abschnitt „YSKAR Node Core“ auf der Startseite verlinkt den Installer
einer bestimmten Version direkt bei GitHub. Nach jeder neuen
Veröffentlichung des Node Core sind dort der Link, der Link zu den
Versionshinweisen und die Versionsnummer anzupassen (ebenso im Block
„Download“ der `README.md` im Hauptordner).

Die Seite fragt GitHub nicht selbst ab, welche Version die neueste ist: Das
wäre ein Aufruf bei einem Dritten aus dem Browser jedes Besuchers.
