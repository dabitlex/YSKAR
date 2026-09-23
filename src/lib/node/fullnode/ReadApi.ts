/**
 * Leseschnittstelle des Knotens.
 *
 * Alles, was Mini App und Explorer brauchen -- aus der lokalen Ablage, ohne
 * Datenbank dahinter. Erst damit laesst sich die App vom Server auf einen
 * Knoten umstellen.
 *
 * Die Antworten haben GENAU die Form der Vercel-Routen. Das ist kein
 * Zufall, sondern der Zweck: Die App soll nur eine andere Adresse bekommen,
 * keinen anderen Code. Weicht ein Feld ab, faellt es erst im Betrieb auf,
 * und dann bei jemandem, der nichts davon weiss.
 *
 * WAS HIER NICHT STEHT: Sessions, Jobs und Shares. Die gehoeren zum
 * Mining-Betrieb und liegen im MiningServer. Diese Datei liest nur die
 * Kette.
 */
import { deserializeBlock, headerHash } from '../../core/block.ts';
import { coinbaseTotal, txid, TX_COINBASE, type Coinbase, type Transfer }
  from '../../core/tx.ts';
import { encodeAddress, decodeAddress } from '../../core/address.ts';
import { toHex, fromHex } from '../../core/codec.ts';
import { stateRoot, totalSupply, getAccount } from '../../core/state.ts';
import { MAX_SUPPLY, rewardAt, TARGET_BLOCK_TIME, UNIT } from '../../core/params.ts';
import { finderName } from '../../chain/finderName.ts';
import { marktlage, position } from '../../core/feemarket.ts';
import { MIN_FEE } from '../../core/params.ts';

import type { ChainManager } from './ChainManager.ts';
import type { ChainStore, StoredBlock } from './ChainStore.ts';
import type { TxPool } from './TxPool.ts';

/**
 * Wie viele Bloecke fuer einen Kontoverlauf hoechstens durchsucht werden.
 *
 * Es gibt keinen Index nach Adresse -- der Knoten haelt die Kette, nicht
 * eine Auswertung davon. Bei einigen tausend Bloecken kostet die Suche
 * Millisekunden; bei Hunderttausenden braeuchte es einen Index, und den
 * baut man, wenn es so weit ist, nicht vorher.
 */
export const VERLAUF_TIEFE = 5000;

export interface ReadTeile {
  chain: ChainManager;
  store: ChainStore;
  pool: TxPool;
  /** Wird fuer die Kennzahlen gebraucht -- sonst bliebe hashrate leer. */
  hashrate?: () => number | null;
  aktiveMiner?: () => number;
  miningSessions?: () => number;
}

export class ReadApi {
  private t: ReadTeile;
  constructor(teile: ReadTeile) { this.t = teile; }

  /**
   * Eine Leseanfrage beantworten.
   *
   * Rueckgabe null heisst: nicht zustaendig. Der Aufrufer versucht es dann
   * mit seinen eigenen Routen.
   */
  behandle(methode: string, pfad: string, such: URLSearchParams):
    { status: number; body: unknown } | null {

    if (methode !== 'GET') return null;

    if (pfad === '/summary') return { status: 200, body: this.summary() };
    if (pfad === '/blocks')  return { status: 200, body: this.blocks(such) };
    if (pfad === '/sync')    return { status: 200, body: this.sync(such) };
    if (pfad === '/search')  return { status: 200, body: this.search(such) };
    if (pfad === '/fees')    return { status: 200, body: this.fees(such) };

    const block = pfad.match(/^\/blocks\/(\d+)$/);
    if (block) return this.block(Number(block[1]));

    const tx = pfad.match(/^\/tx\/([0-9a-fA-F]{64})$/);
    if (tx) return this.tx(tx[1].toLowerCase());

    const konto = pfad.match(/^\/account\/(ysr1[a-z0-9]+)$/i);
    if (konto) return this.account(konto[1].toLowerCase());

    return null;
  }

  // ------------------------------------------------------------ Kennzahlen

