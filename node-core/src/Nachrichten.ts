/*
 * Nachrichten signieren und pruefen -- und Anmelden per Link (yskar:login?...).
 *
 * Das Format und seine Regeln stehen in src/lib/core/signedMessage.ts und
 * gelten genauso fuer YSKAR Wallet, Full Node und YSKAR Lab. Hier kommt nur
 * dazu, was Node Core selbst braucht: den Schluessel aus der Wallet fuer
 * EINEN Vorgang holen, und einen Link, den das Betriebssystem an das Programm
 * gegeben hat, bis zur Entscheidung des Nutzers aufheben.
 *
 * Diese Datei kennt den Sendepfad nicht. Unterschrieben wird ausschliesslich
 * eine Nachricht mit der Kopfzeile "YSKAR Signed Message" -- nie Bytes, die
 * als Transaktion gelten koennten.
 */
import {
  vorbereiten, unterschreibe, pruefe, liesErgebnis, liesLink, lies, sendeAnRuf, NachrichtFehler,
  type Anmeldung, type Signiert,
} from '../../src/lib/core/signedMessage.ts';
import { WalletDienst, WalletFehler } from './Wallet.ts';

/*
 * Kuerzel fuer die Oberflaeche. Jedes hat einen Text in ui/js/de.js und en.js
 * unter "srv.<kuerzel>" (test/ui.test.ts prueft das).
 */
const KUERZEL: Record<string, string> = {
  leer: 'nachricht_leer',
  zu_lang: 'nachricht_zu_lang',
  zeilenende: 'nachricht_format',
  kopf: 'nachricht_format',
  format: 'nachricht_format',
  zweck: 'nachricht_zweck',
  domain: 'nachricht_domain',
  adresse: 'nachricht_adresse',
  abgelaufen: 'nachricht_abgelaufen',
  zu_lange: 'nachricht_zu_lange',
  zeit: 'nachricht_zeit',
  link: 'nachricht_link',
  ruf: 'nachricht_ruf',
};

function alsWalletFehler(e: unknown): never {
  if (e instanceof NachrichtFehler) {
    const code = KUERZEL[e.code] ?? 'nachricht_format';
    throw new WalletFehler(code, e.message, code === 'nachricht_domain' ? [domainAus(e.message)] : []);
  }
  throw e;
}

/** Die Domain aus dem Fehlertext, fuer den Platzhalter in der Oberflaeche. */
function domainAus(text: string): string {
  return /"([^"]+)"/.exec(text)?.[1] ?? '';
}

export interface Vorschau {
  nachricht: string;
  art: 'login' | 'text';
  anmeldung: Anmeldung | null;
  text: string | null;
}

/** Ein Link, den das Betriebssystem uebergeben hat. Lebt nur im Arbeitsspeicher. */
type Wartend =
  | { nr: number; nachricht: string; ruf: string; anmeldung: Anmeldung }
  | { nr: number; fehler: string; code: string; werte: string[] };

export class Nachrichten {
  private wartend: Wartend | null = null;
  private zaehler = 0;

  private wallet: WalletDienst;
  private uhr: () => number;
  private holen: typeof fetch;

  constructor(wallet: WalletDienst, uhr: () => number = Date.now, holen: typeof fetch = fetch) {
    this.wallet = wallet; this.uhr = uhr; this.holen = holen;
  }

  private eigene(): string {
    const a = this.wallet.adresse();
    if (!a) throw new WalletFehler('keine_wallet', 'Es ist noch keine Wallet eingerichtet.');
    return a;
  }

  /** Was signiert wuerde -- ohne Passwort, ohne Schluessel. */
  vorschau(eingabe: unknown): Vorschau {
    this.wallet.verlangeOffen();
    try {
      const { nachricht, inhalt } = vorbereiten(String(eingabe ?? ''), this.eigene(), new Date(this.uhr()));
      return {
        nachricht,
        art: inhalt.art,
        anmeldung: inhalt.art === 'login' ? inhalt.anmeldung : null,
        text: inhalt.art === 'text' ? inhalt.text : null,
      };
    } catch (e) { alsWalletFehler(e); }
  }

