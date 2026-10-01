import { NextResponse } from 'next/server';
import { db } from '@/lib/db/service';
import { unprefix } from '@/lib/node/hex';
import { decodeAddress } from '@/lib/core/address';
import { toHex } from '@/lib/core/codec';
import { fullnodeLesen } from '@/lib/api/fullnode';
import { verlaufLaden } from '@/lib/api/verlauf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' };
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

/** GET /api/v2/account/:address -- Guthaben, Nonce und offene Transaktionen. */
export async function GET(
  _req: Request, { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  let raw: Uint8Array;
  try { raw = decodeAddress(address); }
  catch { return NextResponse.json({ error: 'bad_address' }, { status: 400, headers: CORS }); }

  const key = '\\x' + toHex(raw);
  const sb = db().schema('chain2');

  /*
    Wartende Transaktionen kommen vom Full Node, nicht aus dem Spiegel.

    Der Mempool ist fluechtig und wird nicht gespiegelt -- die Tabelle
    chain2.mempool bleibt seit der Umstellung leer. Wer sie abfragt, sieht
    nie eine wartende Zahlung: nicht der Absender, nicht der Empfaenger.
    Der Knoten weiss es, also fragen wir ihn. Ist er nicht erreichbar, ist
    die Liste leer und das Guthaben trotzdem richtig.
  */
  interface Wartend {
    txid: string; kind: 'in' | 'out'; from: string; to: string;
    amount: string; fee: string; nonce: string; memo?: string;
  }
  const vomKnoten = fullnodeLesen<{ pending?: Wartend[]; nextNonce?: string }>(
    `/api/v2/account/${address}`).catch(() => null);

  const [{ data: acc }, knoten, { count: mined }, { count: poolAnzahl }, seite] =
    await Promise.all([
      sb.from('accounts').select('balance, nonce, first_height, last_height')
        .eq('address', key).maybeSingle(),
      vomKnoten,
      sb.from('transactions').select('block_height', { count: 'exact', head: true })
        .eq('to_addr', key).eq('type', 0),
      /*
        Coinbase mit mehreren Empfaengern: Bei Fassung 2 steht in to_addr
        NICHTS, die Aufteilung liegt in coinbase_outputs. Gezaehlt wird
        ueber alle Bloecke -- vorher war die Zahl an die 40 Verlaufseintraege
        gebunden und blieb bei 40 stehen.
      */
      sb.from('transactions').select('block_height', { count: 'exact', head: true })
        .contains('coinbase_outputs', JSON.stringify([{ to: key.replace(/^\\x/, '') }])),
      /*
        Erste Seite des Verlaufs (Migration 00021). Weitere Seiten holt die
        App ueber /api/v2/account/:adresse/verlauf mit dem Cursor
        historyWeiter -- so laesst sich der ganze Verlauf durchblaettern.
      */
      verlaufLaden(raw, 'alle', null, 40).catch(() => ({ eintraege: [], weiter: null })),
    ]);

  return NextResponse.json({
    address,
    balance: acc?.balance ?? '0',
    // Die naechste Nonce, die eine Transaktion tragen muss. Ohne sie kann
    // die Wallet nicht signieren.
    nonce: acc?.nonce ?? '0',
    // Die Nonce fuer die NAECHSTE Zahlung: Zustand plus eigene wartende.
    // Mit der reinen Zustands-Nonce wuerde eine zweite Zahlung vor der
    // Bestaetigung als Ersatz der ersten gelten und abgelehnt.
    nextNonce: knoten?.nextNonce
      ?? String(BigInt(acc?.nonce ?? '0')
                + BigInt((knoten?.pending ?? []).filter(p => p.kind === 'out').length)),
    firstHeight: acc?.first_height ?? null,
    lastHeight: acc?.last_height ?? null,
    pending: (knoten?.pending ?? []).map(p => ({
      txid: unprefix(p.txid), kind: p.kind, from: p.from, to: p.to,
      amount: p.amount, fee: p.fee, nonce: p.nonce, memo: unprefix(p.memo ?? '') || null,
    })),
    pendingSource: knoten ? 'fullnode' : 'unavailable',
    blocksFound: mined ?? 0,
    /** Bloecke, an deren Coinbase diese Adresse beteiligt war. */
    poolRewards: poolAnzahl ?? 0,
    history: seite.eintraege,
    /** Cursor fuer die naechste Seite, null = das ist schon alles. */
    historyWeiter: seite.weiter,
  }, { headers: CORS });
}
