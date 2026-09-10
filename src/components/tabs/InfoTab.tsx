'use client';

import { Panel, GroupTitle, Notice } from '@/components/ui/Primitives';
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
      <Panel tone="work" className="rise">
        <div className="flex items-baseline justify-between">
          <p className="text-[13px] text-work">Halving</p>
          <span className="text-[11.5px] text-faint">
            Season {Math.floor(hoehe / 6000) + 1}
          </span>
        </div>
        <p className="mt-2 text-[17px] leading-snug">
          Noch <b className="tnum font-medium">{rest.toLocaleString('de-DE')}</b> Blöcke
          bis zur Halbierung auf {(jetzt / 2).toFixed(1)} {symbol}.
        </p>
        <div className="sunk mt-4 h-2 overflow-hidden !rounded-full">
          <div className="h-full rounded-full bg-work transition-[width] duration-700"
               style={{ width: `${Math.max(1.5, anteil)}%` }} />
        </div>
        <p className="tnum mt-2 text-[11.5px] text-faint">
          Block {inEpoche.toLocaleString('de-DE')} von {EPOCHE.toLocaleString('de-DE')}
          {' · '}{anteil.toFixed(1)} %
        </p>
      </Panel>

      <GroupTitle>Neuigkeiten</GroupTitle>
      <Panel className="rise rise-1 !p-0">
        <ul className="divide-y divide-line/70">
          {NEUIGKEITEN.map((n, k) => (
            <li key={k} className="px-4 py-3.5">
              <span className="block text-[10.5px] text-faint">{n.datum}</span>
              <span className="mt-1 block text-[14px] font-medium">{n.titel}</span>
              <p className="mt-1 text-[12.5px] leading-relaxed text-dim">{n.text}</p>
            </li>
          ))}
        </ul>
      </Panel>

      <GroupTitle>Mehr</GroupTitle>
      <Panel className="rise rise-2 !p-0">
        <ul className="divide-y divide-line/70">
          <Verweis href="/explorer.html">Block Explorer öffnen</Verweis>
          <li>
            <button onClick={onEinstellungen}
                    className="flex w-full items-center justify-between px-4 py-3.5
                               text-left text-[14px]">
              Einstellungen <span className="text-faint">›</span>
            </button>
          </li>
        </ul>
      </Panel>

      <div className="mt-5">
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
      <a href={href} className="flex items-center justify-between px-4 py-3.5 text-[14px]">
        {children} <span className="text-faint">›</span>
      </a>
    </li>
  );
}
