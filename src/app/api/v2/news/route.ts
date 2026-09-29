import { NextResponse } from 'next/server';
import { db } from '@/lib/db/service';
import { NEUIGKEITEN } from '@/content/entdecken';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
};
export async function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

export interface NewsEintrag {
  id: number | null;
  datum: string;      // TT.MM.JJJJ
  titel: string;
  text: string;
  link: string | null;
}

const deutsch = (iso: string) => {
  const [j, m, t] = iso.slice(0, 10).split('-');
  return `${t}.${m}.${j}`;
};

/**
 * GET /api/v2/news -- Neuigkeiten, neueste zuerst.
 *
 * Aus der Tabelle; ist sie leer oder nicht erreichbar, die Meldungen aus
 * dem Quelltext. So hat der Reiter „Entdecken" nie eine leere Liste.
 */
export async function GET() {
  try {
    const { data, error } = await db().schema('chain2').from('news')
      .select('id, datum, titel, text, link').order('datum', { ascending: false })
      .order('id', { ascending: false }).limit(20);
    if (!error && data && data.length) {
      const liste: NewsEintrag[] = data.map(n => ({
        id: n.id, datum: deutsch(String(n.datum)), titel: n.titel, text: n.text, link: n.link ?? null,
      }));
      return NextResponse.json({ news: liste, quelle: 'db' }, { headers: CORS });
    }
  } catch { /* Fallback unten */ }
  return NextResponse.json({
    news: NEUIGKEITEN.map(n => ({ id: null, ...n, link: null })), quelle: 'code',
  }, { headers: CORS });
}

/**
 * POST /api/v2/news  { titel, text, link?, push? }   Authorization: Bearer <YSKAR_ADMIN_TOKEN>
 *
 * Legt eine Meldung an. Mit push=true nimmt der Watcher sie beim naechsten
 * Durchlauf und schickt sie an alle angemeldeten Geraete -- der Versand
 * passiert nicht hier, damit ein langsamer FCM-Aufruf nie die Route blockiert.
 */
export async function POST(req: Request) {
  const soll = process.env.YSKAR_ADMIN_TOKEN?.trim();
  const ist = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!soll || !ist || ist !== soll) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: CORS });
  }
  let body: { titel?: unknown; text?: unknown; link?: unknown; push?: unknown; datum?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'malformed' }, { status: 400, headers: CORS });
  }
  const titel = typeof body.titel === 'string' ? body.titel.trim().slice(0, 120) : '';
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 2000) : '';
  if (!titel || !text) return NextResponse.json({ error: 'missing_fields' }, { status: 400, headers: CORS });
  const eintrag = {
    titel, text,
    link: typeof body.link === 'string' && /^https?:\/\//.test(body.link) ? body.link.slice(0, 500) : null,
    push: body.push === true,
    ...(typeof body.datum === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.datum) ? { datum: body.datum } : {}),
  };
  const { data, error } = await db().schema('chain2').from('news').insert(eintrag).select('id').single();
  if (error) return NextResponse.json({ error: 'db', detail: error.message }, { status: 500, headers: CORS });
  return NextResponse.json({ ok: true, id: data.id }, { headers: CORS });
}
