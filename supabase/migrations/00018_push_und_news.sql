-- ============================================================================
-- 00018  Push-Benachrichtigungen und Neuigkeiten
-- ============================================================================
--
-- Fuer die Android-App (YSKAR Wallet). Zwei Dinge, die es vorher nicht gab:
--
--   push_geraete   Welches Geraet will fuer welche Adresse benachrichtigt
--                  werden. Opt-in in der App; ein Geraet, eine Adresse.
--                  Der Watcher (scripts/push-watcher.ts) liest die Liste,
--                  vergleicht sie mit neuen Bloecken und dem Mempool des
--                  Knotens und schickt ueber Firebase Cloud Messaging.
--
--   news           Neuigkeiten fuer den Reiter „Entdecken". Bisher lagen sie
--                  im Quelltext (src/content/entdecken.ts) -- jede Meldung
--                  war ein Deployment. Mit push=true geht sie zusaetzlich als
--                  Benachrichtigung an alle Geraete.
--
--   push_versendet Was schon gemeldet wurde, je Geraet und Ereignis. Ohne
--                  das meldete ein Neustart des Watchers alles noch einmal.
--
-- DATENSCHUTZ: push_geraete verknuepft eine Adresse mit einem Geraetetoken.
-- Das ist mehr, als die Kette selbst weiss. Deshalb nur mit ausdruecklichem
-- Opt-in, jederzeit abmeldbar, und der Token wird bei Abmeldung geloescht,
-- nicht nur deaktiviert.

create table if not exists chain2.push_geraete (
  token       text primary key,
  address     text not null,
  plattform   text not null default 'android',
  sprache     text not null default 'de',
  erstellt    timestamptz not null default now(),
  zuletzt     timestamptz not null default now()
);
create index if not exists push_geraete_address on chain2.push_geraete (address);

create table if not exists chain2.push_versendet (
  token       text not null references chain2.push_geraete(token) on delete cascade,
  ereignis    text not null,            -- z.B. "in:<txid>", "ok:<txid>", "block:<height>", "news:<id>"
  gesendet    timestamptz not null default now(),
  primary key (token, ereignis)
);
-- Alte Eintraege duerfen weg; der Watcher raeumt ab, was aelter als 30 Tage ist.
create index if not exists push_versendet_gesendet on chain2.push_versendet (gesendet);

create table if not exists chain2.news (
  id          bigserial primary key,
  datum       date not null default current_date,
  titel       text not null,
  text        text not null,
  link        text,
  push        boolean not null default false,
  gepusht     timestamptz,
  erstellt    timestamptz not null default now()
);

-- Lesen darf jeder (Neuigkeiten sind oeffentlich); schreiben nur die
-- Service Role -- wie bei allen Tabellen des Spiegels.
alter table chain2.news enable row level security;
create policy news_lesen on chain2.news for select using (true);
grant select on chain2.news to anon, authenticated;

alter table chain2.push_geraete enable row level security;
alter table chain2.push_versendet enable row level security;
-- keine Policies: nur die Service Role kommt heran.

-- Stand des Watchers (zuletzt verarbeitete Hoehe), damit ein Neustart dort
-- weitermacht, wo er aufgehoert hat.
create table if not exists chain2.push_stand (
  schluessel  text primary key,
  wert        text not null,
  geaendert   timestamptz not null default now()
);
alter table chain2.push_stand enable row level security;
