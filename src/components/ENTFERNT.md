# Abgeloeste Dateien

Dieses Projekt hat zwei groessere Umbauten hinter sich. Die folgenden
Dateien gehoeren zu frueheren Staenden und duerfen NICHT mehr im Repo
liegen -- sie verweisen auf Bausteine, die es nicht mehr gibt, und lassen
den Build scheitern.

`AUFRAEUMEN.sh` im Wurzelverzeichnis entfernt sie.

| Datei | Warum weg | Ersetzt durch |
|---|---|---|
| `src/components/Mine.tsx` | Einzelbildschirm ohne Navigation | `AppShell.tsx` + Reiter |
| `src/components/MiningPanel.tsx` | Oberflaeche der ersten Kette | `AppShell.tsx` |
| `src/components/Explorer.tsx` | React-Explorer der ersten Kette | `public/explorer.html` |
| `src/hooks/useMiner.ts` | Mining gegen `/api/v1` | `useMining.ts` gegen `/api/v2` |
| `src/app/explorer/page.tsx` | Route zum React-Explorer | `public/explorer.html` |
| `src/components/PerformanceStrip.tsx` | ein Balken je Zeitfenster | `ShareChart.tsx`, ein Balken je Share |
| `src/lib/strip.ts` | Masse des Zeitfenster-Streifens | in `ShareChart.tsx` |
| `tests/header.test.ts` | prueft den 116-Byte-Header | `tests/core.test.ts` |
| `public/miner.wasm` | fester Name plus Jahres-Cache | `public/miner.<hash>.wasm` |

## Warum das ueberhaupt ein Problem ist

Die Pakete kommen als Zip, und ein Zip fuegt nur hinzu. Wer darueber
entpackt, ohne vorher zu loeschen, behaelt jede Datei, die einmal da war.
Beim Build faellt das dann an einer Stelle auf, die mit der eigentlichen
Aenderung nichts zu tun hat.

`src/lib/chain/` ist ein Sonderfall: Es gehoert zur ersten Kette und bleibt
bewusst liegen, weil `vardiff.ts` daraus weiterhin benutzt wird. Siehe
`src/lib/chain/DEPRECATED.md`.
