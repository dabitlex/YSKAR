/**
 * Mehrfach-Signatur fuer Wallets (CONSENSUS_V6.md 7, 13).
 *
 * Drei Schritte, die jede Wallet gleich macht -- Mini App, Node Core, CLI:
 *
 *   1. KONTO ANLEGEN: k von n Schluesseln. Das Skript ist THRESH(k, PK...),
 *      die Schluessel aufsteigend sortiert (7.1), die Adresse Version 1 aus
 *      dem Skript-Hash (4). Jeder Beteiligte kann das Konto aus denselben
 *      Schluesseln selbst nachrechnen -- niemand muss der Adresse eines
 *      anderen glauben.
 *
 *   2. MITZEICHNEN: Eine Ausgabe wird als Datei herumgereicht. Sie traegt
 *      die unsignierte Transaktion, das Skript und die bisher gesammelten
 *      Unterschriften, jede ihrem Schluessel zugeordnet. Wer unterschreibt,
 *      prueft vorher den Sighash gegen die Felder (die Datei koennte
 *      unterwegs veraendert worden sein) und haengt seine Unterschrift an.
 *      Der Transport ist Sache der Wallet: QR, Datei, Nachricht.
 *
 *   3. ZUSAMMENSETZEN: Sobald k Unterschriften da sind, wird der Witness
 *      gebaut -- genau k belegte Slots in Blattreihenfolge, der Rest leer
 *      (7.4: mehr als k ist witness_excess) -- und die Transaktion vor dem
 *      Einreichen noch einmal vollstaendig geprueft.
 *
 * Die Datei ist JSON mit Hex-Feldern. Kein Binaerformat: Sie wird von
 * Menschen weitergereicht, in Chats eingefuegt, aus Fotos gelesen. Hex mit
 * festen Laengen uebersteht das.
 */
import {
  OP_PK, OP_THRESH, type ScriptNode, type WitnessSlot,
  encodeScript, decodeScript, encodeWitness, multisig, leaves, evaluateScript,
} from '../core/script.ts';
import {
  type ScriptSpend, unsignedScriptSpend, scriptSpendSighash, checkScriptSpend,
  serializeTx, deserializeTx, TX_SCRIPT_SPEND, type CheckParams,
} from '../core/tx.ts';
import { rawAddressFromScript, encodeAddress, decodeAddress } from '../core/address.ts';
import { ADDRESS_HRP } from '../core/params.ts';
import { sign, verifySignature } from '../core/wallet.ts';
import { toHex, fromHex } from '../core/codec.ts';
import { MAX_SCRIPT_KEYS } from '../core/params.ts';

// -------------------------------------------------------------- Konto

export interface MehrfachKonto {
  k: number;
  /** Aufsteigend sortiert -- so stehen sie im Skript. */
  schluessel: Uint8Array[];
  script: Uint8Array;
  /** Rohadresse der Version 1 (33 Byte). */
  raw: Uint8Array;
  /** Textform, 63 Zeichen. */
  adresse: string;
}

/**
 * Ein k-von-n-Konto aus oeffentlichen Schluesseln.
 *
 * Doppelte Schluessel werden abgewiesen: Ein Schluessel, der zweimal im
 * Skript steht, koennte zweimal unterschreiben und aus 2-von-3 ein
 * 1-von-2 machen.
 */
export function mehrfachKonto(k: number, schluessel: Uint8Array[], hrp: string = ADDRESS_HRP): MehrfachKonto {
  if (!Number.isInteger(k) || k < 1) throw new Error('k muss eine ganze Zahl ab 1 sein');
  if (schluessel.length < 1 || schluessel.length > MAX_SCRIPT_KEYS) {
    throw new Error(`1 bis ${MAX_SCRIPT_KEYS} Schluessel, nicht ${schluessel.length}`);
  }
  if (k > schluessel.length) throw new Error(`k=${k} bei ${schluessel.length} Schluesseln`);
  for (const s of schluessel) if (s.length !== 32) throw new Error('jeder Schluessel hat 32 Byte');
  const hex = new Set(schluessel.map(toHex));
  if (hex.size !== schluessel.length) throw new Error('ein Schluessel kommt doppelt vor');

  const script = encodeScript(multisig(k, schluessel));
  // Was die Wallet zeigt, muss die Kette lesen koennen (4.4 Regel 3).
  const konto = kontoAusScript(script, hrp);
  if (!konto) throw new Error('Skript ist nicht wohlgeformt');
  return konto;
}

