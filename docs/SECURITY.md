# Sicherheit und Grenzen

Dieses Dokument benennt, was das System leistet und was nicht. Kein Punkt
hier ist ein offener Fehler — es sind Eigenschaften der Plattform, mit denen
die Architektur umgehen muss.

## Was kryptografisch hart ist

**Share-Validierung.** Der Server baut den Header aus eigenen Daten neu auf
und rechnet den Hash selbst. Entweder er erfuellt das Target oder nicht. Es
gibt keinen Weg, dem Server einen Share unterzuschieben, zu dem keine Arbeit
geleistet wurde.

**Telegram-Identitaet.** Die initData ist mit einem aus dem Bot-Token
abgeleiteten Schluessel signiert. Eine untergeschobene User-ID faellt beim
HMAC-Vergleich auf (`tests/chain.test.ts`).

Zum data-check-string: Fuer das HMAC-Verfahren ist nur `hash` ausgenommen,
`signature` gehoert hinein. Der Ausschluss von `signature` gilt allein fuer
das Ed25519-Verfahren zur Pruefung durch Dritte. Diese Verwechslung war die
Ursache des ersten `bad_signature` im Betrieb. Die Pruefung akzeptiert jetzt
beide Varianten -- ohne Abschwaechung, da fuer beide Zeichenketten weiterhin
der Bot-Token noetig ist.

**Kettenverkettung.** Ein Datenbank-Trigger erzwingt lueckenlose Hoehen und
passende `prev_hash`. Bloecke sind unveraenderlich, auch fuer die Service
Role — `UPDATE` und `DELETE` auf `blocks` loesen eine Exception aus.

**Replay-Schutz.** `unique (job_id, extranonce, nonce)` plus Job-TTL von
90 Sekunden.

## Was nicht geht

### Ein modifizierter Client ist nicht erkennbar

Wer den API-Vertrag nachbaut und den Header nativ auf einer Grafikkarte
hasht, leistet **echte, korrekt verifizierbare Arbeit** — nur zwei bis drei
Groessenordnungen schneller als ein Handy. Der Server kann diesen Miner nicht
von einem echten unterscheiden, weil er nicht unterscheidbar *ist*.

Jede Heuristik, die "unrealistische Hashrate" erkennen will, trifft
frueher oder spaeter nur den Nutzer mit dem neuen Geraet.

**Gegenmassnahme: Grenzen statt Erkennung.** Der Konto-Deckel begrenzt jeden
Teilnehmer auf `max(5 %, min(1, 3/N))` des Rundenrewards. Damit ist eine
Grafikkarte nach wenigen Prozent nutzlos. Wer mehr will, braucht viele
Konten — und das ist Sybil, nicht Client-Manipulation.

### Der Smartphone-Gate ist nicht durchsetzbar

`Telegram.WebApp.platform` kommt unsigniert vom Client. Es steht **nicht** in
den signierten initData und ist serverseitig nicht pruefbar.

Was der Gate trotzdem bringt: Er haelt die *ehrlichen* Desktop-Nutzer drau\u00dfen,
und die sind der groessere Teil der realen Ungleichheit. Wer die API direkt
anspricht, oeffnet die Mini App ohnehin nicht.

Der Gate sitzt deshalb am Session-Start, nicht in der Auth-Route: Bloecke,
Rangliste und Kontostand bleiben am Desktop einsehbar.

### Sybil ist das groessere Risiko

Telegram-Konten sind billig. Rewards haengen direkt an Rechenzeit, und ein
Geraet kann beliebig viele Konten bedienen. Das ist nicht technisch loesbar,
nur oekonomisch: Der Reward je Konto muss so gedeckelt sein, dass sich
Zweitkonten nicht lohnen.

Vorgesehen, noch nicht umgesetzt: Mindestalter des App-Kontos,
`is_premium`-Gewichtung, IP-Cluster als Signal (nicht als Beweis),
Reward-Freigabe erst nach N abgeschlossenen Runden.

Hinweis: Telegram liefert **kein Registrierungsdatum des Kontos**.
`users.first_seen_at` ist der erste Aufruf dieser App, nicht mehr.

### Bildschirmsperre

Sperrt das Display, haelt die Plattform den Worker an und das Mining endet
mitten im Job. Dagegen fordert die App eine Wake-Lock-Sperre an, solange
gemint wird.

Zwei Eigenheiten, die dabei zaehlen: Die Sperre wird automatisch
freigegeben, sobald die Seite unsichtbar wird, und muss danach neu
angefordert werden -- sonst ist sie stillschweigend weg. Und sie braucht
einen sicheren Kontext; ueber http gibt es sie nicht.

