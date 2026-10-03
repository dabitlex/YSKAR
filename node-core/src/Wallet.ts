/*
 * Wallet des Node Core.
 *
 * Dieselbe Wallet wie in der App: 12 Woerter (BIP39), derselbe Ableitungs-
 * pfad, dieselbe Adresse. Wer hier und in der App dieselben Woerter nutzt,
 * sieht dasselbe Guthaben -- es liegt in der Kette, nicht im Programm.
 *
 * WO DER SCHLUESSEL IST
 *
 * Die 12 Woerter liegen verschluesselt in wallet.json:
 *
 *   Passwort -> PBKDF2-SHA256, 400.000 Runden, 16 Byte Salz -> AES-256-GCM
 *
 * (dieselbe Verwahrung wie in der App, src/lib/wallet/vault.ts). Im
 * Arbeitsspeicher steht der Schluessel nur fuer die Dauer EINES Vorgangs:
 * entschluesseln, unterschreiben, vergessen. "Entsperrt" heisst deshalb
 * nicht, dass der Schluessel bereitliegt -- es heisst nur, dass die
 * Oberflaeche Guthaben, Verlauf und Kontakte zeigen darf. Senden und die
 * Woerter anzeigen verlangen das Passwort jedes Mal.
 *
 * WAS DAS PASSWORT LEISTET
 *
 * Es schuetzt die Datei gegen jemanden, der sie kopiert. Wie gut, haengt an
 * seiner Laenge: 400.000 Runden bremsen jeden Versuch, aber ein kurzes
 * Passwort bleibt erratbar. Der eigentliche Schutz des Guthabens sind die
 * aufgeschriebenen 12 Woerter.
 */
