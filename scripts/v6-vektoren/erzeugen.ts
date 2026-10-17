/**
 * Erzeugt tests/fixtures/v6-vektoren.json (docs/CONSENSUS_V6.md 14).
 *
 *   node --experimental-strip-types scripts/v6-vektoren/erzeugen.ts
 *
 * Die Datei hat zwei Teile:
 *   eingaben  -- alles, was eine zweite Umsetzung braucht: Schluessel als
 *                rohe Ed25519-Geheimnisse (32 Byte, RFC 8032), Felder,
 *                Netz-ID. Keine YSKAR-eigene Ableitung (SLIP-0010), weil die
 *                nicht zum Konsens gehoert.
 *   erwartet  -- was herauskommen muss: Bytes auf der Leitung, Sighash,
 *                txid, Adressen, Zustandswurzel.
 *
 * Ed25519 nach RFC 8032 ist deterministisch: Dieselbe Nachricht mit
 * demselben Schluessel ergibt dieselbe Signatur. Darum sind auch die
 * Signaturen feste Werte, die jede korrekte Bibliothek reproduziert.
 *
 * Wer die Datei neu erzeugt, muss erklaeren koennen, warum sich ein Wert
 * aendert -- tests/v6-vektoren.test.ts haelt sie fest.
 */
import { writeFileSync } from 'node:fs';
import { sha256 } from '@noble/hashes/sha2.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import * as T from '../../src/lib/core/tx.ts';
import * as SC from '../../src/lib/core/script.ts';
import * as S from '../../src/lib/core/state.ts';
import { REGTEST_V6 } from '../../src/lib/core/networks.ts';
import { addressFromPublicKey, rawAddressFromScript, encodeAddress, HRP_MAINNET, HRP_REGTEST } from '../../src/lib/core/address.ts';
import { toHex } from '../../src/lib/core/codec.ts';

const NETZ = REGTEST_V6;
const geheim = (b: number) => new Uint8Array(32).fill(b);
const SCHLUESSEL = { alice: 0x11, bob: 0x22, carol: 0x33, dave: 0x44 } as const;
type Name = keyof typeof SCHLUESSEL;
const sk = (n: Name) => geheim(SCHLUESSEL[n]);
const pk = (n: Name) => ed25519.getPublicKey(sk(n));
const adr = (n: Name) => addressFromPublicKey(pk(n));
const hx = toHex;
const enc = new TextEncoder();

const eingaben: Record<string, unknown> = {
  netz: { name: NETZ.network, chainId: hx(NETZ.chainId), chainIdHerleitung: 'SHA-256 ueber den ASCII-Text des Netznamens' },
  forkId: 6,
  schluessel: Object.fromEntries(Object.keys(SCHLUESSEL).map(n => [n, { geheim: hx(sk(n as Name)) }])),
};
const erwartet: Record<string, unknown> = {
  schluessel: Object.fromEntries(Object.keys(SCHLUESSEL).map(n => [n, {
    oeffentlich: hx(pk(n as Name)), rohadresse: hx(adr(n as Name)),
    textMainnet: encodeAddress(adr(n as Name), HRP_MAINNET), textRegtest: encodeAddress(adr(n as Name), HRP_REGTEST),
  }])),
};
const tx = (t: T.Tx) => ({ leitung: hx(T.serializeTx(t)), txid: hx(T.txid(t)) });

// 1. Ueberweisung Fassung 2
{
  const f = { von: 'alice', an: 'bob', betrag: '1000000', gebuehr: '2000', nonce: '7', validFrom: 5, validUntil: 50, notiz: 'v6' };
  const t = T.buildTransfer({ chainId: NETZ.chainId, version: 2, from: adr('alice'), to: adr('bob'), amount: 1_000_000n, fee: 2_000n,
    nonce: 7n, validFrom: 5, validUntil: 50, memo: enc.encode('v6'), publicKey: pk('alice'), privateKey: sk('alice') });
  if (T.checkTransfer(t, 10, NETZ)) throw new Error('Vektor 1 ungueltig');
  eingaben.ueberweisung = f;
  erwartet.ueberweisung = { sighash: hx(T.spendSighash(t, NETZ.chainId)), signatur: hx(t.signature), ...tx(t) };
}

