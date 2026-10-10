-- ============================================================================
-- 00026  Ausfuehrungsrechte der schreibenden Funktionen schliessen
-- ============================================================================
--
-- Bisher durfte jede Rolle (PUBLIC, damit auch anon und authenticated) die
-- folgenden Funktionen ausfuehren. Die vier in chain2 laufen als SECURITY
-- DEFINER und schreiben in den Spiegel; rollback_to loescht Bloecke oberhalb
-- einer Hoehe und alle Konten. Das Schema chain2 ist ueber die API erreichbar.
--
-- Aufgerufen werden sie nur vom Server mit der Rolle service_role
-- (src/lib/db/service.ts); einen anon-Schluessel im Client gibt es nicht.
-- service_role hat auf allen ein eigenes Recht und behaelt es.
--
-- Die alten Funktionen in public (Pool v1) ruft der Code nicht mehr auf;
-- auch ihnen werden die Rechte fuer PUBLIC, anon und authenticated entzogen.
--
-- search_path: Die Funktionen in chain2 sprechen ihre Tabellen alle mit
-- chain2.<tabelle> an; der feste search_path verhindert, dass eine fremde
-- Tabelle oder Funktion gleichen Namens untergeschoben wird. Die Funktionen
-- in public nutzen Tabellennamen ohne Schema und bleiben daher unveraendert.
--
-- Keine Daten werden geaendert.
-- Zuruecknehmen: grant execute on function ... to anon, authenticated;
-- ============================================================================

revoke execute on function
  chain2.commit_block(jsonb, jsonb, jsonb, numeric),
  chain2.rollback_to(integer),
  chain2.mempool_add(bytea, bytea, bytea, bigint, bigint, bigint, integer, bytea),
  chain2.expire_sessions(integer)
from public, anon, authenticated;

revoke execute on function
  public.settle_block(integer),
  public.submit_verified_share(uuid, uuid, uuid, bigint, bytea, bigint, bigint, bigint, numeric[]),
  public.prune_shares(),
  public.expire_sessions(),
  public.reward_at(integer),
  public.season_at(integer)
from public, anon, authenticated;

alter function chain2.commit_block(jsonb, jsonb, jsonb, numeric)
  set search_path = chain2, pg_temp;
alter function chain2.rollback_to(integer)
  set search_path = chain2, pg_temp;
alter function chain2.mempool_add(bytea, bytea, bytea, bigint, bigint, bigint, integer, bytea)
  set search_path = chain2, pg_temp;
alter function chain2.expire_sessions(integer)
  set search_path = chain2, pg_temp;