import { existsSync, readFileSync, writeFileSync, renameSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { seal, unseal, type Vault } from '../../src/lib/wallet/vault.ts';
import {
  createMnemonic, isValidMnemonic, normalizeMnemonic, keypairFromMnemonic, type Keypair,
} from '../../src/lib/core/wallet.ts';
import { isValidAddress } from '../../src/lib/core/address.ts';

/** Kuerzer ist kein Passwort, sondern eine PIN. */
export const PASSWORT_MIN = 8;
export const KONTAKT_NAME_MAX = 24;
export const KONTAKTE_MAX = 200;
/** Nach so vielen falschen Versuchen in Folge gibt es eine Pause. */
const VERSUCHE_BIS_PAUSE = 5;
const PAUSE_MS = 30_000;

export interface WalletStand {
  vorhanden: boolean;
  gesperrt: boolean;
  adresse: string | null;
  /** Sekunden bis zur automatischen Sperre; null = sperrt nie von selbst. */
  sperrtIn: number | null;
  angelegt: string | null;
}

export interface Kontakt { name: string; adresse: string }

/** Fehler, den die Oberflaeche in ihrer Sprache zeigen kann. */
export class WalletFehler extends Error {
  code: string;
  constructor(code: string, text: string) { super(text); this.code = code; }
}

function schreibe(pfad: string, inhalt: string): void {
  // Erst daneben schreiben, dann umbenennen: Ein Absturz mittendrin laesst
  // die alte Datei heil -- eine halbe wallet.json waere der Verlust der Wallet.
  const neben = pfad + '.neu';
  writeFileSync(neben, inhalt, { mode: 0o600 });
  renameSync(neben, pfad);
}

function liesJson<T>(pfad: string, vorgabe: T): T {
  if (!existsSync(pfad)) return vorgabe;
  try { return JSON.parse(readFileSync(pfad, 'utf8')) as T; } catch { return vorgabe; }
}

export class WalletDienst {
  private ordner: string;
  private pfad: string;
  private kontaktPfad: string;
  private tresor: Vault | null = null;
  /** Bis wann die Oberflaeche die Wallet zeigen darf. 0 = gesperrt. */
  private entsperrt = false;
  private letzteRegung = 0;
  private fehlversuche = 0;
  private pauseBis = 0;
  private kontakte_: Kontakt[] = [];
  /** Minuten ohne Regung bis zur Sperre; 0 = nie. */
  sperreMinuten = 10;
  private uhr: () => number;

  constructor(ordner: string, uhr: () => number = Date.now) {
    this.ordner = ordner;
    this.uhr = uhr;
    this.pfad = join(ordner, 'wallet.json');
    this.kontaktPfad = join(ordner, 'kontakte.json');
    this.lade();
  }

  private lade(): void {
    const v = liesJson<Partial<Vault> | null>(this.pfad, null);
    this.tresor = v && v.version === 1 && typeof v.ciphertext === 'string' && typeof v.salt === 'string'
      && typeof v.iv === 'string' && typeof v.address === 'string' && isValidAddress(v.address)
      ? v as Vault : null;
    const k = liesJson<unknown>(this.kontaktPfad, []);
    this.kontakte_ = Array.isArray(k)
      ? k.filter((x): x is Kontakt => !!x && typeof x.name === 'string' && typeof x.adresse === 'string' && isValidAddress(x.adresse))
          .slice(0, KONTAKTE_MAX)
      : [];
  }

  /** Gibt es eine Datei, die sich nicht lesen laesst? Dann nichts ueberschreiben. */
  dateiBeschaedigt(): boolean {
    return existsSync(this.pfad) && this.tresor === null;
  }

  // ------------------------------------------------------------------ Stand

  private pruefeSperre(): void {
    if (!this.entsperrt || this.sperreMinuten <= 0) return;
    if (this.uhr() - this.letzteRegung > this.sperreMinuten * 60_000) this.entsperrt = false;
  }

  stand(): WalletStand {
    this.pruefeSperre();
    const offen = this.tresor !== null && this.entsperrt;
    return {
      vorhanden: this.tresor !== null,
      gesperrt: this.tresor !== null && !this.entsperrt,
      adresse: this.tresor?.address ?? null,
      sperrtIn: offen && this.sperreMinuten > 0
        ? Math.max(0, Math.ceil((this.letzteRegung + this.sperreMinuten * 60_000 - this.uhr()) / 1000))
        : null,
      angelegt: this.tresor?.createdAt ?? null,
    };
  }

  adresse(): string | null { return this.tresor?.address ?? null; }

  /** Der Nutzer tut etwas -- die Frist bis zur Sperre beginnt neu. */
  regung(): void {
    this.pruefeSperre();
    if (this.entsperrt) this.letzteRegung = this.uhr();
  }

  /** Wirft, wenn die Oberflaeche die Wallet gerade nicht zeigen darf. */
  verlangeOffen(): string {
    this.pruefeSperre();
    if (!this.tresor) throw new WalletFehler('keine_wallet', 'Es ist noch keine Wallet eingerichtet.');
    if (!this.entsperrt) throw new WalletFehler('gesperrt', 'Die Wallet ist gesperrt.');
    return this.tresor.address;
  }

  sperren(): void { this.entsperrt = false; }

  // ---------------------------------------------------------------- Passwort

  private pruefePasswort(passwort: unknown): string {
    if (typeof passwort !== 'string' || passwort.length < PASSWORT_MIN) {
      throw new WalletFehler('passwort_kurz', `Das Passwort braucht mindestens ${PASSWORT_MIN} Zeichen.`);
    }
    if (passwort.length > 256) throw new WalletFehler('passwort_lang', 'Das Passwort ist zu lang.');
    return passwort;
  }

  /**
   * Die 12 Woerter entschluesseln. Der einzige Weg zum Schluessel.
   *
   * Falsche Versuche werden gezaehlt: Nach fuenf in Folge gibt es eine
   * Pause. Das haelt niemanden auf, der die Datei hat -- aber jemanden, der
   * am offenen Programm sitzt und raet.
   */
  private async oeffne(passwort: unknown): Promise<string> {
    if (!this.tresor) throw new WalletFehler('keine_wallet', 'Es ist noch keine Wallet eingerichtet.');
    const jetzt = this.uhr();
    if (jetzt < this.pauseBis) {
      throw new WalletFehler('pause', `Zu viele falsche Versuche. Bitte ${Math.ceil((this.pauseBis - jetzt) / 1000)} Sekunden warten.`);
    }
    if (typeof passwort !== 'string' || passwort.length === 0 || passwort.length > 256) {
      throw new WalletFehler('passwort_falsch', 'Das Passwort stimmt nicht.');
    }
    const r = await unseal(this.tresor, passwort);
    if (!r.ok) {
      this.fehlversuche++;
      if (this.fehlversuche >= VERSUCHE_BIS_PAUSE) { this.pauseBis = this.uhr() + PAUSE_MS; this.fehlversuche = 0; }
      throw new WalletFehler('passwort_falsch', 'Das Passwort stimmt nicht.');
    }
    this.fehlversuche = 0;
    return r.mnemonic;
  }

  // ------------------------------------------------------- Anlegen, Entfernen

  /** Zwoelf frische Woerter. Noch nichts gespeichert -- erst anlegen() tut das. */
  neueWoerter(): string {
    return createMnemonic(12);
  }

  /**
   * Eine Wallet aus 12 Woertern anlegen -- neu erzeugten oder mitgebrachten.
   * Danach ist sie entsperrt.
   */
  async anlegen(woerter: unknown, passwort: unknown): Promise<WalletStand> {
    if (this.tresor) throw new WalletFehler('wallet_vorhanden', 'Auf diesem PC gibt es schon eine Wallet. Entferne sie zuerst.');
    if (this.dateiBeschaedigt()) {
      throw new WalletFehler('datei_beschaedigt', 'wallet.json ist vorhanden, aber nicht lesbar. Sichere die Datei, bevor du eine neue Wallet anlegst.');
    }
    const pw = this.pruefePasswort(passwort);
    if (typeof woerter !== 'string') throw new WalletFehler('woerter_falsch', 'Die 12 Wörter fehlen.');
    const sauber = normalizeMnemonic(woerter);
    if (!isValidMnemonic(sauber) || sauber.split(' ').length !== 12) {
      throw new WalletFehler('woerter_falsch', 'Das sind keine gültigen 12 Wörter. Prüfe Schreibweise und Reihenfolge.');
    }
    const paar = keypairFromMnemonic(sauber);
    const tresor = await seal(sauber, pw, paar.address);
    mkdirSync(this.ordner, { recursive: true });
    schreibe(this.pfad, JSON.stringify(tresor, null, 2));
    this.tresor = tresor;
    this.entsperrt = true;
    this.letzteRegung = this.uhr();
    return this.stand();
  }

  async entsperren(passwort: unknown): Promise<WalletStand> {
    await this.oeffne(passwort);
    this.entsperrt = true;
    this.letzteRegung = this.uhr();
    return this.stand();
  }

  /** Die 12 Woerter zeigen -- nur mit Passwort. */
  async woerter(passwort: unknown): Promise<string> {
    this.verlangeOffen();
    const w = await this.oeffne(passwort);
    this.regung();
    return w;
  }

  async passwortAendern(alt: unknown, neu: unknown): Promise<void> {
    this.verlangeOffen();
    const pw = this.pruefePasswort(neu);
    const woerter = await this.oeffne(alt);
    const tresor = await seal(woerter, pw, this.tresor!.address);
    tresor.createdAt = this.tresor!.createdAt;
    schreibe(this.pfad, JSON.stringify(tresor, null, 2));
    this.tresor = tresor;
    this.regung();
  }

  /**
   * Die Wallet von diesem PC entfernen. Das Guthaben bleibt in der Kette;
   * ohne die 12 Woerter ist es danach nicht mehr erreichbar.
   */
  async entfernen(passwort: unknown): Promise<void> {
    await this.oeffne(passwort);
    rmSync(this.pfad, { force: true });
    this.tresor = null;
    this.entsperrt = false;
  }

  /**
   * Passwort vergessen: mit den 12 Woertern ein neues setzen.
   *
   * Nur mit den Woertern DIESER Wallet. Andere Woerter wuerden die Datei
   * durch eine fremde Wallet ersetzen -- und wer die eigenen nicht notiert
   * hat, verloere damit den Zugang endgueltig.
   */
  async neuesPasswortMitWoertern(woerter: unknown, passwort: unknown): Promise<WalletStand> {
    if (!this.tresor) throw new WalletFehler('keine_wallet', 'Es ist noch keine Wallet eingerichtet.');
    const pw = this.pruefePasswort(passwort);
    const sauber = typeof woerter === 'string' ? normalizeMnemonic(woerter) : '';
    if (!isValidMnemonic(sauber) || sauber.split(' ').length !== 12) {
      throw new WalletFehler('woerter_falsch', 'Das sind keine gültigen 12 Wörter. Prüfe Schreibweise und Reihenfolge.');
    }
    if (keypairFromMnemonic(sauber).address !== this.tresor.address) {
      throw new WalletFehler('woerter_fremd', 'Diese 12 Wörter gehören zu einer anderen Wallet als der auf diesem PC.');
    }
    const tresor = await seal(sauber, pw, this.tresor.address);
    tresor.createdAt = this.tresor.createdAt;
    schreibe(this.pfad, JSON.stringify(tresor, null, 2));
    this.tresor = tresor;
    this.fehlversuche = 0; this.pauseBis = 0;
    this.entsperrt = true;
    this.letzteRegung = this.uhr();
    return this.stand();
  }

  /** Wo die Wallet-Datei liegt -- fuer die Anzeige. */
  datei(): string { return this.pfad; }

  /**
   * Den Schluessel fuer EINEN Vorgang herausgeben. Der Aufrufer
   * unterschreibt damit und laesst ihn fallen.
   */
  async schluessel(passwort: unknown): Promise<Keypair> {
    this.verlangeOffen();
    const paar = keypairFromMnemonic(await this.oeffne(passwort));
    if (paar.address !== this.tresor!.address) {
      // Kann nur bei einer von Hand veraenderten Datei passieren.
      throw new WalletFehler('datei_beschaedigt', 'Die Wallet-Datei passt nicht zu ihrer Adresse.');
    }
    this.regung();
    return paar;
  }

  // ---------------------------------------------------------------- Kontakte

  kontakte(): Kontakt[] {
    return [...this.kontakte_].sort((a, b) => a.name.localeCompare(b.name));
  }

  kontaktName(adresse: string): string | null {
    return this.kontakte_.find(k => k.adresse === adresse)?.name ?? null;
  }

  setzeKontakt(name: unknown, adresse: unknown): Kontakt[] {
    this.verlangeOffen();
    const n = String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    const a = String(adresse ?? '').trim().toLowerCase();
    if (!n) throw new WalletFehler('kontakt_name', 'Der Kontakt braucht einen Namen.');
    if ([...n].length > KONTAKT_NAME_MAX) throw new WalletFehler('kontakt_name', `Der Name darf höchstens ${KONTAKT_NAME_MAX} Zeichen haben.`);
    if (!isValidAddress(a)) throw new WalletFehler('adresse_falsch', 'Das ist keine gültige YSKAR-Adresse.');
    const da = this.kontakte_.find(k => k.adresse === a);
    if (da) da.name = n;
    else {
      if (this.kontakte_.length >= KONTAKTE_MAX) throw new WalletFehler('kontakte_voll', 'Mehr Kontakte passen nicht hinein.');
      this.kontakte_.push({ name: n, adresse: a });
    }
    schreibe(this.kontaktPfad, JSON.stringify(this.kontakte_, null, 2));
    this.regung();
    return this.kontakte();
  }

  entferneKontakt(adresse: unknown): Kontakt[] {
    this.verlangeOffen();
    const a = String(adresse ?? '').trim().toLowerCase();
    this.kontakte_ = this.kontakte_.filter(k => k.adresse !== a);
    schreibe(this.kontaktPfad, JSON.stringify(this.kontakte_, null, 2));
    this.regung();
    return this.kontakte();
  }
}
