-- YSKAR Phase 1 -- eigenstaendige Kette mit Transaktionen im Block.
--
-- GRUNDLEGENDER UNTERSCHIED zum Schema public: Dort war Postgres das
-- Hauptbuch, der Block enthielt nur einen Hash darauf. Hier ist die KETTE
-- die Wahrheit und die Datenbank ein wiederherstellbarer Index. Jede Zeile
-- in chain2.accounts laesst sich aus blocks + transactions neu berechnen;
-- tests/core.test.ts fuehrt genau das als Pruefstein aus.
--
-- Es gibt hier bewusst KEINE Funktion, die Guthaben veraendert. Konten
-- werden ausschliesslich durch das Anwenden von Bloecken fortgeschrieben.
-- Wer eine Zeile von Hand aendert, macht den state_root ungueltig, und jeder
-- Knoten sieht das.
--
-- NACHTRAG 17.09.2026: Diese Datei enthielt urspruenglich nur diese
-- Beschreibung und den Verweis "Die vollstaendige Fassung ist im
-- Supabase-Projekt eingespielt". Damit liess sich das Schema aus dem
-- Repository nicht wiederherstellen -- fuer ein Projekt, das
-- Nachpruefbarkeit verspricht, die schwerwiegendste Luecke. Der Inhalt
-- unten ist aus der laufenden Datenbank ausgelesen.

create schema if not exists chain2;

-- Fortlaufende Extranonce. Sie trennt die Nonce-Raeume der Sessions; zwei
-- Miner koennen denselben Treffer dadurch gar nicht erst finden.
create sequence if not exists chain2.extranonce_seq as bigint start 1;

-- ------------------------------------------------------------ Parameter
-- Genau eine Zeile. Sie dient der Anzeige und dem Abgleich -- verbindlich
-- sind die Konstanten in src/lib/core/params.ts, denn danach rechnet der
-- Konsens.
create table if not exists chain2.params (
  id                 smallint  primary key default 1 check (id = 1),
  network            text      not null default 'yskar-main-1',
  chain_id           bytea     not null check (octet_length(chain_id) = 32),
  token_name         text      not null default 'YSKAR',
  token_symbol       text      not null default 'YSR',
  decimals           smallint  not null default 8,
  unit               bigint    not null default 100000000,
  max_supply         numeric   not null default 2100000000000000,
  initial_reward     bigint    not null default 87500000000,
  epoch_blocks       integer   not null default 12000,
  season_blocks      integer   not null default 6000,
  target_block_time  integer   not null default 600,
  difficulty_unit    bigint    not null default 65536,
  min_difficulty     bigint    not null default 4096,
  genesis_difficulty bigint    not null default 24576,
  lwma_window        integer   not null default 45,
  lwma_clamp         integer   not null default 4,
  solvetime_cap      integer   not null default 6,
  emergency_factor   integer   not null default 3,
  median_time_blocks integer   not null default 11,
  max_future_drift   integer   not null default 120,
  min_fee            bigint    not null default 100000,
  max_txs_per_block  integer   not null default 2000,
  max_memo_bytes     integer   not null default 32,
  address_hrp        text      not null default 'ysr',
  coin_type          integer   not null default 9077,
  updated_at         timestamptz not null default now()
);

-- -------------------------------------------------------------- Bloecke
-- Der Header ist auf 136 Byte festgenagelt. Weicht er ab, stimmt der Hash
-- nicht mehr -- die Pruefung gehoert deshalb schon in die Tabelle.
create table if not exists chain2.blocks (
  height      integer primary key,
  hash        bytea   not null unique check (octet_length(hash) = 32),
  version     integer not null,
  prev_hash   bytea   not null check (octet_length(prev_hash) = 32),
  merkle_root bytea   not null check (octet_length(merkle_root) = 32),
  state_root  bytea   not null check (octet_length(state_root) = 32),
  block_time  bigint  not null,
  difficulty  bigint  not null check (difficulty > 0),
  tx_count    integer not null check (tx_count >= 1),
  extranonce  bigint  not null,
  nonce       bigint  not null,
  header      bytea   not null check (octet_length(header) = 136),
  size_bytes  integer not null,
  received_at timestamptz not null default now()
);
create index if not exists blocks_time_idx on chain2.blocks (block_time desc);

