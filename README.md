# YSKAR

Eigenstaendige Proof-of-Work-Kette mit Wallet, Transaktionen im Block und
einem Miner, der auf Smartphones laeuft. Die Bedienung laeuft ueber eine
Telegram Mini App, das Eigentum haengt aber an Schluesseln, nicht an
Telegram.

**Kein Wert wird simuliert.** Das Geraet rechnet echte SHA-256d-Hashes, jeder
Knoten rechnet jeden Share selbst nach, und der Kontostand ist allein aus den
Bloecken wiederherstellbar.

Der Genesis-Block traegt eine Inschrift, und sie ist der Anspruch an alles
Weitere: **proof, not promise**.

## Stand

| | |
|---|---|
| Kette | `yskar-main-1`, Genesis gemint am 09.09.2026 |
| Tests | 297, keine Typfehler |
| Knoten | Server unter `/api/v2/*` **und** eigenstaendiger Full Node |
| Oberflaeche | Wallet, Senden, Empfangen, Mining, Kalibrierung |
| Konsens | Fassung 2 (Coinbase mit mehreren Empfaengern) ab Hoehe 2000 |
| Pool | Abrechnung gebaut und geprueft, noch nicht angeschlossen |

## Aufbau

```
src/lib/core/            Konsens: Header, Difficulty, Zustand, Signaturen
src/lib/node/            Spiegel (Supabase) und gemeinsame Bausteine
src/lib/node/fullnode/   Full Node: Kette, Mempool, Mining, Pool
src/lib/node/p2p/        Verbindung zwischen Full Nodes
src/lib/pool/            PPLNS und Abrechnung
src/app/                 Mini App und API
src/lib/native/          Bruecke zur Android-App (Biometrie, Dienst, Push)
android/                 Android-App (Capacitor)
miner/                   eigenstaendiger Miner, baut zu einer .exe
node/                    Full Node, Kommandozeile
observer/                Beobachter -- prueft die Kette, baut nichts
wasm/                    Mining-Engine, handgeschriebenes WAT
```

## Was wo laeuft

**Full Nodes** auf beliebigen Rechnern. Sie holen die Kette voneinander
(Header zuerst, alles mit Grenzen), pruefen jeden Block selbst, halten den
Mempool, geben Jobs an Miner aus und bauen eigene Bloecke. Mehrere laufen
gleichzeitig; die Kette haengt an keinem einzelnen Server mehr. Ablage ist
eine SQLite-Datei; `node:sqlite` ist seit Node 22 eingebaut, es gibt kein
natives Modul zu kompilieren.

**Pool** ist ein Full Node mit Aufteilung: Die PPLNS-Abrechnung wird zur
Coinbase des Blocks, die Kette zahlt jeden Beteiligten direkt aus. Der
erste Pool ist in Betrieb (`docs/POOL_BETRIEB.md`).

**YSKAR Wallet** ist die Android-App: dieselbe Oberflaeche in einer nativen
Huelle, dazu Biometrie, Mining im Hintergrund, Push und Update-Hinweis.
Verteilung als APK ueber GitHub Releases (`docs/APP.md`).

**Mini App** auf Vercel. Mining und Transaktionen gehen an den Full Node
(`NEXT_PUBLIC_MINING_BASE`); Guthaben, Verlauf und Kennzahlen liest die App
ueber den eigenen Server, der dafuer den Knoten fragt (`YSKAR_FULLNODE_URL`)
und einen Lesespiegel der festgeschriebenen Kette in Supabase haelt. Der
Spiegel ist Bequemlichkeit fuer Explorer und Verlauf, nicht Wahrheit.

## Loslegen

```bash
npm install
npm test                 # 297 Tests
npx tsc --noEmit         # 0 Fehler
npm run dev
```

Full Node:

```bash
cd node && npm install && npm run build
node dist/yskar-node.cjs mine --data ./knoten
```

Miner gegen den eigenen Knoten:

```bash
cd miner && node src/cli.mjs --address ysr1… --api http://127.0.0.1:8645
```

Unter Windows `npm.cmd` statt `npm`.

### Einmalig noetig: Schema chain2 freigeben

Supabase spricht ueber PostgREST, und das gibt nur ausdruecklich freigegebene
Schemata heraus. Voreingestellt sind `public` und `graphql_public` -- die
Kette liegt aber in `chain2`.

**Dashboard -> Settings -> API -> Exposed schemas -> `chain2` ergaenzen.**

Ohne diesen Schritt bauen und starten alle Routen normal, aber jeder Aufruf
von `/api/v2/*` scheitert zur Laufzeit mit "The schema must be one of the
following: public, graphql_public". Der Build zeigt das nicht, weil es kein
Typfehler ist.

