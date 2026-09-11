# Was in dieses Repo gehört

Stand vom 11.09.2026. Alle Prüfungen grün: 67 Tests, 0 Typfehler,
Next.js-Build läuft durch.

## Zuerst

```bash
./AUFRAEUMEN.sh          # entfernt abgelöste Dateien (ein Zip löscht nichts)
npm install
npx tsc --noEmit         # muss 0 Fehler zeigen
npm test                 # 67 Tests
git add -A && git commit && git push
```

Unter Windows: `npm.cmd` statt `npm`.

## Was seit dem letzten Deployment neu ist

Die Datenbank ist bereits umgestellt — die Migrationen 00011 und 00012 sind
in Supabase eingespielt. **Der Code ist es nicht.** Genau deshalb beendet
der laufende Server noch immer die erste Session, wenn eine zweite mit
derselben Adresse startet.

### Mehrere Miner auf eine Adresse

| Datei | |
|---|---|
| `src/app/api/v2/session/route.ts` | beendet andere Sessions nicht mehr, Deckel bei 8 |
| `src/hooks/useMining.ts` | zeigt die Begründung des Servers statt nur den Code |
| `supabase/migrations/00011_chain2_multi_session.sql` | `reap_sessions`, `live_sessions` |

### Job an Session binden

| Datei | |
|---|---|
| `src/lib/node/node.ts` | trägt `session_id` in den Job ein |
| `src/lib/node/share.ts` | weist fremde Jobs mit `job_foreign` ab |
| `supabase/migrations/00012_chain2_job_session_binding.sql` | Spalte + Index |

Ohne das könnten zwei Sessions derselben Adresse dieselbe Nonce auf
denselben Job einreichen und beide gutgeschrieben bekommen.

### Oberfläche

| Datei | |
|---|---|
| `src/components/ShareChart.tsx` | feste Skala, feste Balkenbreite, Verankerung an der aktuellen Difficulty |
| `src/components/ui/Chrome.tsx` | Wortmarke als Text, Startbild mit Mindestdauer |
| `src/components/tabs/WalletTab.tsx` | Transaktionsdetails |
| `src/components/AppShell.tsx` | Wake Lock, Blockfund-Überlagerung schließbar |
| `src/app/globals.css` | Farben als RGB-Kanäle, Wasserzeichen-Regel entfernt |
| `src/app/api/v2/account/[address]/route.ts` | Verlauf, Adressen als bech32m |
| `src/hooks/useWakeLock.ts` | hält den Bildschirm wach beim Mining |
| `public/explorer.html` | Rückweg in die App, Sprung zu `#block-N`, neue Palette |
| `public/marke/logo.png` | aus 1024 statt 520 Pixeln |

**`public/marke/zeichen.png` muss weg** — `AUFRAEUMEN.sh` erledigt das.

### Miner

| Datei | |
|---|---|
| `miner/src/anzeige.mjs` | **neu** — Kennzahlen, Aufwand, Zeitfenster |
| `miner/src/cli.mjs` | Zeile je Share, Tastenbefehle, Adressabfrage |
| `miner/src/konfig.mjs`, `miner/src/frage.mjs` | **neu** — Einstellungen, Eingaben |
| `miner/build/bundle.mjs`, `miner/build/exe.mjs` | **neu** — eigenständige Binärdatei |
| `miner/miner.57f237a2a4.wasm` | Engine nach Inhalt benannt |

### Beobachter-Knoten

| Datei | |
|---|---|
| `observer/src/main.ts` | **neu** — holt die Kette und rechnet jeden Block nach |
| `observer/build.mjs`, `observer/package.json` | **neu** |
| `src/app/api/v2/sync/route.ts` | **neu** — rohe Blockkörper, stapelweise |

## Nach dem Push prüfen

```
/api/v2/summary            zeigt die aktuelle Höhe
```

Dann zweiter Miner mit derselben Adresse: In der `c`-Ansicht müssen beide
**verschiedene Extranonces** zeigen, und keiner darf `session_inactive`
melden.
