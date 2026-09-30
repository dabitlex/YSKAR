import { NextResponse } from 'next/server';
import { db } from '@/lib/db/service';
import { NEUIGKEITEN_DE, NEUIGKEITEN_EN } from '@/content/entdecken';

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
  datum: string;      // ISO JJJJ-MM-TT -- die App formatiert je Sprache
  titel: string;
  text: string;
  link: string | null;
}

/**
 * GET /api/v2/news?sprache=de|en -- Neuigkeiten, neueste zuerst.
 *
 * Aus der Tabelle; ist sie leer oder nicht erreichbar, die Meldungen aus
 * dem Quelltext. So hat der Reiter „Entdecken" nie eine leere Liste.
 * Englisch kommt aus den Spalten titel_en/text_en (Migration 00019); fehlen
 * sie fuer einen Eintrag, bleibt der deutsche Text.
 */
export async function GET(req: Request) {
  // Deutsch bekommt den deutschen Text; jede andere Sprache die englische
  // Fassung, sofern vorhanden -- andere Uebersetzungen gibt es in der Tabelle nicht.
  const roh = new URL(req.url).searchParams.get('sprache') ?? 'en';
  const sprache = roh === 'de' ? 'de' : 'en';
  try {
    const { data, error } = await db().schema('chain2').from('news')
      .select('*').order('datum', { ascending: false })
      .order('id', { ascending: false }).limit(20);
    if (!error && data && data.length) {
      const liste: NewsEintrag[] = data.map(n => ({
        id: n.id, datum: String(n.datum).slice(0, 10),
        titel: (sprache === 'en' && n.titel_en) || n.titel,
        text: (sprache === 'en' && n.text_en) || n.text,
        link: n.link ?? null,
      }));
      return NextResponse.json({ news: liste, quelle: 'db' }, { headers: CORS });
    }
  } catch { /* Fallback unten */ }
  const code = sprache === 'en' ? NEUIGKEITEN_EN : NEUIGKEITEN_DE;
  return NextResponse.json({
    news: code.map(n => ({ id: null, datum: n.datum, titel: n.titel, text: n.text, link: n.link ?? null })),
    quelle: 'code',
  }, { headers: CORS });
}

/**
 * POST /api/v2/news  { titel, text, titel_en?, text_en?, link?, push? }   Authorization: Bearer <YSKAR_ADMIN_TOKEN>
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
  let body: { titel?: unknown; text?: unknown; link?: unknown; push?: unknown; datum?: unknown;
              titel_en?: unknown; text_en?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'malformed' }, { status: 400, headers: CORS });
  }
  const titel = typeof body.titel === 'string' ? body.titel.trim().slice(0, 120) : '';
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 2000) : '';
  if (!titel || !text) return NextResponse.json({ error: 'missing_fields' }, { status: 400, headers: CORS });
  const eintrag = {
    titel, text,
    titel_en: typeof body.titel_en === 'string' ? body.titel_en.trim().slice(0, 120) || null : null,
    text_en: typeof body.text_en === 'string' ? body.text_en.trim().slice(0, 2000) || null : null,
    link: typeof body.link === 'string' && /^https?:\/\//.test(body.link) ? body.link.slice(0, 500) : null,
    push: body.push === true,
    ...(typeof body.datum === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.datum) ? { datum: body.datum } : {}),
  };
  const { data, error } = await db().schema('chain2').from('news').insert(eintrag).select('id').single();
  if (error) return NextResponse.json({ error: 'db', detail: error.message }, { status: 500, headers: CORS });
  return NextResponse.json({ ok: true, id: data.id }, { headers: CORS });
}
