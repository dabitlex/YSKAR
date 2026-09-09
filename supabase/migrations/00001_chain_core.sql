-- ============================================================================
-- 00001_chain_core.sql
--
-- Grundschema der PoW-Kette.
--
-- Leitprinzip: der Client schreibt NICHTS. Jede Zeile in shares, blocks,
-- round_contributions und block_rewards entsteht ausschliesslich ueber die API
-- mit der Service Role, nachdem der Server den Hash selbst nachgerechnet hat.
-- RLS gibt dem anon-Key ausschliesslich Leserechte auf oeffentliche Daten.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- Parameter
-- Eine einzige Zeile. Alle Konstanten der Kette an einem Ort, damit
-- Difficulty-, Reward- und VarDiff-Logik nirgends hartkodiert sind.
create table chain_params (
  id                       smallint primary key default 1 check (id = 1),
  version                  int      not null default 1,
  hash_algo                text     not null default 'sha256d',

  -- 1 Difficulty = 65.536 erwartete Hashes. target = floor(2^240 / difficulty)
  difficulty_unit          bigint   not null default 65536,
  target_block_time        int      not null default 600,      -- Sekunden

  -- Emission: reward = initial_reward / 2^(height / epoch_blocks)
  epoch_blocks             int      not null default 12000,    -- 2 Seasons
  season_blocks            int      not null default 6000,     -- ca. 6 Wochen
  initial_reward           bigint   not null default 87500000000,      -- 875 TOKEN
  token_decimals           smallint not null default 8,
  max_supply               bigint   not null default 2100000000000000, -- 21 Mio

  -- gemessen auf einem Android-Referenzgeraet: 2,64 MH/s Dauerleistung
  genesis_difficulty       bigint   not null default 24576,
  min_difficulty           bigint   not null default 4096,

  lwma_window              int      not null default 45,
  lwma_clamp               numeric  not null default 4,
  emergency_factor         numeric  not null default 3,  -- Target lockert ab 3x Zielzeit

  vardiff_target_seconds   int      not null default 30,
  vardiff_min              bigint   not null default 32,
  vardiff_max              bigint   not null default 4096,
  share_diff_block_ratio   int      not null default 8,  -- share_diff <= block_diff/8

  account_cap_pct          numeric  not null default 0.05,
  finder_bonus_pct         numeric  not null default 0,  -- rein anteilig

  job_ttl_seconds          int      not null default 90,
  session_timeout_seconds  int      not null default 120,
  share_retention_days     int      not null default 7,
  max_share_rate_per_min   int      not null default 8,  -- Lastschutz, kein Fairness-Deckel

  updated_at               timestamptz not null default now()
);
insert into chain_params (id) values (1);

comment on column chain_params.account_cap_pct is
  'Obergrenze je Konto und Runde. Wirksam wird max(account_cap_pct, 1/N) -- '
  'bei wenigen Minern darf jeder mehr, sonst bliebe der Reward unverteilbar.';

-- Reward an einer Hoehe. Ganzzahlig, wie Bitcoin: die Abrundung ab der
-- neunten Halbierung laesst die reale Gesamtmenge knapp unter 21 Mio landen.
create or replace function reward_at(p_height int)
returns bigint language sql stable as $$
  select case
    when p_height / c.epoch_blocks >= 63 then 0::bigint
    else floor(c.initial_reward / power(2::numeric, p_height / c.epoch_blocks))::bigint
  end
  from chain_params c where c.id = 1;
$$;

create or replace function season_at(p_height int)
returns int language sql stable as $$
  select (p_height / c.season_blocks) + 1 from chain_params c where c.id = 1;
$$;

-- ------------------------------------------------------------------- Nutzer
create table users (
  id             uuid primary key default gen_random_uuid(),
  telegram_id    bigint not null unique,
  username       text,
  first_name     text,
  last_name      text,
  photo_url      text,
  language_code  text,
  is_premium     boolean not null default false,
  platform       text,                         -- android | ios, aus WebApp.platform
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  balance        bigint  not null default 0 check (balance >= 0),
  lifetime_earned bigint not null default 0,
  blocks_found   int     not null default 0,
  lifetime_weight numeric not null default 0,
  banned         boolean not null default false
);
comment on column users.first_seen_at is
  'Erster Aufruf DIESER App. Telegram liefert kein Registrierungsdatum des Kontos.';

create index users_balance_idx on users (balance desc) where not banned;

-- -------------------------------------------------------------------- Clans
create table clans (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  tag          text unique,
  owner_id     uuid not null references users(id) on delete restrict,
  created_at   timestamptz not null default now(),
  member_count int not null default 0,
  blocks_found int not null default 0,
  lifetime_weight numeric not null default 0
);

