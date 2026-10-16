-- ============================================================================
-- 00027  Spiegel fuer Konsensfassung 6 (docs/CONSENSUS_V6.md, Abschnitt 13)
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
--   * Der Kontodatensatz traegt zwei reservierte Felder (Abschnitt 8); sie
--     sind in dieser Fassung immer leer und werden deshalb nicht gespiegelt.
--
-- Verbindlich bleibt `raw`. Wer eine Frage hat, die die Spalten nicht
-- beantworten, liest raw mit dem Kern.

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
  add column if not exists valid_from integer,
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
      case when v_tx->>'valid_until' is null then null else (v_tx->>'valid_until')::int end,
      case when v_tx->>'memo' is null then null else decode(v_tx->>'memo','hex') end,
      case when v_tx->>'public_key' is null then null else decode(v_tx->>'public_key','hex') end,
      case when v_tx->>'signature' is null then null else decode(v_tx->>'signature','hex') end,
      decode(v_tx->>'raw', 'hex'),
      case when jsonb_typeof(v_tx->'coinbase_outputs') = 'array'
           then v_tx->'coinbase_outputs' else null end,
      case when v_tx->>'flags' is null then null else (v_tx->>'flags')::smallint end,
      case when v_tx->>'valid_from' is null then null else (v_tx->>'valid_from')::int end,
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
