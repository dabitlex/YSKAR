/**
 * Hilf YSKAR beim Wachsen -- Losliste und Ziehung.
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
 *     node --experimental-strip-types scripts/aktion-ziehung.ts liste
 *       Prueft alle offenen Empfehlungen ein letztes Mal, druckt die Losliste
 *       und ihren SHA-256. Am 14.02.2027 nach 00:00 UTC laufen lassen und
 *       Liste + Hash im Kanal veroeffentlichen.
 *
 *     node --experimental-strip-types scripts/aktion-ziehung.ts ziehen [--speichern]
 *       Nimmt den ersten Block nach dem 15.02.2027, 12:00 UTC, zieht die
 *       10 Gewinner und druckt sie. Mit --speichern landen sie in
 *       chain2.aktion_gewinner (dann sieht jeder Gewinner sein Ergebnis in
 *       der App). Danach im Community-Bot: /gewinner <Code> <Platz> <USD> <Adresse>.
 *
 * Nachrechnen kann jeder mit derselben Losliste und demselben Blockhash:
 * die Regel steht in src/lib/aktion/ziehung.ts.
 */
import { createClient } from '@supabase/supabase-js';
import { decodeAddress } from '../src/lib/core/address.ts';
import { toHex } from '../src/lib/core/codec.ts';
import { ZIEHUNG, PRUEF_ENDE, MINING_TAGE, fristFuer, lose } from '../src/lib/aktion/regeln.ts';
import { losliste, ziehen, type Eintrag } from '../src/lib/aktion/ziehung.ts';

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY setzen');
const db = createClient(url, key, { auth: { persistSession: false } }).schema('chain2');

interface Zeile { tg_fingerabdruck: string; adresse: string; code: string; geworben_von: string | null;
  angemeldet_am: string; status: string; mining_tage: number }

async function alle(): Promise<Zeile[]> {
  const out: Zeile[] = [];
  for (let von = 0; ; von += 1000) {
    const { data, error } = await db.from('aktion_teilnehmer').select('*').range(von, von + 999);
    if (error) throw new Error(error.message);
    out.push(...(data as Zeile[]));
    if (!data || data.length < 1000) return out;
  }
}

async function letztePruefung(zeilen: Zeile[]): Promise<Zeile[]> {
  const jetzt = Math.min(Date.now(), PRUEF_ENDE);
  for (const z of zeilen) {
    if (z.status !== 'offen') continue;
    const von = Date.parse(z.angemeldet_am);
    const bis = Math.min(fristFuer(von), jetzt);
    const { data } = await db.rpc('aktion_mining_tage', {
      p_addr: '\\x' + toHex(decodeAddress(z.adresse)), p_von: Math.floor(von / 1000), p_bis: Math.floor(bis / 1000),
    });
    const tage = typeof data === 'number' ? data : z.mining_tage;
    z.mining_tage = tage;
    z.status = tage >= MINING_TAGE ? 'bestaetigt' : (Date.now() >= fristFuer(von) ? 'ungueltig' : 'offen');
    await db.from('aktion_teilnehmer').update({
      status: z.status, mining_tage: tage, grund: z.status === 'ungueltig' ? 'frist' : null,
      bestaetigt_am: z.status === 'bestaetigt' ? new Date().toISOString() : null, geprueft_am: new Date().toISOString(),
    }).eq('tg_fingerabdruck', z.tg_fingerabdruck);
  }
  return zeilen;
}

function eintraege(zeilen: Zeile[]): Eintrag[] {
  const bestaetigtJeCode = new Map<string, number>();
  for (const z of zeilen) {
    if (z.status === 'bestaetigt' && z.geworben_von) {
      bestaetigtJeCode.set(z.geworben_von, (bestaetigtJeCode.get(z.geworben_von) ?? 0) + 1);
    }
  }
  return zeilen.map(z => ({ adresse: z.adresse, lose: lose(bestaetigtJeCode.get(z.code) ?? 0, z.status === 'bestaetigt') }));
}

const modus = process.argv[2];
const zeilen = await letztePruefung(await alle());
const liste = losliste(eintraege(zeilen));

if (modus === 'liste') {
  console.log(liste.text);
  console.log(`\nTeilnehmer mit Losen: ${liste.text ? liste.text.split('\n').length : 0}`);
  console.log(`SHA-256 der Losliste: ${liste.hash}`);
} else if (modus === 'ziehen') {
  const { data: block, error } = await db.from('blocks').select('height, hash, block_time')
    .gte('block_time', Math.floor(ZIEHUNG / 1000)).order('height', { ascending: true }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!block) throw new Error('Noch kein Block nach dem Ziehungszeitpunkt.');
  const hashHex = String(block.hash).replace(/^\\x/, '');
  const gewinner = ziehen(eintraege(zeilen), hashHex);
  console.log(`Block #${block.height}  Hash ${hashHex}`);
  console.log(`SHA-256 der Losliste: ${liste.hash}\n`);
  for (const g of gewinner) console.log(`${g.platz}. ${g.code}  ${g.betrag_usd} USD  ${g.adresse}`);
  console.log('\nFuer den Community-Bot (eine Nachricht):');
  console.log('/gewinner ' + gewinner.map(g => `${g.code} ${g.platz} ${g.betrag_usd} ${g.adresse}`).join('\n'));
  if (process.argv.includes('--speichern')) {
    const { error: e2 } = await db.from('aktion_gewinner').upsert(gewinner.map(g => ({
      platz: g.platz, adresse: g.adresse, code: g.code, betrag_usd: g.betrag_usd,
    })), { onConflict: 'platz' });
    if (e2) throw new Error(e2.message);
    console.log('\nGespeichert in chain2.aktion_gewinner.');
  }
} else {
  console.log('Aufruf: aktion-ziehung.ts liste | ziehen [--speichern]');
}
