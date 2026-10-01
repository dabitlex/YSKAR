-- ============================================================================
-- 00021  Verlauf einer Adresse, vollstaendig und seitenweise
-- ============================================================================
--
-- Bisher lieferte /api/v2/account nur die letzten 40 Eintraege. Wer mehr
-- Bewegungen hatte, sah den Rest nie.
--
-- Diese Funktion gibt den Verlauf seitenweise zurueck, in einer Liste aus
-- beiden Quellen:
--   * direkte Eintraege: Ueberweisungen (Eingang und Ausgang) und Coinbase
--     der Fassung 1 (to_addr = Adresse)
--   * Pool-Anteile: Coinbase der Fassung 2, bei der die Adresse in
--     coinbase_outputs steht (to_addr ist dort leer)
--
-- Sortiert nach (block_height, idx) absteigend. Weiterblaettern mit dem
-- letzten Paar der vorigen Seite als Cursor -- eindeutig, auch wenn mehrere
-- Eintraege im selben Block liegen.
--
-- p_richtung: 'alle' | 'ein' | 'aus'
--   ein = alles, was ankommt (Ueberweisungen, Blockrewards, Pool-Anteile)
--   aus = nur Ueberweisungen von dieser Adresse
-- ============================================================================

create or replace function chain2.verlauf(
  p_addr      bytea,
  p_richtung  text    default 'alle',
  p_vor_hoehe integer default null,
  p_vor_idx   integer default null,
  p_limit     integer default 40
)
returns table (
  txid bytea, block_height integer, idx integer, type smallint,
  from_addr bytea, to_addr bytea, amount bigint, fee bigint, memo bytea,
  pool boolean, empfaenger integer, block_time bigint
)
language sql
stable
set search_path = chain2, pg_temp
as $$
  with direkt as (
    select t.txid, t.block_height, t.idx, t.type, t.from_addr, t.to_addr,
           t.amount, t.fee, t.memo, false as pool, 1 as empfaenger
      from chain2.transactions t
     where (p_richtung in ('alle', 'aus') and t.from_addr = p_addr)
        or (p_richtung in ('alle', 'ein') and t.to_addr = p_addr)
  ),
  anteile as (
    select t.txid, t.block_height, t.idx, t.type, null::bytea, null::bytea,
           (o->>'amount')::bigint, 0::bigint, t.memo, true,
           jsonb_array_length(t.coinbase_outputs)
      from chain2.transactions t
      cross join lateral jsonb_array_elements(t.coinbase_outputs) o
     where p_richtung in ('alle', 'ein')
       and t.coinbase_outputs @> jsonb_build_array(jsonb_build_object('to', encode(p_addr, 'hex')))
       and o->>'to' = encode(p_addr, 'hex')
  ),
  zusammen as (
    select * from direkt
    union all
    select * from anteile
  )
  select z.txid, z.block_height, z.idx, z.type, z.from_addr, z.to_addr,
         z.amount, z.fee, z.memo, z.pool, z.empfaenger, b.block_time
    from zusammen z
    join chain2.blocks b on b.height = z.block_height
   where p_vor_hoehe is null
      or (z.block_height, z.idx) < (p_vor_hoehe, coalesce(p_vor_idx, 2147483647))
   order by z.block_height desc, z.idx desc
   limit least(greatest(coalesce(p_limit, 40), 1), 200)
$$;

revoke all on function chain2.verlauf(bytea, text, integer, integer, integer) from public;
grant execute on function chain2.verlauf(bytea, text, integer, integer, integer) to service_role;

comment on function chain2.verlauf(bytea, text, integer, integer, integer) is
  'Verlauf einer Adresse seitenweise: Ueberweisungen, Blockrewards und Pool-Anteile. '
  'Cursor (p_vor_hoehe, p_vor_idx) = letztes Paar der vorigen Seite. Migration 00021.';
