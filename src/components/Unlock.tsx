'use client';

import { Zeichen as YZeichen } from '@/components/ui/Marke';

import { useEffect, useRef, useState } from 'react';
import { useWallet } from '@/lib/wallet/useWallet';
import { Button, Notice } from '@/components/ui/Primitives';
import PinFeld, { PinTasten, PIN_LAENGE } from '@/components/PinFeld';
import { biometrieAktiv, biometriePin, biometrieDeaktivieren } from '@/lib/native/biometrie';
import { useT, fehlerText } from '@/i18n';
import { vorladen } from '@/lib/vorladen';
import { haptik, telegramFarben } from '@/lib/telegram/webapp';
import { leistenFaerben } from '@/lib/native/leisten';
import { useThema } from '@/lib/useThema';

/**
 * Entsperren.
 *
 * Der private Schluessel lebt nur im Arbeitsspeicher dieser Sitzung. Nach
 * einem Neuladen ist er weg -- deshalb erscheint dieser Bildschirm, und
 * deshalb ist er absichtlich kurz.
 */
export default function Unlock({ ebene = false }: { ebene?: boolean }) {
  const wallet = useWallet();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [zeigeNotausgang, setZeigeNotausgang] = useState(false);
  const [bio, setBio] = useState(false);
  const bioVersucht = useRef(false);
  const { t } = useT();
  const { dunkel } = useThema();
  // Die Sperre ist dunkel wie der Einstieg -- auch Telegram- und Systemleisten.
  useEffect(() => {
    telegramFarben(true); leistenFaerben(true);
    return () => { telegramFarben(dunkel); leistenFaerben(dunkel); };
  }, [dunkel]);

  const oeffnen = async () => {
    setBusy(true); setFehler(null);
    const r = await wallet.unlock(pin);
    if (!r.ok) { haptik('fehler'); setFehler(fehlerText(r.reason, t)); setPin(''); setBusy(false); }
  };

  /*
    Biometrie (nur Android-App): Sensor sofort anbieten, PIN bleibt darunter.
    Stimmt die hinterlegte PIN nicht mehr zum Tresor -- etwa nach einer
    Wiederherstellung mit neuer PIN -- wird Biometrie abgeschaltet, statt bei
    jedem Start ins Leere zu laufen.
  */
  const mitBiometrie = async () => {
    setBusy(true); setFehler(null);
    const p = await biometriePin(t.unlock.bioGrund);
    if (!p) { setBusy(false); return; }
    const r = await wallet.unlock(p);
    if (!r.ok) {
      await biometrieDeaktivieren(); setBio(false);
      setFehler(t.unlock.bioWeg);
      setBusy(false);
    }
  };

  // Waehrend der Nutzer die PIN tippt, Konto und Kennzahlen frisch holen --
  // der Hauptbildschirm steht dann sofort mit den richtigen Zahlen.
  useEffect(() => { vorladen(wallet.address); }, [wallet.address]);

  useEffect(() => {
    if (!biometrieAktiv()) return;
    setBio(true);
    if (bioVersucht.current) return;
    bioVersucht.current = true;
    mitBiometrie();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Beim sechsten Punkt sofort pruefen -- ein Knopf "Oeffnen" waere ein Tipp mehr.
  useEffect(() => {
    if (pin.length === PIN_LAENGE && !busy) oeffnen();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const inhalt = (
    <main className="thema-dunkel rand-oben mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-[calc(28px+var(--unten))]">
      <div className="mt-11 flex justify-center">
        <YZeichen g={64} className="licht-auf" />
      </div>
      <h1 className="mt-[22px] text-center text-[24px] font-semibold tracking-[-0.02em]">{t.unlock.titel}</h1>
      {ebene && (
        <div className="mt-2.5 flex justify-center">
          <span className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[.08em] text-dim">
            <span className="h-1.5 w-1.5 rounded-full bg-work" />{t.einstellungen.sperreKurz}
          </span>
        </div>
      )}

      <div className="mt-[30px]"><PinFeld wert={pin} onChange={setPin} gesperrt={busy} fehler={!!fehler && pin === ''} /></div>
      <p className="mt-3.5 min-h-[18px] text-center text-[12.5px] font-semibold text-risk">
        {busy ? <span className="text-faint">{t.unlock.oeffnet}</span> : fehler}
      </p>

      {bio && (
        <button type="button" onClick={mitBiometrie} disabled={busy}
                className="mx-auto mt-2 flex items-center gap-2 rounded-full bg-surface px-4 py-2.5 text-[13px] font-extrabold disabled:opacity-50">
          <svg viewBox="0 0 22 22" width="18" height="18" fill="none" stroke="currentColor"
               strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 6.5a8 8 0 0 1 12 0M3.5 10a10 10 0 0 1 15 0M7 13a5 5 0 0 1 8 0M11 11v6M8.5 16.5a4 4 0 0 0 5 0" />
          </svg>
          {t.unlock.biometrie}
        </button>
      )}

      <div className="min-h-6 flex-1" />
      <PinTasten wert={pin} onChange={v => { setPin(v); setFehler(null); }} gesperrt={busy} />

      {!zeigeNotausgang ? (
        <button onClick={() => setZeigeNotausgang(true)}
                className="mt-4 w-full text-center text-[13px] font-bold text-dim">
          {t.unlock.vergessen}
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <Notice tone="risk">{t.unlock.notausgang}</Notice>
          <Button variant="risk" onClick={() => {
            if (confirm(t.unlock.loeschenFrage)) wallet.forget();
          }}>
            {t.unlock.loeschen}
          </Button>
        </div>
      )}
    </main>
  );
  // Als Ebene ueber der laufenden App: deckt alles ab, auch die Navigation.
  return ebene
    ? <div className="thema-dunkel fixed inset-0 z-[70] overflow-y-auto">{inhalt}</div>
    : inhalt;
}
