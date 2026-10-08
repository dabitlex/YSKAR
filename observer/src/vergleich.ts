/**
 * Den Spiegel mit einer zweiten Quelle vergleichen (Issue #14).
 *
 * Der Beobachter prueft jeden Block, den der Spiegel liefert, vollstaendig.
 * Was er allein nicht sehen kann: ob das die Kette ist, der das Netz folgt.
 * Ein Spiegel, der zurueckliegt oder auf einem anderen gueltigen Zweig
 * sitzt, liefert nur gueltige Bloecke. Ein Full Node weiss es -- also wird
 * dessen Kopf mit dem eigenen verglichen.
 *
 * Gefragt wird die zweite Quelle nur nach /summary (Hoehe, tipHash) und
 * hoechstens einem Block (/sync?from=h&count=1). Ihre Antworten werden
 * NICHT als Bloecke geprueft -- sie dienen nur dem Vergleich der Hashes,
 * und ein Unterschied wird gemeldet, nicht entschieden.
 */

export type Vergleich =
  | { art: 'gleich'; hoehe: number }
  | { art: 'spiegel_hinten'; hoehe: number; quelleHoehe: number }
  | { art: 'quelle_hinten'; hoehe: number; quelleHoehe: number }
  | { art: 'anderer_block'; hoehe: number; spiegel: string; quelle: string }
  | { art: 'fehler'; detail: string };

type Hole = (basis: string, pfad: string) => Promise<Record<string, unknown>>;

const HASH = /^[0-9a-f]{64}$/;
const ohne0x = (x: unknown) => typeof x === 'string' ? x.replace(/^\\x|^0x/, '').toLowerCase() : '';

/**
 * Den eigenen Stand (zuletzt gepruefte Hoehe und ihr Hash) mit `quelle`
 * vergleichen.
 *
 * @param hoehe    die zuletzt geprueft Hoehe des Beobachters (-1: noch nichts)
 * @param tipHash  der Hash des Blocks auf dieser Hoehe
 */
export async function vergleiche(hole: Hole, quelle: string, hoehe: number, tipHash: string | null): Promise<Vergleich> {
  if (hoehe < 0 || !tipHash) return { art: 'gleich', hoehe };
  try {
    const s = await hole(quelle, '/summary');
    const qh = Number(s.height);
    if (!Number.isInteger(qh) || qh < 0) return { art: 'fehler', detail: 'Antwort ohne Höhe' };

    if (qh < hoehe) return { art: 'quelle_hinten', hoehe, quelleHoehe: qh };

    // Den Block der Quelle auf UNSERER Hoehe. Auf gleicher Hoehe reicht ihr tipHash.
    let ihrer = qh === hoehe ? ohne0x(s.tipHash) : '';
    if (!HASH.test(ihrer)) {
      const r = await hole(quelle, `/sync?from=${hoehe}&count=1`);
      const b = Array.isArray(r.blocks) ? r.blocks[0] as Record<string, unknown> | undefined : undefined;
      if (!b || Number(b.height) !== hoehe) return { art: 'fehler', detail: `kein Block ${hoehe} von der Quelle` };
      ihrer = ohne0x(b.hash);
      if (!HASH.test(ihrer)) return { art: 'fehler', detail: 'unlesbarer Hash von der Quelle' };
    }
    if (ihrer !== tipHash.toLowerCase()) return { art: 'anderer_block', hoehe, spiegel: tipHash, quelle: ihrer };
    if (qh > hoehe) return { art: 'spiegel_hinten', hoehe, quelleHoehe: qh };
    return { art: 'gleich', hoehe };
  } catch (e) {
    return { art: 'fehler', detail: (e as Error).message };
  }
}

/** Ein Satz fuer das Protokoll. */
export function beschreibe(v: Vergleich, quelle: string): string {
  switch (v.art) {
    case 'gleich': return `Spiegel und ${quelle} stimmen überein (Höhe ${v.hoehe})`;
    case 'spiegel_hinten': return `Spiegel liegt ${v.quelleHoehe - v.hoehe} Block/Blöcke hinter ${quelle} (${v.hoehe} gegen ${v.quelleHoehe}); bis dahin gleich`;
    case 'quelle_hinten': return `${quelle} liegt zurück (Höhe ${v.quelleHoehe}, Spiegel ${v.hoehe}) — kein Vergleich`;
    case 'anderer_block': return `ANDERER ZWEIG: Höhe ${v.hoehe}, Spiegel ${v.spiegel.slice(0, 16)}…, ${quelle} ${v.quelle.slice(0, 16)}…`;
    case 'fehler': return `Vergleich mit ${quelle} nicht möglich: ${v.detail}`;
  }
}