create table clan_members (
  clan_id   uuid not null references clans(id) on delete cascade,
  user_id   uuid not null references users(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner','officer','member')),
  joined_at timestamptz not null default now(),
  primary key (clan_id, user_id)
);
-- Ein Nutzer kann in genau einem Clan sein.
create unique index clan_members_single_clan on clan_members (user_id);

-- ------------------------------------------------------------------- Bloecke
create table blocks (
  height      int primary key,
  version     int    not null,
  prev_hash   bytea  not null check (octet_length(prev_hash) = 32),
  merkle_root bytea  not null check (octet_length(merkle_root) = 32),
  job_seed    bytea  not null check (octet_length(job_seed) = 16),
  block_time  bigint not null,                 -- Unix-Sekunden, im Header
  difficulty  bigint not null check (difficulty > 0),
  extranonce  bigint not null,
  nonce       bigint not null,
  block_hash  bytea  not null unique check (octet_length(block_hash) = 32),
  miner_id    uuid   references users(id) on delete set null,
  clan_id     uuid   references clans(id) on delete set null,
  reward      bigint not null check (reward >= 0),
  found_at    timestamptz not null default now()
);
comment on table blocks is
  'merkle_root committet auf Shares und Reward-Verteilung der VORHERIGEN Runde. '
  'Die laufende Runde kann nicht im eigenen Header stehen -- das waere zirkulaer.';

create index blocks_miner_idx on blocks (miner_id) where miner_id is not null;
create index blocks_clan_idx  on blocks (clan_id)  where clan_id is not null;
create index blocks_found_idx on blocks (found_at desc);

-- Verkettung erzwingen: luecken- und sprungfrei, prev_hash muss passen.
create or replace function fn_block_link_guard() returns trigger
language plpgsql as $$
declare v_max int; v_prev bytea;
begin
  select max(height) into v_max from blocks;
  if v_max is null then
    if new.height <> 0 then
      raise exception 'Der erste Block muss Hoehe 0 haben, nicht %', new.height;
    end if;
    if new.prev_hash <> decode(repeat('00', 32), 'hex') then
      raise exception 'Genesis prev_hash muss aus 32 Nullbytes bestehen';
    end if;
  else
    if new.height <> v_max + 1 then
      raise exception 'Naechste Hoehe waere %, erhalten %', v_max + 1, new.height;
    end if;
    select block_hash into v_prev from blocks where height = v_max;
    if new.prev_hash <> v_prev then
      raise exception 'prev_hash passt nicht zum Hash von Block %', v_max;
    end if;
  end if;
  return new;
end $$;

create trigger blocks_link_guard before insert on blocks
  for each row execute function fn_block_link_guard();

-- Bloecke sind unveraenderlich. Auch fuer die Service Role.
create or replace function fn_blocks_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'Bloecke sind unveraenderlich (% auf Hoehe %)', tg_op, old.height;
end $$;

create trigger blocks_immutable before update or delete on blocks
  for each row execute function fn_blocks_immutable();

-- ------------------------------------------------------------------ Runden
create table rounds (
  id           bigserial primary key,
  height       int    not null unique,        -- Hoehe, an der gearbeitet wird
  difficulty   bigint not null check (difficulty > 0),
  prev_hash    bytea  not null check (octet_length(prev_hash) = 32),
  merkle_root  bytea  not null check (octet_length(merkle_root) = 32),
  opened_at    timestamptz not null default now(),
  closed_at    timestamptz,
  block_height int    references blocks(height),
  status       text   not null default 'open'
                 check (status in ('open','settling','settled'))
);
-- Hoechstens eine offene Runde.
create unique index rounds_single_open on rounds ((true)) where status = 'open';

-- -------------------------------------------------------------------- Jobs
create table mining_jobs (
  id          uuid primary key default gen_random_uuid(),
  round_id    bigint not null references rounds(id) on delete cascade,
  height      int    not null,
  prev_hash   bytea  not null check (octet_length(prev_hash) = 32),
  merkle_root bytea  not null check (octet_length(merkle_root) = 32),
  job_seed    bytea  not null check (octet_length(job_seed) = 16),
  block_time  bigint not null,
  difficulty  bigint not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index mining_jobs_round_idx   on mining_jobs (round_id, created_at desc);
create index mining_jobs_expires_idx on mining_jobs (expires_at);

-- ---------------------------------------------------------------- Sessions
create sequence extranonce_seq start 1;

create table mining_sessions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references users(id) on delete cascade,
  clan_id            uuid references clans(id) on delete set null,
  extranonce         bigint not null unique default nextval('extranonce_seq'),
  share_difficulty   bigint not null,
  duty_cycle         smallint not null default 100 check (duty_cycle between 1 and 100),
  platform           text not null,
  started_at         timestamptz not null default now(),
  last_share_at      timestamptz,
  valid_shares       int not null default 0,
  invalid_shares     int not null default 0,
  accumulated_weight numeric not null default 0,
  status             text not null default 'active'
                       check (status in ('active','expired','stopped'))
);
comment on column mining_sessions.extranonce is
  'Trennt die Suchraeume aller Miner. Ein Share einer fremden Session ist damit '
  'wertlos, und zwei Nutzer koennen nie denselben gueltigen Share finden.';

create index mining_sessions_active_idx on mining_sessions (user_id) where status = 'active';
create index mining_sessions_reaper_idx on mining_sessions (last_share_at) where status = 'active';

-- ------------------------------------------------------------------ Shares
-- Bewusst nicht partitioniert: die Eindeutigkeit ueber (job_id, extranonce,
-- nonce) muesste sonst den Partitionsschluessel enthalten und wuerde
-- Duplikate ueber Tagesgrenzen hinweg durchlassen. Ab etwa 100 Shares/s wird
-- daraus eine partitionierte Tabelle plus eine eigene, kurzlebige
-- Dedupe-Schicht -- das ist eine Skalierungs-, keine Korrektheitsfrage.
create table shares (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  job_id     uuid   not null references mining_jobs(id) on delete cascade,
  round_id   bigint not null references rounds(id) on delete cascade,
  session_id uuid   not null references mining_sessions(id) on delete cascade,
  user_id    uuid   not null references users(id) on delete cascade,
  clan_id    uuid   references clans(id) on delete set null,
  extranonce bigint not null,
  nonce      bigint not null,
  hash       bytea  not null check (octet_length(hash) = 32),
  difficulty bigint not null check (difficulty > 0),
  is_block   boolean not null default false,
  constraint shares_no_replay unique (job_id, extranonce, nonce)
);
create index shares_round_user_idx on shares (round_id, user_id);
create index shares_created_idx    on shares (created_at);
create index shares_session_idx    on shares (session_id, created_at desc);

-- ---------------------------------------------------- Beitraege je Runde
create table round_contributions (
  round_id       bigint not null references rounds(id) on delete cascade,
  user_id        uuid   not null references users(id) on delete cascade,
  clan_id        uuid   references clans(id) on delete set null,
  weight         numeric not null default 0,   -- Summe der Share-Difficulties
  share_count    int     not null default 0,
  first_share_at timestamptz,
  last_share_at  timestamptz,
  primary key (round_id, user_id)
);
create index round_contributions_clan_idx on round_contributions (round_id, clan_id);

-- Beitrag und Session-Zaehler beim Share-Insert fortschreiben.
-- rounds.total_weight wird BEWUSST nicht mitgefuehrt: eine einzelne Zeile,
-- die jeder Miner bei jedem Share sperrt, waere unter Last der Flaschenhals.
-- Die Rundensumme wird bei der Abrechnung und fuer die Live-Anzeige aus
-- round_contributions aufsummiert.
create or replace function fn_share_inserted() returns trigger
language plpgsql as $$
begin
  insert into round_contributions
    (round_id, user_id, clan_id, weight, share_count, first_share_at, last_share_at)
  values
    (new.round_id, new.user_id, new.clan_id, new.difficulty, 1, new.created_at, new.created_at)
  on conflict (round_id, user_id) do update set
    weight        = round_contributions.weight + excluded.weight,
    share_count   = round_contributions.share_count + 1,
    clan_id       = excluded.clan_id,
    last_share_at = excluded.last_share_at;

  update mining_sessions set
    valid_shares       = valid_shares + 1,
    accumulated_weight = accumulated_weight + new.difficulty,
    last_share_at      = new.created_at
  where id = new.session_id;

  update users set
    lifetime_weight = lifetime_weight + new.difficulty,
    last_seen_at    = new.created_at
  where id = new.user_id;

  return new;
end $$;

create trigger shares_after_insert after insert on shares
  for each row execute function fn_share_inserted();

-- --------------------------------------------------------------- Auszahlung
create table block_rewards (
  id           bigserial primary key,
  block_height int    not null references blocks(height) on delete restrict,
  user_id      uuid   not null references users(id) on delete restrict,
  clan_id      uuid   references clans(id) on delete set null,
  weight       numeric not null,
  weight_pct   numeric not null,   -- Anteil an der geleisteten Arbeit
  payout_pct   numeric not null,   -- Anteil am Reward (weicht bei Deckelung ab)
  amount       bigint not null check (amount >= 0),
  capped       boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (block_height, user_id)
);
create index block_rewards_user_idx on block_rewards (user_id, created_at desc);

-- Arbeitstabelle der Abrechnung. Bleibt nach dem Lauf leer, ist aber im
-- Fehlerfall inspizierbar -- deshalb keine temporaere Tabelle.
create table settlement_work (
  round_id bigint  not null,
  user_id  uuid    not null,
  clan_id  uuid,
  weight   numeric not null,
  fixed    boolean not null default false,
  amount   bigint  not null default 0,
  primary key (round_id, user_id)
);

-- Verteilt den Block-Reward rein anteilig, mit iterativer Deckelung auf
-- max(account_cap_pct, 1/N) je Konto. Gekappte Ueberhaenge fliessen an die
-- ungedeckelten Teilnehmer zurueck, bis sich nichts mehr aendert.
create or replace function settle_block(p_height int)
returns void language plpgsql security definer as $$
declare
  v_round       rounds%rowtype;
  v_reward      bigint;
  v_cap_pct     numeric;
  v_cap_amount  bigint;
  v_n           int;
  v_fixed_total bigint;
  v_free_weight numeric;
  v_remaining   bigint;
  v_total_weight numeric;
  v_rest        bigint;
  v_rc          int;
  v_iter        int := 0;
begin
  select * into v_round from rounds where block_height = p_height for update;
  if not found then
    raise exception 'Keine Runde fuer Hoehe %', p_height;
  end if;
  if v_round.status = 'settled' then
    return;   -- idempotent
  end if;

  select reward into v_reward from blocks where height = p_height;

  delete from settlement_work where round_id = v_round.id;
  insert into settlement_work (round_id, user_id, clan_id, weight)
  select round_id, user_id, clan_id, weight
  from round_contributions
  where round_id = v_round.id and weight > 0;

  select count(*), coalesce(sum(weight), 0)
    into v_n, v_total_weight
  from settlement_work where round_id = v_round.id;

  if v_n = 0 or v_reward = 0 then
    update rounds set status = 'settled', closed_at = now() where id = v_round.id;
    delete from settlement_work where round_id = v_round.id;
    return;
  end if;

  select greatest(account_cap_pct, 1.0 / v_n) into v_cap_pct
  from chain_params where id = 1;
  v_cap_amount := floor(v_reward * v_cap_pct);

  loop
    v_iter := v_iter + 1;

    select coalesce(sum(amount), 0) into v_fixed_total
    from settlement_work where round_id = v_round.id and fixed;
    v_remaining := v_reward - v_fixed_total;

    select coalesce(sum(weight), 0) into v_free_weight
    from settlement_work where round_id = v_round.id and not fixed;
    exit when v_free_weight <= 0;

    update settlement_work
       set amount = floor(v_remaining * weight / v_free_weight)
     where round_id = v_round.id and not fixed;

    update settlement_work
       set amount = v_cap_amount, fixed = true
     where round_id = v_round.id and not fixed and amount > v_cap_amount;
    get diagnostics v_rc = row_count;

    exit when v_rc = 0 or v_iter >= 32;
  end loop;

  -- Abrundungsrest an den groessten ungedeckelten Beitrag
  select v_reward - coalesce(sum(amount), 0) into v_rest
  from settlement_work where round_id = v_round.id;

  if v_rest > 0 then
    update settlement_work set amount = amount + v_rest
    where (round_id, user_id) = (
      select round_id, user_id from settlement_work
      where round_id = v_round.id
      order by fixed asc, weight desc, user_id asc limit 1
    );
  end if;

  insert into block_rewards
    (block_height, user_id, clan_id, weight, weight_pct, payout_pct, amount, capped)
  select p_height, user_id, clan_id, weight,
         round(weight / v_total_weight * 100, 4),
         round(amount::numeric / v_reward * 100, 4),
         amount, fixed
  from settlement_work
  where round_id = v_round.id and amount > 0;

  update users u set
    balance         = u.balance + w.amount,
    lifetime_earned = u.lifetime_earned + w.amount
  from settlement_work w
  where w.round_id = v_round.id and w.user_id = u.id and w.amount > 0;

  update rounds set status = 'settled', closed_at = now() where id = v_round.id;
  delete from settlement_work where round_id = v_round.id;
end $$;

-- --------------------------------------------------------- Live und Statistik
create table live_events (
  id         bigserial primary key,
  kind       text not null,
  payload    jsonb not null,
  created_at timestamptz not null default now()
);
create index live_events_recent_idx on live_events (created_at desc);
comment on table live_events is
  'Nur kuratierte Ereignisse: Blockfunde, Clan-Beitritte, Meilensteine. '
  'Ein Event je Share waere bei mehreren hundert Shares/s weder zustellbar '
  'noch lesbar.';

-- Eine Zeile, alle 3 Sekunden von einem einzigen Publisher geschrieben.
-- Alle Clients hoeren auf diesen einen Kanal statt selbst zu aggregieren.
create table network_stats (
  id             smallint primary key default 1 check (id = 1),
  height         int,
  difficulty     bigint,
  hashrate       numeric,
  active_miners  int,
  active_clans   int,
  round_weight   numeric,
  last_block_at  timestamptz,
  updated_at     timestamptz not null default now()
);
insert into network_stats (id) values (1);

-- ------------------------------------------------------------------ Pflege
create or replace function prune_shares() returns int
language plpgsql security definer as $$
declare v_days int; v_deleted int;
begin
  select share_retention_days into v_days from chain_params where id = 1;
  delete from shares where created_at < now() - make_interval(days => v_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;

create or replace function expire_sessions() returns int
language plpgsql security definer as $$
declare v_secs int; v_expired int;
begin
  select session_timeout_seconds into v_secs from chain_params where id = 1;
  update mining_sessions set status = 'expired'
  where status = 'active'
    and coalesce(last_share_at, started_at) < now() - make_interval(secs => v_secs);
  get diagnostics v_expired = row_count;
  return v_expired;
end $$;

-- --------------------------------------------------------------------- RLS
-- Schreibend kommt niemand ausser der Service Role durch: fuer Schreibrechte
-- existiert keine einzige Policy. Der anon-Key darf ausschliesslich lesen,
-- und auch das nur bei oeffentlichen Daten.
alter table chain_params        enable row level security;
alter table users               enable row level security;
alter table clans               enable row level security;
alter table clan_members        enable row level security;
alter table blocks              enable row level security;
alter table rounds              enable row level security;
alter table mining_jobs         enable row level security;
alter table mining_sessions     enable row level security;
alter table shares              enable row level security;
alter table round_contributions enable row level security;
alter table block_rewards       enable row level security;
alter table settlement_work     enable row level security;
alter table live_events         enable row level security;
alter table network_stats       enable row level security;

create policy p_read on chain_params  for select to anon, authenticated using (true);
create policy p_read on blocks        for select to anon, authenticated using (true);
create policy p_read on rounds        for select to anon, authenticated using (true);
create policy p_read on clans         for select to anon, authenticated using (true);
create policy p_read on clan_members  for select to anon, authenticated using (true);
create policy p_read on block_rewards for select to anon, authenticated using (true);
create policy p_read on live_events   for select to anon, authenticated using (true);
create policy p_read on network_stats for select to anon, authenticated using (true);
create policy p_read on users         for select to anon, authenticated using (not banned);
create policy p_read on mining_jobs   for select to anon, authenticated using (true);

-- shares, mining_sessions, round_contributions und settlement_work bleiben
-- ohne jede Policy: nur die Service Role sieht sie.

-- ---------------------------------------------------------------- Genesis
-- Echt gemint mit derselben WASM-Engine, die auch im Client laeuft:
-- 4.016.000.000 Hashes bei Difficulty 24576.
-- Unabhaengig nachgeprueft gegen crypto.sha256d; der Hash liegt 13,3 %
-- unter dem Target.
insert into blocks (
  height, version, prev_hash, merkle_root, job_seed, block_time,
  difficulty, extranonce, nonce, block_hash, miner_id, clan_id, reward
) values (
  0, 1,
  decode(repeat('00', 32), 'hex'),
  decode(repeat('00', 32), 'hex'),
  decode('70726f6f66206e6f742070726f6d6973', 'hex'),   -- "proof not promis"
  1788825600,                                           -- 2026-09-08T00:00:00Z
  24576, 0, 4017069256,
  decode('000000025033fa3c6e5a50956de77df04053008c3a6e606cc3c048c7083b75e0', 'hex'),
  null, null, 0
);

-- Erste Runde: es wird an Hoehe 1 gearbeitet.
insert into rounds (height, difficulty, prev_hash, merkle_root)
select 1,
       (select genesis_difficulty from chain_params where id = 1),
       decode('000000025033fa3c6e5a50956de77df04053008c3a6e606cc3c048c7083b75e0', 'hex'),
       decode(repeat('00', 32), 'hex');

update network_stats set
  height = 1,
  difficulty = (select genesis_difficulty from chain_params where id = 1),
  last_block_at = to_timestamp(1788825600),
  updated_at = now()
where id = 1;
