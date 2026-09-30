-- Neuigkeiten in zwei Sprachen: englische Fassung neben der deutschen.
-- Fehlt sie, zeigt die App den deutschen Text -- lieber als nichts.
alter table chain2.news
  add column if not exists titel_en text,
  add column if not exists text_en  text;

-- Geraete ohne gemeldete Sprache bekommen Englisch -- dieselbe Vorgabe wie die App.
alter table chain2.push_geraete alter column sprache set default 'en';
