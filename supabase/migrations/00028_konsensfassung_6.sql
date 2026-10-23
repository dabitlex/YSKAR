-- ============================================================================
-- 00028  Spiegel fuer Konsensfassung 6 (docs/CONSENSUS_V6.md, Abschnitt 13)
-- ============================================================================
--
-- NOCH NICHT EINGESPIELT. Gehoert zum Zweig consensus-v6 und wird zusammen
-- mit Node Core 1.0.0 vor der Aktivierungshoehe eingespielt. Bis dahin
-- aendert sich am Spiegel nichts: Alle Erweiterungen unten sind
-- rueckwaertsvertraeglich -- Bloecke der Fassungen 1 bis 5 schreiben sich
-- unveraendert.
--
-- Der Spiegel rechnet keinen Konsens. Er speichert, was der Knoten geprueft
-- hat, und muss ab der Hoehe nur mehr Formen aufnehmen koennen:
--
--   * Adressen in Rohform mit Version: 20 Byte (Version 0) oder 33 Byte
--     (Version 1, 0x01 | Skript-Hash) -- in transactions, accounts, mempool.
--   * Transaktionstypen 2 (Skript-Ausgabe) und 3 (Sammelzahlung).
--   * Die neuen Felder: flags, valid_from, script, witness. Die Aufteilung
--     einer Sammelzahlung steht in coinbase_outputs (dieselbe Form wie bei
--     einer Pool-Coinbase; die Spalte heisst historisch so).
--   * Der Kontodatensatz traegt zwei reservierte Felder (Abschnitt 5.1); sie
--     sind in dieser Fassung immer leer und werden deshalb nicht gespiegelt.
--
-- Verbindlich bleibt `raw`. Wer eine Frage hat, die die Spalten nicht
-- beantworten, liest raw mit dem Kern.

-- ------------------------------------------------- alte Pruefungen entfernen
--
-- Die Pruefungen auf 20-Byte-Adressen und auf die Typen 0 und 1 stammen aus
-- 00007, wo sie ohne Namen angelegt wurden. Ihr Name ist deshalb der, den
-- Postgres vergeben hat -- in einer Datenbank, die anders entstanden ist,
-- vielleicht ein anderer. Bliebe auch nur eine stehen, scheiterte der erste
-- Block mit einer Adresse der Version 1 in commit_block, und der Spiegel
-- stuende still. Deshalb hier nach INHALT statt nach Namen entfernen; die
-- neuen Pruefungen darunter haben feste Namen.
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tab, c.conname, pg_get_constraintdef(c.oid) as def
      from pg_constraint c
     where c.contype = 'c'
       and c.conrelid in ('chain2.transactions'::regclass, 'chain2.accounts'::regclass,
                          'chain2.mempool'::regclass)
  loop
    if r.def ~ 'octet_length\((from_addr|to_addr|address)\) = 20'
       or (r.tab = 'chain2.transactions'::regclass and r.def ~ '\mtype\M' and r.def !~ '3'
           and r.conname <> 'coinbase_first' and r.conname <> 'tx_to_addr_nur_bei_pool_coinbase')
    then
      execute format('alter table %s drop constraint %I', r.tab, r.conname);
      raise notice '00028: Pruefung % auf % entfernt (%)', r.conname, r.tab, r.def;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------- Transaktionen

alter table chain2.transactions
  drop constraint if exists transactions_type_check,
  add  constraint transactions_type_check check (type in (0, 1, 2, 3));

alter table chain2.transactions
  drop constraint if exists transactions_from_addr_check,
  add  constraint transactions_from_addr_check
    check (from_addr is null or octet_length(from_addr) in (20, 33));

alter table chain2.transactions
  drop constraint if exists transactions_to_addr_check,
  add  constraint transactions_to_addr_check
    check (to_addr is null or octet_length(to_addr) in (20, 33));

