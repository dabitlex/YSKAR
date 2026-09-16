-- Coinbase mit mehreren Empfaengern -- Spiegelung in der Transaktionstabelle.
--
-- Bei Fassung 2 bleibt to leer, amount traegt die Gesamtsumme, und
-- coinbase_outputs haelt die Aufteilung. Bei Fassung 1 aendert sich nichts.
--
-- "to = erster Empfaenger, amount = Gesamtsumme" waere die naheliegende
-- Abkuerzung und genau die falsche: Sie liest sich, als haette der erste
-- alles bekommen. Verbindlich ist ohnehin das raw-Feld.

alter table chain2.transactions
  add column coinbase_outputs jsonb;

create index if not exists transactions_coinbase_outputs_idx
  on chain2.transactions using gin (coinbase_outputs)
  where coinbase_outputs is not null;
