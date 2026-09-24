# Pool betreiben

Ein Pool ist **kein Eintrag irgendwo**, sondern ein Full Node, der seine
Coinbase aufteilt. Keine Registrierung, keine Erlaubnis.

## Starten

```bash
node dist/yskar-node.cjs mine --data ./knoten \
  --pool pool.yskar.net \
  --pool-fee 100 \
  --pool-payout ysr1…
```

| | |
|---|---|
| `--pool <name>` | Name, der in jeden Pool-Block kommt |
| `--pool-fee <bp>` | Basispunkte: `100` = 1,00 %, höchstens `500` |
| `--pool-payout <a>` | Adresse für die Gebühr — **Pflicht ab Gebühr > 0** |

Ohne `--pool` läuft der Knoten wie bisher: reines Solo-Mining.

Der Knoten prüft beim Start, nicht beim ersten Block. Eine Gebühr ohne
Auszahlungsadresse verhindert den Start — sonst fiele es erst auf, wenn ein
Block gefunden ist.

## Der Name landet in der Kette

`--pool pool.yskar.net` schreibt diesen Namen in das `extra`-Feld der
Coinbase jedes Pool-Blocks. Der Explorer liest ihn heraus und zeigt ihn
unter dem Block; ohne Namen steht dort „Unbekannt".

Es gelten dieselben Regeln wie überall: druckbares ASCII, mindestens drei
und höchstens 32 Zeichen. Was einmal in einem Block steht, steht dort für
immer.

**Nur Pool-Blöcke tragen ihn.** Ein fremder Solo-Miner, der über diesen
Knoten mint, baut seinen eigenen Block — dein Name hätte darin nichts zu
suchen.

## Wie ein Miner beitritt

```bash
yskar-miner --address ysr1… --api https://pool.yskar.net --mode pool
```

In der Mini App: Modus auf **Pool**, Adresse eintragen, starten.

Ein Knoten **ohne** Pool lehnt eine Pool-Anmeldung ab (`pool_unavailable`),
statt sie stillschweigend als Solo zu führen. Sonst minte jemand im Glauben,
seine Arbeit werde geteilt, und bekäme nichts.

## Solo und Pool nebeneinander

Derselbe Knoten bedient beide. Jede Sitzung legt ihren Modus beim Anmelden
fest und behält ihn — ein Wechsel mitten im Lauf ließe Arbeit im Fenster in
der Schwebe.

```
Sitzung A   solo   Coinbase → Adresse A          Extranonce 1
Sitzung B   pool   Coinbase → Aufteilung         Extranonce 2
Sitzung C   pool   Coinbase → dieselbe Aufteilung Extranonce 3
```

B und C bauen am selben Block, A an einem eigenen. Die Extranonce steht im
Header und trennt die Suchräume — zwei Miner können denselben Treffer gar
nicht finden.

## Der Block zahlt, nicht der Betreiber

Die Belohnung entsteht direkt auf den Adressen der Miner. Es gibt keinen
Moment, in dem jemand fremdes Geld hält — also auch keine Kasse, mit der
jemand verschwinden könnte.

Nachgewiesen an einem echten Block:

```
Betreiber (Gebühr)      8,7500 YSR     1,00 %
Telefon A (4000)      330,0000 YSR    37,71 %
Telefon B (3000)      247,5000 YSR    28,29 %
Telefon C (2000)      165,0000 YSR    18,86 %
Telefon D (1000)       82,5000 YSR     9,43 %
Telefon E (500)        41,2500 YSR     4,71 %
Summe                 875,0000 YSR    ← exakt
```

Jeder kann das im Explorer nachrechnen.

**Was du trotzdem glauben musst:** die Share-Zählung. Shares stehen in
keinem Block. Du kannst hinterher sehen, dass jemand 37,71 % bekommen hat,
aber nicht, ob ihm 37,71 % zustanden. Das ist bei jedem Pool so — auch bei
Bitcoin. Vertrauensarm, nicht vertrauensfrei.

## Grenzen aus dem Code

```
64   Empfänger je Coinbase
63   Miner je Block (einer geht für die Gebühr)
5 %  höchste Gebühr
```

Bei mehr als 63 Minern zahlt nicht jeder in jedem Block. Die Abrechnung
trägt die Arbeit derer, die nicht hineinpassen, in die nächste Runde vor —
sie geht nicht verloren, sie wartet.

## Das PPLNS-Fenster

Es ist **doppelt so groß wie die Netz-Difficulty** und kennt keine
Rundengrenze. Nach einem Fund wird es nicht geleert, sondern wandert weiter.
Deshalb bringt es nichts, kurz vor einem erwarteten Fund einzusteigen.

| | Netz-Difficulty | Fenster |
|---|---|---|
| Testnetz | 1 | **2** — unbrauchbar |
| Mainnet | 452.148 | 904.296 |

**Im Testnetz entartet das.** Ein einziger Share mit Difficulty 128 sprengt
ein Fenster von 2, und die Aufteilung hat dann genau einen Empfänger. Das
ist kein Fehler, sondern die Formel bei entarteten Parametern — auf dem
Mainnet passen hunderte Shares hinein.

Wer im Testnetz prüfen will, testet die Abrechnung direkt
(`tests/pool-anbindung.test.ts`) statt über einen laufenden Knoten.

## Was gezählt wird

Die **Share-Difficulty zum Zeitpunkt des Funds** — nicht die erreichte.

Sonst zählte ein Glückstreffer wie tausend Shares, und wer Glück hat, bekäme
mehr als wer arbeitet. Die Auszahlungsadresse wird beim **Anmelden**
festgeschrieben, nicht bei jedem Share: Sonst könnte jemand sie nachträglich
umbiegen und sich fremde Arbeit gutschreiben.

## Was noch fehlt

**TLS.** Telegram lädt Mini Apps nur über HTTPS. Ein Telefon erreicht deinen
Pool erst, wenn er unter einem Namen mit Zertifikat läuft — siehe
`docs/UMSTELLUNG.md`, Schritt 4.

**Auszahlungsverlauf.** Wer wie viel bekommen hat, steht in der Kette, aber
der Knoten führt darüber kein eigenes Buch. Für die Anzeige „deine letzte
Auszahlung" bräuchte es eine Tabelle.

**Neustartfest.** `PoolCoordinator` kann sein Fenster exportieren und laden
(`exportieren()` / `laden()`), aber der Knoten tut es noch nicht. Nach einem
Neustart beginnt das Fenster leer — die Arbeit der letzten Stunde wäre
verloren.