-- Die Coinbase steht vorn, alles andere dahinter -- auch die neuen Typen.
alter table chain2.transactions
  drop constraint if exists coinbase_first,
  add  constraint coinbase_first
    check ((type = 0 and idx = 0) or (type in (1, 2, 3) and idx > 0));

-- to_addr darf leer sein, wenn die Empfaenger in coinbase_outputs stehen:
-- bei einer Pool-Coinbase (wie bisher) und bei einer Sammelzahlung (Typ 3).
alter table chain2.transactions
  drop constraint if exists tx_to_addr_nur_bei_pool_coinbase,
  add  constraint tx_to_addr_nur_bei_pool_coinbase
    check (to_addr is not null
        or (type in (0, 3) and coinbase_outputs is not null
            and jsonb_array_length(coinbase_outputs) >= 1));

alter table chain2.transactions
  add column if not exists flags      smallint,
  -- u32 wie valid_until (00027): bigint, sonst scheitert ein Wert ueber 2^31.
  add column if not exists valid_from bigint check (valid_from is null or (valid_from >= 0 and valid_from <= 4294967295)),
  -- Skript-Ausgabe: das offengelegte Skript (1..1024 Byte) und der Witness.
  add column if not exists script     bytea check (script is null or octet_length(script) between 1 and 1024),
  add column if not exists witness    bytea;

-- Skriptkonten finden: alle Ausgaben, die dasselbe Skript offenlegen.
create index if not exists tx_script_idx on chain2.transactions (from_addr)
  where type = 2;

-- --------------------------------------------------------------- Konten

alter table chain2.accounts
  drop constraint if exists accounts_address_check,
  add  constraint accounts_address_check check (octet_length(address) in (20, 33));

-- -------------------------------------------------------------- Mempool

alter table chain2.mempool
  drop constraint if exists mempool_from_addr_check,
  add  constraint mempool_from_addr_check check (octet_length(from_addr) in (20, 33));

alter table chain2.mempool
  drop constraint if exists mempool_to_addr_check,
  add  constraint mempool_to_addr_check check (octet_length(to_addr) in (20, 33));

-- ---------------------------------------------------------- commit_block
--
-- Identisch mit der laufenden Fassung (Stand 16.10.2026, aus der Datenbank
-- gelesen), plus: to_addr darf fehlen, und die vier neuen Felder werden
-- uebernommen, wenn der Knoten sie schickt. Ein Knoten aelterer Fassung
-- schickt sie nicht -- dann bleiben sie null.

create or replace function chain2.commit_block(
  p_block jsonb, p_txs jsonb, p_accounts jsonb, p_supply numeric
) returns jsonb
language plpgsql security definer
set search_path to 'chain2', 'pg_temp'
as $$
declare
  v_height   int   := (p_block->>'height')::int;
  v_hash     bytea := decode(p_block->>'hash', 'hex');
  v_root     bytea := decode(p_block->>'state_root', 'hex');
  v_tx       jsonb;
  v_acc      jsonb;
  v_txids    bytea[] := '{}';
  v_written  int := 0;
