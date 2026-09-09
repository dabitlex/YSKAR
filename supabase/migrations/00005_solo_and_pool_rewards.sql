-- Umstellung von "rein anteilig" auf "Finder gewinnt alles, ausser im Pool".
--
--   Solo (kein Pool) -> 100 % an den Finder. Alle anderen Beitraege dieser
--                       Runde verfallen. Das ist echtes Solo-Mining.
--   Pool (Clan)      -> Gebuehr an den Gruender (0-5 %), Rest anteilig nach
--                       validierten Shares an die Mitglieder DIESES Pools.
--                       Beitraege von Nicht-Mitgliedern zaehlen nicht.
--
-- BEWUSSTE FOLGE: Der Konto-Deckel wirkt jetzt nur noch INNERHALB eines
-- Pools. Beim Solo-Mining gibt es nichts zu kappen -- einen Block hat man
-- gefunden oder nicht. Fremde Hardware ist im Solo-Pfad damit nicht mehr
-- begrenzbar; siehe docs/SECURITY.md.
--
-- Gilt fuer die ERSTE Kette (Schema public). Die neue Kette in chain2
-- kennt weder Pools noch Runden -- dort geht der Reward per Coinbase direkt
-- an die Adresse des Finders.

alter table clans
  add column fee_pct numeric not null default 0
    check (fee_pct >= 0 and fee_pct <= 0.05);

alter table block_rewards
  add column kind text not null default 'pool_share'
    check (kind in ('solo', 'pool_share', 'pool_fee')),
  add column fee_amount bigint not null default 0 check (fee_amount >= 0);

alter table settlement_work add column is_owner boolean not null default false;

-- settle_block() wurde vollstaendig ersetzt. Die Fassung im Projekt ist
-- massgeblich; Kern der Aenderung:
--   v_pool is null -> eine Zeile, 100 % an v_block.miner_id, kind='solo'
--   sonst          -> Gebuehr abziehen, Rest iterativ gedeckelt verteilen
