'use client';

import { Notice } from '@/components/ui/Primitives';
import type { Summary } from '@/hooks/useMining';

/**
 * Info.
 *
 * Fuehrt mit dem Halving-Fortschritt statt mit Neuigkeiten: Nach wenigen
 * Bloecken waere eine Nachrichtenliste leer, der Fortschritt erzaehlt vom
 * ersten Tag an etwas.
 */

const EPOCHE = 12_000;

const NEUIGKEITEN = [
  {
    datum: '09.09.2026',
    titel: 'Die Kette ist gestartet',
    text: 'Genesis-Block gemint, Inschrift „proof, not promise". Mining ist ' +
          'für alle offen.',
  },
  {
    datum: '09.09.2026',
    titel: 'Wallet mit zwölf Wörtern',
    text: 'Dein Guthaben hängt an deinem Schlüssel, nicht an Telegram. ' +
          'Schreib die Wörter auf — sie lassen sich nicht zurücksetzen.',
  },
];

export default function InfoTab({ summary, decimals, symbol, onEinstellungen }: {
  summary: Summary | null; decimals: number; symbol: string;
  onEinstellungen: () => void;
}) {
  const hoehe = summary?.height ?? 0;
  const inEpoche = hoehe % EPOCHE;
  const rest = EPOCHE - inEpoche;
  const anteil = (inEpoche / EPOCHE) * 100;
  const jetzt = Number(summary?.nextReward ?? 0) / 10 ** decimals;

  return (
    <>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-dim">Info</span>
        <span className="text-sm text-dim">
          Season {Math.floor(hoehe / 6000) + 1}
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-work/30 p-4">
        <p className="text-xs text-work">Halving</p>
        <p className="mt-1 text-[15px]">
          Noch <b>{rest.toLocaleString('de-DE')} Blöcke</b> bis zur Halbierung
          auf {(jetzt / 2).toFixed(1)} {symbol}.
        </p>
        <div className="mt-3 h-[3px] overflow-hidden rounded-sm bg-line">
          <div className="h-full bg-work" style={{ width: `${Math.max(0.3, anteil)}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-dim tnum">
          Block {inEpoche.toLocaleString('de-DE')} von {EPOCHE.toLocaleString('de-DE')}
        </p>
      </div>

      <p className="mt-7 text-sm text-dim">Neuigkeiten</p>
      <ul className="mt-2">
        {NEUIGKEITEN.map((n, i) => (
          <li key={i} className="border-b border-line py-3">
            <span className="block text-[10.5px] text-dim">{n.datum}</span>
            <span className="mt-0.5 block text-[13.5px] font-medium">{n.titel}</span>
            <p className="mt-1 text-xs leading-relaxed text-dim">{n.text}</p>
          </li>
        ))}
      </ul>

      <ul className="mt-6 border-t border-line">
        <Verweis href="/explorer.html">Block Explorer öffnen</Verweis>
        <li>
          <button onClick={onEinstellungen}
                  className="flex w-full items-center justify-between border-b
                             border-line py-3 text-left text-[13.5px]">
            Einstellungen <span className="text-dim">›</span>
          </button>
        </li>
      </ul>

      <div className="mt-6">
        <Notice>
          YSKAR ist ein Projekt, kein Zahlungsmittel. Die Kette hat einen
          Validator — die Arbeit ist echt und nachrechenbar, vertrauensfrei
          ist sie nicht.
        </Notice>
      </div>
    </>
  );
}

function Verweis({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <a href={href} className="flex items-center justify-between border-b border-line
                                py-3 text-[13.5px]">
        {children} <span className="text-dim">›</span>
      </a>
    </li>
  );
}
