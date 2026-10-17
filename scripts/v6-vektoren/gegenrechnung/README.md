# Gegenrechnung der V6-Testvektoren

Eine zweite Umsetzung des Transaktionsformats der Konsensfassung 6 in Python. Sie entstand am 17.10.2026 **allein aus der Spezifikation** (`docs/CONSENSUS_V6.md`, `docs/PROTOCOL.md`), ohne Zugriff auf den YSKAR-Code. Sie ist eine Gegenprobe des Projekts selbst und ersetzt kein Review durch andere.

```bash
pip install cryptography          # nur fuer Ed25519 (RFC 8032)
python3 scripts/v6-vektoren/gegenrechnung/rechnen.py
```

Liest die Eingaben aus `tests/fixtures/v6-vektoren.json`, rechnet alles selbst (Schlüssel, Adressen mit selbst geschriebenem bech32m nach BIP 350, Skripte, Leitung, Sighash, Signaturen, Witness, txid, Zustandswurzel) und vergleicht erst danach mit den erwarteten Werten. Ergebnis beim ersten Lauf: 46 von 46 gleich.

Dieselbe Gegenrechnung fand zehn unklare Stellen in der Spezifikation; sie sind in Abschnitt 14 aufgezählt und korrigiert.

`selbstpruefung.py` prüft die Umsetzung gegen die älteren Vektoren aus Abschnitt 14. Die Schlüssel dort stammen aus der Wallet-Ableitung (`slip10.py`, SLIP-0010 `m/44'/9077'/0'/0'/0'`).