Was sie NICHT kann: manuelles Sperren durch den Nutzer verhindern oder das
Mining im Hintergrund weiterlaufen lassen. Auf Geraeten ohne die
Schnittstelle sagt die App das ausdruecklich, statt es zu verschweigen.

### Kein Hintergrund-Mining

Geht die Mini App in den Hintergrund oder sperrt das Display, haelt die
Plattform den Worker an oder drosselt ihn hart — auf iOS besonders
aggressiv. Das ist keine Konfigurationsfrage.

`useMiner` stoppt deshalb bei `visibilitychange` und `pagehide` sauber und
laesst die Session serverseitig auslaufen.

### Kein SharedArrayBuffer

Mehrfaedig-WASM ueber SharedArrayBuffer braucht COOP/COEP-Header. Die brechen
das Laden aller Cross-Origin-Ressourcen ohne CORP-Header, unter anderem der
Telegram-Avatare. Stattdessen: mehrere unabhaengige Worker mit getrennten
Nonce-Bereichen. Gleiche Wirkung, keine Header-Nebenwirkungen.

### Keine Batterie- oder Temperatur-Steuerung

Die Battery Status API gibt es auf Android-Chromium, auf iOS nicht. Eine
Temperatur-API existiert im Browser gar nicht. Der Leistungsregler ist
deshalb ein **Duty-Cycle**: Der Worker rechnet und schlaeft anteilig. Weniger
Prozent heisst weniger gerechnete Hashes, nicht eine kleinere Anzeige.

### Ein Validator

Die PoW ist echt und nachpruefbar, die Kette echt verkettet. Aber es gibt
genau einen Validator: diesen Server. Fuer ein Community-Event ist das in
Ordnung; als vertrauensfreie Blockchain darf es nicht vermarktet werden.

## Bekannte Skalierungsgrenzen

`shares` ist nicht partitioniert, weil `unique (job_id, extranonce, nonce)`
sonst den Partitionsschluessel enthalten muesste und Duplikate ueber
Tagesgrenzen durchliesse. Ab etwa 100 Shares/s wird daraus eine partitionierte
Tabelle plus eigene Dedupe-Schicht.

`rounds.total_weight` wird bewusst **nicht** beim Share-Insert fortgeschrieben
— eine Zeile, die jeder Miner bei jedem Share sperrt, waere der Flaschenhals.
Die Rundensumme kommt aus `round_contributions`.

Ab etwa 500 gleichzeitigen Minern (rund 17 Shares/s) traegt Vercel + Supabase
direkt. Darueber braucht es einen dedizierten Coordinator mit persistenter
WebSocket-Verbindung und Batch-Insert. Der Share-Transport liegt deshalb
hinter einer Schnittstelle, damit der Wechsel kein Umbau der Validierung ist.

## Share-Target und Block-Target nicht verwechseln

Der Client mint gegen sein **Share**-Target, das aus der VarDiff-Difficulty
seiner Session stammt. Das Block-Target steht zwar im Header (Feld
`difficulty`, weil es dort bitgenau stimmen muss), aber der Worker vergleicht
nicht dagegen.

Ob ein Share zufaellig auch das Block-Target erfuellt, entscheidet allein der
Server beim Nachrechnen. Der Client erfaehrt davon erst aus der Antwort.

Beim ersten Testlauf im Betrieb lieferte die Job-Route faelschlich das
Block-Target aus. Der Miner rechnete korrekt, suchte aber nach einem ganzen
Block: 1,6 Mrd statt 8,4 Mio Hashes, bei einer Job-Laufzeit von 90 Sekunden.
Von aussen sah das aus, als starte das Mining nicht.

Zwei Lehren daraus stecken jetzt im Code: `tests/chain.test.ts` prueft den
Abstand beider Targets, und abgelehnte Shares werden in der Oberflaeche
angezeigt statt stillschweigend verworfen.

## Merkle-Root

`blocks.merkle_root` verpflichtet auf die Beitraege und die Auszahlung der
**vorherigen** Runde. Die laufende Runde kann nicht im eigenen Header stehen,
das waere zirkulaer.

Aktuell ist das ein **flacher Hash** ueber die sortierte Liste
`user_id:amount`, kein echter Merkle-Baum. Fuer die Verankerung der
Auszahlungshistorie in der Kette reicht das; fuer Inklusionsbeweise einzelner
Nutzer nicht. Ein echter Baum kommt, wenn das gebraucht wird.
