/**
 * Zustand des Y-Statuszeichens aus dem, was die App ohnehin weiss.
 *
 * Reine Funktion ohne React, damit sie getestet werden kann. Sie liest nur
 * und entscheidet nichts: "verbunden" heisst, die Kennzahlen des eigenen
 * Servers haben eine Blockhoehe geliefert.
 */
export type WalletStand = 'gesichert' | 'offen';
export type NetzStand = 'verbunden' | 'getrennt';
export type MiningStand = 'an' | 'aus';
export interface AppStatus { wallet: WalletStand; netz: NetzStand; mining: MiningStand }

export function appStatus({ gesichert, hoehe, mining }: {
  gesichert: boolean; hoehe: number | null | undefined; mining: boolean;
}): AppStatus {
  return {
    wallet: gesichert ? 'gesichert' : 'offen',
    netz: typeof hoehe === 'number' && Number.isFinite(hoehe) ? 'verbunden' : 'getrennt',
    mining: mining ? 'an' : 'aus',
  };
}
