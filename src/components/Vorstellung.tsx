'use client';

import { useState } from 'react';
import { Screen, Title, Body, Button, SubHeader } from '@/components/ui/Primitives';
import { ThemenRaster } from '@/components/tabs/EntdeckenTab';
import Artikel from '@/components/Artikel';
import { inhalte } from '@/content/entdecken';
import { useT } from '@/i18n';

/**
 * YSKAR kennenlernen -- VOR der Wallet. Dieselben Artikel wie im Reiter
 * „Entdecken", aber ohne Kette und ohne Guthaben: Wer noch keine Wallet
 * hat, soll trotzdem alles lesen koennen.
 */
export default function Vorstellung({ onZurueck, onLos }: {
  onZurueck: () => void; onLos: () => void;
}) {
  const [slug, setSlug] = useState<string | null>(null);
  const { t, sprache, locale } = useT();
  const { ARTIKEL } = inhalte(sprache, locale);
  const artikel = slug ? ARTIKEL.find(a => a.slug === slug) : null;

  return (
    <Screen>
      {artikel ? (
        <Artikel artikel={artikel} onZurueck={() => setSlug(null)}
                 unten={<Button onClick={onLos}>{t.start.erstellen}</Button>} />
      ) : (
        <>
          <SubHeader titel={t.vorstellung.titel} onZurueck={onZurueck} />
          <Title>{t.vorstellung.ueberschrift}</Title>
          <Body>{t.vorstellung.text}</Body>
          <div className="mt-6"><ThemenRaster onOeffnen={setSlug} /></div>
          <div className="mt-8"><Button onClick={onLos}>{t.start.erstellen}</Button></div>
        </>
      )}
    </Screen>
  );
}
