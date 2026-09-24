-- ============================================================================
-- 00015  u64-Felder: bigint reicht nicht
-- ============================================================================
--
-- BEFUND
--
-- Der Konsens erlaubt fuer nonce und extranonce den vollen u64-Bereich, also
-- bis 18.446.744.073.709.551.615. Postgres' bigint ist VORZEICHENBEHAFTET und
-- endet bei 9.223.372.036.854.775.807 -- der Haelfte.
--
-- Jede zweite moegliche Extranonce sprengt die Spalte. Aufgefallen ist es erst
-- bei Block 2061:
--
--   commit_block: value "13111268702705097209" is out of range for type bigint
--
-- Bis dahin kamen alle Bloecke ueber den Mining-Server, und der zaehlt die
-- Extranonce fortlaufend von 1 hoch (groesster Wert bis dahin: 785). Der
-- Node Core mint direkt und WUERFELT eine volle 64-Bit-Zahl -- deshalb trat
-- es genau dann auf, als der GPU-Miner im Node Core einen Block fand.
--
-- FOLGE, falls nicht behoben: commit_block laesst nur den jeweils naechsten
-- Block zu. Ein abgelehnter Block blockiert also ALLE weiteren. Der Spiegel
-- bleibt stehen, waehrend die Kette weiterlaeuft.
--
--
-- WARUM numeric UND NICHT bigint MIT VERSCHIEBUNG
--
-- Man koennte u64 als signed bigint speichern und beim Lesen umrechnen. Dann
-- staende in der Datenbank aber eine negative Zahl, wo der Block eine positive
-- hat -- jede Abfrage von Hand waere falsch, und ein Vergleich mit dem Knoten
-- gaebe Unsinn. numeric(20,0) speichert den Wert so, wie er im Block steht.
--
-- Der Preis ist etwas mehr Platz und langsamere Vergleiche. Bei diesen
-- Spalten wird nicht sortiert oder gerechnet -- sie werden geschrieben und
-- angezeigt. Der Preis faellt nicht ins Gewicht.
--
--
-- WAS NICHT GEAENDERT WIRD
--
--   amount, fee, balance   Betraege sind durch MAX_SUPPLY begrenzt
--                          (2.100.000.000.000.000) -- weit unter der Grenze
--   block_time             Sekunden seit 1970, reicht bis weit nach dem
--                          Jahr 292 Milliarden
--   transactions.nonce     Kontononcen zaehlen fortlaufend von 0 hoch; eine
--                          Adresse muesste 9 Trillionen Ueberweisungen
--                          senden, um die Grenze zu erreichen
--
-- Geaendert wird nur, was TATSAECHLICH den vollen u64-Bereich nutzt.
-- ============================================================================


alter table chain2.blocks
  alter column extranonce type numeric(20,0) using extranonce::numeric,
  alter column nonce      type numeric(20,0) using nonce::numeric;

-- Beide sind vorzeichenlos. Ohne diese Pruefung koennte eine negative Zahl
-- hineingeraten, die es im Block gar nicht geben kann.
alter table chain2.blocks
  add constraint blocks_extranonce_u64
    check (extranonce >= 0 and extranonce <= 18446744073709551615),
  add constraint blocks_nonce_u64
    check (nonce >= 0 and nonce <= 18446744073709551615);

-- Die Sitzungstabelle vergibt Extranoncen fortlaufend. Sie bleibt bigint --
-- aber der Vollstaendigkeit halber dieselbe Obergrenze, damit nie eine
-- Extranonce entsteht, die spaeter nicht in einen Block passt.
alter table chain2.sessions
  add constraint sessions_extranonce_u64
    check (extranonce >= 0 and extranonce <= 9223372036854775807);

comment on column chain2.blocks.extranonce is
  'u64 aus dem Blockheader. numeric(20,0), weil bigint nur die Haelfte des '
  'erlaubten Bereichs traegt -- siehe Migration 00015.';
comment on column chain2.blocks.nonce is
  'u64 aus dem Blockheader. Siehe extranonce.';
