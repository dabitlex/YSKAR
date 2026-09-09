# YSKAR

Eigenstaendige Proof-of-Work-Kette mit Wallet, Transaktionen im Block und
einem Miner, der auf Smartphones laeuft. Die Bedienung laeuft ueber eine
Telegram Mini App, das Eigentum haengt aber an Schluesseln, nicht an
Telegram.

**Kein Wert wird simuliert.** Das Geraet rechnet echte SHA-256d-Hashes, der
Server rechnet jeden Share selbst nach, und der Kontostand ist allein aus
den Bloecken wiederherstellbar.

## Stand

| | |
|---|---|
| Kette | `yskar-main-1`, Genesis gemint am 09.09.2026 |
| Bibliothek | vollstaendig, 62 Tests |
| Knoten und API | `/api/v2/*` steht |
| Oberflaeche | **fehlt noch** -- Wallet und Miner werden gerade gebaut |

Es laufen zwei Ketten nebeneinander:

- **`chain2`** ist die echte Kette. Genesis steht, `/api/v2/job` liefert
  Jobs. Es fehlt nur die Bedienung.
- **`public`** war das Testnet, 20 Bloecke, Reward direkt in der Datenbank.
  Es bleibt als Nachschlagewerk stehen, Mining ist dort abgeschaltet.

Warum abgeschaltet und nicht entfernt: Der Miner-Worker baut seit der
Umstellung 136-Byte-Header, die alte Job-Route liefert 116. Diese
Kombination wuerde Muell hashen und jeden Share verwerfen -- sichtbar als
"laeuft, aber nichts passiert". Ein abgeschalteter Knopf sagt die Wahrheit,
ein kaputter nicht.

## Schnellstart

```bash
npm install
cp .env.example .env.local     # fuenf Werte eintragen
npm test                       # 62 Tests, laufen ohne Datenbank
npm run dev
```

Alle Migrationen sind im Supabase-Projekt eingespielt.

### Einmalig noetig: Schema chain2 freigeben

Supabase spricht ueber PostgREST, und das gibt nur ausdruecklich freigegebene
Schemata heraus. Voreingestellt sind `public` und `graphql_public` -- die
neue Kette liegt aber in `chain2`.

**Dashboard -> Settings -> API -> Exposed schemas -> `chain2` ergaenzen.**

Ohne diesen Schritt bauen und starten alle Routen normal, aber jeder Aufruf
von `/api/v2/*` scheitert zur Laufzeit mit einer Meldung wie
"The schema must be one of the following: public, graphql_public".
Der Build zeigt das nicht, weil es kein Typfehler ist.

## Wie es funktioniert

```
12 Merkwoerter -> Seed -> SLIP-0010 -> Ed25519 -> Adresse ysr1...
                                                        |
Mini App -> Session -> Job (fertiger Block) -> Worker -> WASM
   -> echte Hashes -> Nonce -> Server prueft -> Block -> Kette
```

Der Client sendet ausschliesslich eine **Nonce**. Der Server nimmt den im Job
hinterlegten Blockkoerper, setzt sie ein und hasht selbst. Hashrate,
Difficulty und Share-Anzahl werden nie vom Client uebernommen.

Details in [docs/CHAIN.md](docs/CHAIN.md), Grenzen in
[docs/SECURITY.md](docs/SECURITY.md).

## Struktur

```
src/lib/core/      Kette: Wallet, Adressen, Transaktionen, Bloecke,
                   Zustand, Konsens, Blockbau, Blockpruefung
src/lib/node/      Knoten: Datenbankzugriff, Job, Share, Mempool
src/app/api/v2/    Routen der Kette
src/lib/chain/     ERSETZT, siehe DEPRECATED.md -- nur vardiff.ts gilt noch
src/app/api/v1/    Testnet, laeuft nur noch lesend
src/workers/       miner.worker.ts, 136-Byte-Header
wasm/              gen_wat.py erzeugt die Engine, build.js kompiliert
supabase/          Migrationen
scripts/genesis.ts Genesis bauen und minen
```

Die WAT-Datei ist **generiert, nicht handgeschrieben**. Aenderungen laufen
ueber `wasm/gen_wat.py`, danach `npm run wasm:gen`.

## Tokenomics

```
YSKAR (YSR), 8 Nachkommastellen, max. 21.000.000
875 YSR je Block, Halving alle 12.000 Bloecke (2 Seasons)
Blockzeit 10 min, Mindestgebuehr 0,001 YSR
```

Der Reward geht per Coinbase direkt an die Adresse des Finders. Kein Pool,
keine Verteilung -- echtes Solo-Mining.

## Gemessen

Android-Referenzgeraet, WASM mit Midstate:

| | |
|---|---|
| 2 Worker, 100 %, 20 s | 2,96 MH/s |
| 2 Worker, 100 %, 5 min | **2,64 MH/s, 0 % Abfall** |

Der kurze Lauf misst den Boost-Takt. Alle Chain-Parameter sind auf den
Dauerwert ausgelegt.

## Grenzen

Vollstaendig in [docs/SECURITY.md](docs/SECURITY.md). Die wichtigsten:

- **Wer die zwoelf Woerter verliert, verliert das Guthaben endgueltig.**
  Es gibt niemanden, der sie zuruecksetzen kann.
- **Kein Hintergrund-Mining.** Geht die App in den Hintergrund, haelt die
  Plattform den Worker an.
- **Ein modifizierter Client ist nicht erkennbar.** Wer den Header selbst
  baut und nativ hasht, leistet echte Arbeit -- nur schneller. Seit dem
  Wegfall der Telegram-Identitaet gibt es dagegen keine kontogebundene
  Begrenzung mehr; Missbrauchsschutz muss ueber Ratenbegrenzung laufen.
- **Ein Validator.** Die PoW ist echt und nachpruefbar, aber es gibt genau
  einen Knoten. Reorgs und P2P sind Phase 2.