begin
  insert into chain2.blocks (
    height, hash, version, prev_hash, merkle_root, state_root,
    block_time, difficulty, tx_count, extranonce, nonce, header, size_bytes
  ) values (
    v_height, v_hash,
    (p_block->>'version')::int,
    decode(p_block->>'prev_hash', 'hex'),
    decode(p_block->>'merkle_root', 'hex'),
    v_root,
    (p_block->>'block_time')::bigint,
    (p_block->>'difficulty')::numeric(78,0),
    (p_block->>'tx_count')::int,
    (p_block->>'extranonce')::numeric(20,0),
    (p_block->>'nonce')::numeric(20,0),
    decode(p_block->>'header', 'hex'),
    (p_block->>'size_bytes')::int
  );

  for v_tx in select * from jsonb_array_elements(p_txs) loop
    insert into chain2.transactions (
      txid, block_height, idx, type, version, from_addr, to_addr,
      amount, fee, nonce, valid_until, memo, public_key, signature, raw,
      coinbase_outputs, flags, valid_from, script, witness
    ) values (
      decode(v_tx->>'txid', 'hex'), v_height, (v_tx->>'idx')::int,
      (v_tx->>'type')::smallint, (v_tx->>'version')::int,
      case when v_tx->>'from' is null then null else decode(v_tx->>'from','hex') end,
      case when v_tx->>'to'   is null then null else decode(v_tx->>'to','hex') end,
      (v_tx->>'amount')::bigint,
      coalesce((v_tx->>'fee')::bigint, 0),
      case when v_tx->>'nonce' is null then null else (v_tx->>'nonce')::bigint end,
      case when v_tx->>'valid_until' is null then null else (v_tx->>'valid_until')::bigint end,
      case when v_tx->>'memo' is null then null else decode(v_tx->>'memo','hex') end,
      case when v_tx->>'public_key' is null then null else decode(v_tx->>'public_key','hex') end,
      case when v_tx->>'signature' is null then null else decode(v_tx->>'signature','hex') end,
      decode(v_tx->>'raw', 'hex'),
      case when jsonb_typeof(v_tx->'coinbase_outputs') = 'array'
           then v_tx->'coinbase_outputs' else null end,
      case when v_tx->>'flags' is null then null else (v_tx->>'flags')::smallint end,
      case when v_tx->>'valid_from' is null then null else (v_tx->>'valid_from')::bigint end,
      case when v_tx->>'script' is null then null else decode(v_tx->>'script','hex') end,
      case when v_tx->>'witness' is null then null else decode(v_tx->>'witness','hex') end
    );
    v_txids := array_append(v_txids, decode(v_tx->>'txid', 'hex'));
    v_written := v_written + 1;
  end loop;

  for v_acc in select * from jsonb_array_elements(p_accounts) loop
    if (v_acc->>'balance')::bigint = 0 and (v_acc->>'nonce')::bigint = 0 then
      delete from chain2.accounts where address = decode(v_acc->>'address','hex');
    else
      insert into chain2.accounts (address, balance, nonce, first_height, last_height)
      values (decode(v_acc->>'address','hex'), (v_acc->>'balance')::bigint,
              (v_acc->>'nonce')::bigint, v_height, v_height)
      on conflict (address) do update
        set balance = excluded.balance,
            nonce = excluded.nonce,
            last_height = v_height;
    end if;
  end loop;

  delete from chain2.mempool where txid = any(v_txids);
  delete from chain2.mempool where valid_until <> 0 and valid_until < v_height;

  update chain2.state_meta
     set height = v_height, state_root = v_root,
         total_supply = p_supply, updated_at = now()
   where id = 1;

  return jsonb_build_object('height', v_height, 'txs', v_written,
                            'hash', encode(v_hash, 'hex'));
end $$;

-- ------------------------------------------- Auswertungen: Sammelzahlungen
--
-- Ab Fassung 6 stehen in coinbase_outputs nicht nur die Empfaenger einer
-- Pool-Coinbase (Typ 0), sondern auch die einer Sammelzahlung (Typ 3). Die
-- Auswertungen aus 00021, 00022 und 00024 lasen die Spalte bisher als
-- "Mining-Anteil". Ohne die Aenderungen unten zaehlte eine empfangene
-- Sammelzahlung als Mining-Einnahme, fehlte bei den Eingaengen und stand im
-- Verlauf als Pool-Anteil ohne Absender.
--
-- Eine Sammelzahlung hat to_addr immer leer (store.ts, auch bei nur einem
-- Empfaenger); ihre Empfaenger stehen nur in coinbase_outputs.
--
-- Grundlage: die Fassungen der Funktionen, wie sie am 17.10.2026 in der
-- Datenbank stehen (gelesen mit pg_get_functiondef). Geaendert ist jeweils
-- nur, was mit "Fassung 6" markiert ist. Fuer Bloecke der Fassungen 1 bis 5
-- ist das Ergebnis unveraendert: Dort gibt es keinen Typ 3.

