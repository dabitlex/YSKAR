-- Jobs an ihre Session binden.
--
-- Der Server prueft beim Einreichen Session und Job unabhaengig, und der
-- Wiedereinreichungsschutz greift ueber (job_id, extranonce, nonce). Mit
-- MEHREREN Sessions je Adresse wird das zur Luecke: Zwei Sessions derselben
-- Adresse koennten dieselbe Nonce auf denselben Job einreichen. Der Hash
-- kaeme aus demselben Koerper, waere identisch -- aber die Extranonce der
-- Session ist verschieden, also griffe der Schutz nicht.
--
-- Die Luecke entstand genau mit Migration 00011.

alter table chain2.jobs
  add column session_id uuid references chain2.sessions(id) on delete cascade;

create index if not exists jobs_session_idx on chain2.jobs (session_id, created_at desc);