/** Konto aus einem gespeicherten Skript zurueckgewinnen; null, wenn es kein k-von-n ist. */
export function kontoAusScript(script: Uint8Array, hrp: string = ADDRESS_HRP): MehrfachKonto | null {
  const node = decodeScript(script);
  if (!node || node.op !== OP_THRESH) return null;
  if (!node.children.every(c => c.op === OP_PK)) return null;
  const schluessel = node.children.map(c => (c as { pubkey: Uint8Array }).pubkey);
  const raw = rawAddressFromScript(script);
  return { k: node.k, schluessel, script, raw, adresse: encodeAddress(raw, hrp) };
}

// ------------------------------------------------------ Mitzeichnung

/** Die Datei, die zwischen den Beteiligten wandert. */
export interface Mitzeichnung {
  /** Formatkennung. */
  yskar: 'mitzeichnung';
  v: 1;
  /** Netzname -- eine Datei vom Testnetz soll im Mainnet auffallen. */
  netz: string;
  /** Unsignierte Transaktion (Typ 2) ohne Witness, als Hex. */
  tx: string;
  /** Unterschriften: Schluessel (Hex) -> Signatur (Hex). */
  sigs: Record<string, string>;
}

export interface MitzeichnungsStand {
  konto: MehrfachKonto;
  unsigniert: Omit<ScriptSpend, 'witness'>;
  sighash: Uint8Array;
  /** Wer schon unterschrieben hat, in Skriptreihenfolge. */
  unterschrieben: Uint8Array[];
  /** Wie viele noch fehlen bis k. */
  fehlen: number;
}

/** Ausgabe ohne Witness auf die Leitung bringen (Typ 2 mit leerem Witness-Feld). */
function unsigniertHex(u: Omit<ScriptSpend, 'witness'>): string {
  return toHex(serializeTx({ ...u, witness: new Uint8Array(0) }));
}

function unsigniertAusHex(hex: string): Omit<ScriptSpend, 'witness'> {
  const t = deserializeTx(fromHex(hex));
  if (t.type !== TX_SCRIPT_SPEND) throw new Error('keine Skript-Ausgabe');
  if (t.witness.length !== 0) throw new Error('Mitzeichnung traegt schon einen Witness');
  const { witness: _w, ...u } = t;
  return u;
}

/**
 * Eine Ausgabe vom Mehrfach-Konto vorbereiten -- der erste Beteiligte ruft
 * das auf und reicht das Ergebnis weiter.
 */
export function mitzeichnungAnlegen(p: {
  konto: MehrfachKonto; netz: string;
  an: string | Uint8Array; betrag: bigint; gebuehr: bigint; nonce: bigint;
  notiz?: Uint8Array; validFrom?: number; validUntil?: number; hrp?: string;
}): Mitzeichnung {
  const to = typeof p.an === 'string' ? decodeAddress(p.an, p.hrp ?? ADDRESS_HRP) : p.an;
  const u = unsignedScriptSpend({
    script: p.konto.script, to, amount: p.betrag, fee: p.gebuehr, nonce: p.nonce,
    memo: p.notiz, validFrom: p.validFrom, validUntil: p.validUntil,
  });
  return { yskar: 'mitzeichnung', v: 1, netz: p.netz, tx: unsigniertHex(u), sigs: {} };
}

/**
 * Eine Mitzeichnung lesen und pruefen: Form, Skript, und JEDE enthaltene
 * Unterschrift gegen den Sighash. Eine falsche Unterschrift wirft -- wer
 * eine Datei mit ungueltigen Unterschriften weiterreicht, hat sie
 * veraendert oder falsch erzeugt, und niemand soll darauf aufbauen.
 */
export function mitzeichnungLesen(m: Mitzeichnung, netz: string, chainId: Uint8Array, hrp: string = ADDRESS_HRP): MitzeichnungsStand {
  if (m.yskar !== 'mitzeichnung' || m.v !== 1) throw new Error('keine Mitzeichnungsdatei');
  if (m.netz !== netz) throw new Error(`Datei gehoert zum Netz ${m.netz}, nicht ${netz}`);
  const unsigniert = unsigniertAusHex(m.tx);
  const konto = kontoAusScript(unsigniert.script, hrp);
  if (!konto) throw new Error('Skript ist kein k-von-n-Konto');
  const sighash = scriptSpendSighash(unsigniert, chainId);

  const bekannt = new Map(konto.schluessel.map(s => [toHex(s), s]));
  const unterschrieben: Uint8Array[] = [];
  for (const [pk, sig] of Object.entries(m.sigs)) {
    const s = bekannt.get(pk);
    if (!s) throw new Error(`Unterschrift von einem Schluessel, der nicht zum Konto gehoert: ${pk.slice(0, 16)}…`);
    if (!verifySignature(fromHex(sig), sighash, s)) throw new Error(`Unterschrift von ${pk.slice(0, 16)}… ist ungueltig`);
  }
  for (const s of konto.schluessel) if (m.sigs[toHex(s)]) unterschrieben.push(s);
  return { konto, unsigniert, sighash, unterschrieben, fehlen: Math.max(0, konto.k - unterschrieben.length) };
}

