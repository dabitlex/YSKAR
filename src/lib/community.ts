/**
 * Wege nach draussen: Kanal, Gruppe, X, Website, Explorer, Quelltext.
 *
 * An EINER Stelle, damit ein neuer Kanal (etwa Discord) eine Zeile ist und
 * nicht eine Suche durch alle Bildschirme.
 */
export const COMMUNITY = {
  /** Telegram-Kanal mit Neuigkeiten. */
  kanal: 'https://t.me/yskar_official',
  kanalName: '@yskar_official',
  /** Community-Gruppe (englischsprachig). */
  gruppe: 'https://t.me/+GxAmtTMeG1w1M2Yy',
  x: 'https://x.com/yskar_official',
  xName: '@yskar_official',
  website: 'https://www.yskar.app',
  explorer: 'https://www.yskar.app/explorer',
  whitepaper: 'https://www.yskar.app/whitepaper',
  anleitungen: 'https://www.yskar.app/anleitungen',
  github: 'https://github.com/dabitlex/YSKAR',
  releases: 'https://github.com/dabitlex/YSKAR/releases',
  /** Der Bot, ueber den die Mini App startet. */
  bot: 'https://t.me/YSKAR_bot',
} as const;

/**
 * Einladungslink in die Mini App.
 *
 * `startapp` kommt in der App als start_param an. Erlaubt sind dort nur
 * Buchstaben, Ziffern, Unter- und Bindestrich, hoechstens 64 Zeichen. Die
 * Kennung ist ein kurzer Teil der eigenen Adresse -- sie verraet nichts,
 * was nicht ohnehin oeffentlich in der Kette steht.
 */
export function einladungsLink(adresse: string | null): string {
  const kurz = adresse ? adresse.replace(/^ysr1/, '').slice(0, 8).replace(/[^A-Za-z0-9]/g, '') : '';
  return kurz ? `${COMMUNITY.bot}?startapp=ref_${kurz}` : COMMUNITY.bot;
}
