# YSKAR Kette -- Phase 1

Eigenstaendige Kette mit Transaktionen im Block. Der Zustand ist allein aus
Bloecken wiederherstellbar; Eigentum haengt an Schluesseln, nicht an Telegram.

## Der Pruefstein

> Datenbank loeschen, aus den Bloecken neu aufbauen, identischer state_root.

Solange das nicht geht, ist es keine Kette, sondern eine Datenbank mit Hashes
daneben. `tests/core.test.ts` fuehrt genau das aus.

## Zahlen

```
YSKAR (YSR), 8 Nachkommastellen, max. 21.000.000
875 YSR je Block, Halving alle 12.000 Bloecke (2 Seasons)
Blockzeit 10 min, Mindestgebuehr 0,001 YSR
Netz: yskar-main-1
chain_id: 952ee402c8e77c34e006d7019780c93e2297795a02abb26c4decd627278af2e8
```

## Genesis-Block

Gemint am 09.09.2026, echt und nachpruefbar.

```
height       0
hash         000000090a14a03f1562d11113d539c1208b8078c6391da6c48f6bcf72c33c66
prev_hash    0000000000000000000000000000000000000000000000000000000000000000
merkle_root  1007612ea5c27b0b7c6ae79c745da364cfd64224eb6f5519bf559dc3b09fe840
state_root   e2860175f61cefa97ff34e88d35402a7ee373a8764adbdda0b97ef200bbeca57
timestamp    1788912000   2026-09-09T00:00:00Z
difficulty   4096
nonce        50773796
Inschrift    "proof, not promise"
```

Die Coinbase ueber 875 YSR geht an die Nulladresse
`ysr1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqregwfw`. Es gibt keinen Schluessel, der
auf 20 Nullbytes fuehrt -- der Betrag entsteht und ist sofort unausgebbar.
So bleibt die Reward-Funktion ohne Sonderfall und es gibt keinen Premine.
Bitcoins Genesis verhaelt sich genauso.

Die eigene Difficulty des Genesis ist die Untergrenze 4096. Ab Block 1 gilt
regulaer 24576. Gefunden wurde er nach 50 Mio Hashes bei 268 Mio erwarteten --
Glueck, kein Fehler.

`tests/core.test.ts` friert den Block ein: Wer an Serialisierung,
Merkle-Baum, Zustandswurzel oder Reward-Funktion etwas aendert, faellt dort
auf und nicht erst, wenn zwei Knoten sich uneinig sind.

## Wallet

```
12 oder 24 Merkwoerter (BIP39)
  -> Seed (PBKDF2, optional Passphrase)
  -> SLIP-0010 fuer ed25519, m/44'/9077'/konto'/0'/index'
  -> Ed25519-Schluesselpaar
  -> Adresse = bech32m('ysr', sha256(pubkey)[0..20])
```

BIP32 funktioniert fuer ed25519 nicht -- die Schluessel lassen sich nicht
linear addieren. SLIP-0010 loest das, erlaubt aber ausschliesslich gehaertete
Pfade.

Coin-Type 9077 ist NICHT bei SLIP-0044 registriert. Fuer eine eigene Kette
unkritisch, aber relevant, falls YSKAR spaeter in fremde Wallets soll.

**Wer die Woerter verliert, verliert das Guthaben endgueltig.** Es gibt
niemanden, der sie zuruecksetzen kann. Das gehoert prominent in die
Oberflaeche, nicht ins Kleingedruckte.

## Blockheader, 136 Byte, Little-Endian

```
  0  u32  version        104  u64  timestamp
  4  u32  height         112  u32  difficulty
  8  32B  prev_hash      116  u32  tx_count
 40  32B  merkle_root    120  u64  extranonce
 72  32B  state_root     128  u64  nonce
```

Die 136 Byte sind kein Zufall. Mit Padding ergeben sie genau drei
SHA-256-Bloecke, und alles ausser der Nonce liegt in den ersten 128 Byte --
also in den ersten beiden. Deren Kompression laesst sich als Midstate einmal
je Job berechnen; pro Nonce bleiben zwei Kompressionsschritte, genau wie beim
alten Format.

`state_root` ist neu und der eigentliche Schritt weg von der Datenbank.

## Transaktionen

Kontomodell, nicht UTXO -- fuer eine Wallet auf dem Handy deutlich einfacher.
Wiederholungsschutz ueber eine fortlaufende Nonce je Absender.

```
Transfer:  version u16 | type u8=1 | from 20B | to 20B | amount u64
           | fee u64 | nonce u64 | valid_until u32 | memo_len u8 + memo
           | pubkey 32B | signature 64B                      = 173 Byte

Coinbase:  version u16 | type u8=0 | height u32 | to 20B | amount u64
           | extra_len u8 + extra
```

