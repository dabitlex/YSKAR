# Entfernte Oberflaeche der ersten Kette

`MiningPanel.tsx`, `useMiner.ts`, `Explorer.tsx` und `src/app/explorer/`
gehoerten zur ersten Kette (Schema `public`), bei der die Datenbank das
Hauptbuch war und der Reward serverseitig verteilt wurde.

Sie sind ersetzt durch `Onboarding`, `Unlock`, `Mine` und `useMining`, die
gegen `/api/v2/*` und die eigene Kette arbeiten.

Die v1-API-Routen bleiben bestehen: `public/explorer.html` liest sie und
zeigt die alte Kette mit ihren 20 Bloecken weiterhin an. Gemint wird dort
nicht mehr -- die WASM-Engine erwartet seit der Umstellung 136-Byte-Header.
