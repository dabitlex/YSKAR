-- ============================================================================
-- 00020  difficulty: numeric statt bigint (Konsensfassung 4)
-- ============================================================================
--
-- Ab Hoehe 6.000 kann die Difficulty ueber den u32-Bereich hinaus wachsen,
-- bis knapp 2^240 (73 Stellen). bigint endet bei 9.223.372.036.854.775.807.
-- Derselbe Fall wie bei der Extranonce (00015): Ein einziger Block mit
-- groesserer Difficulty wuerde commit_block scheitern lassen, und weil
-- commit_block nur den jeweils naechsten Block zulaesst, stuende der Spiegel
-- danach still, waehrend die Kette weiterlaeuft.
--
-- numeric(78,0) traegt jede Zahl bis 2^256. Bestehende Werte (hoechster
-- bisher 1.831.228) werden unveraendert uebernommen; die Pruefung
-- difficulty > 0 bleibt bestehen.
--
-- commit_block: Geaendert ist genau eine Zeile:
--   (p_block->>'difficulty')::bigint  ->  ::numeric(78,0)
-- Der Rest ist der Rumpf aus der Datenbank, unveraendert.
--
-- LESEN: PostgREST liefert numeric als JSON-Zahl, und JavaScript rundet
-- ab 2^53. Wer den genauen Wert braucht, liest difficulty::text.
-- ============================================================================

alter table chain2.blocks alter column difficulty type numeric(78,0) using difficulty::numeric;
alter table chain2.jobs   alter column difficulty type numeric(78,0) using difficulty::numeric;

comment on column chain2.blocks.difficulty is
  'Echte Difficulty des Blocks (nicht das Header-Feld). Ab Hoehe 6.000 '
  'unbegrenzt bis knapp 2^240 -- siehe docs/CONSENSUS_V4.md, Migration 00020.';

CREATE OR REPLACE FUNCTION chain2.commit_block(p_block jsonb, p_txs jsonb, p_accounts jsonb, p_supply numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
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
      case when v_tx->>'valid_until' is null then null else (v_tx->>'valid_until')::int end,
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
