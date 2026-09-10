'use client';

import { useMemo, useState } from 'react';
import { useWallet } from '@/lib/wallet/useWallet';
import { isValidAddress, decodeAddress } from '@/lib/core/address';
import { buildTransfer, serializeTx, txid } from '@/lib/core/tx';
import { MIN_FEE, UNIT } from '@/lib/core/params';
import { toHex } from '@/lib/core/codec';
import { Title, Body, Button, Notice } from '@/components/ui/Primitives';
import type { Account } from '@/hooks/useMining';

/**
 * Senden -- drei Schritte mit einer bewussten Bestaetigung dazwischen.
 *
 * Eine gesendete Zahlung laesst sich nicht zurueckholen. Ein Schritt weniger
 * waere bequemer und falsch. Die PIN wird erneut verlangt, weil der private
 * Schluessel zum Signieren gebraucht wird -- und weil ein zweites bewusstes
 * Ja an dieser Stelle angemessen ist.
 *
 * Die Transaktion wird VOLLSTAENDIG auf dem Geraet gebaut und signiert. Der
 * Server sieht nur fertige Bytes; er koennte Betrag oder Empfaenger gar
 * nicht aendern, ohne die Signatur zu brechen.
 */

type Schritt = 'formular' | 'pruefen' | 'fertig';

