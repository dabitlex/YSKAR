'use client';

import { useState } from 'react';
import { useT } from '@/i18n';
import { Icon } from '@/components/ui/Primitives';
import { Blatt } from '@/components/ui/Bausteine';
import { SymbolKnopf } from './Knopf';
import { Liste, Zeile } from './Zeile';
import { Statuszeichen, Band, BAND_FARBE } from './Zeichen';
import type { AppStatus } from './status';

/**
 * Die Kopfzeile aller vier Bereiche (Paket 2).
 *
 * Links das Y-Statuszeichen -- ein Tipp erklaert die drei Baender --,
 * daneben der Titel des Bereichs oder, auf Mining, der Gruss. Rechts immer
 * das Zahnrad: Einstellungen sind von ueberall gleich erreichbar
 * (vorher fehlte es auf Community).
 *
 * `hoehe` erscheint nur, wenn das Netz verbunden ist; die Zeile
 * "verbunden" im Blatt nennt dann den Block.
 */
export function Kopfzeile({ titel, gruss, status, hoehe, onEinstellungen }: {
  titel?: string;
  /** Statt Titel: zwei Zeilen Gruss (klein) und Name (gross). */
  gruss?: { zeile: string; name: string };
  status: AppStatus;
  hoehe?: number | null;
  onEinstellungen: () => void;
}) {
  const { t, zahl } = useT();
  const [offen, setOffen] = useState(false);
  const s = t.ys.status;
  return (
    <>
      <header className="mb-4 flex min-h-11 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Statuszeichen {...status} groesse={30} onClick={() => setOffen(true)} />
          {gruss ? (
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-ys-meta text-dim">{gruss.zeile}</span>
              <span className="truncate text-ys-zeile font-semibold">{gruss.name}</span>
            </div>
          ) : (
            <h1 className="truncate text-ys-seite font-semibold">{titel}</h1>
          )}
        </div>
        <SymbolKnopf symbol={Icon.Zahnrad} label={t.allgemein.einstellungen} onClick={onEinstellungen} />
      </header>

      <Blatt offen={offen} onSchliessen={() => setOffen(false)} titel={s.titel}>
        <p className="mb-3 text-ys-klein text-lese">{s.erklaerung}</p>
        <Liste>
          <Zeile symbol={<Band teil="fuss" farbe={BAND_FARBE[status.wallet]} />}
                 titel={s.band.wallet} unter={s.wallet[status.wallet]} />
          <Zeile symbol={<Band teil="bogen" farbe={BAND_FARBE[status.netz]} />}
                 titel={s.band.netz}
                 unter={status.netz === 'verbunden' && hoehe ? `${s.netz.verbunden} · #${zahl(hoehe)}` : s.netz[status.netz]} />
          <Zeile symbol={<Band teil="arm" farbe={BAND_FARBE[status.mining]} />}
                 titel={s.band.mining} unter={s.mining[status.mining]} />
        </Liste>
      </Blatt>
    </>
  );
}