Der Sighash deckt zusaetzlich `chain_id` ab: Eine auf dem Testnet gueltige
Transaktion ist auf dem Mainnet wertlos. `txid = sha256d(Uebertragungsformat)`.

Coinbase-Betrag muss exakt `reward_at(height) + Summe der Gebuehren` sein.

## Merkle-Baeume

```
Blatt  = sha256d(0x00 || wert)
Knoten = sha256d(0x01 || links || rechts)
ungerade Anzahl -> letzter Knoten wird UNVERAENDERT hochgereicht
```

Die Bereichstrennung verhindert, dass ein innerer Knoten als Blatt ausgegeben
werden kann. Das Hochreichen statt Verdoppeln vermeidet CVE-2012-2459, wo bei
Bitcoin zwei verschiedene Transaktionslisten denselben Root ergeben koennen.

`state_root` nutzt denselben Baum ueber die nach Adresse sortierten Konten:
`address(20) || balance(u64) || nonce(u64)`. Sortiert wird nach Rohbytes --
eine lokalisierte Textsortierung waere ein Konsensfehler. Leere Konten werden
nicht gespeichert, sonst haenge der Root davon ab, wer irgendwann einmal eine
Zeile hatte.

## Konsens

**Alles ganzzahlig.** In der alten Fassung rechnete die Difficulty mit
`Number` und `Math.round`. Mit einem Server war das folgenlos; sobald zwei
Knoten sich einig sein muessen, ist Fliesskomma ein Konsensfehler mit Ansage.

- Difficulty: LWMA ueber 45 Bloecke, Loesungszeiten auf das Sechsfache der
  Zielzeit gekappt, Aenderung je Schritt auf Faktor 4 begrenzt, Untergrenze
  4.096
- Notfallregel: ab dem Dreifachen der Zielzeit ohne Block lockert das Target
- Zeitstempel: echt groesser als der Median der letzten 11 Bloecke, hoechstens
  120 Sekunden in der Zukunft
- Reward: `INITIAL_REWARD >> (height / 12000)`, reine Bitverschiebung

## Mining-Engine

`wasm/gen_wat.py` erzeugt die Engine fuer den 136-Byte-Header. Der Midstate
deckt die ersten beiden SHA-256-Bloecke ab (Byte 0..128), pro Nonce bleiben
zwei Kompressionsschritte -- genauso viele wie beim alten 116-Byte-Format.

Die extranonce liegt in Byte 120..128 und damit im konstanten Teil: Sie
trennt die Suchraeume der Miner, aendert den Midstate aber nur beim
Sessionstart.

Geprueft in `tests/core.test.ts`:
- Engine und `serializeHeader()` liefern denselben Hash, ueber sieben Nonces
  inklusive Werten oberhalb von 2^32
- der Midstate haengt nicht von der Nonce ab, wohl aber von der extranonce
- die Engine findet selbstaendig einen gueltigen Block, der Server rechnet
  ihn nach
- die Serialisierung im Worker stimmt Byte fuer Byte mit der des Servers

## Betrieb

Zwei Einstellungen, die der Build nicht prueft und die trotzdem alles lahmlegen:

1. **Supabase -> Integrations -> Data API -> Exposed schemas** muss `chain2`
   enthalten. Sonst gibt PostgREST das Schema gar nicht heraus.
2. **Die Service-Rolle braucht Rechte auf `chain2`** (Migration 00010). Sie
   umgeht RLS, aber nicht die Schema- und Tabellenrechte.

Fehlt eines von beiden, antworten die Routen mit lauter Nullen statt mit
einem Fehler -- das sah beim ersten Aufruf exakt aus wie eine leere
Datenbank. `loadTip()` und `loadState()` werfen deshalb jetzt eine Ausnahme,
statt einen Lesefehler als "Kette ist leer" durchgehen zu lassen. Der
Unterschied ist folgenreich: Bei einer leeren Kette wuerde der Knoten einen
zweiten Genesis bauen.

## Was Phase 1 noch nicht hat

- P2P, Forks, Reorgs (Phase 2). `chain2.rollback_to` ist vorbereitet.
- Mempool-Auswahl, Blockbau und die API-Routen.
- Wallet-Oberflaeche: Merkwoerter anzeigen, bestaetigen lassen,
  Wiederherstellung.
- Der state_root wird je Block ueber alle Konten neu berechnet, also O(n).
  Bis in den Bereich einiger zehntausend Konten unkritisch, darueber braucht
  es einen Trie.