/**
 * Mit dem eigenen Schluessel unterschreiben. Liefert die erweiterte Datei;
 * die uebergebene bleibt unveraendert. Ein Schluessel, der nicht zum Konto
 * gehoert, wirft -- die Unterschrift waere wertlos.
 */
export function mitzeichnen(
  m: Mitzeichnung, privateKey: Uint8Array, publicKey: Uint8Array,
  netz: string, chainId: Uint8Array, hrp: string = ADDRESS_HRP,
): Mitzeichnung {
  const stand = mitzeichnungLesen(m, netz, chainId, hrp);
  const pk = toHex(publicKey);
  if (!stand.konto.schluessel.some(s => toHex(s) === pk)) throw new Error('dieser Schluessel gehoert nicht zum Konto');
  const sig = sign(stand.sighash, privateKey);
  return { ...m, sigs: { ...m.sigs, [pk]: toHex(sig) } };
}

/**
 * Die fertige Transaktion, sobald k Unterschriften vorliegen.
 *
 * Genau k Slots werden belegt, die ERSTEN k in Skriptreihenfolge: Mehr
 * waere witness_excess (7.4), und die Reihenfolge macht das Ergebnis
 * vorhersagbar -- zwei Wallets mit derselben Datei bauen denselben Witness
 * und damit dieselbe txid (7.6).
 */
export function zusammensetzen(
  m: Mitzeichnung, netz: string, chainId: Uint8Array,
  hoehe: number, params: CheckParams = {}, hrp: string = ADDRESS_HRP,
): ScriptSpend {
  const stand = mitzeichnungLesen(m, netz, chainId, hrp);
  if (stand.fehlen > 0) throw new Error(`es fehlen noch ${stand.fehlen} Unterschrift(en)`);

  const node = decodeScript(stand.konto.script) as ScriptNode;
  let belegt = 0;
  const slots: WitnessSlot[] = leaves(node).map(leaf => {
    const pk = toHex((leaf as { pubkey: Uint8Array }).pubkey);
    const sig = m.sigs[pk];
    if (sig && belegt < stand.konto.k) { belegt++; return { kind: 'sig', signature: fromHex(sig) }; }
    return { kind: 'absent' };
  });

  const fehler = evaluateScript(node, slots, {
    sighash: stand.sighash, validFrom: stand.unsigniert.validFrom, validUntil: stand.unsigniert.validUntil,
  });
  if (fehler) throw new Error(`Skript nicht erfuellt: ${fehler}`);

  const tx: ScriptSpend = { ...stand.unsigniert, witness: encodeWitness(slots) };
  const pruefung = checkScriptSpend(tx, hoehe, params);
  if (pruefung) throw new Error(`Transaktion ungueltig: ${pruefung}`);
  return tx;
}

/** Datei als Text -- zum Weiterreichen. */
export function mitzeichnungText(m: Mitzeichnung): string {
  return JSON.stringify(m);
}

/** Text zurueck in die Datei; wirft bei allem, was keine Mitzeichnung ist. */
export function mitzeichnungAusText(text: string): Mitzeichnung {
  let roh: unknown;
  try { roh = JSON.parse(text); } catch { throw new Error('kein JSON'); }
  if (!roh || typeof roh !== 'object') throw new Error('keine Mitzeichnungsdatei');
  const r = roh as Record<string, unknown>;
  if (r.yskar !== 'mitzeichnung' || r.v !== 1) throw new Error('keine Mitzeichnungsdatei');
  if (typeof r.netz !== 'string' || typeof r.tx !== 'string' || !/^([0-9a-f]{2})+$/.test(r.tx)) {
    throw new Error('Mitzeichnungsdatei ist beschaedigt');
  }
  const sigs: Record<string, string> = {};
  const s = (r.sigs && typeof r.sigs === 'object' ? r.sigs : {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(s)) {
    if (!/^[0-9a-f]{64}$/.test(k) || typeof v !== 'string' || !/^[0-9a-f]{128}$/.test(v)) {
      throw new Error('Mitzeichnungsdatei ist beschaedigt');
    }
    sigs[k] = v;
  }
  return { yskar: 'mitzeichnung', v: 1, netz: r.netz, tx: r.tx, sigs };
}
