'use client';

import { useState } from 'react';
import { Screen, Title, Body, Button, SubHeader } from '@/components/ui/Primitives';
import { ThemenRaster } from '@/components/tabs/EntdeckenTab';
import Artikel from '@/components/Artikel';
import { ARTIKEL } from '@/content/entdecken';

/**
 * YSKAR kennenlernen -- VOR der Wallet. Dieselben Artikel wie im Reiter
 * „Entdecken", aber ohne Kette und ohne Guthaben: Wer noch keine Wallet
 * hat, soll trotzdem alles lesen koennen.
 */
export default function Vorstellung({ onZurueck, onLos }: {
  onZurueck: () => void; onLos: () => void;
}) {
  const [slug, setSlug] = useState<string | null>(null);
  const artikel = slug ? ARTIKEL.find(a => a.slug === slug) : null;

  return (
    <Screen>
      {artikel ? (
        <Artikel artikel={artikel} onZurueck={() => setSlug(null)}
                 unten={<Button onClick={onLos}>Wallet erstellen</Button>} />
      ) : (
        <>
          <SubHeader titel="YSKAR kennenlernen" onZurueck={onZurueck} />
          <Title>Sechs Themen, drei Minuten.</Title>
          <Body>Alles, was du wissen solltest, bevor dein Telefon anfängt zu rechnen.</Body>
          <div className="mt-6"><ThemenRaster onOeffnen={setSlug} /></div>
          <div className="mt-8"><Button onClick={onLos}>Wallet erstellen</Button></div>
        </>
      )}
    </Screen>
  );
}
