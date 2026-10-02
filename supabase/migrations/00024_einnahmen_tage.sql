-- ============================================================================
-- 00024  Mining-Einnahmen je Tag
-- ============================================================================
--
-- Fuer die Kachel "Mining-Einnahmen" in der Wallet: Was eine Adresse an
-- jedem der letzten Tage aus Bloecken bekommen hat -- eigene Funde und
-- Pool-Anteile zusammen -- und in wie vielen Bloecken.
--
-- Gezaehlt wird genau das, was der Verlauf (00021/00022) als "Blockreward"
-- und "Pool-Anteil" zeigt:
--   Coinbase Fassung 1   type = 0 und to_addr = Adresse
--   Coinbase Fassung 2   ein Eintrag in coinbase_outputs fuer die Adresse
-- Die beiden schliessen sich aus: Bei Fassung 2 steht in to_addr nichts.
-- Ueberweisungen sind keine Einnahmen aus dem Mining. Sie kommen aus einer
-- zweiten Funktion (chain2.eingaenge_tage, unten): Zusammen ergibt das
-- "heute dazugekommen" auf der Guthabenkarte -- genau, auch wenn an einem
-- Tag mehr passiert ist, als die erste Seite des Verlaufs fasst.
--
-- p_zone ist die Zeitzone des Geraets (IANA-Name, z. B. "Europe/Berlin").
-- Ein Tag ist der Kalendertag DORT, nicht in UTC: Die Kachel soll dieselben
-- Tage zeigen wie die Ueberschriften im Verlauf darunter. Postgres rechnet
-- mit dem Namen auch ueber die Zeitumstellung hinweg richtig. Ein
-- unbekannter Name faellt auf UTC zurueck, statt die Abfrage abzubrechen.
--
-- Zurueck kommt je Tag GENAU eine Zeile, aelteste zuerst, auch fuer Tage
-- ohne Einnahmen (Summe 0) -- die App muss keine Luecken fuellen. Die
-- Summen sind Text: Einheiten sind ganze Zahlen, die als JSON-Zahl nicht in
-- jeder Groesse genau bleiben.
--
--   einnahmen_tage   summe    Blockrewards und Pool-Anteile des Tages
--                    bloecke  in wie vielen Bloecken
--   eingaenge_tage   summe    empfangene Ueberweisungen des Tages
--
-- Nur lesend. Nichts Bestehendes wird veraendert.
-- ============================================================================

create or replace function chain2.einnahmen_tage(
  p_addr bytea,
  p_tage integer default 30,
  p_zone text    default 'UTC'
)
returns table (tag date, summe text, bloecke integer)
language plpgsql
stable
set search_path = chain2, pg_temp
as $$
declare
  v_zone  text    := coalesce(nullif(btrim(p_zone), ''), 'UTC');
  v_tage  integer := least(greatest(coalesce(p_tage, 30), 1), 90);
  v_heute date;
  v_erster date;
  v_ab    bigint;
begin
  begin
    perform now() at time zone v_zone;
  exception when others then
    v_zone := 'UTC';
  end;

  v_heute  := (now() at time zone v_zone)::date;
  v_erster := v_heute - (v_tage - 1);
  -- Mitternacht des ersten Tages in der Zone, als Unix-Sekunden.
  v_ab := extract(epoch from (v_erster::timestamp at time zone v_zone))::bigint;

  return query
  with ertraege as (
    select t.block_height as hoehe, t.amount::numeric as betrag
      from chain2.transactions t
     where t.type = 0 and t.to_addr = p_addr
    union all
    select t.block_height, (o->>'amount')::numeric
      from chain2.transactions t
      cross join lateral jsonb_array_elements(t.coinbase_outputs) o
     where t.coinbase_outputs @> jsonb_build_array(jsonb_build_object('to', encode(p_addr, 'hex')))
       and o->>'to' = encode(p_addr, 'hex')
  ),
  je_tag as (
    select (to_timestamp(b.block_time) at time zone v_zone)::date as d,
           sum(e.betrag) as s,
           count(distinct e.hoehe)::integer as n
      from ertraege e
      join chain2.blocks b on b.height = e.hoehe
     where b.block_time >= v_ab
     group by 1
  )
  select g.d::date, coalesce(j.s, 0)::text, coalesce(j.n, 0)
    from generate_series(v_erster::timestamp, v_heute::timestamp, interval '1 day') as g(d)
    left join je_tag j on j.d = g.d::date
   order by 1;
end
$$;

revoke all on function chain2.einnahmen_tage(bytea, integer, text) from public;
grant execute on function chain2.einnahmen_tage(bytea, integer, text) to service_role;

comment on function chain2.einnahmen_tage(bytea, integer, text) is
  'Mining-Einnahmen einer Adresse je Kalendertag (Blockrewards und Pool-Anteile), '
  'letzte p_tage Tage (1..90) in der Zeitzone p_zone, aelteste zuerst, Tage ohne Einnahmen mit 0. Migration 00024.';

-- Empfangene Ueberweisungen je Kalendertag. Dieselben Tage, dieselbe
-- Zeitzone, dieselbe Form wie oben -- nur eben das, was andere geschickt
-- haben, nicht das Mining.
create or replace function chain2.eingaenge_tage(
  p_addr bytea,
  p_tage integer default 30,
  p_zone text    default 'UTC'
)
returns table (tag date, summe text)
language plpgsql
stable
set search_path = chain2, pg_temp
as $$
declare
  v_zone  text    := coalesce(nullif(btrim(p_zone), ''), 'UTC');
  v_tage  integer := least(greatest(coalesce(p_tage, 30), 1), 90);
  v_heute date;
  v_erster date;
  v_ab    bigint;
begin
  begin
    perform now() at time zone v_zone;
  exception when others then
    v_zone := 'UTC';
  end;

  v_heute  := (now() at time zone v_zone)::date;
  v_erster := v_heute - (v_tage - 1);
  v_ab := extract(epoch from (v_erster::timestamp at time zone v_zone))::bigint;

  return query
  with je_tag as (
    select (to_timestamp(b.block_time) at time zone v_zone)::date as d,
           sum(t.amount::numeric) as s
      from chain2.transactions t
      join chain2.blocks b on b.height = t.block_height
     where t.type <> 0 and t.to_addr = p_addr
       and b.block_time >= v_ab
     group by 1
  )
  select g.d::date, coalesce(j.s, 0)::text
    from generate_series(v_erster::timestamp, v_heute::timestamp, interval '1 day') as g(d)
    left join je_tag j on j.d = g.d::date
   order by 1;
end
$$;

revoke all on function chain2.eingaenge_tage(bytea, integer, text) from public;
grant execute on function chain2.eingaenge_tage(bytea, integer, text) to service_role;

comment on function chain2.eingaenge_tage(bytea, integer, text) is
  'Empfangene Ueberweisungen einer Adresse je Kalendertag, letzte p_tage Tage (1..90) in der Zeitzone p_zone, '
  'aelteste zuerst, Tage ohne Eingang mit 0. Gegenstueck zu chain2.einnahmen_tage. Migration 00024.';

-- PostgREST soll die neuen Funktionen sofort kennen.
notify pgrst, 'reload schema';
