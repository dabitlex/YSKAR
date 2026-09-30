'use client';

import { useEffect, useRef, useState } from 'react';
import { adresseAusCode } from '@/lib/wallet/qr';
import { telegramScan } from '@/lib/telegram/webapp';
import { istTelegram } from '@/lib/native/plattform';
import { Icon } from '@/components/ui/Primitives';

/**
 * QR-Code einer Adresse mit der Kamera lesen.
 *
 * Drei Wege, in dieser Reihenfolge:
 *
 *  1. Der Telegram-Client hat einen eigenen Scanner (ab Bot-API 6.4). Er ist
 *     schneller, kennt die Kamerarechte schon und sieht auf jedem Geraet aus
 *     wie Telegram. Wenn er da ist, nehmen wir ihn.
 *  2. Sonst die eigene Kamera-Ansicht: getUserMedia und die eingebaute
 *     BarcodeDetector-API des Browsers -- die ist schnell, weil sie nativ ist.
 *  3. Gibt es die nicht (aeltere WebViews), liest jsQR das Bild aus einem
 *     Canvas. Langsamer, aber ueberall.
 *
 * Erkannt wird nur, was eine gueltige YSKAR-Adresse ist. Ein fremder Code
 * wird gemeldet, nicht uebernommen: Wer die Adresse eines Bitcoin-Zettels
 * scannt, soll das sofort sehen.
 */

type Zustand = 'start' | 'kamera' | 'verweigert' | 'fehlt';