-- --------------------------------------------------------- Transaktionen
create table if not exists chain2.transactions (
  txid         bytea   primary key check (octet_length(txid) = 32),
  block_height integer not null references chain2.blocks(height) on delete cascade,
  idx          integer not null check (idx >= 0),
  type         smallint not null check (type in (0, 1)),
  version      integer not null,
  from_addr    bytea   check (from_addr is null or octet_length(from_addr) = 20),
  to_addr      bytea   not null check (octet_length(to_addr) = 20),
  amount       bigint  not null check (amount >= 0),
  fee          bigint  not null default 0 check (fee >= 0),
  nonce        bigint,
  valid_until  integer,
  memo         bytea,
  public_key   bytea   check (public_key is null or octet_length(public_key) = 32),
  signature    bytea   check (signature is null or octet_length(signature) = 64),
  raw          bytea   not null,
  unique (block_height, idx),
  -- Die Coinbase steht an Position 0, alles andere dahinter. Das ist
  -- Konsens und keine Konvention.
  constraint coinbase_first check ((type = 0 and idx = 0) or (type = 1 and idx > 0))
);
create unique index if not exists tx_one_coinbase
  on chain2.transactions (block_height) where (type = 0);
create index if not exists tx_block_idx on chain2.transactions (block_height, idx);
create index if not exists tx_to_idx    on chain2.transactions (to_addr);
create index if not exists tx_from_idx  on chain2.transactions (from_addr, nonce)
  where from_addr is not null;

-- --------------------------------------------------------------- Konten
-- Abgeleitet, nicht verbindlich: vollstaendig aus blocks + transactions
-- wiederherstellbar. Kein negatives Guthaben -- ein Block, der das
-- erzeugen wuerde, kommt gar nicht erst durch.
create table if not exists chain2.accounts (
  address      bytea  primary key check (octet_length(address) = 20),
  balance      bigint not null default 0 check (balance >= 0),
  nonce        bigint not null default 0 check (nonce >= 0),
  first_height integer,
  last_height  integer
);
create index if not exists accounts_balance_idx
  on chain2.accounts (balance desc) where balance > 0;

-- ------------------------------------------------------------ Fortschritt
create table if not exists chain2.state_meta (
  id           smallint primary key default 1 check (id = 1),
  height       integer  not null default -1,
  state_root   bytea,
  total_supply numeric  not null default 0,
  updated_at   timestamptz not null default now()
);
insert into chain2.state_meta (id) values (1) on conflict do nothing;

-- -------------------------------------------------------------- Mempool
-- Eine Nonce je Absender: Zwei Transaktionen mit derselben Nonce sind
-- Konkurrenten, nicht beides gueltig.
create table if not exists chain2.mempool (
  txid        bytea   primary key check (octet_length(txid) = 32),
  from_addr   bytea   not null check (octet_length(from_addr) = 20),
  to_addr     bytea   not null check (octet_length(to_addr) = 20),
  amount      bigint  not null check (amount > 0),
  fee         bigint  not null check (fee >= 0),
  nonce       bigint  not null,
  valid_until integer not null default 0,
  raw         bytea   not null,
  received_at timestamptz not null default now(),
  unique (from_addr, nonce)
);
create index if not exists mempool_fee_idx on chain2.mempool (fee desc, received_at);

-- ------------------------------------------------------- Mining-Sessions
create table if not exists chain2.sessions (
  id                    uuid primary key default gen_random_uuid(),
  address               bytea not null check (octet_length(address) = 20),
  telegram_id           bigint,
  extranonce            bigint not null unique
                          default nextval('chain2.extranonce_seq'),
  share_difficulty      bigint not null,
  prev_share_difficulty bigint,
  difficulty_changed_at timestamptz,
  -- Normierte Messwerte: Sekunden je Difficulty-Einheit. Rohe Abstaende zu
  -- mitteln waere falsch, weil sie von der gerade geltenden Difficulty
  -- abhaengen -- daran hat die Anpassung frueher geschwungen.
  vardiff_samples       numeric[] not null default '{}',
  duty_cycle            smallint not null default 50
                          check (duty_cycle between 1 and 100),
  platform              text,
  started_at            timestamptz not null default now(),
  last_share_at         timestamptz,
  valid_shares          integer not null default 0,
  invalid_shares        integer not null default 0,
  accumulated_weight    numeric not null default 0,
  status                text not null default 'active'
                          check (status in ('active', 'expired', 'stopped'))
);
create index if not exists sessions_active_idx
  on chain2.sessions (address) where status = 'active';
create index if not exists sessions_reaper_idx
  on chain2.sessions (last_share_at) where status = 'active';

-- ----------------------------------------------------------------- Jobs
create table if not exists chain2.jobs (
  id            uuid primary key default gen_random_uuid(),
  height        integer not null,
  prev_hash     bytea not null check (octet_length(prev_hash) = 32),
  merkle_root   bytea not null check (octet_length(merkle_root) = 32),
  state_root    bytea not null check (octet_length(state_root) = 32),
  block_time    bigint not null,
  difficulty    bigint not null,
  tx_count      integer not null,
  txids         bytea[],
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  body          bytea not null,
  miner_address bytea check (miner_address is null or octet_length(miner_address) = 20)
);
create index if not exists jobs_height_idx  on chain2.jobs (height, created_at desc);
create index if not exists jobs_expires_idx on chain2.jobs (expires_at);

