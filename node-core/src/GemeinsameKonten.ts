/*
 * Gemeinsame Konten (Mehrfachsignatur, CONSENSUS_V6.md 7 und 13) -- was
 * Node Core dazu auf dem PC festhaelt.
 *
 * Gespeichert wird nur Oeffentliches: Name, k, die oeffentlichen
 * Schluessel und die daraus gerechnete Adresse. Der eigene private
 * Schluessel bleibt in der Wallet-Datei; zum Unterschreiben wird er wie
 * beim Senden mit dem Passwort geholt und gleich wieder verworfen.
 *
 * Die Rechnung selbst (Skript, Adresse, Mitzeichnungsdatei) steht in
 * src/lib/wallet/mehrfach.ts -- dieselbe wie in Mini App und CLI.
 */
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { mehrfachKonto, type MehrfachKonto } from '../../src/lib/wallet/mehrfach.ts';
import { toHex, fromHex } from '../../src/lib/core/codec.ts';
import { MAX_SCRIPT_KEYS } from '../../src/lib/core/params.ts';
import { WalletFehler } from './Wallet.ts';

export const KONTO_NAME_MAX = 24;
export const KONTEN_MAX = 50;

export interface GemeinsamesKonto {
  name: string;
  k: number;
  /** Oeffentliche Schluessel, Hex, aufsteigend sortiert (wie im Skript). */
  schluessel: string[];
  adresse: string;
}

interface Datei {
  /** Der eigene oeffentliche Schluessel, sobald er einmal mit dem Passwort geholt wurde. */
  eigenerSchluessel: string | null;
  konten: GemeinsamesKonto[];
}

function schreibe(pfad: string, inhalt: string): void {
  const neben = pfad + '.neu';
  writeFileSync(neben, inhalt, { mode: 0o600 });
  renameSync(neben, pfad);
}

const HEX32 = /^[0-9a-f]{64}$/;

export class GemeinsameKonten {
  private pfad: string;
  private hrp: string | undefined;
  private d: Datei = { eigenerSchluessel: null, konten: [] };

  constructor(ordner: string, hrp?: string) {
    this.hrp = hrp;
    this.pfad = join(ordner, 'gemeinsam.json');
    this.lade();
  }

  private lade(): void {
    if (!existsSync(this.pfad)) return;
    let roh: unknown;
    try { roh = JSON.parse(readFileSync(this.pfad, 'utf8')); } catch { return; }
    if (!roh || typeof roh !== 'object') return;
    const r = roh as Record<string, unknown>;
    const eigen = typeof r.eigenerSchluessel === 'string' && HEX32.test(r.eigenerSchluessel) ? r.eigenerSchluessel : null;
    const konten: GemeinsamesKonto[] = [];
    for (const x of Array.isArray(r.konten) ? r.konten : []) {
      // Jedes Konto wird aus seinen Schluesseln neu gerechnet -- eine von Hand
      // geaenderte Adresse in der Datei zaehlt nicht.
      try {
        const k = this.rechne(x?.name, x?.k, x?.schluessel);
        if (!konten.some(y => y.adresse === k.adresse)) konten.push(k);
      } catch { /* ungueltigen Eintrag auslassen */ }
      if (konten.length >= KONTEN_MAX) break;
    }
    this.d = { eigenerSchluessel: eigen, konten };
  }

  private sichere(): void { schreibe(this.pfad, JSON.stringify(this.d, null, 2)); }

