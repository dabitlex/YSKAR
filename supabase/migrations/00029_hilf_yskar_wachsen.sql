-- ============================================================================
-- 00029  Aktion "Hilf YSKAR beim Wachsen" (Empfehlungen, Verlosung 1.000 USD)
-- ============================================================================
--
-- Rein additiv: zwei neue Tabellen und zwei Lesefunktionen im Schema chain2
-- (das Schema ist fuer die API schon freigegeben). Am Spiegel der Kette
-- aendert sich nichts.
--
-- aktion_teilnehmer
--   Ein Eintrag je Telegram-Konto. Gespeichert wird nicht die Telegram-ID,
--   sondern ein HMAC-Fingerabdruck (Schluessel nur auf dem Server). Dazu die
--   Wallet-Adresse, der eigene Empfehlungscode und -- falls ueber einen Link
--   gekommen -- der Code des Werbers.
--
--   status:  offen      geworben, wartet auf 3 Mining-Tage
--            bestaetigt 3 Mining-Tage innerhalb von 14 Tagen erreicht
--            ungueltig  zaehlt nicht (grund sagt warum)
--            ohne       nicht geworben (Werber oder normaler Nutzer)
--
-- aktion_gewinner
--   Ergebnis der Ziehung (scripts/aktion-ziehung.ts). Die App zeigt einem
--   Gewinner Platz, Betrag und Gewinncode; abgeholt wird im Community-Bot.
-- ============================================================================

create table if not exists chain2.aktion_teilnehmer (
  tg_fingerabdruck text primary key,
  adresse          text not null unique,
  code             text not null unique check (code ~ '^[a-z0-9]{6,16}$'),
  geworben_von     text,
  angemeldet_am    timestamptz not null default now(),
  status           text not null default 'ohne'
                   check (status in ('ohne', 'offen', 'bestaetigt', 'ungueltig')),
  grund            text,
  mining_tage      integer not null default 0,
  bestaetigt_am    timestamptz,
  geprueft_am      timestamptz
);
create index if not exists aktion_teilnehmer_werber_idx
  on chain2.aktion_teilnehmer (geworben_von, angemeldet_am);

create table if not exists chain2.aktion_gewinner (
  platz      integer primary key check (platz between 1 and 10),
  adresse    text not null unique,
  code       text not null unique,
  betrag_usd integer not null check (betrag_usd > 0),
  gezogen_am timestamptz not null default now()
);

alter table chain2.aktion_teilnehmer enable row level security;
alter table chain2.aktion_gewinner   enable row level security;
revoke all on chain2.aktion_teilnehmer, chain2.aktion_gewinner from anon, authenticated;
grant select, insert, update, delete on chain2.aktion_teilnehmer, chain2.aktion_gewinner to service_role;

-- An wie vielen verschiedenen Tagen (UTC) hat die Adresse zwischen p_von und
-- p_bis (Unix-Sekunden) Mining-Ertraege bekommen? Gezaehlt werden nur
-- Coinbase-Transaktionen (Typ 0): als Empfaenger direkt (Solo) oder als
-- Anteil in coinbase_outputs (Pool). Dieselbe Erkennung wie chain2.verlauf.
create or replace function chain2.aktion_mining_tage(p_addr bytea, p_von bigint, p_bis bigint)
returns integer
language sql
stable
set search_path = chain2, pg_temp
as $$
  select count(distinct (b.block_time / 86400))::integer
    from chain2.transactions t
    join chain2.blocks b on b.height = t.block_height
   where t.type = 0
     and b.block_time between p_von and p_bis
     and (
       t.to_addr = p_addr
       or t.coinbase_outputs @> jsonb_build_array(jsonb_build_object('to', encode(p_addr, 'hex')))
     )
$$;

-- Hatte die Adresse vor p_vor (Unix-Sekunden) schon irgendeine Bewegung auf
-- der Kette (Eingang, Ausgang, Mining)? Dann ist es keine neue Wallet.
create or replace function chain2.aktion_aktiv_vor(p_addr bytea, p_vor bigint)
returns boolean
language sql
stable
set search_path = chain2, pg_temp
as $$
  select exists (
    select 1
      from chain2.transactions t
      join chain2.blocks b on b.height = t.block_height
     where b.block_time < p_vor
       and (
         t.to_addr = p_addr
         or t.from_addr = p_addr
         or t.coinbase_outputs @> jsonb_build_array(jsonb_build_object('to', encode(p_addr, 'hex')))
       )
  )
$$;

revoke all on function chain2.aktion_mining_tage(bytea, bigint, bigint) from public;
revoke all on function chain2.aktion_aktiv_vor(bytea, bigint) from public;
grant execute on function chain2.aktion_mining_tage(bytea, bigint, bigint) to service_role;
grant execute on function chain2.aktion_aktiv_vor(bytea, bigint) to service_role;
