/**
 * STILLGELEGT -- diese Route gehoert dem Full Node.
 *
 * Bis September 2026 lief hier ein Teil des Minings ueber Supabase. Seit
 * der Umstellung ist der Full Node die einzige Stelle, die Arbeit verteilt
 * und Transaktionen annimmt. Supabase haelt nur noch einen Lesespiegel der
 * Kette fuer den Explorer.
 *
 * Die Begruendung und das Antwortformat stehen in src/lib/api/stillgelegt.ts.
 */
import { stillgelegt } from '@/lib/api/stillgelegt';

export { OPTIONS } from '@/lib/api/stillgelegt';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ZIEL = '/api/v2/share';

export async function POST() { return stillgelegt(ZIEL); }