## Tokenomics

```
YSKAR (YSR), 8 Nachkommastellen, max. 21.000.000
875 YSR je Block, Halving alle 12.000 Bloecke
Blockzeit 10 min, Mindestgebuehr 0,001 YSR
```

Kein Vorverkauf, keine Zuteilung an Gruender, keine reservierten Anteile.
Der Reward des Genesis-Blocks ging an eine Adresse aus lauter Nullbytes --
es gibt keinen Schluessel dafuer.

Seit Hoehe 2000 darf eine Coinbase mehrere Empfaenger haben. Darauf baut
das Pool Mining: Der Block selbst zahlt alle Beteiligten aus, kein
Betreiber haelt fremdes Geld. Solo-Mining ist davon unberuehrt.

## Weitere Werkzeuge

**Explorer** unter `/explorer.html`. Er laedt die Bloecke und rechnet sie
**im Browser** nach: Header aus den Einzelfeldern neu zusammengesetzt,
doppelt gehasht, gegen die eingetragene Difficulty geprueft, Verkettung
verfolgt. Keine dieser Aussagen stammt vom Server.

**Eigenstaendiger Miner** in `miner/`. Baut zu einer einzelnen Datei, die
ohne Node laeuft (`npm run build:exe`). Fasst keine Schluessel an -- er
braucht nur eine Adresse.

**Beobachter** in `observer/`. Holt die Kette und rechnet jeden Block nach,
baut aber nichts. Fuer einen Raspberry Pi gedacht.

**Startseite** unter `/start.html`. Oeffentliche Erklaerung mit Live-Zahlen.

## Dokumente

| | |
|---|---|
| `docs/CHAIN.md` | Kettenregeln, Header, Difficulty, Zustand |
| `docs/CONSENSUS_V2.md` | Coinbase mit mehreren Empfaengern, Aktivierung |
| `docs/FULLNODE.md` | Full Node, Chain Work, Forks, Reorg, Testnetz |
| `docs/POOL_MINING.md` | PPLNS, Abrechnung, Gebuehr |
| `docs/POOL_BETRIEB.md` | einen Pool betreiben, beitreten |
| `docs/P2P.md` | Nachrichten, Handschlag, Grenzen zwischen Knoten |
| `docs/UMSTELLUNG.md` | wie die Kette vom Server auf die Full Nodes zog |
| `docs/APP.md` | Android-App: Bau, Signatur, Release, Push-Watcher |
| `docs/SECURITY.md` | Schluessel, Tresor, Angriffsflaechen |

## Oberflaeche

Werkzeug, nicht Spielautomat -- und seit September 2026 hell: weisser Grund,
Karten, ein einziger blauer Akzent, abgeleitet vom Kristall der Marke. Der
Markt, in dem diese App sitzt, besteht aus Neonverlaeufen und hochzaehlenden
Fantasiezahlen; saehe YSKAR so aus, widerlegte die Oberflaeche das
Versprechen der Kette.

Fuenf Reiter: **Home** (Guthaben, Mining-Status, Kette), **Mining**,
**Wallet** (Senden mit QR-Scan per Kamera, Empfangen mit QR-Code),
**Netz**, **Entdecken** (was YSKAR ist, wie es funktioniert, Roadmap, FAQ --
die Zahlen kommen aus `src/lib/core/params.ts`, die Texte liegen in
`src/content/entdecken.ts`).

Fuehrende Nullen eines Hashes sind gedimmt: Sie SIND die geleistete Arbeit,
und gedimmt kann man sie zaehlen statt lesen.

## Was offen ist

Ehrlich benannt, damit niemand mehr erwartet als da ist.

**Mikrozahlungen.** Kleine Betraege schnell und guenstig -- der naechste
Schritt auf der Roadmap.

**Node Core.** Eine Veroeffentlichung des Full Node mit eingebauter Wallet
und Mining fuer alle Systeme, ohne Node.js-Installation.

**Apps.** Android ist da (YSKAR Wallet, APK ueber GitHub Releases); der
Play Store und iOS fehlen, die Lightning-Wallet ebenso.

**Keine Ratenbegrenzung** auf `/api/v2/share`. Bei bekannten Testern
unkritisch, bei offener Verteilung nicht.

**Blockzeit unter dem Ziel.** Im Mittel rund 520 statt 600 Sekunden. Die
Difficulty-Regel hinkt nach Pausen systematisch nach; die Halbierungen kommen
dadurch frueher als geplant.

## Nichts versprechen

YSKAR hat keinen Preis, keinen Markt und keinen Gegenwert. Es gibt kein
Versprechen, dass sich das aendert, und niemand sollte in dieser Erwartung
minen.
