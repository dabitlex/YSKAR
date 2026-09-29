/**
 * Push-Watcher: beobachtet den Full Node und benachrichtigt Geraete.
 *
 * Laeuft als Dienst neben einem Knoten (systemd, siehe docs/APP.md), nicht
 * auf Vercel: Der Takt ist Sekunden, und "wirklich live" heisst, dass die
 * Meldung kommt, wenn die Zahlung im Mempool auftaucht -- nicht beim
 * naechsten Cron.
 *
 *   node --experimental-strip-types scripts/push-watcher.ts
 *
 * Umgebung:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   Geraeteliste, Stand, News
 *   YSKAR_FULLNODE_URL                                    z.B. https://yskar-main.dynv6.net
 *   FCM_SERVICE_ACCOUNT_FILE                              Pfad zur JSON des Firebase-Dienstkontos
 *   PUSH_TAKT_MS                                          Abfrageintervall, Vorgabe 8000
 *
 * Was er tut, je Durchlauf:
 *   1. Geraeteliste laden.
 *   2. Neue Bloecke seit dem letzten Stand: Ereignisse "ok" und "block".
 *   3. Je registrierte Adresse: wartende Eingaenge -> Ereignis "in".
 *   4. Neuigkeiten mit push=true und ohne gepusht -> an alle.
 *   5. Jedes Ereignis genau einmal je Geraet (push_versendet).
 * Tokens, die FCM als ungueltig meldet, werden ausgetragen.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { Fcm } from '../src/lib/push/fcm.ts';
import { ausBlock, ausMempool, ausNews, type Geraet, type BlockAnsicht, type Wartend, type Ereignis }
  from '../src/lib/push/ereignisse.ts';

const env = (k: string, pflicht = true) => {
  const v = process.env[k]?.trim();
  if (!v && pflicht) { console.error(`${k} fehlt`); process.exit(2); }
  return v ?? '';
};

const KNOTEN = env('YSKAR_FULLNODE_URL').replace(/\/+$/, '');
const TAKT = Number(env('PUSH_TAKT_MS', false) || 8000);
const sb = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'),
                        { auth: { persistSession: false } }).schema('chain2');
const fcm = Fcm.ausJson(readFileSync(env('FCM_SERVICE_ACCOUNT_FILE'), 'utf8'));

async function knoten<T>(pfad: string): Promise<T | null> {
  try {
    const r = await fetch(`${KNOTEN}/api/v2${pfad}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    return await r.json() as T;
  } catch { return null; }
}

async function stand(schluessel: string): Promise<string | null> {
  const { data } = await sb.from('push_stand').select('wert').eq('schluessel', schluessel).maybeSingle();
  return data?.wert ?? null;
}
async function setzeStand(schluessel: string, wert: string) {
  await sb.from('push_stand').upsert({ schluessel, wert }, { onConflict: 'schluessel' });
}

async function schonGesendet(token: string, schluessel: string): Promise<boolean> {
  const { data } = await sb.from('push_versendet').select('token')
    .eq('token', token).eq('ereignis', schluessel).maybeSingle();
  return !!data;
}

async function zustellen(e: Ereignis) {
  if (await schonGesendet(e.token, e.schluessel)) return;
  const r = await fcm.senden(e.token, e.nachricht);
  if (r.ok) {
    await sb.from('push_versendet').insert({ token: e.token, ereignis: e.schluessel });
    console.log(`→ ${e.schluessel} an ${e.token.slice(0, 12)}…`);
    return;
  }
  if (r.ungueltig) {
    await sb.from('push_geraete').delete().eq('token', e.token);
    console.log(`✗ Token tot, ausgetragen: ${e.token.slice(0, 12)}…`);
    return;
  }
  console.error(`! ${e.schluessel}: HTTP ${r.status} ${r.grund}`);
}

async function durchlauf() {
  const { data: geraeteRoh, error } = await sb.from('push_geraete').select('token, address, sprache');
  if (error) { console.error('Geraeteliste:', error.message); return; }
  const geraete = (geraeteRoh ?? []) as Geraet[];
  if (!geraete.length) return;

  // 2. Bloecke
  const zusammen = await knoten<{ height: number | null }>('/summary');
  if (zusammen?.height != null) {
    const letzte = Number(await stand('hoehe') ?? zusammen.height - 1);
    // Nach langer Pause nicht die ganze Kette nachmelden: hoechstens 50 Bloecke.
    const von = Math.max(letzte + 1, zusammen.height - 50);
    for (let h = von; h <= zusammen.height; h++) {
      const b = await knoten<BlockAnsicht>(`/blocks/${h}`);
      if (!b) break;
      for (const e of ausBlock(b, geraete)) await zustellen(e);
      await setzeStand('hoehe', String(h));
    }
  }

  // 3. Mempool je Adresse
  for (const adr of new Set(geraete.map(g => g.address))) {
    const k = await knoten<{ pending?: Wartend[] }>(`/account/${adr}`);
    if (!k?.pending?.length) continue;
    for (const e of ausMempool(adr, k.pending, geraete)) await zustellen(e);
  }

  // 4. News
  const { data: news } = await sb.from('news').select('id, titel, text, link')
    .eq('push', true).is('gepusht', null).order('id').limit(5);
  for (const n of news ?? []) {
    for (const e of ausNews(n, geraete)) await zustellen(e);
    await sb.from('news').update({ gepusht: new Date().toISOString() }).eq('id', n.id);
  }
}

async function aufraeumen() {
  const vor30 = new Date(Date.now() - 30 * 86400_000).toISOString();
  await sb.from('push_versendet').delete().lt('gesendet', vor30);
}

console.log(`Push-Watcher: Knoten ${KNOTEN}, Takt ${TAKT} ms`);
let laeuft = false;
setInterval(async () => {
  if (laeuft) return;
  laeuft = true;
  try { await durchlauf(); } catch (e) { console.error('Durchlauf:', (e as Error).message); }
  laeuft = false;
}, TAKT);
setInterval(() => aufraeumen().catch(() => {}), 6 * 3600_000);
durchlauf().catch(e => console.error(e));