-- Mining-Einnahmen: nur Coinbase-Anteile.
create or replace function chain2.einnahmen_tage(
  p_addr bytea, p_tage integer default 30, p_zone text default 'UTC'::text
) returns table(tag date, summe text, bloecke integer)
language plpgsql
stable
set search_path to 'chain2', 'pg_temp'
as $function$
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
     where t.type = 0                                   -- Fassung 6
       and t.coinbase_outputs @> jsonb_build_array(jsonb_build_object('to', encode(p_addr, 'hex')))
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
$function$;

-- Eingaenge: Ueberweisungen und Skript-Ausgaben wie bisher, dazu der eigene
-- Anteil an einer Sammelzahlung.
create or replace function chain2.eingaenge_tage(
  p_addr bytea, p_tage integer default 30, p_zone text default 'UTC'::text
) returns table(tag date, summe text)
language plpgsql
stable
set search_path to 'chain2', 'pg_temp'
as $function$
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
  with eingang as (
    select t.block_height as hoehe, t.amount::numeric as betrag
      from chain2.transactions t
     where t.type <> 0 and t.to_addr = p_addr
    union all                                           -- Fassung 6
    select t.block_height, (o->>'amount')::numeric
      from chain2.transactions t
      cross join lateral jsonb_array_elements(t.coinbase_outputs) o
     where t.type = 3
       and t.coinbase_outputs @> jsonb_build_array(jsonb_build_object('to', encode(p_addr, 'hex')))
       and o->>'to' = encode(p_addr, 'hex')
  ),
  je_tag as (
    select (to_timestamp(b.block_time) at time zone v_zone)::date as d,
           sum(e.betrag) as s
      from eingang e
      join chain2.blocks b on b.height = e.hoehe
     where b.block_time >= v_ab
     group by 1
  )
  select g.d::date, coalesce(j.s, 0)::text
    from generate_series(v_erster::timestamp, v_heute::timestamp, interval '1 day') as g(d)
    left join je_tag j on j.d = g.d::date
   order by 1;
end
$function$;

-- Verlauf: Ein Anteil an einer Sammelzahlung ist kein Pool-Anteil und hat
-- einen Absender.
create or replace function chain2.verlauf(
  p_addr bytea, p_richtung text default 'alle'::text, p_vor_hoehe integer default null::integer,
  p_vor_idx integer default null::integer, p_limit integer default 40
) returns table(txid bytea, block_height integer, idx integer, type smallint, from_addr bytea,
                to_addr bytea, amount bigint, fee bigint, memo bytea, pool boolean,
                empfaenger integer, block_time bigint)
