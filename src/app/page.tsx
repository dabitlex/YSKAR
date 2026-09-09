'use client';

import { useEffect, useState } from 'react';
import { WalletProvider, useWallet } from '@/lib/wallet/useWallet';
import Onboarding from '@/components/Onboarding';
import Unlock from '@/components/Unlock';
import Mine from '@/components/Mine';
import { Screen, Title, Body } from '@/components/ui/Primitives';

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

  if (wallet.phase === 'laden' || platform === null) {
    return <Screen><p className="mt-16 text-dim">Einen Moment…</p></Screen>;
  }
  if (wallet.phase === 'kein_tresor') return <Onboarding />;
  if (wallet.phase === 'gesperrt') return <Unlock />;
  return <Mine platform={platform} />;
}
