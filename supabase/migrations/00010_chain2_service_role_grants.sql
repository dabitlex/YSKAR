-- Fehlende Rechte fuer die Service-Rolle.
--
-- In 00007 stand nur:
--   grant usage on schema chain2 to anon, authenticated;
--
-- Die Service-Rolle fehlte -- und genau die benutzt die API. Folge: Jede
-- Abfrage scheiterte mit "permission denied for schema chain2", und weil die
-- Routen den Fehler nicht auslasen, sah es aus wie eine leere Datenbank:
-- /api/v2/summary antwortete mit lauter Nullen statt mit einem Fehler.
--
-- Wichtig zum Verstaendnis: Die Service-Rolle umgeht RLS, aber NICHT die
-- Schema- und Tabellenrechte. Beides muss gesetzt sein.

grant usage on schema chain2 to service_role;
grant all privileges on all tables in schema chain2 to service_role;
grant all privileges on all sequences in schema chain2 to service_role;
grant execute on all functions in schema chain2 to service_role;

-- Kuenftige Objekte gleich mit abdecken, damit dieselbe Luecke nicht bei der
-- naechsten Tabelle wieder aufgeht.
alter default privileges in schema chain2 grant all on tables to service_role;
alter default privileges in schema chain2 grant all on sequences to service_role;
alter default privileges in schema chain2 grant execute on functions to service_role;
