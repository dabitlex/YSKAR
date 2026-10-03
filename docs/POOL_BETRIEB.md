# Pool betreiben

Ein Pool ist **kein Eintrag irgendwo**, sondern ein Full Node, der seine
Coinbase aufteilt. Keine Registrierung, keine Erlaubnis.

Die Kette kennt kein Pool-Register. Damit die App einen Pool zur Auswahl
anbietet, steht er in einer Liste im Repository — siehe
[In der App erscheinen](#in-der-app-erscheinen). Wer nicht darauf steht, ist
trotzdem erreichbar: über „Eigene Adresse“ in der App und über `--api` im
Kommandozeilen-Miner.

## Mit dem Node Core (Windows)

Im Node Core gibt es dafür die Ansicht **Pool betreiben**: Name eintragen,
Gebühr und Plätze einstellen, einschalten. Mehr braucht es nicht — es ist
derselbe Pool wie beim Kommandozeilen-Knoten unten, nur mit Oberfläche.

| | |
|---|---|
| Gebühr | geht an die Wallet dieses PCs; 0 bis 5 % in Schritten von 0,25 % |
| Eigener Miner | rechnet mit, wenn du im Mining „Pool“ wählst — dein Pool steht dort zuerst |
| Geräte im Heimnetz | Schalter „Im Heimnetz freigeben“; andere PCs verbinden sich mit `http://<Adresse dieses PCs>:8645` |
| App und Mini App | nur über HTTPS mit eigenem Namen und Zertifikat — das richtet der Node Core nicht ein, siehe [Wie ein Miner beitritt](#wie-ein-miner-beitritt) und `docs/UMSTELLUNG.md` |
| Fenster | wird gesichert und beim nächsten Start wieder geladen |

Der Anschluss 8645 antwortet dabei nur dem eigenen PC und dem eigenen Netz.
Wer den Pool ins Internet stellen will, setzt einen eigenen Webserver mit
Zertifikat davor (auf demselben PC oder im selben Netz).

## Starten

```bash
node dist/yskar-node.cjs mine --data ./knoten \
  --seed yskar-main.dynv6.net:8646 --no-upstream \
  --pool pool.yskar.net \
  --pool-fee 100 \
  --pool-payout ysr1…
```

| | |
|---|---|
| `--seed <host:port>` | ein bekannter Knoten -- über ihn lädt der Pool die Kette und gibt seine Blöcke ins Netz |
| `--no-upstream` | Blöcke gehen nur an andere Knoten, nicht an den Spiegel unter yskar.vercel.app (den beschreibt allein der Hauptknoten) |
| `--pool <name>` | Name, der in jeden Pool-Block kommt |
| `--pool-fee <bp>` | Basispunkte: `100` = 1,00 %, höchstens `500` |
| `--pool-payout <a>` | Adresse für die Gebühr — **Pflicht ab Gebühr > 0** |
| `--pool-max <n>` | höchstens so viele Adressen aufnehmen (Vorgabe: 64, mit Gebühr 63) |

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

In der App: Modus auf **Pool**. Die App schlägt den ersten offenen Pool der
Liste vor; „Wechseln“ zeigt alle mit Minern und Plätzen, Leistung, gefundenen
Blöcken und Gebühr. Ein Pool, der nicht in der Liste steht, lässt sich über
„Eigene Adresse“ eintragen.

Ein Knoten **ohne** Pool lehnt eine Pool-Anmeldung ab (`pool_unavailable`),
statt sie stillschweigend als Solo zu führen. Sonst minte jemand im Glauben,
seine Arbeit werde geteilt, und bekäme nichts.

## Plätze

Ein Pool nimmt so viele **Adressen** auf, wie ein Block auszahlen kann:

```
64   ohne Gebühr
63   mit Gebühr (ein Empfänger ist der Betreiber)
```

Mit `--pool-max` kann der Betreiber weniger anbieten, nicht mehr. Eine
angekündigte Gebühr zählt schon vor dem Block mit, ab dem sie gilt.

Gezählt werden Adressen, nicht Geräte. Wer mit drei Telefonen auf dieselbe
Adresse mint, belegt einen Platz — die Coinbase zahlt jede Adresse ohnehin
nur einmal aus.

**Voll heißt gesperrt.** Meldet sich eine neue Adresse an einem vollen Pool
an, antwortet der Knoten mit HTTP 409:

```json
{ "error": "pool_full", "detail": "Pool voll: alle 64 Plätze sind belegt (pool_full).",
  "plaetze": 64, "belegt": 64 }
```

Wer schon einen Platz hat, darf weitere Geräte anmelden. Solo-Mining am
selben Knoten bleibt unberührt.

Die übrigen Ablehnungen (`missing_address`, `bad_address`,
`pool_unavailable`) kommen wie bisher mit HTTP 200 und `error`. Der Miner
der Android-App (`User-Agent: YSKAR-Wallet-Nativ/…`) bekommt auch
`pool_full` mit 200: Er hält alles ab 400 für einen Netzfehler und versuchte
es sonst endlos weiter, statt anzuhalten.

**Wann ein Platz frei wird:**

| | |
|---|---|
| Miner stoppt (meldet sich ab) | sofort — sofern kein zweites Gerät derselben Adresse weiterrechnet |
| Miner verstummt (App eingefroren, Absturz, Netz weg) | Sitzung läuft nach 5 Minuten ab, der Platz bleibt weitere 15 Minuten vorgemerkt |
| Angemeldet, aber nie einen Share geliefert, dann verstummt | nach 5 Minuten — ohne Vormerkung |
| Angemeldet, holt weiter Jobs, liefert aber 10 Minuten lang keinen Share | nach diesen 10 Minuten — die Sitzung bleibt, zählt aber nicht mehr als Platz |

**Ein Platz gehört, wer arbeitet.** Wer rechnet, liefert rund alle 30
Sekunden einen Share. Eine Sitzung, die zehn Minuten lang keinen einzigen
angenommenen Share hatte, wird nicht beendet — sie hält nur keinen Platz
mehr, und ein anderer kann ihn bekommen. Liefert sie wieder, zählt sie
wieder. `miner` (verbunden) kann deshalb über `belegt` liegen.

Die Vormerkung ist für Telefone da: Eine eingefrorene App meldet sich nicht
ab. Kommt sie nach zehn Minuten zurück, eröffnet der Miner still eine neue
Sitzung — und stünde sonst vor einem vollen Pool, obwohl er nie gegangen ist.
Vorgemerkt wird je Sitzung: Meldet sich ein zweites Gerät derselben Adresse
ab, bleibt die Vormerkung des eingefrorenen stehen; ein „Stopp“ für die
abgelaufene Sitzung selbst löscht sie. Hat das Gerät nach dem Aufwachen eine
neue Sitzung eröffnet und stoppt diese, bleibt die alte Vormerkung bis zu
ihrem Ablauf stehen — der Platz wird dann bis zu 15 Minuten später frei. Der
Knoten kann nicht wissen, ob die neue Sitzung vom selben Gerät kommt.

**Der Stand ist für jeden lesbar:**

```bash
curl https://pool.yskar.net/api/v2/pool
curl "https://pool.yskar.net/api/v2/pool?address=ysr1…"   # zusätzlich: dabei
```

```json
{ "name": "pool.yskar.net", "feeBps": 100, "feeBpsNext": null,
  "miner": 5, "hashrate": 146000000,
  "plaetze": 63, "belegt": 5, "frei": 58, "voll": false,
  "eintraege": 412, "arbeitGesamt": "1930112" }
```

`miner` sind Adressen mit offener Pool-Sitzung. `belegt` sind die, die
einen Platz halten: arbeitende Sitzungen und Vormerkungen. Ein Knoten ohne
Pool antwortet mit 404 `pool_unavailable`.

**Was das nicht leistet — ehrlich:**

- **Plätze lassen sich besetzen.** Ohne Arbeit hält eine Anmeldung ihren
  Platz zehn Minuten; danach kostet er einen angenommenen Share je Adresse
  alle zehn Minuten. Das ist wenig. Wer es darauf anlegt, kann einen Pool
  mit vielen Adressen und wenig Rechenleistung füllen — der Knoten kennt
  keine Personen, nur Adressen. Dagegen hilft derzeit nur eine Begrenzung im
  vorgeschalteten Webserver. (Vor dieser Grenze gab es nichts zu besetzen —
  dafür minte der 65. Miner ohne Auszahlung.)
- Die Grenze gilt für die **Aufnahme**, nicht für das PPLNS-Fenster. Wer
  gegangen ist, hat noch eine Weile Arbeit im Fenster. Liegen dort deshalb
  mehr Adressen, als ein Block auszahlt, bekommen die mit der meisten Arbeit
  ihren Anteil; die Kleinsten gehen in diesem Block leer aus (siehe
  „Grenzen aus dem Code“). Mit der Aufnahmegrenze betrifft das nur noch
  Reste von Minern, die schon weg sind, oder jemanden in seinen ersten
  Minuten.

## In der App erscheinen

Die Liste steht in `src/lib/pool/verzeichnis.ts`:

```ts
export const POOLS: PoolEintrag[] = [
  { host: 'yskar-main.dynv6.net', name: 'YSKAR Main', kette: 'yskar-main.dynv6.net' },
];
```

`host` ist die Adresse des Knotens, `name` der Anzeigename, `kette` der Name
aus `--pool` (nur nötig, solange der Knoten ihn nicht selbst meldet). Ein
neuer Eintrag ist eine Zeile; `tests/pool-verzeichnis.test.ts` prüft sie.

Voraussetzungen für einen Eintrag:

- erreichbar über **HTTPS** mit den CORS-Kopfzeilen aus
  `docs/UMSTELLUNG.md`, Schritt 4 — die App fragt den Pool direkt
- ein Knoten mit `/api/v2/pool` (ab diesem Stand). Ältere Knoten erscheinen
  als „Erreichbar“ ohne Zahlen und ohne Sperre

Die Liste ist keine Prüfung und keine Empfehlung. Miner, Leistung und Gebühr
meldet der Pool selbst; nur die gefundenen Blöcke zählt der Server aus der
Kette — über den Namen im Block, also ebenfalls nach Selbstauskunft
(`/api/v2/pools`, Migration 00025).

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

Liegen mehr Adressen im Fenster, als ein Block auszahlt, bekommen die mit
der meisten Arbeit ihren Anteil. Die Arbeit der übrigen bleibt im Fenster
und zählt beim nächsten Block wieder mit — ein eigenes Guthaben führt der
Knoten für sie aber **nicht**. Wer dauerhaft zu den Kleinsten jenseits der
Grenze gehörte, ginge also leer aus. Deshalb nimmt der Pool gar nicht erst
mehr Adressen auf, als er auszahlen kann (siehe [Plätze](#plätze)).

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

**Neustartfest (Kommandozeilen-Knoten).** `PoolCoordinator` kann sein
Fenster exportieren und laden (`exportieren()` / `laden()`). Der Node Core
tut das; der Kommandozeilen-Knoten noch nicht — dort beginnt das Fenster
nach einem Neustart leer, und die Arbeit der letzten Stunde wäre verloren.
