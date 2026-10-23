-- ============================================================================
-- 00027  valid_until (und spaeter valid_from) als bigint
-- ============================================================================
--
-- validUntil ist in der Kette ein u32 (0 bis 4.294.967.295). Die Spalten
-- waren integer (bis 2.147.483.647), und commit_block las den Wert mit
-- ::int. Eine einzige gueltige Ueberweisung mit validUntil ueber 2^31 --
-- etwa 4.294.967.295 als "nie ablaufen" -- liess commit_block scheitern.
-- Weil commit_block nur den jeweils naechsten Block annimmt, stuende der
-- Spiegel danach still, waehrend die Kette weiterlaeuft. Derselbe Fall wie
-- bei der Extranonce (00015) und der Difficulty (00020).
--
-- Geaendert:
--   * chain2.transactions.valid_until und chain2.mempool.valid_until: bigint.
--     Bestehende Werte bleiben unveraendert (integer passt in bigint).
--   * commit_block: (v_tx->>'valid_until')::int  ->  ::bigint. Sonst ist der
--     Rumpf der aus 00020, unveraendert; die Rechte aus 00026 bleiben, der
--     search_path steht jetzt in der Definition selbst.
--   * mempool_add: Parameter p_valid_until bigint (neue Signatur, die alte
--     wird entfernt). Wird derzeit von keinem Dienst aufgerufen.
--
-- Laeuft vor 00028 (Konsensfassung 6) und unabhaengig davon. 00028 legt
-- valid_from gleich als bigint an und liest beide Felder mit ::bigint.
--
-- Zuruecknehmen: nicht noetig -- bigint nimmt jeden integer-Wert auf.
-- ============================================================================

alter table chain2.transactions alter column valid_until type bigint;
alter table chain2.mempool      alter column valid_until type bigint;

alter table chain2.transactions add constraint transactions_valid_until_u32
  check (valid_until is null or (valid_until >= 0 and valid_until <= 4294967295));
alter table chain2.mempool add constraint mempool_valid_until_u32
  check (valid_until >= 0 and valid_until <= 4294967295);

CREATE OR REPLACE FUNCTION chain2.commit_block(p_block jsonb, p_txs jsonb, p_accounts jsonb, p_supply numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'chain2', 'pg_temp'
AS $function$
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
    -- Konsensfassung 4: unbegrenzt bis knapp 2^240 (Migration 00020).
    (p_block->>'difficulty')::numeric(78,0),
    (p_block->>'tx_count')::int,
    -- u64: numeric statt bigint. bigint traegt nur die Haelfte des
    -- erlaubten Bereichs, und der Node Core wuerfelt volle 64 Bit.
    (p_block->>'extranonce')::numeric(20,0),
    (p_block->>'nonce')::numeric(20,0),
    decode(p_block->>'header', 'hex'),
    (p_block->>'size_bytes')::int
  );

  for v_tx in select * from jsonb_array_elements(p_txs) loop
    insert into chain2.transactions (
      txid, block_height, idx, type, version, from_addr, to_addr,
      amount, fee, nonce, valid_until, memo, public_key, signature, raw,
      coinbase_outputs
    ) values (
      decode(v_tx->>'txid', 'hex'), v_height, (v_tx->>'idx')::int,
      (v_tx->>'type')::smallint, (v_tx->>'version')::int,
      case when v_tx->>'from' is null then null else decode(v_tx->>'from','hex') end,
      decode(v_tx->>'to', 'hex'),
      (v_tx->>'amount')::bigint,
      coalesce((v_tx->>'fee')::bigint, 0),
      case when v_tx->>'nonce' is null then null else (v_tx->>'nonce')::bigint end,
      -- u32 in der Kette: bigint (Migration 00027).
      case when v_tx->>'valid_until' is null then null else (v_tx->>'valid_until')::bigint end,
      case when v_tx->>'memo' is null then null else decode(v_tx->>'memo','hex') end,
      case when v_tx->>'public_key' is null then null else decode(v_tx->>'public_key','hex') end,
      case when v_tx->>'signature' is null then null else decode(v_tx->>'signature','hex') end,
      decode(v_tx->>'raw', 'hex'),
      case when jsonb_typeof(v_tx->'coinbase_outputs') = 'array'
           then v_tx->'coinbase_outputs' else null end
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
end $function$;

-- mempool_add mit bigint statt integer. Neue Signatur, also die alte weg.
drop function if exists chain2.mempool_add(bytea, bytea, bytea, bigint, bigint, bigint, integer, bytea);

create or replace function chain2.mempool_add(
  p_txid bytea, p_from bytea, p_to bytea, p_amount bigint, p_fee bigint,
  p_nonce bigint, p_valid_until bigint, p_raw bytea
) returns jsonb language plpgsql security definer
set search_path to 'chain2', 'pg_temp'
as $$
declare v_existing chain2.mempool%rowtype;
begin
  select * into v_existing from chain2.mempool
   where from_addr = p_from and nonce = p_nonce;

  if found then
    if v_existing.txid = p_txid then
      return jsonb_build_object('accepted', true, 'duplicate', true);
    end if;
    if p_fee <= v_existing.fee then
      return jsonb_build_object('accepted', false, 'reason', 'fee_not_higher',
                                'current_fee', v_existing.fee);
    end if;
    delete from chain2.mempool where txid = v_existing.txid;
  end if;

  insert into chain2.mempool (txid, from_addr, to_addr, amount, fee, nonce,
                              valid_until, raw)
  values (p_txid, p_from, p_to, p_amount, p_fee, p_nonce, p_valid_until, p_raw);

  return jsonb_build_object('accepted', true, 'replaced', found);
end $$;

-- Wie in 00026: nur der Dienst darf schreiben.
revoke execute on function
  chain2.mempool_add(bytea, bytea, bytea, bigint, bigint, bigint, bigint, bytea)
from public, anon, authenticated;
grant execute on function
  chain2.mempool_add(bytea, bytea, bytea, bigint, bigint, bigint, bigint, bytea)
to service_role;