-- --------------------------------------------------------------- Shares
-- shares_no_replay: Dieselbe Nonce auf demselben Job mit derselben
-- Extranonce zaehlt genau einmal.
create table if not exists chain2.shares (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  job_id     uuid not null references chain2.jobs(id) on delete cascade,
  session_id uuid not null references chain2.sessions(id) on delete cascade,
  address    bytea not null check (octet_length(address) = 20),
  extranonce bigint not null,
  nonce      bigint not null,
  hash       bytea not null check (octet_length(hash) = 32),
  difficulty bigint not null check (difficulty > 0),
  is_block   boolean not null default false,
  constraint shares_no_replay unique (job_id, extranonce, nonce)
);
create index if not exists shares_addr_idx    on chain2.shares (address, created_at desc);
create index if not exists shares_created_idx on chain2.shares (created_at);

-- --------------------------------------------------- Verkettung erzwingen
-- Die Kette wird nicht nur im Code geprueft, sondern auch hier. Ein
-- Fehler in der Anwendung darf keine Luecke und keinen falschen Vorgaenger
-- in die Tabelle schreiben koennen.
create or replace function chain2.fn_block_link_guard()
returns trigger language plpgsql as $$
declare v_max int; v_prev bytea;
begin
  select max(height) into v_max from chain2.blocks;
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
    select hash into v_prev from chain2.blocks where height = v_max;
    if new.prev_hash <> v_prev then
      raise exception 'prev_hash passt nicht zum Hash von Block %', v_max;
    end if;
  end if;
  return new;
end $$;

create or replace function chain2.fn_blocks_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Bloecke sind unveraenderlich (% auf Hoehe %)', tg_op, old.height;
end $$;

drop trigger if exists blocks_link_guard on chain2.blocks;
create trigger blocks_link_guard before insert on chain2.blocks
  for each row execute function chain2.fn_block_link_guard();

drop trigger if exists blocks_immutable on chain2.blocks;
create trigger blocks_immutable before update on chain2.blocks
  for each row execute function chain2.fn_blocks_immutable();

-- ------------------------------------------------ Reorg-Hilfe fuer Phase 2
-- Setzt die Kette auf eine Hoehe zurueck und leert den abgeleiteten
-- Zustand. Der Zustand wird danach aus den Bloecken neu gerechnet -- er
-- wird NICHT teilweise zurueckgedreht, weil ein halb zurueckgedrehter
-- Zustand schlimmer waere als gar keiner.
create or replace function chain2.rollback_to(p_height integer)
returns integer language plpgsql security definer as $$
declare v_removed int;
begin
  alter table chain2.blocks disable trigger blocks_immutable;
  delete from chain2.blocks where height > p_height;
  get diagnostics v_removed = row_count;
  alter table chain2.blocks enable trigger blocks_immutable;

  delete from chain2.accounts;
  update chain2.state_meta
     set height = -1, state_root = null, total_supply = 0, updated_at = now()
   where id = 1;
  return v_removed;
end $$;

-- ------------------------------------------------------------------- RLS
-- Kettendaten sind oeffentlich lesbar -- eine Kette, die man nicht ansehen
-- kann, ist keine. Geschrieben wird ausschliesslich ueber die Service
-- Role, also nie aus dem Browser.
alter table chain2.params       enable row level security;
alter table chain2.blocks       enable row level security;
alter table chain2.transactions enable row level security;
alter table chain2.accounts     enable row level security;
alter table chain2.state_meta   enable row level security;
alter table chain2.mempool      enable row level security;
alter table chain2.sessions     enable row level security;
alter table chain2.jobs         enable row level security;
alter table chain2.shares       enable row level security;

drop policy if exists p_read on chain2.params;
create policy p_read on chain2.params       for select to anon, authenticated using (true);
drop policy if exists p_read on chain2.blocks;
create policy p_read on chain2.blocks       for select to anon, authenticated using (true);
drop policy if exists p_read on chain2.transactions;
create policy p_read on chain2.transactions for select to anon, authenticated using (true);
drop policy if exists p_read on chain2.accounts;
create policy p_read on chain2.accounts     for select to anon, authenticated using (true);
drop policy if exists p_read on chain2.state_meta;
create policy p_read on chain2.state_meta   for select to anon, authenticated using (true);
drop policy if exists p_read on chain2.mempool;
create policy p_read on chain2.mempool      for select to anon, authenticated using (true);

-- sessions, jobs und shares haben KEINE Leseregel: Sie gehoeren zum
-- Betrieb, nicht zur Kette. Ohne Regel bei aktivem RLS sieht anon nichts.
