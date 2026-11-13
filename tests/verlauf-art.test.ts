/**
 * Verlauf nach Art: nur Mining oder nur Ueberweisungen, seitenweise.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { artAus, passtZurArt, nachArt, SEITE, type ArtEintrag, type ArtSeite } from '../src/lib/api/verlaufArt.ts';

type E = ArtEintrag;

/** Ein Verlauf, neueste zuerst: Hoehe n-1 … 0, je ein Eintrag. `art(h)` bestimmt die Art. */
function verlauf(n: number, art: (h: number) => E['kind']): E[] {
  return Array.from({ length: n }, (_, i) => ({ height: n - 1 - i, idx: 0, kind: art(n - 1 - i) }));
}

/** Abruf wie die Datenbank: ab Cursor, hoechstens `limit`, Cursor nur bei voller Seite. */
function abruf(alle: E[]) {
  const aufrufe: (string | null)[] = [];
  const laden = async (vor: string | null, limit: number): Promise<ArtSeite<E>> => {
    aufrufe.push(vor);
    const ab = vor === null ? 0 : alle.findIndex(e => `${e.height}:${e.idx}` === vor) + 1;
    const teil = alle.slice(ab, ab + limit);
    const letzter = teil[teil.length - 1];
    return { eintraege: teil, weiter: teil.length === limit && letzter ? `${letzter.height}:${letzter.idx}` : null };
  };
  return { laden, aufrufe };
}

/** Alle Seiten nacheinander holen, wie die App es tut. */
async function alles(alle: E[], art: 'mining' | 'transfer', limit: number, seitenMax?: number) {
  const { laden, aufrufe } = abruf(alle);
  const gefunden: E[] = [];
  let vor: string | null = null, runden = 0;
  for (;;) {
    const s = await nachArt(laden, art, vor, limit, seitenMax);
    gefunden.push(...s.eintraege); runden++;
    if (!s.weiter) break;
    vor = s.weiter;
    assert.ok(runden < 1000, 'endet nicht');
  }
  return { gefunden, runden, aufrufe };
}

test('artAus kennt nur mining und transfer', () => {
  assert.equal(artAus('mining'), 'mining');
  assert.equal(artAus('transfer'), 'transfer');
  assert.equal(artAus('alle'), null);
  assert.equal(artAus(''), null);
  assert.equal(artAus(null), null);
});

test('Blockreward und Pool-Anteil sind Mining, Ein- und Ausgang sind Ueberweisungen', () => {
  assert.equal(passtZurArt('reward', 'mining'), true);
  assert.equal(passtZurArt('pool', 'mining'), true);
  assert.equal(passtZurArt('in', 'mining'), false);
  assert.equal(passtZurArt('out', 'mining'), false);
  assert.equal(passtZurArt('in', 'transfer'), true);
  assert.equal(passtZurArt('out', 'transfer'), true);
  assert.equal(passtZurArt('reward', 'transfer'), false);
  assert.equal(passtZurArt('pool', 'transfer'), false);
});

test('leerer Verlauf: leere Seite ohne Cursor', async () => {
  const { laden } = abruf([]);
  assert.deepEqual(await nachArt(laden, 'mining', null, 40), { eintraege: [], weiter: null });
});

test('nur passende Eintraege, Reihenfolge bleibt', async () => {
  const alle = verlauf(10, h => (h % 3 === 0 ? 'in' : 'pool'));
  const { laden } = abruf(alle);
  const s = await nachArt(laden, 'transfer', null, 40);
  assert.deepEqual(s.eintraege.map(e => e.height), [9, 6, 3, 0]);
  assert.equal(s.weiter, null);
});

test('volle Seite: der Cursor zeigt auf den letzten behaltenen Eintrag', async () => {
  const alle = verlauf(100, () => 'pool');
  const { laden } = abruf(alle);
  const s = await nachArt(laden, 'mining', null, 40);
  assert.equal(s.eintraege.length, 40);
  assert.equal(s.weiter, '60:0');
});

test('volle Seite genau am Ende des Verlaufs: kein Cursor', async () => {
  const alle = verlauf(40, () => 'pool');
  const { laden } = abruf(alle);
  const s = await nachArt(laden, 'mining', null, 40);
  assert.equal(s.eintraege.length, 40);
  assert.equal(s.weiter, null);
});

test('Blaettern liefert jeden passenden Eintrag genau einmal', async () => {
  // 1.000 Eintraege, jeder siebte eine Ueberweisung.
  const alle = verlauf(1000, h => (h % 7 === 0 ? (h % 2 ? 'in' : 'out') : 'pool'));
  for (const limit of [1, 7, 40, 200]) {
    const t = await alles(alle, 'transfer', limit);
    assert.deepEqual(t.gefunden.map(e => e.height), alle.filter(e => e.kind !== 'pool').map(e => e.height), `limit ${limit}`);
    const m = await alles(alle, 'mining', limit);
    assert.equal(m.gefunden.length, alle.filter(e => e.kind === 'pool').length, `limit ${limit}`);
    assert.equal(new Set(m.gefunden.map(e => e.height)).size, m.gefunden.length);
  }
});

test('viel Mining zwischen zwei Ueberweisungen: leere Seiten mit Cursor, bis die naechste kommt', async () => {
  // Die einzige Ueberweisung liegt ganz am Anfang der Kette, darueber 2.500 Pool-Anteile.
  const alle = verlauf(2501, h => (h === 0 ? 'in' : 'pool'));
  const { laden, aufrufe } = abruf(alle);
  const erste = await nachArt(laden, 'transfer', null, 40, 5);
  assert.deepEqual(erste.eintraege, []);
  assert.equal(aufrufe.length, 5, 'eine Antwort liest hoechstens fuenf Seiten');
  assert.equal(erste.weiter, `${2501 - 5 * SEITE}:0`);
  const t = await alles(alle, 'transfer', 40, 5);
  assert.deepEqual(t.gefunden.map(e => e.height), [0]);
  assert.equal(t.runden, 3);
});

test('ab einem Cursor: nichts davor, nichts doppelt', async () => {
  const alle = verlauf(50, h => (h % 2 ? 'pool' : 'out'));
  const { laden } = abruf(alle);
  const s = await nachArt(laden, 'transfer', '20:0', 5);
  assert.deepEqual(s.eintraege.map(e => e.height), [18, 16, 14, 12, 10]);
  assert.equal(s.weiter, '10:0');
});

test('limit wird auf 1 bis 200 begrenzt', async () => {
  const alle = verlauf(500, () => 'pool');
  const { laden } = abruf(alle);
  assert.equal((await nachArt(laden, 'mining', null, 9999)).eintraege.length, 200);
  assert.equal((await nachArt(laden, 'mining', null, 0)).eintraege.length, 40);
  assert.equal((await nachArt(laden, 'mining', null, -3)).eintraege.length, 1);
});
