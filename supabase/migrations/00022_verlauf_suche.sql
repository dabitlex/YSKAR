-- ============================================================================
-- 00022  Verlauf: Suche und Zeitraum
-- ============================================================================
--
-- Erweitert chain2.verlauf (00021) um Filter, die in der Wallet ueber dem
-- Verlauf liegen. Gesucht wird im ganzen Verlauf der Adresse, nicht nur in
-- dem, was die App schon geladen hat.
--
--   p_von_zeit, p_bis_zeit   Blockzeit in Unix-Sekunden, [von, bis)
--   p_hoehe                  genau dieser Block
--   p_tx_lo .. p_tx_hi       TxID beginnt mit ... (als Bereich, siehe unten)
--   p_gegen_lo .. p_gegen_hi Adresse der Gegenseite beginnt mit ...
--   p_memo                   Notiz enthaelt ... (Gross/klein egal)
--                            Nur Ueberweisungen: Bei einer Coinbase steht im
--                            Notizfeld keine Notiz, sondern Bytes des Miners.
--
-- Die Suchfelder sind ODER-verknuepft: Eine Eingabe wie "5871" kann eine
-- Blocknummer oder der Anfang einer TxID sein -- beides zaehlt. Der
-- Zeitraum und die Richtung schraenken zusaetzlich ein (UND).
--
-- "Beginnt mit" als Bereich: Die App rechnet einen Anfang (Hex-Ziffern oder
-- bech32-Zeichen) in die kleinste und groesste passende Bytefolge um. bytea
-- vergleicht byteweise, also ist "beginnt mit" dasselbe wie "liegt
-- zwischen lo und hi". Kein Textumwandeln je Zeile.
--
-- Als eigene Funktion chain2.verlauf_suche, nicht als Ersatz fuer
-- chain2.verlauf: Nichts wird geloescht, die laufende App ruft ihre
-- Funktion unveraendert weiter auf. Ohne Filter liefern beide dasselbe.
-- Eine Ueberladung von verlauf ginge nicht -- PostgREST koennte zwischen
-- zwei passenden Fassungen nicht waehlen.
-- ============================================================================

-- Notiz als Text. Eine Notiz sind beliebige Bytes (bis 32); nicht jede ist
-- gueltiges UTF-8. convert_from wuerde dann die ganze Abfrage abbrechen --
-- hier wird daraus nur "kein Treffer".
create or replace function chain2.memo_text(p bytea)
returns text
language plpgsql
immutable
set search_path = chain2, pg_temp
as $$
begin
  if p is null or length(p) = 0 then return null; end if;
  return convert_from(p, 'UTF8');
exception when others then
  return null;
end
$$;

revoke all on function chain2.memo_text(bytea) from public;
grant execute on function chain2.memo_text(bytea) to service_role;

create or replace function chain2.verlauf_suche(
  p_addr      bytea,
  p_richtung  text    default 'alle',
  p_vor_hoehe integer default null,
  p_vor_idx   integer default null,
  p_limit     integer default 40,
  p_von_zeit  bigint  default null,
  p_bis_zeit  bigint  default null,
  p_hoehe     integer default null,
  p_tx_lo     bytea   default null,
  p_tx_hi     bytea   default null,
  p_gegen_lo  bytea   default null,
  p_gegen_hi  bytea   default null,
  p_memo      text    default null
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
           t.amount, t.fee, t.memo, false as pool, 1 as empfaenger,
           case when t.to_addr = p_addr then t.from_addr else t.to_addr end as gegen
      from chain2.transactions t
     where (p_richtung in ('alle', 'aus') and t.from_addr = p_addr)
        or (p_richtung in ('alle', 'ein') and t.to_addr = p_addr)
  ),
  anteile as (
    select t.txid, t.block_height, t.idx, t.type, null::bytea, null::bytea,
           (o->>'amount')::bigint, 0::bigint, t.memo, true,
           jsonb_array_length(t.coinbase_outputs), null::bytea
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
   where (p_vor_hoehe is null
          or (z.block_height, z.idx) < (p_vor_hoehe, coalesce(p_vor_idx, 2147483647)))
     and (p_von_zeit is null or b.block_time >= p_von_zeit)
     and (p_bis_zeit is null or b.block_time <  p_bis_zeit)
     and (
           (p_hoehe is null and p_tx_lo is null and p_gegen_lo is null and p_memo is null)
        or (p_hoehe is not null and z.block_height = p_hoehe)
        or (p_tx_lo is not null and z.txid between p_tx_lo and p_tx_hi)
        or (p_gegen_lo is not null and z.gegen between p_gegen_lo and p_gegen_hi)
        or (p_memo is not null and z.type <> 0
            and strpos(lower(chain2.memo_text(z.memo)), lower(p_memo)) > 0)
     )
   order by z.block_height desc, z.idx desc
   limit least(greatest(coalesce(p_limit, 40), 1), 200)
$$;

revoke all on function chain2.verlauf_suche(bytea, text, integer, integer, integer,
  bigint, bigint, integer, bytea, bytea, bytea, bytea, text) from public;
grant execute on function chain2.verlauf_suche(bytea, text, integer, integer, integer,
  bigint, bigint, integer, bytea, bytea, bytea, bytea, text) to service_role;

comment on function chain2.verlauf_suche(bytea, text, integer, integer, integer,
  bigint, bigint, integer, bytea, bytea, bytea, bytea, text) is
  'Verlauf einer Adresse seitenweise: Ueberweisungen, Blockrewards und Pool-Anteile. '
  'Cursor (p_vor_hoehe, p_vor_idx) = letztes Paar der vorigen Seite. '
  'Optional Zeitraum (Blockzeit) und Suche (Block, TxID-/Adress-Anfang, Notiz). Wie chain2.verlauf (00021). Migration 00022.';

-- PostgREST soll die neue Signatur sofort kennen.
notify pgrst, 'reload schema';
