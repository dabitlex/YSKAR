-- Mehrere Mining-Sessions je Adresse.
--
-- Vorher beendete eine neue Session alle anderen derselben Adresse. Das
-- war gedacht als Schutz gegen doppelte Arbeit -- traf aber den Normalfall:
-- Wer auf Handy und Rechner gleichzeitig mint, hatte nach dem zweiten
-- Start nur noch einen laufenden Miner, und der erste meldete
-- "session_inactive", ohne dass jemand verstand, warum.
--
-- Doppelte Arbeit ist ohnehin ausgeschlossen: Jede Session hat ihre eigene
-- Extranonce, und die steht im Header. Zwei Miner koennen denselben
-- Treffer gar nicht finden.
--
-- NACHTRAG 17.09.2026: Diese Datei enthielt urspruenglich nur diese
-- Beschreibung. Der Inhalt unten ist aus der laufenden Datenbank
-- ausgelesen.

-- Tote Sessions einsammeln. Ohne das zaehlten abgestuerzte Miner ewig
-- gegen die Obergrenze -- und der Nutzer koennte sich nicht mehr anmelden,
-- obwohl nichts mehr laeuft.
create or replace function chain2.reap_sessions(p_idle_seconds integer default 300)
returns integer language plpgsql security definer
set search_path to 'chain2', 'public' as $$
declare v_count int;
begin
  update chain2.sessions
     set status = 'expired'
   where status = 'active'
     and coalesce(last_share_at, started_at) < now() - make_interval(secs => p_idle_seconds);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Wie viele Sessions dieser Adresse laufen wirklich?
--
-- Raeumt vorher auf. Ohne das waere die Zahl die der jemals gestarteten,
-- nicht die der laufenden -- und die Obergrenze traefe die Falschen.
create or replace function chain2.live_sessions(p_address bytea)
returns integer language plpgsql security definer
set search_path to 'chain2', 'public' as $$
declare v_count int;
begin
  perform chain2.reap_sessions(300);
  select count(*) into v_count
    from chain2.sessions
   where address = p_address and status = 'active';
  return v_count;
end $$;
