/**
 * Einen Pool-Knoten nach seinem Stand fragen: GET <pool>/api/v2/pool.
 *
 * Dieselbe Abfrage fuer beide Seiten -- der Server fragt die Pools der Liste
 * (lib/api/pools.ts), die App fragt den gewaehlten Pool unmittelbar vor dem
 * Start (hooks/usePoolAuswahl.ts). Was die Antwort bedeutet, entscheidet in
 * beiden Faellen standAusAntwort().
 *
 * Wirft nie: Keine Antwort, eine kaputte Antwort oder eine Umleitung ergeben
 * den Stand "aus". Einer Umleitung wird nicht gefolgt -- ein Pool, der
 * woandershin zeigt, ist nicht der Pool, der in der Liste steht.
 */
import { poolBasis, standAusAntwort, type PoolEintrag, type PoolStand } from './verzeichnis.ts';

export async function poolFragen(
  eintrag: PoolEintrag,
  opt: { address?: string | null; wartenMs?: number } = {},
): Promise<PoolStand> {
  const ab = new AbortController();
  const uhr = setTimeout(() => ab.abort(), opt.wartenMs ?? 4_000);
  try {
    const frage = opt.address ? `?address=${encodeURIComponent(opt.address)}` : '';
    const res = await fetch(`${poolBasis(eintrag.host)}/api/v2/pool${frage}`, {
      signal: ab.signal, cache: 'no-store', redirect: 'error',
    });
    const body = await res.json().catch(() => null);
    return standAusAntwort(eintrag, res.status, body);
  } catch {
    return standAusAntwort(eintrag, null, null);
  } finally {
    clearTimeout(uhr);
  }
}