  summary() {
    const tip = this.t.chain.tip();
    const hoehe = tip?.height ?? -1;
    const state = this.t.chain.state();

    return {
      token: { token_name: 'YSKAR', token_symbol: 'YSR', decimals: 8 },
      height: tip ? tip.height : null,
      nextHeight: hoehe + 1,
      difficulty: tip ? Number(tip.difficulty) : null,
      hashrate: this.t.hashrate?.() ?? this.hashrateAusKette(),
      minerHashrate: this.t.hashrate?.() ?? null,
      targetBlockTime: Number(TARGET_BLOCK_TIME),
      tipHash: tip ? toHex(tip.hash) : null,
      stateHeight: this.t.chain.height(),
      stateRoot: tip ? toHex(stateRoot(state)) : null,
      totalSupply: totalSupply(state).toString(),
      maxSupply: MAX_SUPPLY.toString(),
      nextReward: rewardAt(hoehe + 1).toString(),
      mempool: this.t.pool.size(),
      activeMiners: this.t.aktiveMiner?.() ?? 0,
      // Sitzungen, nicht Adressen -- dasselbe Feld wie auf dem Server.
      miningSessions: this.t.miningSessions?.() ?? 0,
      // Nur der Knoten kennt sie: Die App zeigt sie nicht, der Explorer
      // koennte es. Zusaetzliche Felder stoeren nicht -- fehlende schon.
      chainWork: tip ? tip.chainWork.toString() : '0',
    };
  }

  /**
   * Hashrate aus der Kette selbst -- Arbeit geteilt durch Zeit.
   *
   * Dieselbe Rechnung wie auf dem Server. Unter drei Bloecken ist die
   * Streuung groesser als der Wert; dann lieber nichts anzeigen als etwas
   * Erfundenes.
   */
  private hashrateAusKette(): number | null {
    const tip = this.t.chain.tip();
    if (!tip || tip.height < 3) return null;

    const ab = Math.max(0, tip.height - 24);
    const erster = this.t.store.mainAt(ab);
    if (!erster) return null;

    const spanne = Number(tip.blockTime - erster.blockTime);
    if (spanne <= 0) return null;

    let arbeit = 0n;
    for (let h = ab + 1; h <= tip.height; h++) {
      const b = this.t.store.mainAt(h);
      if (b) arbeit += b.difficulty;
    }
    return Number(arbeit) * 65536 / spanne;
  }

  // ---------------------------------------------------------------- Bloecke

  blocks(such: URLSearchParams) {
    const limit = grenze(such.get('limit'), 25, 100);
    const before = such.get('before') !== null ? Number(such.get('before')) : null;
    const tip = this.t.chain.tip();
    if (!tip) return { blocks: [] };

    const start = before !== null && Number.isSafeInteger(before)
      ? Math.min(before - 1, tip.height) : tip.height;

    const out = [];
    for (let h = start; h >= 0 && out.length < limit; h--) {
      const b = this.t.store.mainAt(h);
      if (!b) break;
      out.push(this.kurz(b));
    }
    return { blocks: out };
  }

  private kurz(b: StoredBlock) {
    const block = deserializeBlock(b.body);
    const cb = block.txs[0] as Coinbase;
    return {
      height: b.height,
      hash: toHex(b.hash),
      prevHash: toHex(b.prevHash),
      timestamp: String(b.blockTime),
      difficulty: Number(b.difficulty),
      txCount: b.txCount,
      reward: coinbaseTotal(cb).toString(),
      minerAddress: cb.outputs.length === 1
        ? encodeAddress(cb.outputs[0].to) : null,
      // Wie auf dem Server: Selbstauskunft aus dem extra-Feld, meist null.
      finder: finderName(toHex(cb.extra)),
      recipients: cb.outputs.length,
      sizeBytes: b.body.length,
      extranonce: String(block.header.extranonce),
      nonce: String(block.header.nonce),
    };
  }

  block(hoehe: number) {
    const b = this.t.store.mainAt(hoehe);
    if (!b) return { status: 404, body: { error: 'not_found' } };

    const block = deserializeBlock(b.body);
    return {
      status: 200,
      body: {
        ...this.kurz(b),
        version: block.header.version,
        merkleRoot: toHex(b.merkleRoot),
        stateRoot: toHex(b.stateRoot),
        header: toHex(b.body.slice(0, 136)),
        chainWork: b.chainWork.toString(),
        txs: block.txs.map((t, idx) => this.txAnsicht(t, idx, b)),
      },
    };
  }

  private txAnsicht(t: Transfer | Coinbase, idx: number, b: StoredBlock) {
    const basis = {
      txid: toHex(txid(t)), idx,
      type: t.type === TX_COINBASE ? 'coinbase' : 'transfer',
    };
    if (t.type === TX_COINBASE) {
      const mehrere = t.outputs.length > 1;
      return {
        ...basis,
        from: null,
        to: mehrere ? null : encodeAddress(t.outputs[0].to),
        amount: coinbaseTotal(t).toString(),
        fee: '0', nonce: null, memo: toHex(t.extra),
        // Bei mehreren Empfaengern gehoert die Aufteilung sichtbar hierher.
        // Nur die Summe zu zeigen saehe aus, als haette niemand etwas
        // bekommen.
        recipients: mehrere
          ? t.outputs.map(o => ({
              address: encodeAddress(o.to), amount: o.amount.toString(),
            }))
          : null,
      };
    }
    return {
      ...basis,
      from: encodeAddress(t.from),
      to: encodeAddress(t.to),
      amount: t.amount.toString(),
      fee: t.fee.toString(),
      nonce: String(t.nonce),
      memo: toHex(t.memo),
      recipients: null,
    };
  }

