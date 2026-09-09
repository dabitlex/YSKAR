-- Zwei Ursachen fuer die hohe Ablehnungsquote beheben.
--
-- Gemessen im Betrieb: rund 60 % Ausschuss mit Grund low_difficulty,
-- Geraeteleistung 2,66 MH/s gegen 0,70 MH/s gutgeschrieben.
--
-- A) VarDiff regelte je Einzelwert. Bei exponentialverteilten Abstaenden
--    liegt ein Einzelwert selbst bei perfekter Einstellung in 79 % der
--    Faelle ausserhalb der alten Totzone -> Dauerschwingung.
--    Behoben in src/lib/chain/vardiff.ts (gleitender Mittelwert normierter
--    Messwerte); hier nur die Ablage der Historie.
-- B) Nach einer Erhoehung verfielen unterwegs befindliche Shares.
--    Dagegen ein Kulanzfenster von 15 Sekunden.
--
-- p_share_difficulty faellt weg: Was gutgeschrieben wird, entscheidet die
-- Datenbank aus dem Sessionzustand, nicht der Aufrufer.

alter table mining_sessions
  add column vardiff_samples       numeric[] not null default '{}',
  add column prev_share_difficulty bigint,
  add column difficulty_changed_at timestamptz;

comment on column mining_sessions.vardiff_samples is
  'Letzte Messwerte in Sekunden je Difficulty-Einheit. Normiert, weil sonst '
  'Abstaende gemittelt wuerden, die bei verschiedenen Targets entstanden sind.';

drop function if exists submit_verified_share(
  uuid, uuid, uuid, bigint, bytea, bigint, bigint, bigint, bigint);

-- Neue Signatur mit p_samples numeric[] statt p_share_difficulty.
-- Vollstaendige Definition im Supabase-Projekt eingespielt; Kern der
-- Aenderung ist die Gutschrift:
--
--   if p_achieved >= share_difficulty            -> gutschreiben zu diesem Wert
--   elsif p_achieved >= prev_share_difficulty
--         and difficulty_changed_at > now()-15s  -> Kulanz, alter Wert
--   else                                          -> low_difficulty
--
-- Gutgeschrieben wird immer die Difficulty, gegen die der Client tatsaechlich
-- gerechnet hat -- sonst waere der Hashraten-Schaetzer verzerrt.
