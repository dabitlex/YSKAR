/**
 * Die eingebauten Seeds des Hauptnetzes.
 *
 * Ein Seed ist nur der erste Einstieg: Ein Knoten, der einmal Peers kennt,
 * merkt sie sich im Adressbuch (peers.json) und braucht die Seeds danach
 * nur noch als Rueckfall. Diese Liste ist die einzige Stelle, an der die
 * Seeds stehen -- der Full Node und Node Core lesen sie von hier.
 *
 * Hier steht bewusst KEINE zweite Adresse desselben Rechners (etwa seine
 * feste IP neben seinem Namen): Ein Knoten koennte ihn dann unter beiden
 * Adressen anwaehlen und belegte dort zwei Plaetze.
 *
 * Nur fuer das Hauptnetz. Ein Testknoten (Regtest) waehlt nie eine dieser
 * Adressen an.
 */
export const HAUPTNETZ_SEEDS: readonly string[] = [
  'pool.yskar.app:8646',
  'yskar-seed2.dynv6.net:8646',
];