// Skripte
const multisig = SC.encodeScript(SC.multisig(2, [pk('alice'), pk('bob'), pk('carol')]));
const geheimnis = enc.encode('YSKAR-HTLC-Testgeheimnis-32-Byte');
if (geheimnis.length !== 32) throw new Error('Geheimnis muss 32 Byte haben');
const htlcSkript = SC.encodeScript(SC.htlc(pk('bob'), sha256(geheimnis), pk('alice'), 100));
eingaben.skripte = {
  multisig: { art: 'THRESH(2; PK(alice), PK(bob), PK(carol)), Schluessel aufsteigend sortiert (7.1)' },
  htlc: { art: 'THRESH(1; THRESH(2; PK(bob), HASH(sha256(geheimnis))), THRESH(2; PK(alice), AFTER(100)))', geheimnis: hx(geheimnis) },
};
erwartet.skripte = {
  multisig: { skript: hx(multisig), rohadresse: hx(rawAddressFromScript(multisig)),
    textMainnet: encodeAddress(rawAddressFromScript(multisig), HRP_MAINNET), textRegtest: encodeAddress(rawAddressFromScript(multisig), HRP_REGTEST) },
  htlc: { skript: hx(htlcSkript), hash: hx(sha256(geheimnis)), rohadresse: hx(rawAddressFromScript(htlcSkript)),
    textMainnet: encodeAddress(rawAddressFromScript(htlcSkript), HRP_MAINNET) },
};

// 2. Sammelzahlung an Version-0- und Version-1-Empfaenger
{
  const ausgaenge = [
    { to: adr('carol'), amount: 30_000n }, { to: rawAddressFromScript(multisig), amount: 50_000n }, { to: adr('bob'), amount: 20_000n },
  ];
  const t = T.buildBatch({ chainId: NETZ.chainId, from: adr('alice'), outputs: ausgaenge, fee: 3_000n, nonce: 8n,
    validFrom: 0, validUntil: 0, memo: enc.encode('Auszahlung'), publicKey: pk('alice'), privateKey: sk('alice') });
  if (T.checkBatch(t, 10, NETZ)) throw new Error('Vektor 2 ungueltig');
  eingaben.sammelzahlung = { von: 'alice', ausgaenge: [
    { an: 'carol', betrag: '30000' }, { an: 'skript:multisig', betrag: '50000' }, { an: 'bob', betrag: '20000' },
  ], gebuehr: '3000', nonce: '8', validFrom: 0, validUntil: 0, notiz: 'Auszahlung', hinweis: 'Ausgaenge in der Reihenfolge der Eingabe; die Transaktion sortiert sie nach 6.4.' };
  erwartet.sammelzahlung = { reihenfolge: t.outputs.map(o => hx(o.to)), sighash: hx(T.spendSighash(t, NETZ.chainId)), signatur: hx(t.signature), ...tx(t) };
}

/** Skriptausgabe mit den Unterschriften der genannten Schluessel. */
function skriptAusgabe(script: Uint8Array, felder: { an: Uint8Array; betrag: bigint; gebuehr: bigint; nonce: bigint; validFrom: number; validUntil: number; notiz: string },
  belegung: (blatt: SC.ScriptNode, h: Uint8Array) => SC.WitnessSlot) {
  const u = T.unsignedScriptSpend({ script, to: felder.an, amount: felder.betrag, fee: felder.gebuehr, nonce: felder.nonce,
    validFrom: felder.validFrom, validUntil: felder.validUntil, memo: enc.encode(felder.notiz) });
  const h = T.scriptSpendSighash(u, NETZ.chainId);
  const node = SC.decodeScript(script)!;
  const slots = SC.leaves(node).map(b => belegung(b, h));
  const t: T.ScriptSpend = { ...u, witness: SC.encodeWitness(slots) };
  return { t, h };
}
const signiere = (n: Name, h: Uint8Array): SC.WitnessSlot => ({ kind: 'sig', signature: ed25519.sign(h, sk(n)) });
const pkIst = (b: SC.ScriptNode, n: Name) => b.op === SC.OP_PK && hx(b.pubkey) === hx(pk(n));

