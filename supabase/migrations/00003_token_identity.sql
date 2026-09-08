-- Name und Symbol des Tokens.
-- Bewusst als Daten: Frontend, Explorer und spaetere Telegram-Beitraege lesen
-- dieselbe Quelle. Ein Wechsel ist ein UPDATE und beruehrt die Kette nicht --
-- Header und Hashes kennen nur ganzzahlige Einheiten.
--
-- Symbol YSR statt YSK: auf Solana existiert ein Memecoin "yskaela" (YSKA).
-- Rechtlich unkritisch, aber zu nah fuer eine saubere Ticker-Suche.
alter table chain_params
  add column token_name   text not null default 'YSKAR',
  add column token_symbol text not null default 'YSR';

comment on column chain_params.token_symbol is
  'Aenderbar per UPDATE. Nicht in der Kette verankert.';

update chain_params set token_name = 'YSKAR', token_symbol = 'YSR' where id = 1;
