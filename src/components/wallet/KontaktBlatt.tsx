'use client';

import { useEffect, useRef, useState } from 'react';
import { Blatt } from '@/components/ui/Bausteine';
import { useT } from '@/i18n';
import { NAME_MAX, kontaktSetzen, kontaktEntfernen, useKontakte } from '@/lib/wallet/kontakte';
import { AdresseVierer, KNOPF, Punkt, VERWEIS, WKopf } from '@/components/wallet/Teile';

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
      <div className="flex items-start gap-3.5 border-y border-line py-[14px]">
        <Punkt art="mensch" className="mt-[6px]" />
        <AdresseVierer adresse={a} className="min-w-0 flex-1" />
      </div>
      <form onSubmit={e => { e.preventDefault(); speichern(); }}>
        <label htmlFor="kontaktname" className="mb-2 mt-5 block text-[13.5px] font-medium text-dim">{t.kontakt.name}</label>
        <input id="kontaktname" ref={feld} value={eingabe} maxLength={NAME_MAX}
               onChange={e => setEingabe(e.target.value)}
               autoComplete="off" autoCorrect="off" enterKeyHint="done"
               placeholder={t.kontakt.platzhalter}
               className="feld h-[58px] w-full bg-transparent px-[18px] text-[16px] text-text outline-none placeholder:text-faint" />
        <p className="mt-2.5 text-[13px] leading-[1.45] text-dim">{t.kontakt.hinweis}</p>
        <div className="mt-6 flex flex-col">
          <button type="submit" disabled={!eingabe.trim()} className={KNOPF}>{t.kontakt.speichern}</button>
          {vorhanden && (
            <button type="button" onClick={() => { kontaktEntfernen(a); onSchliessen(); }}
                    className={`${VERWEIS} mt-1 justify-center !text-risk !decoration-risk/50`}>
              {t.kontakt.entfernen}
            </button>
          )}
        </div>
      </form>
    </Blatt>
  );
}
