import { fullnodeLesen } from './fullnode';
import { atomarLesen, mengenBerechnen, NULL_ADRESSE, type Mengen } from './umlauf';

/** Erzeugte Menge und Guthaben der Null-Adresse vom Full Node holen. */
export async function mengenLaden(): Promise<Mengen & { hoehe: number | null }> {
  const [summary, konto] = await Promise.all([
    fullnodeLesen<{ totalSupply?: unknown; height?: number }>('/api/v2/summary'),
    fullnodeLesen<{ balance?: unknown }>(`/api/v2/account/${NULL_ADRESSE}`),
  ]);
  const m = mengenBerechnen(
    atomarLesen(summary.totalSupply, 'totalSupply'),
    atomarLesen(konto.balance, 'balance'),
  );
  return { ...m, hoehe: typeof summary.height === 'number' ? summary.height : null };
}
