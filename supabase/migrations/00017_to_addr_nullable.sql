-- ============================================================================
-- 00017  to_addr darf leer sein -- aber nur bei einer Pool-Coinbase
-- ============================================================================
--
-- BEFUND: Block 2188 war der erste echte Pool-Block (drei Empfaenger). Der
-- Spiegel lehnte ihn ab:
--
--   commit_block: null value in column "to_addr" violates not-null constraint
--
-- Und weil commit_block nur den jeweils naechsten Block annimmt, blockierte
-- er ALLE weiteren. Supabase blieb stehen, der Explorer zeigte nichts Neues.
--
-- WARUM NICHT EINFACH DEN ERSTEN EMPFAENGER EINTRAGEN: Das laese sich, als
-- haette er alles bekommen -- und die Kontoauskunft zaehlt genau diese
-- Spalte als "gefundene Bloecke". Jeder Pool-Teilnehmer erschiene als
-- Blockfinder. Die Aufteilung steht in coinbase_outputs; verbindlich ist
-- ohnehin raw.
--
-- Diese Migration haette zur Coinbase mit mehreren Empfaengern gehoert.
-- BEREITS EINGESPIELT; diese Datei haelt sie im Repository fest.
-- ============================================================================

alter table chain2.transactions
  alter column to_addr drop not null;

-- Die Bedingung bleibt scharf: Leer ist nur erlaubt, wo auch wirklich eine
-- Aufteilung steht. Eine Ueberweisung ohne Empfaenger bleibt unmoeglich.
alter table chain2.transactions
  add constraint tx_to_addr_nur_bei_pool_coinbase
    check (
      to_addr is not null
      or (type = 0 and coinbase_outputs is not null
          and jsonb_array_length(coinbase_outputs) > 1)
    );

comment on column chain2.transactions.to_addr is
  'Empfaenger. Leer nur bei einer Coinbase mit mehreren Empfaengern -- dann '
  'steht die Aufteilung in coinbase_outputs. Siehe Migration 00017.';