  /** Unterschreibt. Das Passwort wird jedes Mal verlangt, wie beim Senden. */
  async signieren(eingabe: unknown, passwort: unknown): Promise<Signiert> {
    const v = this.vorschau(eingabe);
    const paar = await this.wallet.schluessel(passwort);
    try { return unterschreibe(v.nachricht, paar); }
    catch (e) { alsWalletFehler(e); }
    finally { paar.privateKey.fill(0); }
  }

  /** Prueft ein Ergebnis -- als JSON in einem Feld oder als einzelne Felder. */
  pruefen(body: Record<string, unknown>) {
    const s = typeof body.ergebnis === 'string' && body.ergebnis.trim()
      ? liesErgebnis(body.ergebnis)
      : { address: str(body.address), publicKey: str(body.publicKey), signature: str(body.signature), message: str(body.message, false) };
    if (!s) throw new WalletFehler('nachricht_ergebnis', 'Das ist kein Ergebnis einer Wallet (JSON mit address, publicKey, signature, message).');
    const p = pruefe(s);
    if (!p.gueltig) return { gueltig: false, grund: p.grund, text: p.text };
    return {
      gueltig: true, address: p.address,
      art: p.inhalt.art,
      anmeldung: p.inhalt.art === 'login' ? p.inhalt.anmeldung : null,
      text: p.inhalt.art === 'text' ? p.inhalt.text : null,
    };
  }

  // ------------------------------------------------------------ Anmelden per Link

  /** Vom Betriebssystem: yskar:login?msg=…&cb=… Ein neuer Link ersetzt einen alten. */
  oeffneLink(link: string): void {
    const nr = ++this.zaehler;
    try {
      const l = liesLink(link);
      const inhalt = lies(l.nachricht);
      if (inhalt.art !== 'login') throw new NachrichtFehler('link', 'A sign-in link must contain a login message.');
      this.wartend = { nr, nachricht: l.nachricht, ruf: l.ruf, anmeldung: inhalt.anmeldung };
    } catch (e) {
      const f = e instanceof NachrichtFehler ? e : new NachrichtFehler('link', 'This is not a YSKAR sign-in link.');
      const code = KUERZEL[f.code] ?? 'nachricht_link';
      this.wartend = { nr, fehler: f.message, code, werte: code === 'nachricht_domain' ? [domainAus(f.message)] : [] };
    }
  }

  /** Fuer /api/status: Gibt es einen Link, auf den die Oberflaeche reagieren soll? */
  linkStand(): { nr: number } | null {
    return this.wartend ? { nr: this.wartend.nr } : null;
  }

  link() {
    const w = this.wartend;
    if (!w) return null;
    if ('fehler' in w) return { nr: w.nr, fehler: w.fehler, code: w.code, werte: w.werte };
    const eigene = this.wallet.adresse();
    return {
      nr: w.nr, nachricht: w.nachricht, anmeldung: w.anmeldung,
      eigeneAdresse: eigene, passt: eigene === w.anmeldung.address,
      walletGesperrt: this.wallet.stand().gesperrt,
    };
  }

  verwerfen(): void { this.wartend = null; }

  /**
   * Unterschreibt die wartende Anmeldung und schickt sie an die Website.
   * Ist die Wallet gesperrt, entsperrt dasselbe Passwort sie zuerst.
   */
  async anmelden(passwort: unknown): Promise<{ ok: boolean; text: string; domain: string }> {
    const w = this.wartend;
    if (!w || 'fehler' in w) throw new WalletFehler('nachricht_kein_link', 'Es wartet keine Anmeldung.');
    if (this.wallet.stand().gesperrt) await this.wallet.entsperren(passwort);
    const signiert = await this.signieren(w.nachricht, passwort);
    const r = await sendeAnRuf(w.ruf, signiert, this.holen);
    if (r.ok) this.wartend = null;
    return { ...r, domain: w.anmeldung.domain };
  }
}

function str(v: unknown, trim = true): string | undefined {
  return typeof v === 'string' ? (trim ? v.trim() : v) : undefined;
}
