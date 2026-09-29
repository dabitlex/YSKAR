/**
 * Kopfzeilen fuer das Einreichen von Bloecken bei der Gegenstelle.
 *
 * Seit der Umstellung ist POST /api/v2/block der einzige Schreibweg nach
 * Supabase. Setzt die Gegenstelle YSKAR_SPIEGEL_TOKEN, nimmt sie Bloecke
 * nur noch mit diesem Token an -- damit landet nur die eigene Kette im
 * Spiegel und nicht die eines Fremden.
 *
 * Ist die Umgebungsvariable hier nicht gesetzt, geht die Anfrage ohne
 * Token raus. Das ist der Zustand vor dem Abschliessen der Umstellung und
 * ausdruecklich in Ordnung, solange die Gegenstelle ebenfalls keinen
 * Token verlangt. Verlangt sie einen, antwortet sie mit 401 und sagt es --
 * ein stilles Danebenlaufen gibt es nicht.
 */
export function spiegelKopf(): Record<string, string> {
  const kopf: Record<string, string> = { 'content-type': 'application/json' };
  const token = process.env.YSKAR_SPIEGEL_TOKEN?.trim();
  if (token) kopf.authorization = `Bearer ${token}`;
  return kopf;
}