language sql
stable
set search_path to 'chain2', 'pg_temp'
as $function$
  with direkt as (
    select t.txid, t.block_height, t.idx, t.type, t.from_addr, t.to_addr,
           t.amount, t.fee, t.memo, false as pool, 1 as empfaenger
      from chain2.transactions t
     where (p_richtung in ('alle', 'aus') and t.from_addr = p_addr)
        or (p_richtung in ('alle', 'ein') and t.to_addr = p_addr)
  ),
  anteile as (
    select t.txid, t.block_height, t.idx, t.type,
           case when t.type = 3 then t.from_addr end,   -- Fassung 6
           null::bytea,
           (o->>'amount')::bigint, 0::bigint, t.memo,
           t.type = 0,                                  -- Fassung 6
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
$function$;

-- Zweiter Adressbereich fuer die Suche (Adressen der Version 1, ysr1p…):
-- Ein Anfang wie "ysr1p3" kann eine Adresse der Version 0 oder der Version 1
-- sein. Neue Signatur, also die alte zuerst weg -- sonst gaebe es zwei
-- Ueberladungen, und ein Aufruf ohne die neuen Parameter waere mehrdeutig.
drop function if exists chain2.verlauf_suche(bytea, text, integer, integer, integer,
  bigint, bigint, integer, bytea, bytea, bytea, bytea, text);

create or replace function chain2.verlauf_suche(
  p_addr bytea, p_richtung text default 'alle'::text, p_vor_hoehe integer default null::integer,
  p_vor_idx integer default null::integer, p_limit integer default 40,
  p_von_zeit bigint default null::bigint, p_bis_zeit bigint default null::bigint,
  p_hoehe integer default null::integer, p_tx_lo bytea default null::bytea,
  p_tx_hi bytea default null::bytea, p_gegen_lo bytea default null::bytea,
  p_gegen_hi bytea default null::bytea, p_memo text default null::text,
  p_gegen2_lo bytea default null::bytea, p_gegen2_hi bytea default null::bytea
) returns table(txid bytea, block_height integer, idx integer, type smallint, from_addr bytea,
                to_addr bytea, amount bigint, fee bigint, memo bytea, pool boolean,
                empfaenger integer, block_time bigint)
language sql
stable
set search_path to 'chain2', 'pg_temp'
as $function$
  with direkt as (
    select t.txid, t.block_height, t.idx, t.type, t.from_addr, t.to_addr,
           t.amount, t.fee, t.memo, false as pool, 1 as empfaenger,
           case when t.to_addr = p_addr then t.from_addr else t.to_addr end as gegen
      from chain2.transactions t
     where (p_richtung in ('alle', 'aus') and t.from_addr = p_addr)
        or (p_richtung in ('alle', 'ein') and t.to_addr = p_addr)
  ),
  anteile as (
    select t.txid, t.block_height, t.idx, t.type,
           case when t.type = 3 then t.from_addr end,   -- Fassung 6
           null::bytea,
           (o->>'amount')::bigint, 0::bigint, t.memo,
           t.type = 0,                                  -- Fassung 6
           jsonb_array_length(t.coinbase_outputs),
           case when t.type = 3 then t.from_addr end    -- Fassung 6: Gegenseite
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
           (p_hoehe is null and p_tx_lo is null and p_gegen_lo is null and p_gegen2_lo is null and p_memo is null)
        or (p_hoehe is not null and z.block_height = p_hoehe)
        or (p_tx_lo is not null and z.txid between p_tx_lo and p_tx_hi)
        -- Gleiche Laenge dazu: bytea vergleicht Byte fuer Byte, und ein
        -- 20-Byte-Bereich wuerde sonst auch 33-Byte-Adressen treffen.
        or (p_gegen_lo is not null and octet_length(z.gegen) = octet_length(p_gegen_lo)
            and z.gegen between p_gegen_lo and p_gegen_hi)
        or (p_gegen2_lo is not null and octet_length(z.gegen) = octet_length(p_gegen2_lo)
            and z.gegen between p_gegen2_lo and p_gegen2_hi)
        or (p_memo is not null and z.type <> 0
            and strpos(lower(chain2.memo_text(z.memo)), lower(p_memo)) > 0)
     )
   order by z.block_height desc, z.idx desc
   limit least(greatest(coalesce(p_limit, 40), 1), 200)
$function$;

-- Rechte wie in 00021, 00022, 00024 und 00026: nur service_role.
revoke all on function chain2.einnahmen_tage(bytea, integer, text) from public, anon, authenticated;
revoke all on function chain2.eingaenge_tage(bytea, integer, text) from public, anon, authenticated;
revoke all on function chain2.verlauf(bytea, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function chain2.verlauf_suche(bytea, text, integer, integer, integer,
  bigint, bigint, integer, bytea, bytea, bytea, bytea, text, bytea, bytea) from public, anon, authenticated;
grant execute on function chain2.einnahmen_tage(bytea, integer, text) to service_role;
grant execute on function chain2.eingaenge_tage(bytea, integer, text) to service_role;
grant execute on function chain2.verlauf(bytea, text, integer, integer, integer) to service_role;
grant execute on function chain2.verlauf_suche(bytea, text, integer, integer, integer,
  bigint, bigint, integer, bytea, bytea, bytea, bytea, text, bytea, bytea) to service_role;
