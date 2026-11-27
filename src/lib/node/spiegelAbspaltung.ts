import { db } from '../db/service.ts';
import { unprefix } from './hex.ts';

/**
 * Abspaltungen im Spiegel erkennen und zuruecknehmen.
 *
 * Finden zwei Miner fast gleichzeitig einen Block derselben Hoehe, kann der
 * Spiegel den Block uebernehmen, den die Kette danach verwirft (27.11.2026,
 * Hoehe 10991). Jeder folgende Block zeigt dann auf einen Vorgaenger, den
 * der Spiegel nicht hat -- ohne Rueckbau stuende er fuer immer still.
 *
 * Wer entscheidet, welcher Block der richtige ist: der eigene Full Node
 * (YSKAR_FULLNODE_URL), nie der Einreicher. Zurueckgenommen wird nur, wenn
 * der Knoten bestaetigt, dass
 *   1. der Kopf des Spiegels NICHT auf seiner Hauptkette liegt, und
 *   2. der eingereichte Block auf seiner Hauptkette aufbaut.
 * Ein Fremder kann den Spiegel also nicht rueckwaerts schieben: Er braeuchte
 * dafuer die Zustimmung des Knotens.
 *
 * Den Rueckbau selbst macht chain2.spiegel_zurueck (Migration 00030) aus
 * einem Journal, das commit_block je Block mitschreibt. Ob er stimmt, zeigt
 * der naechste Block: Die Route rechnet die Zustandswurzel nach.
 */

/** So tief reicht das Journal in der Datenbank (00030). */
export const RUECKBAU_TIEFE = 100;

export interface KopfEintrag { height: number; hash: string }

export type Entscheidung =
  | { art: 'zurueck'; bis: number }
  | { art: 'keine'; grund: 'knoten_kennt_hoehe_nicht' | 'spiegel_kopf_ist_hauptkette' | 'block_nicht_auf_hauptkette' | 'zu_tief' };

/**
 * Reine Entscheidung, ohne Netz und Datenbank -- damit sie sich pruefen laesst.
 *
 * @param kopf     Kopf des Spiegels
 * @param block    eingereichter Block (Hoehe und Vorgaenger)
 * @param spiegel  Hashes des Spiegels, oberste RUECKBAU_TIEFE Hoehen
 * @param knoten   Hashes der Hauptkette des Knotens, gleiche Hoehen
 */
export function entscheide(
  kopf: KopfEintrag,
  block: { height: number; prevHash: string },
  spiegel: KopfEintrag[],
  knoten: KopfEintrag[],
): Entscheidung {
  const amKnoten = new Map(knoten.map(k => [k.height, k.hash.toLowerCase()]));

  const knotenAmKopf = amKnoten.get(kopf.height);
  const knotenDarunter = amKnoten.get(block.height - 1);
  if (knotenAmKopf === undefined || knotenDarunter === undefined) {
    return { art: 'keine', grund: 'knoten_kennt_hoehe_nicht' };
  }
  if (knotenAmKopf === kopf.hash.toLowerCase()) {
    return { art: 'keine', grund: 'spiegel_kopf_ist_hauptkette' };
  }
  if (knotenDarunter !== block.prevHash.toLowerCase()) {
    return { art: 'keine', grund: 'block_nicht_auf_hauptkette' };
  }

  // Hoechste Hoehe, auf der beide denselben Block haben.
  let bis: number | null = null;
  for (const s of spiegel) {
    if (amKnoten.get(s.height) === s.hash.toLowerCase() && (bis === null || s.height > bis)) bis = s.height;
  }
  if (bis === null || kopf.height - bis > RUECKBAU_TIEFE) return { art: 'keine', grund: 'zu_tief' };
  return { art: 'zurueck', bis };
}

/** So lange darf der Knoten fuer die Hash-Liste brauchen; die Route wartet nicht ewig. */
const KNOTEN_FRIST_MS = 5_000;

/** Hauptkette des eigenen Knotens, oberste Hoehen ab `kopf` abwaerts. */
async function knotenHashes(kopf: number): Promise<KopfEintrag[]> {
  const basis = process.env.YSKAR_FULLNODE_URL?.trim().replace(/\/+$/, '');
  if (!basis) throw new Error('YSKAR_FULLNODE_URL ist nicht gesetzt');
  const res = await fetch(`${basis}/api/v2/blocks?before=${kopf + 1}&limit=${RUECKBAU_TIEFE}`,
    { cache: 'no-store', signal: AbortSignal.timeout(KNOTEN_FRIST_MS) });
  if (!res.ok) throw new Error(`Full Node antwortete mit HTTP ${res.status}`);
  const r = await res.json() as { blocks?: { height: number; hash: string }[] };
  if (!Array.isArray(r.blocks)) throw new Error('Antwort des Full Node ohne Blockliste');
  return r.blocks.map(b => ({ height: Number(b.height), hash: String(b.hash) }));
}

export type Ergebnis =
  | { zurueckgenommen: true; bis: number; entfernt: number }
  | { zurueckgenommen: false; grund: string };

/**
 * Prueft beim Knoten und nimmt, wenn noetig, die Abspaltung zurueck.
 * Wirft nie: Jeder Fehler endet als "nicht zurueckgenommen" mit Grund, und
 * die Route antwortet wie bisher.
 */
export async function abspaltungZuruecknehmen(
  kopf: KopfEintrag,
  block: { height: number; prevHash: string },
): Promise<Ergebnis> {
  try {
    const [knoten, spiegel] = await Promise.all([
      knotenHashes(kopf.height),
      db().schema('chain2').from('blocks').select('height, hash')
        .gt('height', kopf.height - RUECKBAU_TIEFE)
        .order('height', { ascending: false }).limit(RUECKBAU_TIEFE),
    ]);
    if (spiegel.error) return { zurueckgenommen: false, grund: `spiegel_lesen: ${spiegel.error.message}` };

    const e = entscheide(
      kopf, block,
      (spiegel.data ?? []).map(r => ({ height: r.height as number, hash: unprefix(r.hash as string) })),
      knoten,
    );
    if (e.art === 'keine') return { zurueckgenommen: false, grund: e.grund };

    const { data, error } = await db().schema('chain2').rpc('spiegel_zurueck', {
      p_bis: e.bis,
      p_kopf_hash: '\\x' + kopf.hash.toLowerCase(),
    });
    if (error) return { zurueckgenommen: false, grund: `spiegel_zurueck: ${error.message}` };
    const r = data as { bis: number; entfernt: number };
    return { zurueckgenommen: true, bis: r.bis, entfernt: r.entfernt };
  } catch (err) {
    return { zurueckgenommen: false, grund: err instanceof Error ? err.message : String(err) };
  }
}
