-- ============================================================================
-- 00031  Spiegel: commit_block mengenbasiert, doppelten Index entfernen
-- ============================================================================
--
-- Volllast-Konzept M4. Beim Stresstest am 26.11.2026 lief commit_block fuer
-- volle Bloecke (5.000 Transaktionen) in die Zeitgrenze von 8 s; der laengste
-- Lauf dauerte live 27,5 s (pg_stat_statements). Die Funktion schrieb jede
-- Transaktion und jedes Konto in einer eigenen Schleifenrunde.
--
-- Jetzt: dieselben Daten, dieselben Regeln, aber je Tabelle EIN Befehl ueber
-- alle Zeilen (jsonb_array_elements). Lokal gemessen gegen das Live-Schema
-- mit 1,1 Mio. vorhandenen Transaktionen: 590-751 ms -> 159-223 ms je vollem
-- Block. Das Rueckbau-Journal aus 00030 bleibt unveraendert.
--
-- Ergebnis und Fehlerverhalten wie bisher: Ein doppelter Schluessel bricht
-- den ganzen Aufruf ab, nichts wird teilweise geschrieben.
--
-- tx_block_idx (block_height, idx) ist ein zweiter Index neben dem
-- Eindeutigkeits-Index transactions_block_height_idx_key auf denselben
-- Spalten -- jede Zeile wurde zweimal einsortiert. Er faellt weg; Abfragen
-- nutzen den gleichwertigen eindeutigen Index.
--
-- Zuruecknehmen: commit_block aus 00030 wieder einspielen und
--   create index tx_block_idx on chain2.transactions (block_height, idx);
-- ============================================================================

drop index if exists chain2.tx_block_idx;

create or replace function chain2.commit_block(
  p_block jsonb, p_txs jsonb, p_accounts jsonb, p_supply numeric
) returns jsonb
language plpgsql security definer
set search_path = chain2, pg_temp
as $$
declare
  v_height   int   := (p_block->>'height')::int;
  v_hash     bytea := decode(p_block->>'hash', 'hex');
  v_root     bytea := decode(p_block->>'state_root', 'hex');
  v_written  int;
begin
  -- Schreiben und Rueckbau nie gleichzeitig (00030).
  perform pg_advisory_xact_lock(hashtext('chain2.spiegel'));

  -- Journal: so stand es VOR diesem Block (00030).
  insert into chain2.spiegel_undo_block (height, hash, vorher_height, vorher_root, vorher_menge)
  select v_height, v_hash, m.height, m.state_root, m.total_supply
    from chain2.state_meta m where m.id = 1;

  insert into chain2.spiegel_undo_konten (height, address, gab_es, balance, nonce, first_height, last_height)
  select v_height, k.addr, a.address is not null, a.balance, a.nonce, a.first_height, a.last_height
    from (select distinct decode(e->>'address','hex') addr from jsonb_array_elements(p_accounts) e) k
    left join chain2.accounts a on a.address = k.addr;

  delete from chain2.spiegel_undo_konten where height <= v_height - 100;
  delete from chain2.spiegel_undo_block  where height <= v_height - 100;

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

  insert into chain2.transactions (
    txid, block_height, idx, type, version, from_addr, to_addr,
    amount, fee, nonce, valid_until, memo, public_key, signature, raw,
    coinbase_outputs, flags, valid_from, script, witness
  )
  select decode(t->>'txid', 'hex'), v_height, (t->>'idx')::int,
         (t->>'type')::smallint, (t->>'version')::int,
         decode(t->>'from', 'hex'), decode(t->>'to', 'hex'),
         (t->>'amount')::bigint, coalesce((t->>'fee')::bigint, 0),
         (t->>'nonce')::bigint, (t->>'valid_until')::bigint,
         decode(t->>'memo', 'hex'), decode(t->>'public_key', 'hex'), decode(t->>'signature', 'hex'),
         decode(t->>'raw', 'hex'),
         case when jsonb_typeof(t->'coinbase_outputs') = 'array' then t->'coinbase_outputs' end,
         (t->>'flags')::smallint, (t->>'valid_from')::bigint,
         decode(t->>'script', 'hex'), decode(t->>'witness', 'hex')
    from jsonb_array_elements(p_txs) t;
  get diagnostics v_written = row_count;

  -- Konten auf 0/0 verschwinden, alle anderen werden geschrieben (wie bisher).
  -- Steht ein Konto mehrfach in der Liste, gilt wie in der alten Schleife
  -- der letzte Eintrag.
  create temp table if not exists spiegel_konten_neu (address bytea primary key, balance bigint, nonce bigint) on commit drop;
  truncate spiegel_konten_neu;
  insert into spiegel_konten_neu
  select distinct on (decode(k->>'address', 'hex')) decode(k->>'address', 'hex'), (k->>'balance')::bigint, (k->>'nonce')::bigint
    from jsonb_array_elements(p_accounts) with ordinality as e(k, nr)
   order by decode(k->>'address', 'hex'), nr desc;

  delete from chain2.accounts a
   using spiegel_konten_neu k
   where k.balance = 0 and k.nonce = 0 and a.address = k.address;

  insert into chain2.accounts (address, balance, nonce, first_height, last_height)
  select k.address, k.balance, k.nonce, v_height, v_height
    from spiegel_konten_neu k
   where not (k.balance = 0 and k.nonce = 0)
  on conflict (address) do update
     set balance = excluded.balance, nonce = excluded.nonce, last_height = v_height;

  delete from chain2.mempool m
   using jsonb_array_elements(p_txs) t
   where m.txid = decode(t->>'txid', 'hex');
  delete from chain2.mempool where valid_until <> 0 and valid_until < v_height;

  update chain2.state_meta
     set height = v_height, state_root = v_root,
         total_supply = p_supply, updated_at = now()
   where id = 1;

  return jsonb_build_object('height', v_height, 'txs', v_written,
                            'hash', encode(v_hash, 'hex'));
end $$;

revoke execute on function chain2.commit_block(jsonb, jsonb, jsonb, numeric) from public, anon, authenticated;
grant  execute on function chain2.commit_block(jsonb, jsonb, jsonb, numeric) to service_role;
