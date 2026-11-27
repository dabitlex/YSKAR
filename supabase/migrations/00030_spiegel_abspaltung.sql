-- ============================================================================
-- 00030  Spiegel: Abspaltungen selbst zuruecknehmen
-- ============================================================================
--
-- Anlass (27.11.2026): Auf Hoehe 10991 fanden YSKAR MAIN und ein Solo-Miner
-- fast gleichzeitig einen Block. Der Spiegel uebernahm den von YSKAR MAIN,
-- die Kette den Solo-Block. Jeder folgende Block zeigte damit auf einen
-- Vorgaenger, den der Spiegel nicht hat (wrong_parent), und der Spiegel
-- stand fuenf Stunden still, bis er von Hand zurueckgesetzt wurde.
--
-- rollback_to (00007) hilft dabei nicht: Es leert ALLE Konten und laesst
-- den Zustand neu rechnen -- ein Spiegel mit vielen Konten kaeme danach nicht
-- mehr in Gang, weil die Route den Zustand aus genau diesen Konten liest.
--
-- Deshalb ein Rueckbau-Journal: commit_block merkt sich je Block, wie jedes
-- beruehrte Konto VORHER aussah und wie state_meta vorher stand.
-- spiegel_zurueck nimmt damit Bloecke exakt zurueck, juengster zuerst. Ob
-- der Rueckbau stimmt, prueft danach die Route beim naechsten Block selbst:
-- Sie rechnet die Zustandswurzel nach und lehnt ab, wenn auch nur eine
-- Einheit fehlt.
--
-- Das Journal reicht 100 Bloecke zurueck (rund 17 Stunden). Tiefere
-- Abspaltungen lehnt die Funktion ab; dann bleibt der Weg von Hand.
--
-- Bloecke, die VOR dieser Migration geschrieben wurden, haben kein Journal
-- und lassen sich nicht automatisch zuruecknehmen. Ab dem ersten Block
-- danach greift es.
--
-- commit_block bleibt in Ablauf und Ergebnis gleich; neu sind nur die
-- Journal-Zeilen und eine Sperre gegen gleichzeitigen Rueckbau.
--
-- Zuruecknehmen: commit_block aus 00028 wieder einspielen,
--   drop function chain2.spiegel_zurueck(integer, bytea);
--   drop table chain2.spiegel_undo_konten, chain2.spiegel_undo_block;
-- ============================================================================

create table if not exists chain2.spiegel_undo_block (
  height        int     primary key,
  hash          bytea   not null,
  vorher_height int     not null,
  vorher_root   bytea,
  vorher_menge  numeric not null
);

create table if not exists chain2.spiegel_undo_konten (
  height        int     not null,
  address       bytea   not null,
  gab_es        boolean not null,
  balance       bigint,
  nonce         bigint,
  first_height  int,
  last_height   int,
  primary key (height, address)
);

-- Nur der Server schreibt und liest das Journal; ueber die API ist es nicht sichtbar.
alter table chain2.spiegel_undo_block  enable row level security;
alter table chain2.spiegel_undo_konten enable row level security;
revoke all on chain2.spiegel_undo_block, chain2.spiegel_undo_konten from public, anon, authenticated;

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
  v_tx       jsonb;
  v_acc      jsonb;
  v_txids    bytea[] := '{}';
  v_written  int := 0;
begin
  -- Schreiben und Rueckbau nie gleichzeitig.
  perform pg_advisory_xact_lock(hashtext('chain2.spiegel'));

  -- Journal: so stand es VOR diesem Block.
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

-- ----------------------------------------------------------------------------
-- spiegel_zurueck(bis, kopf_hash)
--
-- Nimmt alle Bloecke oberhalb von p_bis zurueck, juengster zuerst, und
-- stellt Konten und state_meta exakt auf den Stand nach Block p_bis.
-- p_kopf_hash muss der Hash des aktuellen Kopfes sein -- hat sich der Kopf
-- seit der Pruefung in der Route bewegt, passiert nichts.
-- Alles oder nichts: Fehlt fuer einen Block das Journal, bricht es ab.
-- ----------------------------------------------------------------------------
create or replace function chain2.spiegel_zurueck(p_bis int, p_kopf_hash bytea)
returns jsonb
language plpgsql security definer
set search_path = chain2, pg_temp
as $$
declare
  v_kopf   int;
  v_hash   bytea;
  v_h      int;
  v_undo   chain2.spiegel_undo_block;
  v_n      int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('chain2.spiegel'));

  select height, hash into v_kopf, v_hash from chain2.blocks order by height desc limit 1;
  if v_kopf is null then raise exception 'Spiegel ist leer'; end if;
  if v_hash <> p_kopf_hash then
    raise exception 'Kopf hat sich bewegt (Hoehe %), nichts zurueckgenommen', v_kopf;
  end if;
  if p_bis >= v_kopf then
    return jsonb_build_object('bis', v_kopf, 'entfernt', 0);
  end if;
  if p_bis < 0 or v_kopf - p_bis > 100 then
    raise exception 'Rueckbau von % auf % ist tiefer als das Journal (100 Bloecke)', v_kopf, p_bis;
  end if;

  for v_h in reverse v_kopf .. p_bis + 1 loop
    select * into v_undo from chain2.spiegel_undo_block where height = v_h;
    if not found then
      raise exception 'Kein Journal fuer Block % -- von Hand zuruecksetzen', v_h;
    end if;
    if v_undo.hash <> (select hash from chain2.blocks where height = v_h) then
      raise exception 'Journal von Block % gehoert zu einem anderen Block', v_h;
    end if;

    -- Konten, die es vor dem Block nicht gab, verschwinden wieder.
    delete from chain2.accounts a
     using chain2.spiegel_undo_konten u
     where u.height = v_h and not u.gab_es and a.address = u.address;

    -- Alle anderen bekommen ihren alten Stand zurueck (auch wenn der Block sie geloescht hatte).
    insert into chain2.accounts (address, balance, nonce, first_height, last_height)
    select u.address, u.balance, u.nonce, u.first_height, u.last_height
      from chain2.spiegel_undo_konten u
     where u.height = v_h and u.gab_es
    on conflict (address) do update
      set balance = excluded.balance, nonce = excluded.nonce,
          first_height = excluded.first_height, last_height = excluded.last_height;

    update chain2.state_meta
       set height = v_undo.vorher_height, state_root = v_undo.vorher_root,
           total_supply = v_undo.vorher_menge, updated_at = now()
     where id = 1;

    delete from chain2.spiegel_undo_konten where height = v_h;
    delete from chain2.spiegel_undo_block  where height = v_h;
    v_n := v_n + 1;
  end loop;

  -- Bloecke sind sonst unveraenderlich (00007); nur hier und in rollback_to wird geloescht.
  alter table chain2.blocks disable trigger blocks_immutable;
  delete from chain2.blocks where height > p_bis;      -- Transaktionen per Kaskade
  alter table chain2.blocks enable trigger blocks_immutable;

  return jsonb_build_object('bis', p_bis, 'entfernt', v_n);
end $$;

revoke execute on function chain2.spiegel_zurueck(int, bytea) from public, anon, authenticated;
grant  execute on function chain2.spiegel_zurueck(int, bytea) to service_role;
revoke execute on function chain2.commit_block(jsonb, jsonb, jsonb, numeric) from public, anon, authenticated;
grant  execute on function chain2.commit_block(jsonb, jsonb, jsonb, numeric) to service_role;
