/**
 * Adresse der Mining-Engine, benannt nach ihrem Inhalt.
 *
 * WARUM DER HASH IM NAMEN STEHT: Die Datei wird mit
 * `Cache-Control: immutable` fuer ein Jahr ausgeliefert. Das ist richtig --
 * aber nur, wenn jede Fassung eine EIGENE Adresse hat.
 *
 * Vorher hiess sie immer miner.wasm. Nach der Umstellung von 116 auf 136
 * Byte Headerlaenge lag auf Geraeten, die die alte Fassung schon geladen
 * hatten, weiterhin die alte Engine. Deren Speicherlayout ist ein anderes:
 * Sie liest das Target bei Offset 352, der neue Worker schreibt es nach 336.
 * Dort stehen Nullen, und `hash <= 0` ist nie wahr. Das Geraet rechnete mit
 * voller Geschwindigkeit und fand nie einen Share -- ohne jede Fehlermeldung.
 *
 * Diese Datei wird von npm run wasm neu erzeugt. Nicht von Hand aendern.
 */
export const MINER_WASM_URL = '/miner.57f237a2a4.wasm';
export const MINER_WASM_SHA256_PREFIX = '57f237a2a4';
