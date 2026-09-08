-- Korrektur des Konto-Deckels aus 00001.
--
-- Falsch war: cap = max(account_cap_pct, 1/N).
-- Bei N Teilnehmern und Deckel 1/N wird daraus eine erzwungene
-- Gleichverteilung -- die anteilige Verteilung war damit ausgehebelt,
-- solange N <= 20 war. Ein Miner mit 900 Gewicht haette dasselbe bekommen
-- wie einer mit 50.
--
-- Richtig: cap = max(account_cap_pct, min(1, cap_slack / N)).
-- Gelesen als "hoechstens das cap_slack-fache des Durchschnittsanteils,
-- mindestens aber account_cap_pct".
--   N=3   -> 100 %   N=10 -> 30 %   N=30 -> 10 %   N>=60 -> 5 %
--
-- Die vollstaendige Funktion steht in 00002 im Repo; hier gekuerzt auf den
-- geaenderten Abschnitt, der Rest ist identisch zu 00001.
alter table chain_params add column cap_slack numeric not null default 3;
comment on column chain_params.cap_slack is
  'Vielfaches des Durchschnittsanteils, das ein einzelnes Konto je Runde hoechstens erhalten darf.';
-- settle_block() wird komplett neu angelegt; geaendert ist nur:
--   select greatest(account_cap_pct, least(1.0, cap_slack / v_n)) into v_cap_pct
