# Miner und Hashrate über mehrere Knoten

Jeder Knoten kennt nur die Mining-Sitzungen, die an **ihm** hängen. Wer am PC
über einen eigenen Knoten mint, war in den Zahlen der App (die über den
Raspberry läuft) bisher unsichtbar.

## Zwei Zahlen, zwei Quellen

| Feld in `/api/v2/summary` | Quelle | beweisbar? |
|---|---|---|
| `hashrate` („Netz-Hashrate“) | Difficulty und Blockzeit der letzten 24 Blöcke | **ja** — enthält jeden Miner, auch an fremden Knoten |
| `minerHashrate`, `activeMiners`, `miningSessions` | eigene Sitzungen **plus Meldungen der direkten Peers** | nein — gemeldet |
| `knoten` | Knoten mit gültiger Meldung, dieser eingeschlossen | — |

`activeMiners` zählt **Adressen** über alle Knoten hinweg: Wer mit derselben
Adresse an zwei Knoten mint, zählt einmal.

## Wie die Meldung läuft

P2P-Nachricht `stats` (`src/lib/node/p2p/messages.ts`) alle 30 Sekunden und
beim Verbinden: Kennung des Knotens, gemessene Hashrate, Sitzungen, Adressen
(höchstens 500). Gesammelt in `NetzStatistik.ts`, Verfall nach 90 Sekunden.

**Nur an Peers, deren Kennung `+stats` enthält.** Ein Knoten älterer Fassung
kennt den Befehl nicht und würde die Verbindung trennen; er bekommt deshalb
nie eine Meldung. Die Protokollnummer bleibt 1 — eine höhere würden alte
Knoten ablehnen.

## Grenzen

- Nur **direkte** Peers. Meldungen werden nicht weitergereicht.
- Bis zu **30 Sekunden Verzug** zwischen den Knoten.
- Beide Knoten brauchen die neue Fassung, sonst sehen sie einander in der
  Statistik nicht (die Kette gleichen sie trotzdem ab).
