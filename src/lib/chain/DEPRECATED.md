# Abgeloest durch src/lib/core/

Dieses Verzeichnis gehoert zur ersten Kette (Schema `public`), bei der die
Datenbank das Hauptbuch war und der Block nur einen Hash darauf enthielt.

Ersetzt durch `src/lib/core/` -- eigenstaendige Kette mit Transaktionen im
Block, Ganzzahl-Konsens und wiederherstellbarem Zustand.

Was hier noch gebraucht wird, solange die alten Routen laufen:
- `vardiff.ts`  -- unveraendert uebernehmbar, haengt nicht am Blockformat
- `target.ts`   -- gleiche Konvention wie core/params.ts

Was NICHT mehr gilt:
- `header.ts` und `serialize.ts` beschreiben den 116-Byte-Header. Die
  WASM-Engine kann ihn seit der Umstellung auf 136 Byte nicht mehr.
- `difficulty.ts` rechnet mit Number und Math.round. Fuer einen einzelnen
  Server war das folgenlos, fuer mehrere Knoten waere es ein Konsensfehler.
  Ersatz: `src/lib/core/difficulty.ts`, ausschliesslich BigInt.

`tests/header.test.ts` wurde entfernt: Er prueft das alte Format gegen eine
Engine, die es nicht mehr gibt. Die Nachfolge steht in `tests/core.test.ts`.