// 3. 2-von-3: Alice und Carol unterschreiben, Bob nicht
{
  const f = { an: adr('dave'), betrag: 40_000n, gebuehr: 4_000n, nonce: 2n, validFrom: 0, validUntil: 0, notiz: '2von3' };
  const { t, h } = skriptAusgabe(multisig, f, (b, hh) => pkIst(b, 'alice') ? signiere('alice', hh) : pkIst(b, 'carol') ? signiere('carol', hh) : { kind: 'absent' });
  if (T.checkScriptSpend(t, 10, NETZ)) throw new Error('Vektor 3 ungueltig');
  eingaben.zweiVonDrei = { skript: 'multisig', an: 'dave', betrag: '40000', gebuehr: '4000', nonce: '2', validFrom: 0, validUntil: 0, notiz: '2von3',
    unterschreiben: ['alice', 'carol'], hinweis: 'Witness: ein Slot je Blatt in Skriptreihenfolge (7.3); Bob bleibt leer.' };
  erwartet.zweiVonDrei = { sighash: hx(h), witness: hx(t.witness), ...tx(t) };
}

// 4. HTLC einloesen: Bob mit Geheimnis
{
  const f = { an: adr('bob'), betrag: 60_000n, gebuehr: 5_000n, nonce: 0n, validFrom: 0, validUntil: 90, notiz: '' };
  const { t, h } = skriptAusgabe(htlcSkript, f, (b, hh) => pkIst(b, 'bob') ? signiere('bob', hh) : b.op === SC.OP_HASH ? { kind: 'preimage', preimage: geheimnis } : { kind: 'absent' });
  if (T.checkScriptSpend(t, 10, NETZ)) throw new Error('Vektor 4 ungueltig');
  eingaben.htlcEinloesen = { skript: 'htlc', an: 'bob', betrag: '60000', gebuehr: '5000', nonce: '0', validFrom: 0, validUntil: 90, notiz: '',
    unterschreiben: ['bob'], hinweis: 'Zweig 1: Bobs Signatur und das Geheimnis; Zweig 2 bleibt leer.' };
  erwartet.htlcEinloesen = { sighash: hx(h), witness: hx(t.witness), ...tx(t) };
}

// 5. HTLC zurueckholen: Alice ab Hoehe 100
{
  const f = { an: adr('alice'), betrag: 60_000n, gebuehr: 5_000n, nonce: 0n, validFrom: 100, validUntil: 0, notiz: 'zurueck' };
  const { t, h } = skriptAusgabe(htlcSkript, f, (b, hh) => pkIst(b, 'alice') ? signiere('alice', hh) : b.op === SC.OP_AFTER ? { kind: 'claim' } : { kind: 'absent' });
  if (T.checkScriptSpend(t, 100, NETZ)) throw new Error('Vektor 5 ungueltig');
  if (T.checkScriptSpend(t, 99, NETZ) === null) throw new Error('Vektor 5 waere zu frueh gueltig');
  eingaben.htlcZurueck = { skript: 'htlc', an: 'alice', betrag: '60000', gebuehr: '5000', nonce: '0', validFrom: 100, validUntil: 0, notiz: 'zurueck',
    unterschreiben: ['alice'], hinweis: 'Zweig 2: Alices Signatur und AFTER(100) beansprucht; gueltig ab Hoehe 100, nicht vorher.' };
  erwartet.htlcZurueck = { sighash: hx(h), witness: hx(t.witness), ...tx(t) };
}

// 6. Zustandswurzel mit Konten beider Versionen
{
  const st = S.emptyState();
  st.set(hx(adr('alice')), { balance: 5n, nonce: 0n });
  st.set(hx(adr('bob')), { balance: 7n, nonce: 3n });
  st.set(hx(rawAddressFromScript(multisig)), { balance: 9n, nonce: 2n });
  eingaben.zustand = { konten: [
    { konto: 'alice', guthaben: '5', nonce: '0' }, { konto: 'bob', guthaben: '7', nonce: '3' }, { konto: 'skript:multisig', guthaben: '9', nonce: '2' },
  ], hinweis: 'Zustandsbaum nach 5.2, Kontodatensatz nach 5.1.' };
  erwartet.zustand = { wurzel: hx(S.stateRootV6(st)) };
}

const datei = {
  hinweis: 'Testvektoren der Konsensfassung 6 (docs/CONSENSUS_V6.md 14). Erzeugt von scripts/v6-vektoren/erzeugen.ts; nicht von Hand aendern. Zahlen als Text, weil sie ueber 2^53 liegen koennen.',
  eingaben, erwartet,
};
writeFileSync(new URL('../../tests/fixtures/v6-vektoren.json', import.meta.url), JSON.stringify(datei, null, 1) + '\n');
console.log('geschrieben: tests/fixtures/v6-vektoren.json');