  // ------------------------------------------------------------- Gebühren

  /**
   * Marktlage -- dieselbe Form wie auf dem Server.
   *
   * KEINE Konsensregel. Wer weniger zahlt als empfohlen, wartet länger;
   * abgelehnt wird er nicht. Würde eine Empfehlung zur Regel, hätten
   * verschiedene Knoten verschiedene Regeln.
   */
  fees(such: URLSearchParams) {
    const mempool = this.t.pool.alle();
    const m = marktlage(this.t.chain.state(), mempool, this.t.chain.height() + 1);

    const roh = such.get('fee');
    let eigene = null;
    if (roh !== null && /^\d+$/.test(roh)) {
      const p = position(mempool, BigInt(roh));
      eigene = { fee: roh, rang: p.rang, von: p.von };
    }

    return {
      minFee: MIN_FEE.toString(),
      wartend: m.wartend,
      plaetzeJeBlock: m.plaetzeJeBlock,
      andrang: m.andrang,
      kappung: m.kappung?.toString() ?? null,
      stufen: {
        langsam: { fee: m.langsam.fee.toString(), block: m.langsam.block },
        normal: { fee: m.normal.fee.toString(), block: m.normal.block },
        schnell: { fee: m.schnell.fee.toString(), block: m.schnell.block },
      },
      bloecke: m.bloecke.map(b => ({
        block: b.block, anzahl: b.anzahl, minFee: b.minFee.toString(),
      })),
      eigene,
      hinweis: m.andrang
        ? 'Voraussichtlich, unter der Annahme dass nichts Neues dazukommt.'
        : 'Kein Andrang -- die Mindestgebühr genügt für den nächsten Block.',
    };
  }

  // ---------------------------------------------------------------- Konten

  account(adresse: string) {
    let roh: Uint8Array;
    try { roh = decodeAddress(adresse); }
    catch { return { status: 400, body: { error: 'bad_address' } }; }

    const konto = getAccount(this.t.chain.state(), roh);
    const key = toHex(roh);
    const tip = this.t.chain.tip();

    const verlauf: unknown[] = [];
    let gefunden = 0;
    let poolAnteile = 0;

    // Rueckwaerts durch die Kette. Es gibt keinen Index nach Adresse -- der
    // Knoten haelt die Kette, nicht eine Auswertung davon.
    const bis = tip ? Math.max(0, tip.height - VERLAUF_TIEFE) : 0;
    for (let h = tip?.height ?? -1; h >= bis && verlauf.length < 40; h--) {
      const b = this.t.store.mainAt(h);
      if (!b) continue;
      const block = deserializeBlock(b.body);

      for (const t of block.txs) {
        if (t.type === TX_COINBASE) {
          const meiner = t.outputs.find(o => toHex(o.to) === key);
          if (!meiner) continue;
          if (t.outputs.length === 1) gefunden++; else poolAnteile++;
          verlauf.push({
            txid: toHex(txid(t)), height: h, timestamp: String(b.blockTime),
            kind: t.outputs.length === 1 ? 'reward' : 'pool',
            counterparty: null,
            amount: meiner.amount.toString(), fee: '0', memo: toHex(t.extra),
            shares: t.outputs.length > 1 ? t.outputs.length : undefined,
          });
          continue;
        }
        const ein = toHex(t.to) === key;
        const aus = toHex(t.from) === key;
        if (!ein && !aus) continue;
        verlauf.push({
          txid: toHex(txid(t)), height: h, timestamp: String(b.blockTime),
          kind: ein ? 'in' : 'out',
          counterparty: encodeAddress(ein ? t.from : t.to),
          amount: t.amount.toString(), fee: t.fee.toString(), memo: toHex(t.memo),
        });
      }
    }

    // Wartende Transaktionen -- sie zaehlen noch nicht zum Guthaben, aber
    // der Nutzer soll sehen, dass sie unterwegs sind.
    const wartend = this.t.pool.alle()
      .filter(t => toHex(t.from) === key || toHex(t.to) === key)
      .map(t => ({
        txid: toHex(txid(t)),
        to: encodeAddress(t.to),
        amount: t.amount.toString(),
        fee: t.fee.toString(),
        nonce: String(t.nonce),
      }));

    return {
      status: 200,
      body: {
        address: encodeAddress(roh),
        balance: konto.balance.toString(),
        nonce: konto.nonce.toString(),
        blocksFound: gefunden,
        poolRewards: poolAnteile,
        pending: wartend,
        history: verlauf,
        // Ehrlich dazusagen, wie weit gesucht wurde -- sonst haelt jemand
        // einen abgeschnittenen Verlauf fuer vollstaendig.
        historyDepth: (tip?.height ?? -1) - bis + 1,
      },
    };
  }

