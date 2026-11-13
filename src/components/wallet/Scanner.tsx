'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { zahlungAusCode, zahlungAusText, type Zahlung } from '@/lib/wallet/qr';
import { telegramScan } from '@/lib/telegram/webapp';
import { istTelegram } from '@/lib/native/plattform';
import { Icon } from '@/components/ui/Primitives';
import { useT } from '@/i18n';

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
 * wird gemeldet, nicht uebernommen: Wer die Adresse einer anderen Kette
 * scannt, soll das sofort sehen.
 *
 * Ein Code aus "Empfangen -> Betrag anfordern" traegt zusaetzlich Betrag
 * und Notiz (lib/wallet/qr.ts). Beides wird mit uebergeben -- als
 * Vorschlag: Senden traegt es ein, gesendet wird erst nach dem Pruefen.
 */

type Zustand = 'start' | 'kamera' | 'verweigert' | 'fehlt';

export default function Scanner({ onErgebnis, onAbbruch }: {
  onErgebnis: (adresse: string, zahlung: Zahlung) => void; onAbbruch: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [zustand, setZustand] = useState<Zustand>('start');
  const [fremd, setFremd] = useState<string | null>(null);
  const [treffer, setTreffer] = useState<string | null>(null);
  const fertig = useRef(false);
  const { t } = useT();

  // Erkennung abschliessen: kurz zeigen, was gelesen wurde, dann uebergeben.
  // `frei`: Text aus der Zwischenablage -- dort darf um die Adresse herum
  // noch etwas stehen (eine ganze Nachricht).
  const gefunden = (text: string, frei = false) => {
    if (fertig.current) return;
    const z = frei ? zahlungAusText(text) : zahlungAusCode(text);
    if (!z) { setFremd(text.slice(0, 40)); return; }
    fertig.current = true;
    setTreffer(z.adresse);
    setTimeout(() => onErgebnis(z.adresse, z), 650);
  };

  // Weg 1: Telegram.
  useEffect(() => {
    const p = istTelegram() ? telegramScan(t.scanner.tgText) : undefined;
    if (!p) { setZustand('kamera'); return; }
    let lebt = true;
    p.then(text => {
      if (!lebt) return;
      if (text == null) { onAbbruch(); return; }
      const z = zahlungAusCode(text);
      if (z) { onErgebnis(z.adresse, z); return; }
      // Telegram hat etwas gelesen, das keine Adresse ist: eigene Kamera
      // mit Meldung, statt stumm zurueck zum Formular.
      setFremd(text.slice(0, 40));
      setZustand('kamera');
    });
    return () => { lebt = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      gefunden(text, true);
    } catch { setFremd(t.scanner.zwischenablage); }
  };

  // Waehrend Telegram scannt, ist von uns nichts zu sehen.
  if (zustand === 'start' || typeof document === 'undefined') return null;

  // Portal an body: Der Scanner darf nie in einem Blatt oder einer Karte
  // haengen bleiben -- er ist der ganze Bildschirm.
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col text-white"
         style={{ background: 'radial-gradient(120% 60% at 85% 0%, rgb(16 41 94 / .7), transparent 68%), #040A1A' }}>
      {zustand === 'kamera' && (
        <video ref={video} playsInline muted autoPlay
               className="absolute inset-0 h-full w-full object-cover" />
      )}
      {/* Abdunkeln ausserhalb des Rahmens, damit die Mitte fuehrt. */}
      <div className="pointer-events-none absolute inset-0 bg-[rgb(4_10_26/.5)]" />

      <div className="relative flex items-center gap-1.5 pl-[14px] pr-[22px] pt-[calc(8px+var(--oben))]">
        <button onClick={onAbbruch} aria-label={t.allgemein.abbrechen}
                className="flex h-11 w-11 items-center justify-center rounded-full active:scale-95">
          <svg viewBox="0 0 22 22" width="20" height="20" fill="none" stroke="currentColor"
               strokeWidth="1.8" strokeLinecap="round"><path d="M5 5l12 12M17 5 5 17" /></svg>
        </button>
        <span className="text-[16px] font-semibold tracking-[-.01em]">{t.scanner.titel}</span>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-7 px-6">
        <div className="relative h-[260px] w-[260px]">
          <Ecke style={{ top: 0, left: 0, borderRight: 0, borderBottom: 0, borderTopLeftRadius: 22 }} />
          <Ecke style={{ top: 0, right: 0, borderLeft: 0, borderBottom: 0, borderTopRightRadius: 22 }} />
          <Ecke style={{ bottom: 0, left: 0, borderRight: 0, borderTop: 0, borderBottomLeftRadius: 22 }} />
          <Ecke style={{ bottom: 0, right: 0, borderLeft: 0, borderTop: 0, borderBottomRightRadius: 22 }} />
          {zustand === 'kamera' && !treffer && (
            <div className="scanline absolute left-3 right-3 h-0.5"
                 style={{ background: 'linear-gradient(90deg, transparent, #63D8FF, transparent)',
                          boxShadow: '0 0 14px rgb(99 216 255 / .8)' }} />
          )}
        </div>

        <div className="flex max-w-[320px] flex-col items-center gap-2 text-center">
          {zustand === 'kamera' ? (
            <>
              <span className="text-[18px] font-medium tracking-[-.012em]">{t.scanner.halten}</span>
              <span className="text-[14.5px] leading-[1.45] text-white/70">
                {t.scanner.haltenText}
              </span>
            </>
          ) : zustand === 'verweigert' ? (
            <>
              <span className="text-[18px] font-medium tracking-[-.012em]">{t.scanner.verweigert}</span>
              <span className="text-[14.5px] leading-[1.45] text-white/70">
                {t.scanner.verweigertText}
              </span>
            </>
          ) : (
            <>
              <span className="text-[18px] font-medium tracking-[-.012em]">{t.scanner.fehlt}</span>
              <span className="text-[14.5px] leading-[1.45] text-white/70">
                {t.scanner.fehltText}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="relative flex flex-col gap-2.5 px-5 pb-[calc(24px+var(--unten))]">
        {treffer ? (
          <div className="flex items-center gap-3.5 border-y border-proof/40 py-3">
            <svg viewBox="0 0 22 22" width="20" height="20" fill="none" stroke="currentColor" className="shrink-0 text-proof"
                 strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 11.5l4 4 8-9" /></svg>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[14.5px] font-medium text-proof">{t.scanner.erkannt}</span>
              <span className="truncate font-mono text-[13px] text-white/85">{treffer}</span>
            </span>
          </div>
        ) : fremd ? (
          <div className="flex items-center gap-3.5 border-y border-risk/40 py-3">
            <span className="shrink-0 text-risk">{Icon.Warnung}</span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[14.5px] font-medium text-risk">{t.scanner.fremd}</span>
              <span className="truncate font-mono text-[13px] text-white/70">{fremd}</span>
            </span>
          </div>
        ) : null}
        <button onClick={einfuegen}
                className="flex h-14 items-center justify-center gap-2.5 rounded-full text-[16px] font-semibold
                           shadow-[inset_0_0_0_1px_rgb(238_244_255/.42)] active:scale-[.985]">
          {Icon.Kopieren} {t.scanner.einfuegen}
        </button>
      </div>
    </div>
  , document.body);
}

function Ecke({ style }: { style: React.CSSProperties }) {
  return <div className="absolute h-[34px] w-[34px] border-2 border-[#EEF4FF]" style={style} />;
}
