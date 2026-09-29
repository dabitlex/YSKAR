/**
 * Lesezugriff auf den Full Node von der Serverseite aus.
 *
 * Seit der Umstellung ist der Full Node die Wahrheit. Supabase haelt nur
 * noch einen Spiegel der festgeschriebenen Kette -- und zwar ausdruecklich
 * NICHT den Mempool, denn der ist fluechtig und wird nicht gespiegelt. Jede
 * Route, deren Antwort von etwas Fluechtigem abhaengt (Gebuehrenlage,
 * Kennzahlen, aktive Miner), muss den Knoten fragen.
 *
 * Wer das aus dem Spiegel beantwortet, bekommt eine Antwort, die aussieht
 * wie eine Auskunft und eine Vermutung ist.
 */

export class FullnodeFehler extends Error {
  constructor(
    readonly code: 'fullnode_not_configured' | 'chain_unreachable',
    message: string,
  ) {
    super(message);
  }
}

/** Die konfigurierte Adresse, ohne abschliessenden Schraegstrich. */
export function fullnodeBasis(): string {
  const roh = process.env.YSKAR_FULLNODE_URL?.trim();
  if (!roh) {
    throw new FullnodeFehler(
      'fullnode_not_configured',
      'YSKAR_FULLNODE_URL ist nicht gesetzt.',
    );
  }
  return roh.replace(/\/+$/, '');
}

/**
 * Einen Lesepfad am Full Node abfragen.
 *
 * `pfad` beginnt mit einem Schraegstrich und ist derselbe Pfad wie hier,
 * z.B. '/api/v2/fees'. Fehler kommen als FullnodeFehler zurueck, damit der
 * Aufrufer sie von einem leeren Ergebnis unterscheiden kann -- ein nicht
 * erreichbarer Knoten darf nie als "nichts los" durchgehen.
 */
export async function fullnodeLesen<T = unknown>(pfad: string): Promise<T> {
  const basis = fullnodeBasis();

  let res: Response;
  try {
    res = await fetch(basis + pfad, { cache: 'no-store' });
  } catch (e) {
    throw new FullnodeFehler(
      'chain_unreachable',
      e instanceof Error ? e.message : 'Full Node nicht erreichbar',
    );
  }

  if (!res.ok) {
    throw new FullnodeFehler('chain_unreachable', `Full Node antwortete mit HTTP ${res.status}`);
  }

  try {
    return await res.json() as T;
  } catch {
    throw new FullnodeFehler('chain_unreachable', 'Antwort des Full Node war kein JSON');
  }
}
