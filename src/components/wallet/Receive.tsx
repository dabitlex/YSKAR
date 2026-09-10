'use client';

import { useEffect, useState } from 'react';
import { Title, Button, Notice } from '@/components/ui/Primitives';

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

  useEffect(() => {
    import('qrcode').then(QR => QR.toDataURL(address, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 480,
      // Dunkel auf hell: Lesegeraete erwarten diesen Kontrast. Ein
      // invertierter Code wird von vielen Kameras nicht erkannt.
      color: { dark: '#0C0F14', light: '#E4E9F0' },
    }).then(setBild).catch(() => setBild(null)));
  }, [address]);

  return (
    <div className="text-center">
      <div className="flex items-baseline justify-between">
        <button onClick={onZurueck} className="text-sm text-dim">← Zurück</button>
        <span />
      </div>
      <div className="mt-4"><Title>Empfangen</Title></div>

      <div className="mx-auto mt-5 h-[190px] w-[190px] overflow-hidden rounded-xl bg-text">
        {bild
          ? <img src={bild} alt="QR-Code der Adresse" width={190} height={190} />
          : <div className="flex h-full items-center justify-center text-xs text-ink">
              wird erzeugt…
            </div>}
      </div>

      <p className="mx-auto mt-5 max-w-[280px] break-all font-mono text-[13px]">
        {address}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button variant="quiet" onClick={async () => {
          try { await navigator.clipboard.writeText(address); setKopiert(true);
                setTimeout(() => setKopiert(false), 2000); } catch { /* egal */ }
        }}>
          {kopiert ? 'Kopiert' : 'Kopieren'}
        </Button>
        <Button variant="quiet" onClick={() => {
          if (navigator.share) navigator.share({ text: address }).catch(() => {});
        }}>Teilen</Button>
      </div>

      <p className="mt-5 text-left text-sm leading-relaxed text-dim">
        Diese Adresse gehört dauerhaft zu deiner Wallet. Blockrewards kommen
        automatisch hier an.
      </p>
    </div>
  );
}
