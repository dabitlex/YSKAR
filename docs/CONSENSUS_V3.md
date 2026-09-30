# Konsensfassung 3 — Gebühr je Byte und Staubgrenze

Beschlossen bei Höhe 2.880 am 30.09.2026. Aktiv ab **Höhe 4.000**.

## Was sich ändert

| | bis Höhe 3.999 | ab Höhe 4.000 |
|---|---|---|
| Mindestgebühr (Konsens) | `MIN_FEE` = 0,001 YSR fest | `bytes × MIN_FEE_RATE` = 1 Einheit je Byte (Überweisung ohne Notiz: 168 Einheiten = 0,00000168 YSR) |
| Kleinstbetrag (Konsens) | ab 1 Einheit | ab `DUST_LIMIT` = 100 Einheiten (0,000001 YSR) |
| Weiterleitung (Policy, kein Konsens) | `MIN_FEE` | `RELAY_FEE_RATE` = 10 Einheiten je Byte; Ersetzung einer wartenden Zahlung nur um mindestens diesen Satz mehr |

Das Feld `fee` in der Transaktion bleibt unverändert; der Satz ist nur die
Rechnung `fee / bytes`. Alte Blöcke bleiben byteweise gültig — unter der
Aktivierungshöhe gilt die alte Regel weiter. Konstanten in
`src/lib/core/params.ts` (`FEE_V3_HEIGHT`, `MIN_FEE_RATE`, `DUST_LIMIT`,
`RELAY_FEE_RATE`), Prüfung in `checkTransfer()` (`src/lib/core/tx.ts`).

Der Gebührenmarkt (`feemarket.ts`) rechnet weiterhin je **Platz** — knapp
sind Plätze (2.000 je Block), nicht Bytes. Die Weiterleitungsgebühr des
Knotens ist der Boden, unter den keine Stufe fällt. `/api/v2/fees` liefert
dafür `mindestJeByte`; die App rechnet ihre eigene Größe (Notiz) selbst nach.

## Signatur trägt den Chain-ID des Netzes

Bis hierher signierte `signingBytes()` immer mit dem Mainnet-Chain-ID, auch im
Regtest. Jetzt nimmt es den Chain-ID der Netzparameter: Eine im Regtest
gültige Signatur ist im Mainnet ungültig und umgekehrt. Für das Mainnet ändert
sich nichts — dort war der Wert schon immer der richtige.

## Wer aktualisieren muss — vor Höhe 4.000

- **Full Node** (Raspberry): baut und prüft Blöcke. Ohne Update lehnt er ab
  Höhe 4.000 jeden Block mit einer Gebühr unter 0,001 YSR ab und bleibt stehen.
- **Vercel-Server**: prüft Blöcke und nimmt Zahlungen an — geht mit dem Push
  automatisch live und wendet die Regel ab 4.000 an.
- **Eigenständiger Miner**: nicht betroffen, er rechnet nur Hashes.
- **App**: nicht betroffen, sie liest die Untergrenze vom Knoten.

Update des Full Node:

```
cd ~/YSKAR && git pull
cd node && npm ci && npm run build
sudo systemctl restart yskar
sudo systemctl status yskar --no-pager
```

Vor Höhe 4.000 verhält sich der aktualisierte Knoten exakt wie der alte.
