-- ============================================================================
-- 00023  Pool oder Solo -- gezaehlt ueber die ganze Kette
-- ============================================================================
--
-- Der Explorer zeigt, wie viele Bloecke ein Pool gefunden hat und wie viele
-- ein einzelner Miner. Bisher zaehlte er das im Browser ueber die letzten 30
-- geladenen Bloecke -- ein Ausschnitt, der gerade nichts ueber die Kette
-- sagt (30 von 30 "Pool", waehrend ueber alle Bloecke die meisten solo
-- gefunden wurden).
--
-- Dieselbe Regel wie in /api/v2/blocks: Eine Coinbase mit mehr als einem
-- Empfaenger ist ein Pool-Block. Bei Fassung 1 ist coinbase_outputs leer
-- (ein Empfaenger in to_addr) -- das ist solo.
--
-- Eine Zeile je Block, ein Durchlauf ueber die Coinbases. Bei rund 144
-- Bloecken am Tag bleibt das auf Jahre eine Sache von Millisekunden.
-- ============================================================================

create or replace function chain2.finder_statistik()
returns table (pool bigint, solo bigint)
language sql
stable
set search_path = chain2, pg_temp
as $$
  select
    count(*) filter (where jsonb_array_length(coalesce(t.coinbase_outputs, '[]'::jsonb)) > 1),
    count(*) filter (where jsonb_array_length(coalesce(t.coinbase_outputs, '[]'::jsonb)) <= 1)
  from chain2.transactions t
  where t.type = 0;
$$;

revoke all on function chain2.finder_statistik() from public;
grant execute on function chain2.finder_statistik() to service_role;
