# YSKAR

Telegram Mini App mit echtem Proof-of-Work-Mining. Das Geraet des Nutzers
rechnet tatsaechlich SHA-256d-Hashes; der Server rechnet jeden eingereichten
Share selbst nach. Es gibt keine simulierte Hashrate und keine vom Client
behaupteten Werte.

Stand: **Meilenstein 1** — die Kette von der Telegram-Anmeldung bis zum
gefundenen Block. Oberflaeche bewusst minimal.

## Schnellstart

```bash
npm install
cp .env.example .env.local     # Werte eintragen, siehe unten
npm test                       # 24 Tests, laufen ohne Datenbank
npm run dev
```

Die Migrationen unter `supabase/migrations/` sind im Projekt
`ldpfnphwrotmyfejfjpu` bereits eingespielt.

### Umgebungsvariablen

| Variable | Woher |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ebenda |
| `SUPABASE_SERVICE_ROLE_KEY` | ebenda. Umgeht RLS, gehoert nie in den Browser |
| `TELEGRAM_BOT_TOKEN` | BotFather, @YSKAR_bot |
| `JWT_SECRET` | `openssl rand -base64 48` |

## Wie das Mining funktioniert

```
Mini App → Session (Extranonge) → Job → Web Worker → WASM
    → echte Hashes → Share → Server rechnet nach → akzeptiert
    → Block? → Kette + Auszahlung → Realtime an alle
```

Der Client sendet ausschliesslich eine **Nonce**. Den Header baut der Server
aus seinen eigenen Daten neu auf: Job-Felder aus der Datenbank, Extranonce
aus der Session. Er hasht selbst und leitet daraus ab, wie viel Arbeit
geleistet wurde. Hashrate, Difficulty und Share-Anzahl werden nie vom Client
uebernommen.

### Header, 116 Byte, Little-Endian

```
  0  u32   version        72  16B   jobSeed
  4  u32   height          88  u64   timestamp
  8  32B   prevHash        96  u32   difficulty
 40  32B   merkleRoot     100  u64   extranonce
                          108  u64   nonce   ← einziges Client-Feld
```

`src/lib/chain/header.ts` (Server) und `src/workers/miner.worker.ts` (Client)
muessen bitgenau dasselbe erzeugen. `tests/header.test.ts` prueft genau das
gegen die echte WASM-Engine — weicht der Server um ein Byte ab, ist jeder
Share ungueltig, und die Fehlermeldung sagt nur "Hash stimmt nicht".

### Extranonce

Jede Session bekommt einen eigenen Wert. Damit sind die Suchraeume aller
Miner disjunkt: doppelte Arbeit ist ausgeschlossen, zwei Nutzer koennen nie
denselben gueltigen Share finden, und ein abgefangener fremder Share ist
wertlos.

### VarDiff

Jede Session hat ein eigenes Share-Target, das auf etwa einen Share alle
30 Sekunden eingeregelt wird — unabhaengig von der Geraeteleistung. Folge:
Die **Serverlast haengt an der Anzahl der Miner, nicht an ihrer Hardware**
(`Shares/s = Miner / 30`). Ein schnelles Geraet bekommt nicht mehr Shares,
sondern schwerere, und die zaehlen entsprechend mehr.

Die Summe aller Share-Difficulties einer Runde ergibt exakt die
Block-Difficulty. Deshalb geht die anteilige Auszahlung ohne Korrekturfaktor
auf.

## Tokenomics

```
YSKAR (YSR), 8 Nachkommastellen, max. 21.000.000
875 YSR je Block, Halving alle 12.000 Bloecke (= 2 Seasons)
Blockzeit 10 min, Season 6.000 Bloecke (ca. 6 Wochen)
```

Reward rein anteilig nach validierten Shares, kein Finder-Bonus. Deckel je
Konto und Runde: `max(5 %, min(1, 3/N))` — hoechstens das Dreifache des
Durchschnittsanteils, Untergrenze 5 %.

## Was gemessen wurde

Android-Referenzgeraet, WASM mit Midstate:

| Konfiguration | Ergebnis |
|---|---|
| 1 Worker, 100 %, 20 s | 1,42 MH/s |
| 2 Worker, 100 %, 20 s | 2,96 MH/s |
| 2 Worker, 100 %, 5 min | **2,64 MH/s, 0 % Abfall** |

Der 20-Sekunden-Wert misst den Boost-Takt, nicht den Dauerbetrieb. Alle
Chain-Parameter sind auf 2,64 MH/s ausgelegt.

## Struktur

```
src/lib/chain/     header, target, difficulty (LWMA), vardiff, params
src/lib/telegram/  initData-Pruefung per HMAC
src/lib/auth/      HS256-JWT ohne Fremdbibliothek
src/app/api/v1/    auth/telegram, mining/{session,job,share,status}
src/workers/       miner.worker.ts — Nonce-Schleife in WASM
wasm/              gen_wat.py erzeugt sha256d_miner.wat, build.js kompiliert
supabase/          Migrationen
docs/              SECURITY.md, MINING.md
```

Die WAT-Datei ist **generiert, nicht handgeschrieben**. Aenderungen laufen
ueber `wasm/gen_wat.py`, danach `npm run wasm:gen`.

## Grenzen

Vollstaendig in `docs/SECURITY.md`. Die wichtigsten:

- **Kein Hintergrund-Mining.** Geht die App in den Hintergrund oder sperrt
  das Display, haelt die Plattform den Worker an. Wir stoppen deshalb sauber,
  statt das zu verschleiern.
- **Der Smartphone-Gate ist eine Regel, keine Sicherheitsgrenze.**
  `Telegram.WebApp.platform` steht nicht in den signierten initData und ist
  serverseitig nicht pruefbar.
- **Ein modifizierter Client ist nicht erkennbar.** Wer den Header selbst
  baut und nativ hasht, leistet echte Arbeit — nur schneller. Dagegen wirkt
  nur der Konto-Deckel, keine Heuristik.
- **Das ist keine dezentrale Blockchain.** Die PoW ist echt und nachpruefbar,
  die Kette echt verkettet, aber es gibt genau einen Validator: diesen Server.
