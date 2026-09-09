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
| Oberflaeche | Wallet, Entsperren und Mining stehen; Senden fehlt noch |

## Oberflaeche

Messgeraet, nicht Spielautomat. Der Markt, in dem diese App sitzt, besteht
aus Neonverlaeufen und hochzaehlenden Fantasiezahlen -- saehe YSKAR so aus,
wuerde die Oberflaeche das Versprechen der Kette widerlegen.

Der Held des Mining-Bildschirms ist der zuletzt angenommene **Hash**, nicht
eine grosse Zahl mit Label. Fuehrende Nullen sind gedimmt: Sie SIND die
geleistete Arbeit, und gedimmt kann man sie zaehlen statt lesen.

Zwei Signalfarben mit Bedeutung, keine Dekoration: Bernstein `#E8B33C` fuer
"dein Geraet rechnet gerade", Gruen `#4ADE9B` fuer "die Kette hat es
angenommen". Rot ausschliesslich dort, wo Geld unwiderruflich weg sein kann.

Schrift: IBM Plex Sans und Mono, ueber `next/font` selbst gehostet.
Monospace ist hier kein Stilmittel -- Hex, Adressen und Merkwoerter brauchen
feste Zeichenbreite, sonst kann man sie nicht abschreiben.

### Wallet einrichten

Der wichtigste Ablauf der App. Drei Entscheidungen, die ihn ernst nehmen:

1. Die Woerter werden erst gespeichert, **nachdem** der Nutzer drei davon
   korrekt zurueckgegeben hat. Wer wegtippt, hat keine Wallet -- und
   verliert nichts, weil noch nichts drin ist.
2. Kein "Ueberspringen". Die einzige Abkuerzung ist abbrechen.
3. Die Warnung steht VOR der Anzeige der Woerter. Danach liest sie niemand.

Die Merkwoerter liegen mit einer sechsstelligen PIN verschluesselt im
Geraet: PBKDF2-SHA256 mit 400.000 Runden, dann AES-256-GCM. Der private
Schluessel lebt nur im Arbeitsspeicher der Sitzung; nach dem Neuladen wird
die PIN erneut gebraucht.

Ehrlich dazu: Sechs Ziffern sind eine Million Moeglichkeiten, ein
vollstaendiger Durchlauf kostet auf einem schnellen Rechner rund sechs
Stunden. Die PIN schuetzt vor Gelegenheitszugriff, nicht vor einem
entschlossenen Angreifer mit Zugriff auf das Geraet. Der eigentliche Schutz
sind die aufgeschriebenen Woerter.

## Zwei Ketten

Es laufen zwei Ketten nebeneinander:

- **`chain2`** ist die echte Kette. Genesis steht, `/api/v2/job` liefert
  Jobs. Es fehlt nur die Bedienung.
- **`public`** war das Testnet, 20 Bloecke, Reward direkt in der Datenbank.
  Die API-Routen bleiben lesend bestehen, `public/explorer.html` zeigt sie
  weiterhin an. Die zugehoerige Oberflaeche wurde entfernt (siehe
  `src/components/ENTFERNT.md`) -- gemint wird dort nicht mehr, weil die
  WASM-Engine seit der Umstellung 136-Byte-Header erwartet.

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
