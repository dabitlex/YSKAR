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
| Tests | 155, keine Typfehler |
| Knoten | Server unter `/api/v2/*` **und** eigenstaendiger Full Node |
| Oberflaeche | Wallet, Senden, Empfangen, Mining, Kalibrierung |
| Konsens | Fassung 2 (Coinbase mit mehreren Empfaengern) ab Hoehe 2000 |
| Pool | Abrechnung gebaut und geprueft, noch nicht angeschlossen |

## Aufbau

```
src/lib/core/            Konsens: Header, Difficulty, Zustand, Signaturen
src/lib/node/            Server-Knoten (Supabase), Jobs, Shares
src/lib/node/fullnode/   eigenstaendiger Full Node
src/lib/pool/            PPLNS und Abrechnung
src/app/                 Mini App und API
miner/                   eigenstaendiger Miner, baut zu einer .exe
node/                    Full Node, Kommandozeile
observer/                Beobachter -- prueft die Kette, baut nichts
wasm/                    Mining-Engine, handgeschriebenes WAT
```

## Was wo laeuft

**Mini App** auf Vercel, Kette in Supabase. Das ist der Betrieb, an dem alle
Telegram-Nutzer haengen.

**Full Node** auf beliebigen Rechnern. Er holt die Kette, prueft jeden Block
selbst und kann eigene Bloecke bauen und einreichen. Seine Ablage ist eine
SQLite-Datei; `node:sqlite` ist seit Node 22 eingebaut, es gibt kein natives
Modul zu kompilieren.

Der Full Node ist **noch kein P2P-Netz**: Bloecke kommen ueber die
oeffentliche Leseschnittstelle und gehen ueber `POST /api/v2/block` zurueck.
Supabase ist damit weiterhin der Mittelpunkt. Geprueft wird trotzdem alles
lokal -- der Unterschied liegt in der Quelle, nicht in der Pruefung.

## Loslegen

```bash
npm install
npm test                 # 155 Tests
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

Ab Hoehe 2000 darf eine Coinbase mehrere Empfaenger haben. Das ist die
Voraussetzung fuer Pool Mining, bei dem der Block selbst alle Beteiligten
auszahlt und kein Betreiber fremdes Geld haelt. Solo-Mining aendert sich
dadurch nicht.

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
| `docs/SECURITY.md` | Schluessel, Tresor, Angriffsflaechen |

## Oberflaeche

Messgeraet, nicht Spielautomat. Der Markt, in dem diese App sitzt, besteht
aus Neonverlaeufen und hochzaehlenden Fantasiezahlen -- saehe YSKAR so aus,
wuerde die Oberflaeche das Versprechen der Kette widerlegen.

Der Held des Mining-Bildschirms ist der zuletzt angenommene **Hash**, nicht
eine grosse Zahl mit Label. Fuehrende Nullen sind gedimmt: Sie SIND die
geleistete Arbeit, und gedimmt kann man sie zaehlen statt lesen.

## Was offen ist

Ehrlich benannt, damit niemand mehr erwartet als da ist.

**Kein P2P.** Knoten reden nicht direkt miteinander. Faellt Supabase aus,
steht die Kette -- vorhandene Bloecke bleiben lesbar und pruefbar, neue
entstehen nicht.

**Ein Validator.** Die Rechenarbeit ist echt und nachpruefbar, aber wer den
Server kontrolliert, kontrolliert die Kette.

**Pool nicht angeschlossen.** Die Abrechnung ist fertig und geprueft, die
Anbindung an den Knoten fehlt.

**Keine Ratenbegrenzung** auf `/api/v2/share`. Bei bekannten Testern
unkritisch, bei offener Verteilung nicht.

**Blockzeit unter dem Ziel.** Im Mittel rund 520 statt 600 Sekunden. Die
Difficulty-Regel hinkt nach Pausen systematisch nach; die Halbierungen kommen
dadurch frueher als geplant.

## Nichts versprechen

YSKAR hat keinen Preis, keinen Markt und keinen Gegenwert. Es gibt kein
Versprechen, dass sich das aendert, und niemand sollte in dieser Erwartung
minen.
