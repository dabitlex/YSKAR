'use client';

import { useEffect, useState } from 'react';
import { WalletProvider, useWallet } from '@/lib/wallet/useWallet';
import Onboarding from '@/components/Onboarding';
import Unlock from '@/components/Unlock';
import AppShell from '@/components/AppShell';
import { Screen, Title, Body } from '@/components/ui/Primitives';
import { Splash, useSplash } from '@/components/ui/Chrome';

declare global {
  interface Window { Telegram?: { WebApp: any } }
}

export default function Page() {
  return (
    <WalletProvider>
      <Router />
    </WalletProvider>
  );
}

function Router() {
  const wallet = useWallet();
  // Ohne Mindestdauer stuende das Startbild einen Frame lang: Tresor und
  // Plattform werden synchron gelesen. Der erste Eindruck der Marke darf
  // nicht davon abhaengen, wie schnell das Geraet ist.
  const splashVorbei = useSplash(1100);
  const [platform, setPlatform] = useState<string | null>(null);
  const [ausserhalb, setAusserhalb] = useState(false);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    // Das Telegram-Skript laedt auch ausserhalb von Telegram, liefert dann
    // aber keine initData. Genau daran erkennt man den normalen Browser.
    if (!tg || !tg.initData) { setAusserhalb(true); return; }
    tg.ready();
    tg.expand?.();
    setPlatform(tg.platform);
  }, []);

  if (ausserhalb) {
    return (
      <Screen>
        <div className="mt-16">
          <Title>YSKAR läuft in Telegram</Title>
          <Body>
            Die Wallet und das Mining brauchen die Mini App. Die Kette selbst
            kannst du hier ansehen.
          </Body>
          <a href="/explorer.html" className="text-work underline">Block Explorer</a>
        </div>
      </Screen>
    );
  }

  // Startbild statt Ladetext: Der erste Eindruck der App ist die Marke,
  // nicht ein Platzhalter.
  if (!splashVorbei || wallet.phase === 'laden' || (platform === null && !ausserhalb)) {
    return <Splash />;
  }
  if (wallet.phase === 'kein_tresor') return <Onboarding />;
  if (wallet.phase === 'gesperrt') return <Unlock />;
  return <AppShell platform={platform ?? ''} />;
}
