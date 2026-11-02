'use client';

import { useId } from 'react';
import { useT } from '@/i18n';
import { ZEICHEN_PFADE, ZEICHEN_VIEWBOX } from './zeichenPfade';
import type { WalletStand, NetzStand, MiningStand } from './status';

export type { WalletStand, NetzStand, MiningStand };

/**
 * Das YSKAR-Zeichen -- das zentrale Markenelement der App.
 *
 * Flach, ohne Schein und ohne 3D. Die Muenze gibt es nur noch auf Splash
 * und Willkommen (Entscheidung 02.11.2026); ueberall sonst steht dieses Y.
 */
export function YZeichen({ groesse = 32, farbe = 'marke', label }: {
  groesse?: number;
  /** marke = Verlauf Cyan → Blau wie zeichen.svg; hell = einfarbig hell. */
  farbe?: 'marke' | 'hell';
  /** Ohne label ist das Zeichen Schmuck und fuer Screenreader unsichtbar. */
  label?: string;
}) {
  const id = useId().replace(/:/g, '');
  const fill = farbe === 'hell' ? 'rgb(var(--text))' : `url(#ys-y-${id})`;
  return (
    <svg viewBox={ZEICHEN_VIEWBOX} width={groesse} height={groesse} className="block shrink-0"
         {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      {farbe === 'marke' && (
        <defs>
          <linearGradient id={`ys-y-${id}`} x1="0.1" y1="0" x2="0.75" y2="1">
            <stop offset="0" stopColor="#63D8FF" /><stop offset=".55" stopColor="#2F7BFF" /><stop offset="1" stopColor="#1B4FD1" />
          </linearGradient>
        </defs>
      )}
      <path fill={fill} d={`${ZEICHEN_PFADE.fuss} ${ZEICHEN_PFADE.bogen} ${ZEICHEN_PFADE.arm}`} />
    </svg>
  );
}

/** Farben der Baender -- gleiche Bedeutung wie ueberall in der App. */
const FARBE = {
  gesichert: 'rgb(var(--proof))', offen: 'rgb(var(--amber))',
  verbunden: 'rgb(var(--work))', getrennt: 'rgb(var(--faint) / .55)',
  an: 'rgb(var(--cyan))', aus: 'rgb(var(--faint) / .55)',
} as const;

/**
 * Y-Statuszeichen (aus Konzept B): Jedes der drei Baender zeigt einen
 * Zustand der App.
 *
 *   Fuss  = Wallet   gruen gesichert, bernstein: zwoelf Woerter offen
 *   Bogen = Netz     blau verbunden, grau getrennt
 *   Arm   = Mining   cyan an (atmet leicht), grau aus
 *
 * Mit onClick wird es ein Knopf (44 px Trefferflaeche) und oeffnet die
 * Erklaerung; der Screenreader liest den vollen Zustand vor.
 */
export function Statuszeichen({ wallet, netz, mining, groesse = 28, onClick }: {
  wallet: WalletStand; netz: NetzStand; mining: MiningStand;
  groesse?: number; onClick?: () => void;
}) {
  const { t } = useT();
  const s = t.ys.status;
  const text = `${s.titel}: ${s.wallet[wallet]}. ${s.netz[netz]}. ${s.mining[mining]}.`;
  const bild = (
    <svg viewBox={ZEICHEN_VIEWBOX} width={groesse} height={groesse} className="block shrink-0" aria-hidden="true">
      <path fill={FARBE[wallet]} d={ZEICHEN_PFADE.fuss} />
      <path fill={FARBE[netz]} d={ZEICHEN_PFADE.bogen} />
      <path fill={FARBE[mining]} d={ZEICHEN_PFADE.arm} className={mining === 'an' ? 'ys-band-an' : undefined} />
    </svg>
  );
  if (!onClick) return <span role="img" aria-label={text} className="inline-flex">{bild}</span>;
  return (
    <button type="button" onClick={onClick} aria-label={text}
            className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:scale-95">
      {bild}
    </button>
  );
}

/** Ein einzelnes Band als kleines Symbol -- fuer die Legende. */
export function Band({ teil, farbe }: { teil: keyof typeof ZEICHEN_PFADE; farbe: string }) {
  return (
    <svg viewBox={ZEICHEN_VIEWBOX} width={28} height={28} className="block shrink-0" aria-hidden="true">
      {(Object.keys(ZEICHEN_PFADE) as (keyof typeof ZEICHEN_PFADE)[]).map(k => (
        <path key={k} d={ZEICHEN_PFADE[k]} fill={k === teil ? farbe : 'rgb(var(--haar) / .14)'} />
      ))}
    </svg>
  );
}

export const BAND_FARBE = FARBE;
