/**
 * Zentrale Browser-Schnittstelle zur YSKAR Fullnode.
 * NEXT_PUBLIC_MINING_BASE zeigt auf die Fullnode, z.B. https://yskar-main.dynv6.net
 * Die Fullnode ist die Wahrheit fuer alle oeffentlichen Blockchain-Daten.
 */
function normalisiereBasis(roh: string): string {
  const t = roh.trim().replace(/\/+$/, '');
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  return 'https://' + t;
}

export const FULLNODE_BASE = normalisiereBasis(process.env.NEXT_PUBLIC_MINING_BASE ?? '');

export function fullnodeUrl(path: string): string {
  if (!FULLNODE_BASE) {
    throw new Error('NEXT_PUBLIC_MINING_BASE ist nicht gesetzt. Die MiniApp kennt keine Fullnode-Adresse.');
  }
  const clean = path.startsWith('/') ? path : '/' + path;
  return FULLNODE_BASE + '/api/v2' + clean;
}

export async function fullnodeFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');

  const res = await fetch(fullnodeUrl(path), { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail ?? body.error ?? res.statusText);
  return body as T;
}