export default function Scanner({ onErgebnis, onAbbruch }: {
  onErgebnis: (adresse: string) => void; onAbbruch: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [zustand, setZustand] = useState<Zustand>('start');
  const [fremd, setFremd] = useState<string | null>(null);
  const [treffer, setTreffer] = useState<string | null>(null);
  const fertig = useRef(false);

  // Erkennung abschliessen: kurz zeigen, was gelesen wurde, dann uebergeben.
  const gefunden = (text: string) => {
    if (fertig.current) return;
    const adr = adresseAusCode(text);
    if (!adr) { setFremd(text.slice(0, 40)); return; }
    fertig.current = true;
    setTreffer(adr);
    setTimeout(() => onErgebnis(adr), 650);
  };

  // Weg 1: Telegram.
  useEffect(() => {
    const p = istTelegram() ? telegramScan('QR-Code der YSKAR-Adresse in den Rahmen halten') : undefined;
    if (!p) { setZustand('kamera'); return; }
    let lebt = true;
    p.then(text => {
      if (!lebt) return;
      if (text == null) { onAbbruch(); return; }
      const adr = adresseAusCode(text);
      if (adr) { onErgebnis(adr); return; }
      // Telegram hat etwas gelesen, das keine Adresse ist: eigene Kamera
      // mit Meldung, statt stumm zurueck zum Formular.
      setFremd(text.slice(0, 40));
      setZustand('kamera');
    });
    return () => { lebt = false; };
  }, [onAbbruch, onErgebnis]);

  // Weg 2 und 3: eigene Kamera.
  useEffect(() => {
    if (zustand !== 'kamera') return;
    let stream: MediaStream | null = null;
    let timer: number | null = null;
    let gestoppt = false;

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setZustand('fehlt'); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch {
        setZustand('verweigert'); return;
      }
      if (gestoppt) { stream.getTracks().forEach(t => t.stop()); return; }
      const v = video.current;
      if (!v) return;
      v.srcObject = stream;
      await v.play().catch(() => { /* Autoplay-Regeln; playsInline reicht meist */ });

      const Detector = (window as any).BarcodeDetector as
        (new (o: { formats: string[] }) => { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }) | undefined;
      let detector: { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> } | null = null;
      if (Detector) {
        try {
          const formate: string[] = await (Detector as any).getSupportedFormats?.() ?? ['qr_code'];
          if (formate.includes('qr_code')) detector = new Detector({ formats: ['qr_code'] });
        } catch { detector = null; }
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const jsQR = detector ? null : (await import('jsqr')).default;

      const tick = async () => {
        if (gestoppt || fertig.current) return;
        if (v.readyState >= 2 && v.videoWidth > 0) {
          try {
            if (detector) {
              const codes = await detector.detect(v);
              if (codes[0]?.rawValue) gefunden(codes[0].rawValue);
            } else if (jsQR && ctx) {
              // Nur die Bildmitte lesen: dort liegt der Rahmen, und ein
              // kleineres Bild heisst weniger Rechenzeit je Durchlauf.
              const s = Math.min(v.videoWidth, v.videoHeight);
              const groesse = 480;
              canvas.width = groesse; canvas.height = groesse;
              ctx.drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s,
                            0, 0, groesse, groesse);
              const bild = ctx.getImageData(0, 0, groesse, groesse);
              const code = jsQR(bild.data, groesse, groesse, { inversionAttempts: 'dontInvert' });
              if (code?.data) gefunden(code.data);
            }
          } catch { /* ein Frame ohne Ergebnis ist normal */ }
        }
        timer = window.setTimeout(tick, detector ? 120 : 220);
      };
      tick();
    };
    start();

    return () => {
      gestoppt = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach(t => t.stop());
      if (video.current) video.current.srcObject = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zustand]);

  const einfuegen = async () => {
    try {
      const text = await navigator.clipboard.readText();
      gefunden(text);
    } catch { setFremd('Zwischenablage nicht lesbar'); }
  };

  // Waehrend Telegram scannt, ist von uns nichts zu sehen.
  if (zustand === 'start') return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col text-white"
         style={{ background: 'radial-gradient(120% 80% at 50% 40%, #223452 0%, #0A0F1A 70%)' }}>
      {zustand === 'kamera' && (
        <video ref={video} playsInline muted autoPlay
               className="absolute inset-0 h-full w-full object-cover" />
      )}
      {/* Abdunkeln ausserhalb des Rahmens, damit die Mitte fuehrt. */}
      <div className="pointer-events-none absolute inset-0 bg-black/45" />

      <div className="relative flex items-center justify-between px-5 pt-[calc(16px+var(--oben))]">
        <button onClick={onAbbruch} aria-label="Abbrechen"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
          <svg viewBox="0 0 22 22" width="18" height="18" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round"><path d="M6 6l10 10M16 6 6 16" /></svg>
        </button>
        <span className="text-[17px] font-extrabold">Adresse scannen</span>
        <span className="w-9" />
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-7 px-6">
        <div className="relative h-[260px] w-[260px]">
          <Ecke style={{ top: 0, left: 0, borderRight: 0, borderBottom: 0, borderTopLeftRadius: 22 }} />
          <Ecke style={{ top: 0, right: 0, borderLeft: 0, borderBottom: 0, borderTopRightRadius: 22 }} />
          <Ecke style={{ bottom: 0, left: 0, borderRight: 0, borderTop: 0, borderBottomLeftRadius: 22 }} />
          <Ecke style={{ bottom: 0, right: 0, borderLeft: 0, borderTop: 0, borderBottomRightRadius: 22 }} />
          {zustand === 'kamera' && !treffer && (
            <div className="scanline absolute left-3 right-3 h-0.5"
                 style={{ background: 'linear-gradient(90deg, transparent, #4D8DFF, transparent)',
                          boxShadow: '0 0 14px #4D8DFF' }} />
          )}
        </div>

        <div className="flex flex-col items-center gap-1.5 text-center">
          {zustand === 'kamera' ? (
            <>
              <span className="text-[15px] font-bold">QR-Code in den Rahmen halten</span>
              <span className="text-[13px] font-semibold leading-relaxed text-white/60">
                Der Code aus „Empfangen" eines anderen Nutzers wird erkannt und die
                Adresse automatisch eingetragen.
              </span>
            </>
          ) : zustand === 'verweigert' ? (
            <>
              <span className="text-[15px] font-bold">Kein Zugriff auf die Kamera</span>
              <span className="text-[13px] font-semibold leading-relaxed text-white/60">
                Erlaube der App die Kamera in den Einstellungen deines Telefons — oder
                füge die Adresse aus der Zwischenablage ein.
              </span>
            </>
          ) : (
            <>
              <span className="text-[15px] font-bold">Dieses Gerät hat keine Kamera-Freigabe</span>
              <span className="text-[13px] font-semibold leading-relaxed text-white/60">
                Füge die Adresse aus der Zwischenablage ein.
              </span>
            </>
          )}
        </div>
      </div>

      <div className="relative flex flex-col gap-2.5 px-5 pb-[calc(24px+var(--unten))]">
        {treffer ? (
          <div className="flex items-center gap-3 rounded-[16px] border border-proof/40 bg-proof/20 px-4 py-3.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-proof">
              <svg viewBox="0 0 22 22" width="18" height="18" fill="none" stroke="#fff"
                   strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 11.5l4 4 8-9" /></svg>
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] font-extrabold text-[#7EE2B8]">Gültige YSKAR-Adresse erkannt</span>
              <span className="truncate font-mono text-[11.5px] text-white/85">{treffer}</span>
            </span>
          </div>
        ) : fremd ? (
          <div className="flex items-center gap-3 rounded-[16px] border border-risk/40 bg-risk/20 px-4 py-3.5">
            <span className="text-risk">{Icon.Warnung}</span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[13px] font-extrabold text-[#FF9AA0]">Kein YSKAR-Code</span>
              <span className="truncate font-mono text-[11.5px] text-white/70">{fremd}</span>
            </span>
          </div>
        ) : null}
        <button onClick={einfuegen}
                className="flex h-[52px] items-center justify-center gap-2 rounded-[16px]
                           bg-white/12 text-[15px] font-bold active:scale-[.985]">
          {Icon.Kopieren} Aus Zwischenablage einfügen
        </button>
      </div>
    </div>
  );
}

function Ecke({ style }: { style: React.CSSProperties }) {
  return <div className="absolute h-[34px] w-[34px] border-4 border-white" style={style} />;
}
