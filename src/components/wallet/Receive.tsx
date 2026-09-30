'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Button, Notice, SubHeader, Icon } from '@/components/ui/Primitives';
import { useT } from '@/i18n';

/**
 * Empfangen.
 *
 * Der QR-Code wird auf dem Geraet erzeugt, nicht von einem Dienst geholt --
 * eine Adresse an einen fremden Server zu schicken, nur um ein Bild
 * zurueckzubekommen, waere unnoetig und verraeterisch.
 */
export default function Receive({ address, onZurueck }: {
  address: string; onZurueck: () => void;
}) {
  const [bild, setBild] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);
  const { t } = useT();

  useEffect(() => {
    import('qrcode').then(QR => QR.toDataURL(address, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 480,
      // Dunkel auf hell: Lesegeraete erwarten diesen Kontrast. Ein
      // invertierter Code wird von vielen Kameras nicht erkannt.
      color: { dark: '#0E1A2F', light: '#FFFFFF' },
    }).then(setBild).catch(() => setBild(null)));
  }, [address]);

  return (
    <div className="text-center">
      <SubHeader titel={t.empfangen.titel} onZurueck={onZurueck} />

      <div className="panel rise flex flex-col items-center gap-4 px-5 py-6">
        <div className="flex items-center gap-2">
          <Image src="/marke/kristall.png" alt="" width={30} height={20}
                 style={{ width: 30, height: 20, objectFit: 'contain' }} />
          <span className="text-[12px] font-extrabold tracking-[0.16em] text-dim">YSKAR · YSR</span>
        </div>
        <div className="rounded-[20px] border border-line bg-white p-3.5
                        shadow-[0_12px_30px_-18px_rgb(var(--edge)/.3)]">
          <div className="h-[220px] w-[220px] overflow-hidden rounded-[8px] bg-white">
            {bild
              ? <img src={bild} alt={t.empfangen.qrAlt} width={220} height={220} />
              : <div className="flex h-full items-center justify-center text-xs font-semibold text-faint">
                  {t.empfangen.erzeugt}
                </div>}
          </div>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <span className="label">{t.empfangen.adresse}</span>
          <p className="max-w-[280px] break-all font-mono text-[13px] leading-[1.6]">{address}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Button onClick={async () => {
          try { await navigator.clipboard.writeText(address); setKopiert(true);
                setTimeout(() => setKopiert(false), 2000); } catch { /* egal */ }
        }}>
          {Icon.Kopieren}{kopiert ? t.allgemein.Kopiert : t.allgemein.Kopieren}
        </Button>
        <Button variant="quiet" onClick={() => {
          if (navigator.share) navigator.share({ text: address }).catch(() => {});
        }}>{Icon.Teilen}{t.allgemein.teilen}</Button>
      </div>

      <div className="mt-4 text-left">
        <Notice tone="work">{t.empfangen.hinweis}</Notice>
      </div>
    </div>
  );
}
