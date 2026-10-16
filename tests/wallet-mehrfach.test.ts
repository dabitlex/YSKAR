/**
 * Mehrfach-Signatur in der Wallet (src/lib/wallet/mehrfach.ts).
 *
 * Der Weg, den drei Personen gehen: Konto anlegen, eine Ausgabe anlegen,
 * die Datei weiterreichen, unterschreiben, zusammensetzen -- und die
 * fertige Transaktion muss die Kette annehmen. Dazu alles, was unterwegs
 * schiefgehen kann: eine veraenderte Datei, ein fremder Schluessel, zu
 * wenige Unterschriften, das falsche Netz.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as M from '../src/lib/wallet/mehrfach.ts';
import * as T from '../src/lib/core/tx.ts';
import * as S from '../src/lib/core/state.ts';
import * as SC from '../src/lib/core/script.ts';
import { REGTEST_V6, MAINNET } from '../src/lib/core/networks.ts';
import { HRP_REGTEST, decodeAddress, decodeAddressAny, encodeAddress } from '../src/lib/core/address.ts';
import { keypairFromSeed, type Keypair } from '../src/lib/core/wallet.ts';
import { toHex, fromHex } from '../src/lib/core/codec.ts';
import { UNIT } from '../src/lib/core/params.ts';
import { TxPool } from '../src/lib/node/fullnode/TxPool.ts';

const kp = (n: number): Keypair => keypairFromSeed(new Uint8Array(32).fill(n));
const ALICE = kp(1), BOB = kp(2), CAROL = kp(3), DAVE = kp(4);
const V6 = REGTEST_V6;
const NETZ = V6.network;
const HRP = HRP_REGTEST;

const konto = () => M.mehrfachKonto(2, [CAROL.publicKey, ALICE.publicKey, BOB.publicKey], HRP);

test('Konto: Schluessel sortiert, Adresse Version 1 mit 63 Zeichen, aus jedem Schluesselsatz dieselbe', () => {
  const k = konto();
  assert.equal(k.k, 2);
  assert.deepEqual(k.schluessel.map(toHex), SC.sortKeys([ALICE.publicKey, BOB.publicKey, CAROL.publicKey]).map(toHex));
  assert.equal(k.adresse.length, 63 + (HRP.length - 3), '63 Zeichen mit ysr; rysr ist ein Zeichen laenger');
  assert.ok(k.adresse.startsWith(HRP + '1'));
  assert.equal(decodeAddressAny(k.adresse, HRP).version, 1);
  assert.equal(toHex(decodeAddress(k.adresse, HRP)), toHex(k.raw));
  // Jeder Beteiligte rechnet dasselbe Konto aus, egal in welcher Reihenfolge er die Schluessel bekam.
  const anders = M.mehrfachKonto(2, [BOB.publicKey, CAROL.publicKey, ALICE.publicKey], HRP);
  assert.equal(anders.adresse, k.adresse);
  // Und aus dem Skript allein laesst es sich zurueckgewinnen.
  assert.equal(M.kontoAusScript(k.script, HRP)?.adresse, k.adresse);
  assert.equal(M.kontoAusScript(SC.encodeScript(SC.timelocked(ALICE.publicKey, 10)), HRP), null, 'kein k-von-n');
});

test('Konto: doppelte Schluessel, k > n, zu viele Schluessel werden abgewiesen', () => {
  assert.throws(() => M.mehrfachKonto(2, [ALICE.publicKey, ALICE.publicKey, BOB.publicKey]), /doppelt/);
  assert.throws(() => M.mehrfachKonto(4, [ALICE.publicKey, BOB.publicKey, CAROL.publicKey]), /k=4/);
  assert.throws(() => M.mehrfachKonto(0, [ALICE.publicKey]), /ab 1/);
  assert.throws(() => M.mehrfachKonto(1, Array.from({ length: 17 }, (_, i) => kp(10 + i).publicKey)), /1 bis 16/);
  assert.throws(() => M.mehrfachKonto(1, [new Uint8Array(31)]), /32 Byte/);
});

test('2-von-3: anlegen, zwei unterschreiben, zusammensetzen -- die Kette nimmt es an', () => {
  const k = konto();
  const datei = M.mitzeichnungAnlegen({
    konto: k, netz: NETZ, an: encodeAddress(DAVE.addressRaw, HRP), betrag: 10n * UNIT, gebuehr: 100_000n, nonce: 0n,
    notiz: new TextEncoder().encode('Miete'), hrp: HRP,
  });
  assert.equal(Object.keys(datei.sigs).length, 0);
  const leer = M.mitzeichnungLesen(datei, NETZ, V6.chainId, HRP);
  assert.equal(leer.fehlen, 2);
  assert.equal(leer.konto.adresse, k.adresse);

  // Ueber Text weiterreichen, wie zwischen zwei Geraeten.
  const nachAlice = M.mitzeichnen(M.mitzeichnungAusText(M.mitzeichnungText(datei)), ALICE.privateKey, ALICE.publicKey, NETZ, V6.chainId, HRP);
  assert.equal(M.mitzeichnungLesen(nachAlice, NETZ, V6.chainId, HRP).fehlen, 1);
  assert.throws(() => M.zusammensetzen(nachAlice, NETZ, V6.chainId, 10, V6, HRP), /fehlen noch 1/);

  const nachCarol = M.mitzeichnen(M.mitzeichnungAusText(M.mitzeichnungText(nachAlice)), CAROL.privateKey, CAROL.publicKey, NETZ, V6.chainId, HRP);
  const tx = M.zusammensetzen(nachCarol, NETZ, V6.chainId, 10, V6, HRP);
  assert.equal(T.checkScriptSpend(tx, 10, V6), null);
  assert.equal(T.spendSigops(tx), 2);

  // Mempool und Zustand.
  const state = S.emptyState();
  state.set(toHex(k.raw), { balance: 20n * UNIT, nonce: 0n });
  const pool = new TxPool(V6);
  assert.equal(pool.add(tx, state, 10).ok, true);

  // Mit drei Unterschriften: genau k werden benutzt, die Transaktion bleibt gueltig
  // und ist dieselbe (7.6: Wallets bauen denselben Witness).
  const nachBob = M.mitzeichnen(nachCarol, BOB.privateKey, BOB.publicKey, NETZ, V6.chainId, HRP);
  const tx3 = M.zusammensetzen(nachBob, NETZ, V6.chainId, 10, V6, HRP);
  assert.equal(T.checkScriptSpend(tx3, 10, V6), null);
  assert.equal(T.spendSigops(tx3), 2);
  const slots = SC.decodeWitness(SC.decodeScript(k.script)!, tx3.witness)!;
  assert.deepEqual(slots.map(s => s.kind), ['sig', 'sig', 'absent']);
});

test('Veraenderte Datei: Betrag geaendert -> alte Unterschrift ungueltig; fremder Schluessel; falsches Netz', () => {
  const k = konto();
  const datei = M.mitzeichnungAnlegen({ konto: k, netz: NETZ, an: DAVE.addressRaw, betrag: UNIT, gebuehr: 100_000n, nonce: 0n });
  const signiert = M.mitzeichnen(datei, ALICE.privateKey, ALICE.publicKey, NETZ, V6.chainId, HRP);

  // Jemand aendert den Betrag unterwegs: Die Unterschrift passt nicht mehr, Lesen wirft.
  const u = M.mitzeichnungLesen(signiert, NETZ, V6.chainId, HRP).unsigniert;
  const manipuliert = { ...u, amount: 5n * UNIT };
  const falsch = { ...signiert, tx: toHex(T.serializeTx({ ...manipuliert, witness: new Uint8Array(0) })) };
  assert.throws(() => M.mitzeichnungLesen(falsch, NETZ, V6.chainId, HRP), /ungueltig/);
  assert.throws(() => M.mitzeichnen(falsch, BOB.privateKey, BOB.publicKey, NETZ, V6.chainId, HRP), /ungueltig/);

  // Ein Schluessel, der nicht zum Konto gehoert.
  assert.throws(() => M.mitzeichnen(datei, DAVE.privateKey, DAVE.publicKey, NETZ, V6.chainId, HRP), /nicht zum Konto/);
  const fremd = { ...signiert, sigs: { ...signiert.sigs, [toHex(DAVE.publicKey)]: 'ab'.repeat(64) } };
  assert.throws(() => M.mitzeichnungLesen(fremd, NETZ, V6.chainId, HRP), /nicht zum Konto/);

  // Falsches Netz / falsche Chain-ID.
  assert.throws(() => M.mitzeichnungLesen(signiert, MAINNET.network, MAINNET.chainId), /Netz/);
  assert.throws(() => M.mitzeichnungLesen({ ...signiert, netz: MAINNET.network }, MAINNET.network, MAINNET.chainId), /ungueltig/);
});

test('Text-Form: alles, was keine Mitzeichnung ist, wird abgewiesen', () => {
  assert.throws(() => M.mitzeichnungAusText('nicht json'), /kein JSON/);
  assert.throws(() => M.mitzeichnungAusText('{"yskar":"wallet"}'), /keine Mitzeichnungsdatei/);
  assert.throws(() => M.mitzeichnungAusText('{"yskar":"mitzeichnung","v":1,"netz":"x","tx":"zz"}'), /beschaedigt/);
  assert.throws(() => M.mitzeichnungAusText('{"yskar":"mitzeichnung","v":1,"netz":"x","tx":"0102","sigs":{"ab":"cd"}}'), /beschaedigt/);
  // Eine Mitzeichnung, die schon einen Witness traegt, ist keine mehr.
  const k = konto();
  const d = M.mitzeichnungAnlegen({ konto: k, netz: NETZ, an: DAVE.addressRaw, betrag: UNIT, gebuehr: 100_000n, nonce: 0n });
  const mitWitness = { ...d, tx: d.tx + '00' };
  assert.throws(() => M.mitzeichnungLesen(mitWitness, NETZ, V6.chainId, HRP), /Witness/);
  // Eine Ueberweisung (Typ 1) ist keine Skript-Ausgabe.
  const t = T.buildTransfer({ chainId: V6.chainId, from: ALICE.addressRaw, to: BOB.addressRaw, amount: UNIT, fee: 100_000n, nonce: 0n,
    publicKey: ALICE.publicKey, privateKey: ALICE.privateKey, version: 2 });
  assert.throws(() => M.mitzeichnungLesen({ ...d, tx: toHex(T.serializeTx(t)) }, NETZ, V6.chainId, HRP), /keine Skript-Ausgabe/);
  void fromHex;
});
