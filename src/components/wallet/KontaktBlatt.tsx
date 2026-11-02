'use client';

import { useEffect, useRef, useState } from 'react';
import { Blatt } from '@/components/ui/Bausteine';
import { Button } from '@/components/ui/Primitives';
import { useT } from '@/i18n';
import { NAME_MAX, kontaktSetzen, kontaktEntfernen, useKontakte } from '@/lib/wallet/kontakte';
import { AdresseVierer, Gegenkachel, WKopf } from '@/components/wallet/Teile';

/**
 * Kontakt anlegen, umbenennen oder entfernen.
 *
 * Ein Kontakt ist ein Name fuer eine Adresse, gespeichert nur auf diesem
 * Geraet (lib/wallet/kontakte.ts). Das Blatt zeigt die Adresse ganz -- wer
 * einen Namen vergibt, soll sehen, wofuer.
 */
export default function KontaktBlatt({ adresse, onSchliessen }: {
  /** null = Blatt zu. */
  adresse: string | null; onSchliessen: () => void;
}) {
  const { t } = useT();
  const { name } = useKontakte();
  // Die Adresse bleibt stehen, waehrend das Blatt zufaehrt.
  const [gezeigt, setGezeigt] = useState(adresse);
  const [eingabe, setEingabe] = useState('');
  const feld = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!adresse) return;
    setGezeigt(adresse);
    setEingabe(name(adresse) ?? '');
    const id = setTimeout(() => feld.current?.focus({ preventScroll: true }), 60);
    return () => clearTimeout(id);
    // Nur beim Oeffnen fuellen -- nicht, wenn sich die Kontakte aendern.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adresse]);

  const a = gezeigt ?? '';
  const vorhanden = !!name(a);
  const speichern = () => {
    if (!eingabe.trim()) return;
    kontaktSetzen(a, eingabe);
    onSchliessen();
  };

  return (
    <Blatt offen={!!adresse} onSchliessen={onSchliessen} grund="ink">
      <WKopf titel={vorhanden ? t.kontakt.bearbeiten : t.kontakt.neu} onSchliessen={onSchliessen} />
      <div className="ys-flaeche !rounded-md flex items-center gap-3 px-3.5 py-3">
        <Gegenkachel adresse={a} size={40} />
        <AdresseVierer adresse={a} className="min-w-0 flex-1 !text-ys-klein" />
      </div>
      <form onSubmit={e => { e.preventDefault(); speichern(); }}>
        <label htmlFor="kontaktname" className="mb-1.5 mt-4 block text-ys-klein text-dim">{t.kontakt.name}</label>
        <input id="kontaktname" ref={feld} value={eingabe} maxLength={NAME_MAX}
               onChange={e => setEingabe(e.target.value)}
               autoComplete="off" autoCorrect="off" enterKeyHint="done"
               placeholder={t.kontakt.platzhalter}
               className="sunk w-full !rounded-sm px-4 py-3.5 text-ys-fliess outline-none transition-colors focus:border-work placeholder:font-medium placeholder:text-faint" />
        <p className="mt-2 text-ys-meta leading-relaxed text-dim">{t.kontakt.hinweis}</p>
        <div className="mt-5 space-y-2.5">
          <Button type="submit" disabled={!eingabe.trim()} className="!rounded-full !py-4 !font-semibold">
            {t.kontakt.speichern}
          </Button>
          {vorhanden && (
            <Button variant="risk" onClick={() => { kontaktEntfernen(a); onSchliessen(); }}
                    className="!rounded-full !py-4 !font-semibold">
              {t.kontakt.entfernen}
            </Button>
          )}
        </div>
      </form>
    </Blatt>
  );
}
