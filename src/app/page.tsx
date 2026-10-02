'use client';

import { useEffect, useState } from 'react';
import { WalletProvider, useWallet } from '@/lib/wallet/useWallet';
import Onboarding from '@/components/Onboarding';
import Unlock from '@/components/Unlock';
import AppLadenHinweis from '@/components/AppLaden';
import AppShell from '@/components/AppShell';
import { Screen, Title, Body } from '@/components/ui/Primitives';
import { Splash, useSplash } from '@/components/ui/Chrome';
import { plattform, fehlerspeicherInstallieren } from '@/lib/native/plattform';
import { SpracheProvider, useT } from '@/i18n';
import { EXPLORER_URL } from '@/components/ui/ExternLink';
import { vorladen } from '@/lib/vorladen';
import { ThemaProvider } from '@/lib/useThema';

declare global {
  interface Window { Telegram?: { WebApp: any } }
}

export default function Page() {
  return (
    <SpracheProvider>
      <ThemaProvider>
        <WalletProvider>
          <Router />
        </WalletProvider>
      </ThemaProvider>
    </SpracheProvider>
  );
}

function Router() {
  const wallet = useWallet();
  const { t } = useT();
  // Ohne Mindestdauer stuende das Startbild einen Frame lang: Tresor und
  // Plattform werden synchron gelesen. Der erste Eindruck der Marke darf
  // nicht davon abhaengen, wie schnell das Geraet ist.
  const splashVorbei = useSplash(1100);
  const [platform, setPlatform] = useState<string | null>(null);
  const [ausserhalb, setAusserhalb] = useState(false);
  // Kennzahlen und Konto schon hinter dem Startbild holen -- die Adresse
  // ist auch bei gesperrtem Tresor bekannt. Erst wenn das da ist (oder
  // nach spaetestens vier Sekunden), geht es weiter.
  const [vorgeladen, setVorgeladen] = useState(false);
  useEffect(() => {
    if (wallet.phase === 'laden') return;
    vorladen(wallet.address).finally(() => setVorgeladen(true));
  }, [wallet.phase, wallet.address]);

  useEffect(() => {
    // Drei Orte: die Android-App (YSKAR Wallet), der Telegram-Client, ein
    // gewoehnlicher Browser. Nur der letzte bekommt die Hinweisseite.
    const wo = plattform();
    if (wo === 'nativ') { fehlerspeicherInstallieren(); setPlatform('android-app'); return; }
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
          <Title>{t.browser.titel}</Title>
          <Body>{t.browser.text}</Body>
          <a href={EXPLORER_URL} className="mt-4 inline-block font-bold text-work underline">{t.browser.explorer}</a>
        </div>
      </Screen>
    );
  }

  // Startbild statt Ladetext: Der erste Eindruck der App ist die Marke,
  // nicht ein Platzhalter.
  if (!splashVorbei || !vorgeladen || wallet.phase === 'laden' || (platform === null && !ausserhalb)) {
    return <Splash />;
  }
  if (wallet.phase === 'kein_tresor') return <Onboarding />;
  // Erste Sperre der Sitzung: nur der PIN-Bildschirm. Spaetere Sperren
  // (automatisch nach dem Hintergrund) legen sich UEBER die laufende App,
  // damit das Mining darunter weiterlaeuft.
  if (wallet.phase === 'gesperrt' && !wallet.sitzung) return <Unlock />;
  return (
    <>
      <AppShell platform={platform ?? ''} />
      {/* Android-App anbieten -- nur ausserhalb der App, nur auf Android. */}
      <AppLadenHinweis />
      {wallet.phase === 'gesperrt' && <Unlock ebene />}
    </>
  );
}