  /** Name, k und Schluessel pruefen und das Konto rechnen. */
  private rechne(name: unknown, k: unknown, schluessel: unknown): GemeinsamesKonto {
    const n = String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    if (!n) throw new WalletFehler('gemeinsam_name', 'Gib dem Konto einen Namen.');
    if ([...n].length > KONTO_NAME_MAX) throw new WalletFehler('gemeinsam_name_lang', `Höchstens ${KONTO_NAME_MAX} Zeichen.`, [KONTO_NAME_MAX]);
    if (!Array.isArray(schluessel)) throw new WalletFehler('gemeinsam_schluessel', 'Die Schlüssel fehlen.');
    const liste = schluessel.map(s => String(s ?? '').trim().toLowerCase()).filter(s => s !== '');
    if (liste.length < 2 || liste.length > MAX_SCRIPT_KEYS) {
      throw new WalletFehler('gemeinsam_anzahl', `Ein gemeinsames Konto hat 2 bis ${MAX_SCRIPT_KEYS} Schlüssel.`, [MAX_SCRIPT_KEYS]);
    }
    for (const s of liste) if (!HEX32.test(s)) throw new WalletFehler('gemeinsam_schluessel_falsch', 'Ein Schlüssel ist ungültig: 64 Zeichen 0–9 und a–f.');
    const kz = Number(k);
    if (!Number.isInteger(kz) || kz < 1 || kz > liste.length) {
      throw new WalletFehler('gemeinsam_k', `Nötige Unterschriften: 1 bis ${liste.length}.`, [liste.length]);
    }
    let konto: MehrfachKonto;
    try { konto = mehrfachKonto(kz, liste.map(fromHex), this.hrp); }
    catch (e) {
      if (/doppelt/.test((e as Error).message)) throw new WalletFehler('gemeinsam_doppelt', 'Ein Schlüssel steht doppelt in der Liste.');
      throw new WalletFehler('gemeinsam_ungueltig', 'Aus diesen Schlüsseln lässt sich kein Konto bilden.');
    }
    return { name: n, k: konto.k, schluessel: konto.schluessel.map(toHex), adresse: konto.adresse };
  }

  eigenerSchluessel(): string | null { return this.d.eigenerSchluessel; }

  setzeEigenen(hex: string): void {
    if (!HEX32.test(hex)) return;
    if (this.d.eigenerSchluessel === hex) return;
    this.d.eigenerSchluessel = hex;
    this.sichere();
  }

  konten(): GemeinsamesKonto[] { return this.d.konten.map(k => ({ ...k, schluessel: [...k.schluessel] })); }

  finde(adresse: unknown): GemeinsamesKonto {
    const a = String(adresse ?? '').trim().toLowerCase();
    const k = this.d.konten.find(x => x.adresse === a);
    if (!k) throw new WalletFehler('gemeinsam_unbekannt', 'Dieses gemeinsame Konto ist auf diesem PC nicht eingetragen.');
    return k;
  }

  /**
   * Konto anlegen oder beitreten -- beides ist dasselbe: Wer dieselben
   * Schluessel und dasselbe k eintraegt, bekommt dieselbe Adresse. Der
   * eigene Schluessel muss dabei sein, sonst kann man nicht mitzeichnen.
   */
  anlegen(name: unknown, k: unknown, schluessel: unknown): GemeinsamesKonto {
    const eigen = this.d.eigenerSchluessel;
    if (!eigen) throw new WalletFehler('gemeinsam_eigener_fehlt', 'Zeig zuerst deinen eigenen Schlüssel an (mit dem Passwort).');
    const konto = this.rechne(name, k, schluessel);
    if (!konto.schluessel.includes(eigen)) {
      throw new WalletFehler('gemeinsam_ohne_dich', 'Dein eigener Schlüssel fehlt in der Liste. Ohne ihn kannst du nicht mitzeichnen.');
    }
    const da = this.d.konten.findIndex(x => x.adresse === konto.adresse);
    if (da >= 0) this.d.konten[da] = konto;
    else {
      if (this.d.konten.length >= KONTEN_MAX) throw new WalletFehler('gemeinsam_voll', 'Mehr gemeinsame Konten passen nicht hinein.');
      this.d.konten.push(konto);
    }
    this.sichere();
    return konto;
  }

  entfernen(adresse: unknown): void {
    const k = this.finde(adresse);
    this.d.konten = this.d.konten.filter(x => x.adresse !== k.adresse);
    this.sichere();
  }
}
