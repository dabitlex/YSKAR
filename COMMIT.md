# Was in dieses Repo gehört

Stand 17.09.2026. Alle Prüfungen grün: **155 Tests, 0 Typfehler**,
Next.js-Build läuft durch.

## Vor jedem Push

```bash
npm install
npx tsc --noEmit         # muss 0 zeigen
npm test                 # 155 Tests
git status --short       # kein node_modules, kein *.db, kein .next
```

Unter Windows `npm.cmd` statt `npm`.

Eigenständige Ordner brauchen ihre **eigene** Installation — eine im
Wurzelverzeichnis genügt nicht:

```bash
cd node && npm install && npm run build
cd miner && npm install && npm run build:exe
cd observer && npm install && npm run build
```

## Was nicht ins Repo gehört

```
node_modules/            überall
.next/  out/
*.db  *.db-wal  *.db-shm  Kettendaten des Knotens
node/knoten/  node/testnetz/  observer/daten/
miner/dist/  node/dist/  observer/dist/
.env  .env.local
wasm/sha256d_miner.wasm  Bauartefakt, verbindlich ist public/miner.<hash>.wasm
scripts/genesis.state.json
```

Die `.gitignore` im Wurzelverzeichnis und in `node/`, `miner/`, `observer/`
decken das ab. `*.db` fängt Kettendaten unabhängig vom Ordnernamen.

## Abgelöste Dateien

Falls noch vorhanden, gehören sie raus — sie werden von nichts mehr
importiert:

```
public/miner.wasm                     alte 116-Byte-Engine
src/app/explorer/                     ersetzt durch public/explorer.html
src/components/Explorer.tsx
src/components/MiningPanel.tsx
src/components/PerformanceStrip.tsx
src/hooks/useMiner.ts
src/lib/strip.ts
```

`AUFRAEUMEN.sh` erledigt das, braucht aber eine Bash-Umgebung.

## Migrationen

In Supabase eingespielt, die SQL-Dateien sind die Dokumentation:

```
00007–00011  chain2: Kern, Jobs, Rechte, Mehrfach-Sessions
00012        jobs.session_id
00013        transactions.coinbase_outputs
```

`chain2` muss unter **Settings → API → Exposed schemas** eingetragen sein,
sonst scheitert jeder Aufruf von `/api/v2/*` zur Laufzeit.

## Nach dem Push prüfen

```
/api/v2/summary                  aktuelle Höhe
/api/v2/block   (POST, leer)     {"accepted":false,"reason":"missing_raw"}
```

Antwortet die zweite mit einer 404-Seite statt JSON, ist der Deploy nicht
durch.

Dann der Full Node:

```bash
node dist/yskar-node.cjs status --data ./knoten
```

Die **Zustandswurzel** muss mit der aus `/api/v2/summary` übereinstimmen.
Das ist der eigentliche Beleg: zwei unabhängige Implementierungen, dieselbe
Rechnung.