export default function Send({ account, decimals, symbol, onFertig, onAbbruch }: {
  account: Account | null; decimals: number; symbol: string;
  onFertig: () => void; onAbbruch: () => void;
}) {
  const wallet = useWallet();
  const [schritt, setSchritt] = useState<Schritt>('formular');
  const [ziel, setZiel] = useState('');
  const [betrag, setBetrag] = useState('');
  const [notiz, setNotiz] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<{ txid: string } | null>(null);

  const guthaben = BigInt(account?.balance ?? '0');
  const zielGueltig = isValidAddress(ziel.trim());
  const eigene = zielGueltig && wallet.address === ziel.trim();

  const einheiten = useMemo(() => {
    const n = Number(betrag.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return 0n;
    return BigInt(Math.round(n * Number(UNIT)));
  }, [betrag]);

  const summe = einheiten + MIN_FEE;
  const reicht = einheiten > 0n && summe <= guthaben;
  const bereit = zielGueltig && !eigene && reicht;

  const fmt = (v: bigint) => (Number(v) / 10 ** decimals).toFixed(4);

  const setzeAnteil = (teil: number) => {
    const verfuegbar = guthaben > MIN_FEE ? guthaben - MIN_FEE : 0n;
    const wert = teil === 1 ? verfuegbar
      : (verfuegbar * BigInt(Math.round(teil * 100))) / 100n;
    setBetrag((Number(wert) / 10 ** decimals).toFixed(4).replace('.', ','));
  };

  async function senden() {
    setBusy(true); setFehler(null);
    try {
      // Der Schluessel kommt frisch aus dem Tresor, nicht aus dem Speicher.
      const auf = await wallet.revealMnemonic(pin);
      if (!auf.ok || !auf.mnemonic) throw new Error(auf.reason ?? 'PIN stimmt nicht.');

      const { keypairFromMnemonic } = await import('@/lib/core/wallet');
      const kp = keypairFromMnemonic(auf.mnemonic);

      const tx = buildTransfer({
        from: kp.addressRaw,
        to: decodeAddress(ziel.trim()),
        amount: einheiten,
        fee: MIN_FEE,
        // Die naechste Nonce des Kontos. Ohne sie waere die Transaktion
        // entweder ungueltig oder eine Wiederholung.
        nonce: BigInt(account?.nonce ?? '0'),
        publicKey: kp.publicKey,
        privateKey: kp.privateKey,
        memo: notiz ? new TextEncoder().encode(notiz.slice(0, 32)) : undefined,
      });

      const res = await fetch('/api/v2/tx', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ raw: toHex(serializeTx(tx)) }),
      });
      const body = await res.json();
      if (!body.accepted) throw new Error(uebersetze(body.reason));

      setErgebnis({ txid: body.txid ?? toHex(txid(tx)) });
      setSchritt('fertig');
    } catch (e) {
      setFehler(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------------------- fertig
  if (schritt === 'fertig') {
    return (
      <div className="text-center">
        <div className="mx-auto mt-10 flex h-14 w-14 items-center justify-center
                        rounded-full border border-proof text-2xl text-proof">✓</div>
        <h1 className="mt-5 text-2xl font-medium">Gesendet</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-dim">
          {fmt(einheiten)} {symbol} sind unterwegs. Sie erscheinen im nächsten Block.
        </p>
        <p className="mt-6 border-t border-line pt-4 text-sm text-dim">Transaktion</p>
        <p className="mt-1 break-all font-mono text-xs">{ergebnis?.txid}</p>
        <div className="mt-8"><Button variant="quiet" onClick={onFertig}>Fertig</Button></div>
      </div>
    );
  }

  // ------------------------------------------------------------- pruefen
  if (schritt === 'pruefen') {
    return (
      <>
        <Title>Prüfen und senden</Title>
        <Body>Eine gesendete Zahlung lässt sich nicht zurückholen.</Body>

        <div className="mt-5 rounded-xl border border-line p-4">
          <p className="text-xs text-dim">Betrag</p>
          <p className="tnum mt-0.5 text-2xl font-medium">{fmt(einheiten)} {symbol}</p>
          <div className="my-4 h-px bg-line" />
          <p className="text-xs text-dim">An</p>
          <p className="mt-0.5 break-all font-mono text-[13px]">{ziel.trim()}</p>
          {notiz && (
            <>
              <div className="my-4 h-px bg-line" />
              <p className="text-xs text-dim">Notiz</p>
              <p className="mt-0.5 text-[13px]">{notiz.slice(0, 32)}</p>
            </>
          )}
          <div className="my-4 h-px bg-line" />
          <dl className="space-y-1.5 text-[13px]">
            <Zeile label="Gebühr" wert={`${fmt(MIN_FEE)} ${symbol}`} />
            <Zeile label="Belastung" wert={`${fmt(summe)} ${symbol}`} />
            <Zeile label="Rest" wert={`${fmt(guthaben - summe)} ${symbol}`} />
          </dl>
        </div>

        <label htmlFor="spin" className="mb-1.5 mt-6 block text-sm text-dim">
          PIN zum Signieren
        </label>
        <input
          id="spin" inputMode="numeric" maxLength={6} value={pin} autoFocus
          onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setFehler(null); }}
          className="tnum w-full rounded-lg border border-line bg-surface px-4 py-3
                     text-center font-mono text-lg tracking-[0.4em] outline-none
                     focus:border-work"
        />

        {fehler && <div className="mt-4"><Notice tone="risk">{fehler}</Notice></div>}

        <div className="mt-6 space-y-3">
          <Button onClick={senden} disabled={pin.length !== 6 || busy}>
            {busy ? 'Wird signiert…' : 'Jetzt senden'}
          </Button>
          <Button variant="quiet" onClick={() => setSchritt('formular')}>Zurück</Button>
        </div>
      </>
    );
  }

  // ------------------------------------------------------------ formular
  return (
    <>
      <div className="flex items-baseline justify-between">
        <button onClick={onAbbruch} className="text-sm text-dim">← Zurück</button>
        <span className="tnum text-sm text-dim">Verfügbar {fmt(guthaben)}</span>
      </div>
      <div className="mt-4"><Title>Senden</Title></div>

      <label htmlFor="ziel" className="mb-1.5 mt-5 block text-sm text-dim">Empfänger</label>
      <input
        id="ziel" value={ziel} onChange={e => setZiel(e.target.value)}
        autoCapitalize="none" autoCorrect="off" spellCheck={false}
        placeholder="ysr1…"
        className="w-full rounded-lg border border-line bg-surface px-4 py-3
                   font-mono text-[13px] outline-none focus:border-work"
      />
      {ziel.trim().length > 0 && (
        <p className={`mt-1.5 text-sm ${
          eigene ? 'text-risk' : zielGueltig ? 'text-proof' : 'text-risk'}`}>
          {eigene ? 'Das ist deine eigene Adresse.'
            : zielGueltig ? '✓ Gültige YSKAR-Adresse'
            : 'Keine gültige YSKAR-Adresse.'}
        </p>
      )}

      <label htmlFor="betrag" className="mb-1.5 mt-5 block text-sm text-dim">Betrag</label>
      <div className="flex items-center rounded-lg border border-line bg-surface px-4
                      focus-within:border-work">
        <input
          id="betrag" inputMode="decimal" value={betrag}
          onChange={e => setBetrag(e.target.value.replace(/[^\d.,]/g, ''))}
          placeholder="0,0000"
          className="tnum flex-1 bg-transparent py-3 font-mono text-[17px] outline-none"
        />
        <span className="text-sm text-dim">{symbol}</span>
      </div>
      <div className="mt-2 flex gap-2">
        {[[0.25, '25%'], [0.5, '50%'], [1, 'Alles']].map(([t, l]) => (
          <button key={String(l)} onClick={() => setzeAnteil(t as number)}
                  className="rounded-md border border-line px-2.5 py-1 text-xs text-dim">
            {l as string}
          </button>
        ))}
      </div>
      {einheiten > 0n && !reicht && (
        <p className="mt-2 text-sm text-risk">
          Mehr als verfügbar. Die Gebühr von {fmt(MIN_FEE)} kommt noch dazu.
        </p>
      )}

      <label htmlFor="notiz" className="mb-1.5 mt-5 block text-sm text-dim">
        Notiz <span className="text-dim">optional, max. 32 Zeichen</span>
      </label>
      <input
        id="notiz" value={notiz} maxLength={32}
        onChange={e => setNotiz(e.target.value)}
        className="w-full rounded-lg border border-line bg-surface px-4 py-3
                   text-[13px] outline-none focus:border-work"
      />

      <dl className="mt-6 space-y-1.5 border-t border-line pt-4 text-[13px]">
        <Zeile label="Netzgebühr" wert={`${fmt(MIN_FEE)} ${symbol}`} />
        <Zeile label="Summe" wert={`${fmt(summe)} ${symbol}`} />
      </dl>

      <div className="mt-6">
        <Button onClick={() => setSchritt('pruefen')} disabled={!bereit}>Weiter</Button>
      </div>
    </>
  );
}

function Zeile({ label, wert }: { label: string; wert: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-dim">{label}</dt>
      <dd className="tnum">{wert}</dd>
    </div>
  );
}

function uebersetze(grund: string): string {
  const texte: Record<string, string> = {
    insufficient_funds: 'Guthaben reicht nicht.',
    nonce_used: 'Diese Zahlung wurde bereits eingereicht.',
    fee_not_higher: 'Es wartet schon eine Zahlung mit dieser Nummer.',
    fee_too_low: 'Die Gebühr ist zu niedrig.',
    self_transfer: 'Empfänger und Absender sind identisch.',
    bad_signature: 'Signatur ungültig.',
    malformed: 'Die Transaktion ist fehlerhaft aufgebaut.',
  };
  return texte[grund] ?? `Abgelehnt: ${grund}`;
}