  // ----------------------------------------------------------------- Suche

  search(such: URLSearchParams) {
    const q = (such.get('q') ?? '').trim().toLowerCase();
    if (!q) return { kind: 'leer' };

    if (q.startsWith('ysr1')) {
      try {
        const roh = decodeAddress(q);
        const konto = getAccount(this.t.chain.state(), roh);
        return {
          kind: 'address', address: encodeAddress(roh),
          bekannt: konto.balance > 0n || konto.nonce > 0n,
          balance: konto.balance.toString(),
        };
      } catch { return { kind: 'nichts', hinweis: 'Keine gültige YSKAR-Adresse.' }; }
    }

    if (/^\d+$/.test(q)) {
      const h = Number(q);
      return this.t.store.mainAt(h)
        ? { kind: 'block', height: h }
        : { kind: 'nichts', hinweis: `Block ${h} gibt es (noch) nicht.` };
    }

    if (/^[0-9a-f]{64}$/.test(q)) {
      const b = this.t.store.get(fromHex(q));
      if (b) return { kind: 'block', height: b.height };

      const gefunden = this.sucheTx(q);
      if (gefunden) return { kind: 'tx', txid: q, height: gefunden.hoehe };

      const offen = this.t.pool.get(q);
      if (offen) return { kind: 'tx', txid: q, height: null, pending: true };

      return { kind: 'nichts', hinweis: 'Kein Block und keine Transaktion damit.' };
    }

    return { kind: 'nichts', hinweis: 'Adresse, Transaktion, Höhe oder Blockhash.' };
  }

  private sucheTx(hex: string): { hoehe: number; tx: Transfer | Coinbase } | null {
    const tip = this.t.chain.tip();
    if (!tip) return null;
    const bis = Math.max(0, tip.height - VERLAUF_TIEFE);
    for (let h = tip.height; h >= bis; h--) {
      const b = this.t.store.mainAt(h);
      if (!b) continue;
      for (const t of deserializeBlock(b.body).txs) {
        if (toHex(txid(t)) === hex) return { hoehe: h, tx: t };
      }
    }
    return null;
  }

  tx(hex: string) {
    const gefunden = this.sucheTx(hex);
    if (gefunden) {
      const b = this.t.store.mainAt(gefunden.hoehe)!;
      const block = deserializeBlock(b.body);
      const idx = block.txs.findIndex(t => toHex(txid(t)) === hex);
      return {
        status: 200,
        body: {
          ...this.txAnsicht(gefunden.tx, idx, b),
          status: 'confirmed',
          height: gefunden.hoehe,
          blockHash: toHex(b.hash),
          timestamp: String(b.blockTime),
        },
      };
    }

    const offen = this.t.pool.get(hex);
    if (offen) {
      return {
        status: 200,
        body: {
          txid: hex, status: 'pending', height: null, blockHash: null,
          timestamp: null, type: 'transfer',
          from: encodeAddress(offen.from), to: encodeAddress(offen.to),
          amount: offen.amount.toString(), fee: offen.fee.toString(),
          nonce: String(offen.nonce), memo: toHex(offen.memo), recipients: null,
        },
      };
    }
    return { status: 404, body: { error: 'not_found' } };
  }

  // --------------------------------------------------- Rohe Bloecke

  /** Fuer andere Knoten und den Beobachter -- stapelweise rohe Koerper. */
  sync(such: URLSearchParams) {
    const from = Math.max(0, Number(such.get('from') ?? 0) || 0);
    const count = grenze(such.get('count'), 200, 200);
    const tip = this.t.chain.tip();
    if (!tip) return { from, blocks: [], tip: -1 };

    const out = [];
    for (let h = from; h <= tip.height && out.length < count; h++) {
      const b = this.t.store.mainAt(h);
      if (!b) break;
      out.push({ height: h, hash: toHex(b.hash), body: toHex(b.body) });
    }
    return { from, blocks: out, tip: tip.height };
  }
}

function grenze(roh: string | null, vorgabe: number, max: number): number {
  const n = roh === null ? vorgabe : Number(roh);
  if (!Number.isFinite(n) || n <= 0) return vorgabe;
  return Math.min(Math.floor(n), max);
}
