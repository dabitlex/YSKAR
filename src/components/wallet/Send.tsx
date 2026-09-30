'use client';

import { useMemo, useState, useEffect, useCallback } from 'react';
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
import { Button, Notice, Icon } from '@/components/ui/Primitives';
import { BlattKopf } from '@/components/ui/Bausteine';
import Scanner from '@/components/wallet/Scanner';
import { biometrieAktiv, biometriePin } from '@/lib/native/biometrie';
import type { Account } from '@/hooks/useMining';
import { useT, fehlerText, type Woerterbuch } from '@/i18n';

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

export default function Send({ account, decimals, symbol, scanSofort, onGesendet,
                               onFertig, onAbbruch }: {
  account: Account | null; decimals: number; symbol: string;
  /** Aus der Wallet mit „Scannen" geoeffnet: Kamera zuerst, Formular danach. */
  scanSofort?: boolean;
  /** Der Knoten hat die Zahlung angenommen -- Konto neu lesen. */
  onGesendet?: () => void;
  onFertig: () => void; onAbbruch: () => void;
}) {
  const wallet = useWallet();
  const { t } = useT();
  const [schritt, setSchritt] = useState<Schritt>('formular');
  const [ziel, setZiel] = useState('');
  // Ob die Adresse gescannt wurde -- im Pruefschritt steht das dabei, damit
  // klar ist, woher sie kommt und dass man sie trotzdem ganz lesen sollte.
  const [gescannt, setGescannt] = useState(false);
  const [scanner, setScanner] = useState(!!scanSofort);
  const scanErgebnis = useCallback((adr: string) => {
    setZiel(adr); setGescannt(true); setScanner(false);
  }, []);
  const scanAbbruch = useCallback(() => setScanner(false), []);
  const [betrag, setBetrag] = useState('');
  const [notiz, setNotiz] = useState('');
  const [pin, setPin] = useState('');
  // Biometrie (Android-App): Sensor statt PIN beim Signieren; PIN bleibt als Ausweg.
  const [bio, setBio] = useState(false);
  const [pinManuell, setPinManuell] = useState(false);
  useEffect(() => { setBio(biometrieAktiv()); }, []);
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

  // Verfuegbar ist, was nach den schon wartenden Zahlungen uebrig bleibt.
  // Die Kette zieht sie erst mit dem Block ab -- die App muss es vorher tun,
  // sonst laesst sie eine zweite Zahlung zu, die der Knoten ablehnt.
  const wartendAus = (account?.pending ?? [])
    .filter(p => p.kind === 'out')
    .reduce((s, p) => s + BigInt(p.amount) + BigInt(p.fee), 0n);
  const kontostand = BigInt(account?.balance ?? '0');
  const guthaben = kontostand > wartendAus ? kontostand - wartendAus : 0n;
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

  async function senden(pinWert: string = pin) {
    setBusy(true); setFehler(null);
    try {
      // Der Schluessel kommt frisch aus dem Tresor, nicht aus dem Speicher.
      const auf = await wallet.revealMnemonic(pinWert);
      if (!auf.ok || !auf.mnemonic) throw new Error(fehlerText(auf.reason ?? 'wrong_pin', t));

      const { keypairFromMnemonic } = await import('@/lib/core/wallet');
      const kp = keypairFromMnemonic(auf.mnemonic);

      const tx = buildTransfer({
        from: kp.addressRaw,
        to: decodeAddress(ziel.trim()),
        amount: einheiten,
        fee: gebuehr,
        // Die naechste Nonce des Kontos: Zustand PLUS eigene wartende
        // Zahlungen. Mit der reinen Zustands-Nonce gaelte eine zweite
        // Zahlung vor der Bestaetigung als Ersatz der ersten -- und der
        // Knoten lehnte sie ab, weil die Gebuehr nicht hoeher ist.
        nonce: BigInt(account?.nextNonce
          ?? String(BigInt(account?.nonce ?? '0')
                    + BigInt((account?.pending ?? []).filter(p => p.kind === 'out').length))),
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
      if (!body.accepted) throw new Error(uebersetze(body.reason, t));

      setErgebnis({ txid: body.txid ?? toHex(txid(tx)) });
      setSchritt('fertig');
      onGesendet?.();
    } catch (e) {
      setFehler(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function sendenMitBiometrie() {
    const p = await biometriePin(t.senden.bioGrund(fmt(einheiten), symbol));
    if (!p) { setFehler(t.senden.bioNicht); return; }
    await senden(p);
  }

  // ------------------------------------------------------------- fertig
  if (schritt === 'fertig') {
    return (
      <div className="text-center">
        <div className="zoom mx-auto mt-10 flex h-16 w-16 items-center justify-center
                        rounded-full bg-proof text-white shadow-[0_10px_24px_-10px_rgb(var(--proof)/.6)]">
          <svg viewBox="0 0 22 22" width="28" height="28" fill="none" stroke="currentColor"
               strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 11.5l4 4 8-9" /></svg>
        </div>
        <h1 className="rise mt-5 text-[26px] font-extrabold tracking-[-0.02em]">{t.senden.gesendet}</h1>
        <p className="rise rise-1 mt-3 text-[15px] font-medium leading-relaxed text-dim">
          {t.senden.unterwegs(fmt(einheiten), symbol)}
        </p>
        <div className="panel rise rise-2 mt-6 p-4 text-left">
          <p className="label">{t.senden.transaktion}</p>
          <p className="mt-1.5 break-all font-mono text-xs">{ergebnis?.txid}</p>
        </div>
        <div className="mt-8"><Button variant="quiet" onClick={onFertig}>{t.allgemein.fertig}</Button></div>
      </div>
    );
  }

  // ------------------------------------------------------------- pruefen
  if (schritt === 'pruefen') {
    return (
      <>
        <BlattKopf titel={t.senden.pruefenTitel} onZurueck={() => setSchritt('formular')} art="zurueck" />

        <div className="panel rise p-5">
          <p className="label">{t.senden.duSendest}</p>
          <p className="tnum mt-1.5 text-[32px] font-extrabold tracking-[-0.03em]">
            {fmt(einheiten)} <span className="text-[16px] font-bold text-faint">{symbol}</span>
          </p>
          <div className="my-4 h-px bg-line" />
          <p className="label">{t.senden.an}</p>
          <div className="mt-1.5 flex items-start gap-2 rounded-[12px] bg-ink px-3 py-2.5">
            {gescannt && <span className="mt-0.5 shrink-0 text-work">{Icon.Scan}</span>}
            <p className="break-all font-mono text-[12.5px] leading-[1.5]">{ziel.trim()}</p>
          </div>
          {gescannt && (
            <p className="mt-1.5 text-[12px] font-semibold text-faint">
              {t.senden.perScan}
            </p>
          )}
          {notiz && (
            <>
              <div className="my-4 h-px bg-line" />
              <p className="text-xs text-dim">{t.senden.notiz}</p>
              <p className="mt-0.5 text-[13px]">{notiz.slice(0, 32)}</p>
            </>
          )}
          <div className="my-4 h-px bg-line" />
          <dl className="space-y-2 text-[13.5px]">
            <Zeile label={t.senden.netzgebuehr} wert={`${fmt(gebuehr)} ${symbol}`} />
            <Zeile label={t.senden.belastung} wert={`${fmt(summe)} ${symbol}`} />
            <Zeile label={t.senden.rest} wert={`${fmt(guthaben - summe)} ${symbol}`} />
          </dl>
        </div>

        <div className="rise rise-1 mt-4 flex items-start gap-2.5 warte rounded-[14px] px-3.5 py-3
                        text-[12.5px] font-semibold leading-[1.5]">
          <span className="shrink-0">{Icon.Warnung}</span>
          {t.senden.warnung}
        </div>

        {bio && !pinManuell ? (
          <>
            {fehler && <div className="mt-6"><Notice tone="risk">{fehler}</Notice></div>}
            <div className="mt-6 space-y-3">
              <Button onClick={sendenMitBiometrie} disabled={busy}>
                {busy ? t.senden.signiert : t.senden.mitBio}
              </Button>
              <Button variant="quiet" onClick={() => setPinManuell(true)}>{t.senden.pinEingeben}</Button>
              <Button variant="quiet" onClick={() => setSchritt('formular')}>{t.allgemein.zurueck}</Button>
            </div>
          </>
        ) : (
          <>
            <label htmlFor="spin" className="mb-1.5 mt-6 block text-[13px] font-bold text-dim">
              {t.senden.pinSignieren}
            </label>
            <input
              id="spin" inputMode="numeric" maxLength={6} value={pin} autoFocus
              onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setFehler(null); }}
              className="tnum sunk w-full px-4 py-4 text-center font-mono text-xl
                         tracking-[0.45em] outline-none transition-colors focus:border-work"
            />

            {fehler && <div className="mt-4"><Notice tone="risk">{fehler}</Notice></div>}

            <div className="mt-6 space-y-3">
              <Button onClick={() => senden()} disabled={pin.length !== 6 || busy}>
                {busy ? t.senden.signiert : t.senden.jetzt}
              </Button>
              <Button variant="quiet" onClick={() => setSchritt('formular')}>{t.allgemein.zurueck}</Button>
            </div>
          </>
        )}
      </>
    );
  }

  // ------------------------------------------------------------ formular
  if (scanner) {
    return <Scanner onErgebnis={scanErgebnis} onAbbruch={scanAbbruch} />;
  }
  return (
    <>
      <BlattKopf titel={t.senden.titel} onZurueck={onAbbruch}
                 rechts={<span className="tnum text-[12.5px] font-bold text-dim">
                   {fmt(guthaben)} {symbol}</span>} />

      <label htmlFor="ziel" className="mb-1.5 block text-[13px] font-bold text-dim">{t.senden.empfaenger}</label>
      <div className="sunk flex items-center gap-2 pl-4 pr-1.5 transition-colors focus-within:border-work">
        <input
          id="ziel" value={ziel} onChange={e => { setZiel(e.target.value); setGescannt(false); }}
          autoCapitalize="none" autoCorrect="off" spellCheck={false}
          placeholder="ysr1…"
          className="min-w-0 flex-1 bg-transparent py-3.5 font-mono text-[13.5px] outline-none
                     placeholder:text-faint"
        />
        <button type="button" onClick={() => setScanner(true)} aria-label={t.senden.scanAria}
                className="flex h-[42px] shrink-0 items-center gap-1.5 rounded-[11px] bg-work/10
                           px-3.5 text-[13px] font-extrabold text-work active:scale-95">
          {Icon.Scan} {t.senden.scannen}
        </button>
      </div>
      {ziel.trim().length > 0 ? (
        <p className={`mt-1.5 text-[12.5px] font-bold ${
          eigene ? 'text-risk' : zielGueltig ? 'text-proof' : 'text-risk'}`}>
          {eigene ? t.senden.eigene
            : zielGueltig ? (gescannt ? t.senden.gueltigScan : t.senden.gueltig)
            : t.senden.ungueltig}
        </p>
      ) : (
        <p className="mt-1.5 text-[12px] font-semibold text-faint">
          {t.senden.tipp}
        </p>
      )}

      <label htmlFor="betrag" className="mb-1.5 mt-5 block text-[13px] font-bold text-dim">{t.senden.betrag}</label>
      <div className="sunk flex items-center px-4 transition-colors focus-within:border-work">
        <input
          id="betrag" inputMode="decimal" value={betrag}
          onChange={e => setBetrag(e.target.value.replace(/[^\d.,]/g, ''))}
          placeholder="0,0000"
          className="tnum flex-1 bg-transparent py-3 font-mono text-[20px] outline-none
                     placeholder:text-faint"
        />
        <span className="text-[14px] font-bold text-faint">{symbol}</span>
      </div>
      <div className="mt-2 flex gap-2">
        {[[0.25, '25 %'], [0.5, '50 %'], [1, t.senden.alles]].map(([teil, l]) => (
          <button key={String(l)} onClick={() => setzeAnteil(teil as number)}
                  className="rounded-full border border-line bg-surface px-3.5 py-1.5
                             text-[12px] font-bold text-dim active:bg-raised">
            {l as string}
          </button>
        ))}
      </div>
      {einheiten > 0n && !reicht && (
        <p className="mt-2 text-[12.5px] font-bold text-risk">
          {t.senden.zuViel(fmt(gebuehr))}
        </p>
      )}

      <label htmlFor="notiz" className="mb-1.5 mt-5 block text-[13px] font-bold text-dim">
        {t.senden.notiz} <span className="font-semibold text-faint">{t.senden.notizHinweis}</span>
      </label>
      <input
        id="notiz" value={notiz} maxLength={32}
        onChange={e => setNotiz(e.target.value)}
        className="sunk w-full px-4 py-3.5 text-[14px] font-medium outline-none
                   transition-colors focus:border-work"
      />

      <dl className="panel mt-5 space-y-1.5 px-4 py-3 text-[13.5px]">
        {/*
          Gebührenwahl.

          Ohne Andrang sind alle drei Stufen gleich -- dann wird gar keine
          Auswahl gezeigt, sondern gesagt, warum es nichts zu wählen gibt.
          Drei Knöpfe anzubieten, die dasselbe tun, wäre irreführend.
        */}
        {markt?.andrang ? (
          <>
            <div className="mb-1.5 mt-1 flex items-baseline justify-between">
              <span className="text-[13.5px] font-semibold text-dim">{t.senden.gebuehr}</span>
              <span className="text-[12px] font-semibold text-faint">{t.senden.warten(markt.wartend)}</span>
            </div>
            <div className="flex overflow-hidden rounded-full bg-raised p-0.5">
              {(['langsam', 'normal', 'schnell'] as const).map(k => (
                <button key={k} onClick={() => setStufe(k)} aria-pressed={stufe === k}
                        className={`flex-1 rounded-full py-2 text-[12.5px] font-bold capitalize
                                    transition-colors ${
                          stufe === k ? 'bg-surface text-text shadow-sm' : 'text-dim'}`}>
                  {t.senden.stufe[k]}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-baseline justify-between text-[12.5px] font-semibold">
              <span className="tnum font-mono">{fmt(gebuehr)} {symbol}</span>
              <span className="text-dim">
                {zielBlock === 1 ? t.senden.naechster : t.senden.inBloecken(zielBlock)}
              </span>
            </div>
            <p className="mt-2 text-[12px] font-medium leading-relaxed text-faint">
              {t.senden.geschaetzt}
            </p>
          </>
        ) : (
          <>
            <Zeile label={t.senden.netzgebuehr} wert={`${fmt(gebuehr)} ${symbol}`} />
            <p className="pb-1 text-[12px] font-medium leading-relaxed text-faint">
              {markt ? t.senden.keinAndrang : t.senden.mindest}
            </p>
          </>
        )}
        <div className="!mt-2 border-t border-line pt-2">
          <Zeile label={t.senden.summe} wert={`${fmt(summe)} ${symbol}`} />
        </div>
      </dl>

      <div className="mt-6">
        <Button onClick={() => setSchritt('pruefen')} disabled={!bereit}>{t.allgemein.weiter}</Button>
      </div>
    </>
  );
}

function Zeile({ label, wert }: { label: string; wert: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <dt className="font-semibold text-dim">{label}</dt>
      <dd className="tnum font-bold">{wert}</dd>
    </div>
  );
}

function uebersetze(grund: string, t: Woerterbuch): string {
  const texte = t.fehler.tx;
  if (grund in texte && grund !== 'sonst') return texte[grund as Exclude<keyof typeof texte, 'sonst'>];
  return texte.sonst(grund);
}
