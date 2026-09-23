import { NextResponse } from 'next/server';
import { loadMempool, loadState } from '@/lib/node/store';
import { marktlage, position } from '@/lib/core/feemarket';
import { MIN_FEE } from '@/lib/core/params';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = { 'access-control-allow-origin': '*' };

/**
 * GET /api/v2/fees[?fee=<betrag>]
 *
 * Auskunft ueber die Marktlage. KEINE Konsensregel -- nichts hier
 * entscheidet, ob eine Transaktion gueltig ist. Wer weniger als die
 * empfohlene Gebuehr zahlt, wartet laenger; abgelehnt wird er nicht.
 *
 * Mit ?fee=<betrag> kommt zusaetzlich die Position in der Warteschlange.
 */
export async function GET(req: Request) {
  const { state, height } = await loadState();
  const mempool = await loadMempool();

  const m = marktlage(state, mempool, height + 1);

  const roh = new URL(req.url).searchParams.get('fee');
  let eigene = null;
  if (roh !== null && /^\d+$/.test(roh)) {
    const p = position(mempool, BigInt(roh));
    eigene = { fee: roh, rang: p.rang, von: p.von };
  }

  return NextResponse.json({
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
    /*
      Ausdruecklich dabei: Die Schaetzung gilt unter der Annahme, dass
      nichts Neues dazukommt. Wer sie als Zusage liest, wird enttaeuscht --
      und das ist dann nicht die Schuld des Lesers.
    */
    hinweis: m.andrang
      ? 'Voraussichtlich, unter der Annahme dass nichts Neues dazukommt.'
      : 'Kein Andrang -- die Mindestgebühr genügt für den nächsten Block.',
  }, { headers: CORS });
}
