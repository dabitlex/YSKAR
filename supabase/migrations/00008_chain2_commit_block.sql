-- Einen geprueften Block atomar festschreiben.
--
-- Arbeitsteilung: Der Knoten in TypeScript prueft den Block vollstaendig
-- (Struktur, PoW, Signaturen, Guthaben, state_root) und rechnet den
-- Folgezustand aus. Hier passiert ausschliesslich das, was ATOMAR sein
-- muss: Block, Transaktionen, Kontostaende und der Fortschrittszeiger in
-- einer Transaktion. Zwischen "Block einfuegen" und "Konten fortschreiben"
-- darf kein zweiter Aufruf dazwischen.
--
-- NACHTRAG 17.09.2026: Diese Datei enthielt urspruenglich nur diese
-- Beschreibung. Der Inhalt unten ist aus der laufenden Datenbank
-- ausgelesen -- ohne ihn liess sich das Schema aus dem Repository nicht
-- wiederherstellen.

create or replace function chain2.commit_block(
  p_block jsonb, p_txs jsonb, p_accounts jsonb, p_supply numeric
) returns jsonb language plpgsql security definer as $$
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
    (p_block->>'difficulty')::bigint,
    (p_block->>'tx_count')::int,
    (p_block->>'extranonce')::bigint,
    (p_block->>'nonce')::bigint,
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
      v_tx->'coinbase_outputs'
    );
    v_txids := array_append(v_txids, decode(v_tx->>'txid', 'hex'));
    v_written := v_written + 1;
  end loop;

  -- Nur die GEAENDERTEN Konten. Ein Konto ohne Guthaben und ohne Nonce wird
  -- geloescht, nicht auf null gesetzt -- sonst haenge der state_root davon
  -- ab, wer irgendwann einmal eine Zeile hatte.
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

  -- Aufgenommene Transaktionen aus dem Mempool nehmen, abgelaufene auch.
  delete from chain2.mempool where txid = any(v_txids);
  delete from chain2.mempool where valid_until <> 0 and valid_until < v_height;

  update chain2.state_meta
     set height = v_height, state_root = v_root,
         total_supply = p_supply, updated_at = now()
   where id = 1;

  return jsonb_build_object('height', v_height, 'txs', v_written,
                            'hash', encode(v_hash, 'hex'));
end $$;

-- Eine Transaktion in den Mempool aufnehmen.
--
-- Ersetzen nur mit hoeherer Gebuehr. Ohne diese Regel liesse sich der
-- Mempool mit Varianten derselben Nonce fluten -- alle gueltig signiert,
-- alle kostenlos.
create or replace function chain2.mempool_add(
  p_txid bytea, p_from bytea, p_to bytea, p_amount bigint, p_fee bigint,
  p_nonce bigint, p_valid_until integer, p_raw bytea
) returns jsonb language plpgsql security definer as $$
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

-- Sessions ablaufen lassen, die laenger nichts eingereicht haben.
create or replace function chain2.expire_sessions(p_seconds integer default 120)
returns integer language plpgsql security definer as $$
declare v int;
begin
  update chain2.sessions set status = 'expired'
   where status = 'active'
     and coalesce(last_share_at, started_at) < now() - make_interval(secs => p_seconds);
  get diagnostics v = row_count;
  return v;
end $$;
