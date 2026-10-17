# ZIP-215-Modul (Ed25519-Prüfung für Knoten)

WebAssembly-Hülle um [`ed25519-zebra`](https://github.com/ZcashFoundation/ed25519-zebra) 5.0.0 der Zcash Foundation. Knoten prüfen damit Signaturen nach [ZIP 215](https://zips.z.cash/zip-0215), der Regel, die YSKAR seit Genesis anwendet (bisher über `@noble/curves`). Einzeln etwa zehnmal, im Stapel etwa dreißigmal schneller, bei gleichem Ergebnis. Hintergrund und Messwerte: [docs/CONSENSUS_V6.md](../../docs/CONSENSUS_V6.md), Abschnitte 7.7 und 7.8.

## Bauen

Voraussetzung ist [rustup](https://rustup.rs). Compiler-Fassung und Ziel kommen aus `rust-toolchain.toml`, die Abhängigkeiten aus `Cargo.lock`.

```bash
node crypto/zip215/build.mjs            # bauen und src/lib/node/zip215Wasm.ts schreiben
node crypto/zip215/build.mjs --pruefen  # nachbauen und mit der eingebetteten Datei vergleichen
```

Das Ergebnis steht eingebettet im Repository, damit niemand Rust braucht, um einen Knoten zu bauen. `--pruefen` zeigt, dass die eingebettete Datei aus dieser Quelle stammt: Pfade werden beim Bauen entfernt, ein Nachbau an anderer Stelle ergibt dieselben Bytes (SHA-256 `12b6e5044fd48dcd0fc4191960bc2e0a8cbc093435978cc5067d0b50fa769bd3`).

## Schnittstelle

Kein Bindungs-Generator, nur feste Puffer im Speicher des Moduls:

| Export | Zweck |
|---|---|
| `puffer()` | Signatur (64) · Schlüssel (32) · Nachricht (bis 4096) |
| `verify(laenge)` | 1 gültig, 0 ungültig |
| `stapel()`, `saat()`, `max_stapel()` | Einträge zu je 128 Byte (Signatur · Schlüssel · 32-Byte-Nachricht), 32 Byte Zufall, Höchstzahl 8.192 |
| `verify_batch(n)` | 1 alle gültig, 0 mindestens eine ungültig |

Der Lader (`src/lib/node/zip215.ts`) prüft die Prüfsumme, führt eine Selbstprobe aus und fällt bei jedem Fehler auf `@noble/curves` zurück.

## Aktualisieren

Ein Update von `ed25519-zebra`, des Compilers oder von `@noble/curves` ist eine Konsensentscheidung. `tests/zip215.test.ts` muss unverändert grün sein. Der Test hält auch den SHA-256 fest, damit ein neues Modul nie unbemerkt hineinkommt.
