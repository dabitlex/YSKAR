/**
 * Adressen fuer die Anzeige.
 *
 * Eine Adresse hat 42 Zeichen. Niemand vergleicht 42 Zeichen am Stueck --
 * in Vierergruppen geht es. Genau deshalb zeigt die Wallet die volle
 * Adresse so, und nicht nur Anfang und Ende: Eine gekuerzte Adresse laesst
 * sich faelschen, indem man Anfang und Ende trifft ("Address Poisoning").
 */

/** "ysr1rucyz5nr…" -> ["ysr1", "rucy", "z5nr", …]; der Rest steht in der letzten Gruppe. */
export function vierer(adresse: string): string[] {
  const g: string[] = [];
  for (let i = 0; i < adresse.length; i += 4) g.push(adresse.slice(i, i + 4));
  return g;
}

/** Kurzform fuer Listen: "ysr1rucy…36np". Nie zum Pruefen gedacht. */
export function kurzAdresse(adresse: string | null | undefined, sonst: string): string {
  if (!adresse) return sonst;
  return adresse.length <= 14 ? adresse : `${adresse.slice(0, 8)}…${adresse.slice(-4)}`;
}
