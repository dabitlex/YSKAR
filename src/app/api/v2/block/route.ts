import { NextResponse } from 'next/server';

import { deserializeBlock, headerHash, checkBlockStructure } from '@/lib/core/block';
import { coinbaseTotal, type Coinbase } from '@/lib/core/tx';
import { validateBlock } from '@/lib/core/validate';
import { applyBlock, cloneState, stateRoot } from '@/lib/core/state';
import { toHex, fromHex } from '@/lib/core/codec';
import { LWMA_WINDOW } from '@/lib/core/params';
import { loadTip, loadState, loadTimings, commitBlock } from '@/lib/node/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

/**
 * POST /api/v2/block   { raw: "<hex>" }
 *
 * Nimmt einen Block von einem fremden Knoten entgegen.
 *
 * Bis hierher konnte nur der Server selbst Bloecke erzeugen -- ein Full
 * Node konnte die Kette pruefen, aber nichts zu ihr beitragen. Ein lokal
 * gefundener Block lag auf dem Rechner seines Finders und wurde beim
 * naechsten Block der anderen Seite verdraengt.
 *
 * WAS HIER NICHT PASSIERT: Dem Einreicher wird nichts geglaubt. Kein Feld
 * aus seiner Anfrage wird uebernommen -- nur die rohen Bytes. Hoehe,
 * Difficulty, Merkle-Wurzel, Signaturen, Guthaben und Zustandswurzel
 * rechnet dieser Knoten selbst nach, mit derselben Funktion, die auch die
 * eigenen Bloecke prueft.
 *
 * Damit ist die Route offen: Sie braucht keine Anmeldung, weil sie nichts
 * gewaehrt, was nicht ohnehin durch Arbeit gedeckt waere. Wer einen
 * gueltigen Block einreicht, hat ihn gemint.
 */

/** 1 MB. Ein Block mit 2.000 Transaktionen liegt bei rund 350 KB. */
const MAX_BYTES = 1_048_576;

export async function POST(req: Request) {
  let body: { raw?: string };
  try { body = await req.json(); }
  catch { return fail('bad_json'); }

  if (typeof body.raw !== 'string') return fail('missing_raw');
  if (body.raw.length > MAX_BYTES * 2) return fail('too_large');
  if (!/^[0-9a-fA-F]*$/.test(body.raw) || body.raw.length % 2 !== 0) {
    return fail('not_hex');
  }

  let roh: Uint8Array;
  try { roh = fromHex(body.raw); }
  catch { return fail('not_hex'); }

  let block;
  try { block = deserializeBlock(roh); }
  catch (e) { return fail('malformed', String((e as Error).message)); }

  // Billig vor teuer: Struktur und Proof of Work kosten Mikrosekunden,
  // die Signaturen Millisekunden, der Datenbankzugriff noch mehr.
  const strukturfehler = checkBlockStructure(block);
  if (strukturfehler) return fail('structure', strukturfehler);

  const hash = toHex(headerHash(block.header));

  let tip, zustand, zeiten;
  try {
    [tip, zustand, zeiten] = await Promise.all([
      loadTip(),
      loadState(),
      loadTimings(LWMA_WINDOW),
    ]);
  } catch (e) {
    // Lesefehler duerfen nie als "leere Kette" durchgehen -- sonst wuerde
    // hier ein zweiter Genesis angenommen.
    return NextResponse.json(
      { accepted: false, reason: 'chain_unreachable', detail: String((e as Error).message) },
      { status: 503, headers: CORS });
  }

  const erwarteteHoehe = (tip?.height ?? -1) + 1;

  if (block.header.height <= (tip?.height ?? -1)) {
    // Kein Fehler des Einreichers: Er war nur zu spaet. Das kommt bei zwei
    // Produzenten regelmaessig vor und ist kein Grund fuer eine Strafe.
    return NextResponse.json({
      accepted: false, reason: 'stale',
      detail: `Höhe ${block.header.height}, Kette steht bei ${tip?.height ?? -1}`,
      tipHeight: tip?.height ?? -1,
      tipHash: tip ? toHex(tip.hash) : null,
    }, { headers: CORS });
  }

  if (block.header.height !== erwarteteHoehe) {
    return NextResponse.json({
      accepted: false, reason: 'height_gap',
      detail: `Höhe ${block.header.height}, erwartet ${erwarteteHoehe}`,
      tipHeight: tip?.height ?? -1,
    }, { headers: CORS });
  }

  if (tip && toHex(block.header.prevHash) !== toHex(tip.hash)) {
    return NextResponse.json({
      accepted: false, reason: 'wrong_parent',
      detail: `zeigt auf ${toHex(block.header.prevHash).slice(0, 16)}…`,
      tipHash: toHex(tip.hash),
    }, { headers: CORS });
  }

  // Volle Konsenspruefung -- dieselbe Funktion wie fuer eigene Bloecke.
  const state = zustand.state;
  const fehler = validateBlock(block, {
    previous: tip?.header ?? null,
    state,
    recentTimestamps: zeiten.timestamps.slice(-11),
    recentTimings: zeiten.timings,
    now: BigInt(Math.floor(Date.now() / 1000)),
  });
  if (fehler) return fail(fehler.code, fehler.detail);

  const vorher = cloneState(state);
  const angewandt = applyBlock(state, block);
  if (!angewandt.ok) return fail('apply_failed', angewandt.error?.reason);

  const meine = toHex(stateRoot(state));
  if (meine !== toHex(block.header.stateRoot)) {
    return fail('state_root', `errechnet ${meine.slice(0, 16)}…`);
  }

  let committed;
  try {
    committed = await commitBlock(block, vorher, state);
  } catch (e) {
    // Zwischen Pruefung und Festschreiben kann ein anderer Block gewonnen
    // haben. Die Datenbank erzwingt die Verkettung, also faellt das hier
    // auf und nicht erst spaeter.
    return NextResponse.json({
      accepted: false, reason: 'commit_failed',
      detail: String((e as Error).message),
    }, { status: 409, headers: CORS });
  }

  const coinbase = block.txs[0] as Coinbase;

  return NextResponse.json({
    accepted: true,
    height: committed.height,
    hash,
    txs: committed.txs,
    reward: coinbaseTotal(coinbase).toString(),
    // Bei mehreren Empfaengern alle nennen -- eine einzelne Adresse waere
    // hier irrefuehrend.
    recipients: coinbase.outputs.map(o => ({
      address: toHex(o.to), amount: o.amount.toString(),
    })),
  }, { headers: CORS });
}

function fail(reason: string, detail?: string) {
  return NextResponse.json({ accepted: false, reason, detail },
    { status: 400, headers: CORS });
}
