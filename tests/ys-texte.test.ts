/**
 * Texte des YSKAR-Systems (Redesign November 2026): Alle 13 Sprachen haben
 * dieselben Schluessel wie Englisch, und kein Text ist leer.
 *
 * Der Typ YsWoerterbuch faengt fehlende Schluessel schon beim Bauen; dieser
 * Test faengt zusaetzlich leere Texte und Schluessel, die nur in einer
 * Sprache stehen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import en from '../src/i18n/ys/en.ts';
import de from '../src/i18n/ys/de.ts';
import es from '../src/i18n/ys/es.ts';
import fr from '../src/i18n/ys/fr.ts';
import id from '../src/i18n/ys/id.ts';
import it from '../src/i18n/ys/it.ts';
import pl from '../src/i18n/ys/pl.ts';
import pt from '../src/i18n/ys/pt.ts';
import ru from '../src/i18n/ys/ru.ts';
import tr from '../src/i18n/ys/tr.ts';
import uk from '../src/i18n/ys/uk.ts';
import vi from '../src/i18n/ys/vi.ts';
import zh from '../src/i18n/ys/zh.ts';

const SPRACHEN = { de, es, fr, id, it, pl, pt, ru, tr, uk, vi, zh };

function blaetter(o: unknown, pfad = ''): Map<string, unknown> {
  const m = new Map<string, unknown>();
  if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) {
      for (const [p, w] of blaetter(v, pfad ? `${pfad}.${k}` : k)) m.set(p, w);
    }
  } else m.set(pfad, o);
  return m;
}

const vorlage = blaetter(en);

test('ys: Vorlage Englisch hat Texte', () => {
  assert.ok(vorlage.size >= 10);
});

for (const [code, buch] of Object.entries(SPRACHEN)) {
  test(`ys: ${code} hat genau die Schluessel von en`, () => {
    const b = blaetter(buch);
    assert.deepEqual([...b.keys()].sort(), [...vorlage.keys()].sort());
  });
  test(`ys: ${code} hat keine leeren Texte`, () => {
    for (const [p, w] of blaetter(buch)) {
      if (typeof w === 'function') continue;
      assert.equal(typeof w, 'string', p);
      assert.ok((w as string).trim().length > 0, `${code}: ${p} ist leer`);
    }
  });
}
