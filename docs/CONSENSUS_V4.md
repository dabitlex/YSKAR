# Konsensfassung 4 — Difficulty ohne Obergrenze

Beschlossen bei Höhe 2.942 am 01.10.2026. Aktiv ab **Höhe 6.000** (Beginn Season 2).

## Das Problem

Die Difficulty steht im Header als u32. Das Feld endet bei 4.294.967.295,
entsprechend rund **469 GH/s** Netz-Hashrate. Darüber konnte die Anpassung
nicht mehr folgen:

1. LWMA verlangt einen Wert über u32, der Knoten kann keinen Header bauen.
   `/job` antwortet mit HTTP 500, kein Miner bekommt Arbeit.
2. Nach 30 Minuten ohne Block lockert die Notfallregel, bis der Wert wieder
   passt. Der nächste Block fällt sofort, und alles beginnt von vorn.

Simuliert mit der echten Anpassungsfunktion: Bei 200 TH/s kamen zwei
Blöcke in je einer Sekunde, dann eine Pause von 30 Minuten, immer wieder.
Die Blockzeit lag im Schnitt trotzdem bei 10 Minuten, weil die LWMA die
Pausen mitzählt. Die Ausgabe neuer YSR wäre im Plan geblieben, aber das
Mining nicht.

## Die Lösung: dasselbe Feld, neue Lesart

Das Feld bleibt 4 Byte groß. Header-Größe (136 Byte), Nonce-Position und
Midstate ändern sich nicht. Ab Höhe 6.000 gilt:

| Oberstes Bit | Bedeutung | Bereich |
|---|---|---|
| 0 | difficulty = Feld | 1 … 2.147.483.647 |
| 1 | e = Bits 23–30, m = Bits 0–22, difficulty = (2^23 + m) · 2^e | 2^31 … `MAX_DIFFICULTY` |

- **Unter 2^31 sind die Bytes dieselben wie vorher**, vor und nach der
  Aktivierung. Der höchste bisher erreichte Wert war 1.831.228.
- Darüber gilt eine Gleitkommazahl mit 24 Bit Genauigkeit. Sie rundet um
  weniger als 2^-23 (≈ 0,00001 %).
- `MAX_DIFFICULTY` = (2^24 − 1) · 2^216, knapp unter 2^240. Dort ist das
  Target 1, also die Grenze von SHA-256 selbst, nicht von YSKAR.
- **Eindeutig:** Jeder Wert hat genau eine Schreibweise. Ein Exponent unter 8
  (der Wert läge unter 2^31) oder über 216 ist ungültig, und ein solcher
  Header wird schon beim Lesen abgelehnt.

Unter der Aktivierungshöhe bleibt die alte Lesart: Das Feld ist eine
schlichte u32 bis 2^32 − 1. Welche Lesart gilt, entscheidet die Höhe im
selben Header. Code: `encodeDifficulty`, `decodeDifficulty`,
`floorDifficulty` in `src/lib/core/params.ts`.

## Regel

`checkDifficulty()` in `src/lib/core/validate.ts`:

```
regulär  = floor(LWMA(…))
gelockert = floor(Notfallregel(LWMA(…), vergangen))
gültig, wenn gelockert ≤ difficulty ≤ regulär
```

`floor` rundet auf den nächsten darstellbaren Wert ab, höchstens auf
`MAX_DIFFICULTY`. Weil `floor` monoton ist, wird der Bereich nie leer. Unter
2^31 rundet `floor` nichts, und die Regel ist dort exakt die alte.

Der Knoten (`MiningCoordinator`) baut seine Aufgaben mit genau diesem
abgerundeten Wert.

## Kompatibilität

| | Muss aktualisiert werden? |
|---|---|
| Raspberry, PC-Knoten, Vercel | **Ja, vor Höhe 6.000.** Bis zu einer Difficulty von 2^31 (rund 234 GH/s) rechnen alte und neue Knoten trotzdem identisch. |
| Supabase-Spiegel | Erledigt: Migration 00020 (`difficulty` → `numeric(78,0)`, `commit_block`) |
| App, Mini App, CLI-Miner, GPU-Miner | Nein. Der Knoten schickt in `job.difficulty` das **rohe Header-Feld**, und genau das schreiben alle Miner an Stelle 112. Neuere Fassungen lesen den echten Wert aus `difficultyWert`. |

Bei älteren Minern ist über 2^31 nur die **Anzeige** falsch (sie zeigt das
rohe Feld), das Rechnen stimmt. Geprüft in
`tests/konsens-v4.test.ts` mit dem unveränderten `miner/src/header.mjs`.

## Außerhalb des Konsens

| Stelle | Änderung |
|---|---|
| API (`/summary`, `/blocks`, `/job`) | Zusätzlich `difficultyWert` als Dezimaltext. JavaScript rundet Zahlen ab 2^53 (rund 9 Billiarden). |
| Supabase lesen | `difficulty::text`, aus demselben Grund |
| P2P-Statistik | Hashrate über u64 (18,4 EH/s) wird gedeckelt statt zu werfen. Betrifft nur die Anzeige. |
| Anzeigen | Einheiten bis YH/s (`src/lib/format/hashrate.ts`, Explorer, CLI); große Difficulty kompakt |
| Explorer | Rechnet die Schreibweise selbst nach (`diffFeld`), bevor er den Hash prüft |
| `src/lib/chain/` | Unverändert. Das ist der abgelöste Pfad der ersten Kette (siehe `DEPRECATED.md`). |

## Tests

`tests/konsens-v4.test.ts`:

- Byte-Identität für über 500 Werte unter 2^31, an fünf Höhen
- Darstellung und Rundung für über 2.000 Werte zwischen 2^31 und 2^240
- Monotonie der Abrundung
- Eindeutigkeit über 20.000 zufällige Felder, Ablehnung unzulässiger Exponenten
- Regel: Wert über u32 angenommen, eine Stufe zu hoch oder zu niedrig abgelehnt, Notfallregel
- Alter CLI-Header-Bau gegen den Knoten-Header, Byte für Byte
- Explorer-Kodierung gegen den Kern
- **Simulation bei 5 TH/s, 200 TH/s und 10^21 H/s: im Schnitt 540–660 s je Block,
  höchstens 8 % Blöcke über 30 Minuten** (exponentiell erwartbar sind rund 5 %;
  die alte Fassung hatte bei 200 TH/s 33 %).

## Was sich nicht ändert

Hash (SHA-256d), Header-Größe, Blockzeit, Belohnung, Halbierungen,
21 Millionen YSR, Gebühren, Adressen, Wallets und alle bisherigen Blöcke.
