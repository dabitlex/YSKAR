'use client';

import { useMemo, useState, useEffect } from 'react';
import { useWallet } from '@/lib/wallet/useWallet';
import { isValidAddress, decodeAddress } from '@/lib/core/address';
import { buildTransfer, serializeTx, txid } from '@/lib/core/tx';
import { MIN_FEE, UNIT } from '@/lib/core/params';

/** Siehe useMining.ts -- leer heisst: derselbe Server wie die App. */
const MINING_BASIS = (process.env.NEXT_PUBLIC_MINING_BASE ?? '').trim()
  .replace(/\/+$/, '');

/** Antwort von /api/v2/fees -- siehe src/lib/core/feemarket.ts. */
interface Markt {
  minFee: string;
  wartend: number;
  andrang: boolean;
  stufen: Record<'langsam' | 'normal' | 'schnell', { fee: string; block: number }>;
  hinweis: string;
}
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

  /*
    Gebührenwahl.

    Die Stufen kommen vom Knoten und sind GEMESSEN -- aus dem tatsächlichen
    Mempool und der Zahl freier Plätze je Block. Ohne Andrang sind alle drei
    gleich der Mindestgebühr, und die Anzeige sagt das auch, statt drei
    erfundene Preise anzubieten.
  */
  const [stufe, setStufe] = useState<'langsam' | 'normal' | 'schnell'>('normal');
  const [markt, setMarkt] = useState<Markt | null>(null);

  useEffect(() => {
    let lebt = true;
    fetch('/api/v2/fees')
      .then(r => r.json())
      .then(d => { if (lebt && !d.error) setMarkt(d); })
      .catch(() => { /* ohne Auskunft bleibt es bei der Mindestgebühr */ });
    return () => { lebt = false; };
  }, []);

  // Ohne Auskunft vom Knoten: Mindestgebühr. Nie raten.
  const gebuehr = markt ? BigInt(markt.stufen[stufe].fee) : MIN_FEE;
  const zielBlock = markt ? markt.stufen[stufe].block : 1;

  const guthaben = BigInt(account?.balance ?? '0');
  const zielGueltig = isValidAddress(ziel.trim());
  const eigene = zielGueltig && wallet.address === ziel.trim();

  const einheiten = useMemo(() => {
    const n = Number(betrag.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return 0n;
    return BigInt(Math.round(n * Number(UNIT)));
  }, [betrag]);

  const summe = einheiten + gebuehr;
  const reicht = einheiten > 0n && summe <= guthaben;
  const bereit = zielGueltig && !eigene && reicht;

  const fmt = (v: bigint) => (Number(v) / 10 ** decimals).toFixed(4);

  const setzeAnteil = (teil: number) => {
    const verfuegbar = guthaben > gebuehr ? guthaben - gebuehr : 0n;
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
        fee: gebuehr,
        // Die naechste Nonce des Kontos. Ohne sie waere die Transaktion
        // entweder ungueltig oder eine Wiederholung.
        nonce: BigInt(account?.nonce ?? '0'),
        publicKey: kp.publicKey,
        privateKey: kp.privateKey,
        memo: notiz ? new TextEncoder().encode(notiz.slice(0, 32)) : undefined,
      });

      /*
        Transaktionen gehen dorthin, wo auch die Bloecke gebaut werden.

        Ein Spiegel nimmt sie zwar an, aber sie kaemen nie in einen Block:
        Wer die Jobs ausgibt, waehlt die Transaktionen aus -- und das ist
        nach der Umstellung der Knoten.
      */
      const res = await fetch(`${MINING_BASIS}/api/v2/tx`, {
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

        <div className="panel mt-5 p-5">
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
            <Zeile label="Gebühr" wert={`${fmt(gebuehr)} ${symbol}`} />
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
          className="tnum sunk w-full border border-transparent px-4 py-4 text-center font-mono text-xl
                     tracking-[0.45em] outline-none transition-colors focus:border-work/60"
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
        className="sunk w-full border border-transparent px-4 py-3.5 font-mono text-[13px]
                   outline-none transition-colors focus:border-work/60"
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
      <div className="sunk flex items-center border border-transparent px-4
                      transition-colors focus-within:border-work/60">
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
                  className="rounded-full bg-raised px-3 py-1.5 text-[12px] text-dim">
            {l as string}
          </button>
        ))}
      </div>
      {einheiten > 0n && !reicht && (
        <p className="mt-2 text-sm text-risk">
          Mehr als verfügbar. Die Gebühr von {fmt(gebuehr)} kommt noch dazu.
        </p>
      )}

      <label htmlFor="notiz" className="mb-1.5 mt-5 block text-sm text-dim">
        Notiz <span className="text-dim">optional, max. 32 Zeichen</span>
      </label>
      <input
        id="notiz" value={notiz} maxLength={32}
        onChange={e => setNotiz(e.target.value)}
        className="sunk w-full border border-transparent px-4 py-3.5 text-[13px]
                   outline-none transition-colors focus:border-work/60"
      />

      <dl className="mt-6 space-y-1.5 border-t border-line pt-4 text-[13px]">
        {/*
          Gebührenwahl.

          Ohne Andrang sind alle drei Stufen gleich -- dann wird gar keine
          Auswahl gezeigt, sondern gesagt, warum es nichts zu wählen gibt.
          Drei Knöpfe anzubieten, die dasselbe tun, wäre irreführend.
        */}
        {markt?.andrang ? (
          <>
            <div className="mb-1.5 mt-5 flex items-baseline justify-between">
              <span className="text-sm text-dim">Gebühr</span>
              <span className="text-[12px] text-faint">{markt.wartend} warten</span>
            </div>
            <div className="sunk flex overflow-hidden !rounded-full p-0.5">
              {(['langsam', 'normal', 'schnell'] as const).map(k => (
                <button key={k} onClick={() => setStufe(k)} aria-pressed={stufe === k}
                        className={`flex-1 rounded-full py-2 text-[12.5px] capitalize
                                    transition-colors ${
                          stufe === k ? 'bg-work text-ink' : 'text-faint'}`}>
                  {k}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-baseline justify-between text-[12.5px]">
              <span className="tnum font-mono">{fmt(gebuehr)} {symbol}</span>
              <span className="text-dim">
                {zielBlock === 1 ? 'voraussichtlich nächster Block'
                                 : `voraussichtlich in ${zielBlock} Blöcken`}
              </span>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-faint">
              Geschätzt, unter der Annahme dass nichts Neues dazukommt.
              Kommt gleich jemand mit höherer Gebühr, dauert es länger.
            </p>
          </>
        ) : (
          <>
            <Zeile label="Netzgebühr" wert={`${fmt(gebuehr)} ${symbol}`} />
            <p className="mt-2 text-[12px] leading-relaxed text-faint">
              {markt
                ? 'Kein Andrang — die Mindestgebühr genügt für den nächsten Block.'
                : 'Mindestgebühr.'}
            </p>
          </>
        )}
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
