-- Der Job speichert den fertigen Blockkoerper.
--
-- Urspruenglich standen im Job nur die txids, und der gefundene Block sollte
-- daraus rekonstruiert werden. Das kann nicht funktionieren: Die Coinbase
-- haengt an der Miner-Adresse und einem Zufallswert, und der Mempool
-- veraendert sich zwischen Jobausgabe und Blockfund.
--
-- merkle_root und state_root im Header verpflichten aber auf GENAU diese
-- Auswahl. Weicht die Rekonstruktion auch nur in einer Transaktion ab, ist
-- der geleistete Proof of Work wertlos.
--
-- Deshalb: Der vollstaendige Block liegt im Job. Beim Fund wird nur die
-- Nonce eingesetzt, geprueft und festgeschrieben.

alter table chain2.jobs
  add column body bytea not null default '\x',
  add column miner_address bytea check (miner_address is null or octet_length(miner_address) = 20);

alter table chain2.jobs alter column body drop default;
alter table chain2.jobs alter column txids drop not null;
