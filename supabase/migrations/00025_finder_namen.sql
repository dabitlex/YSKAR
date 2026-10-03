-- ============================================================================
-- 00025  Bloecke je Finder-Name -- fuer die Pool-Auswahl in der App
-- ============================================================================
--
-- Die App zeigt zu jedem Pool, wie viele Bloecke er gefunden hat. Ein Pool
-- schreibt seinen Namen in das extra-Feld der Coinbase (im Spiegel: memo);
-- gezaehlt wird also ueber diesen Namen.
--
-- Dieselbe Regel wie finderName() in src/lib/chain/finderName.ts: nur
-- druckbares ASCII (0x20 bis 0x7e), 3 bis 32 Byte, nach dem Trimmen noch
-- mindestens drei Zeichen und mindestens ein Buchstabe oder eine Ziffer.
-- Zufallsbytes -- der Normalfall bei Solo-Bloecken -- fallen damit heraus.
--
-- WAS DIE ZAHL IST: eine Zaehlung nach Selbstauskunft. Den Namen waehlt, wer
-- den Block baut; die Kette prueft ihn nicht. Zwei Knoten mit demselben
-- Namen wuerden zusammengezaehlt.
--
-- Eine Zeile je Name. Bei rund 144 Bloecken am Tag ein Durchlauf ueber die
-- Coinbases, auf Jahre eine Sache von Millisekunden (wie 00023).
-- ============================================================================

create or replace function chain2.finder_namen()
returns table (name text, bloecke bigint, letzte integer)
language sql
stable
set search_path = chain2, pg_temp
as $$
  -- CASE, nicht WHERE: Nur CASE legt fest, dass der Filter VOR der Umwandlung
  -- laeuft. In einem WHERE duerfte der Planer die Reihenfolge waehlen -- und
  -- convert_from() auf Zufallsbytes (der Normalfall bei Solo-Bloecken) wirft
  -- "invalid byte sequence".
  select n.name, count(*)::bigint, max(n.block_height)
  from (
    select
      case
        when octet_length(t.memo) between 3 and 32
         and encode(t.memo, 'hex') ~ '^([2-6][0-9a-f]|7[0-9a-e])+$'
        then btrim(convert_from(t.memo, 'SQL_ASCII'))
      end as name,
      t.block_height
    from chain2.transactions t
    where t.type = 0
  ) n
  where n.name is not null and length(n.name) >= 3 and n.name ~ '[a-zA-Z0-9]'
  group by n.name
  -- Die Schnittstelle liefert hoechstens 1000 Zeilen. Sollten es je mehr
  -- Namen werden, fallen die mit den wenigsten Bloecken heraus.
  order by 2 desc, 1;
$$;

revoke all on function chain2.finder_namen() from public;
grant execute on function chain2.finder_namen() to service_role;
