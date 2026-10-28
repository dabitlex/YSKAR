import { db } from '@/lib/db/service';
import { decodeAddress, addressFor, isValidAddress } from '@/lib/core/address';
import { toHex, fromHex } from '@/lib/core/codec';
import { verifySignature } from '@/lib/core/wallet';
import { pruefeInitData, fingerabdruck } from '@/lib/aktion/initData';
import {
  ENDE, PRUEF_ENDE, MINING_TAGE, TAGESLIMIT, laeuft, codeAusAdresse, fristFuer, lose,
  type Status,
} from '@/lib/aktion/regeln';

/**
 * Serverseite der Aktion. Eingeschaltet erst, wenn beide Umgebungsvariablen
 * gesetzt sind -- vorher antworten die Routen mit "nicht eingerichtet" und
 * die App zeigt nichts von der Aktion:
 *
 *   TELEGRAM_BOT_TOKEN  Token von @YSKAR_bot (fuer die initData-Pruefung)
 *   AKTION_GEHEIMNIS    langer Zufallswert (Fingerabdruck der Telegram-ID)
 */
export function eingerichtet(): { token: string; geheimnis: string } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const geheimnis = process.env.AKTION_GEHEIMNIS?.trim();
  return token && geheimnis && geheimnis.length >= 32 ? { token, geheimnis } : null;
}

/** Die Nachricht, die die Wallet beim Anmelden signiert. */
export function anmeldeNachricht(telegramId: number, adresse: string): string {
  return `YSKAR Hilf-wachsen ${telegramId} ${adresse}`;
}

export interface Zeile {
  tg_fingerabdruck: string;
  adresse: string;
  code: string;
  geworben_von: string | null;
  angemeldet_am: string;
  status: Status;
  grund: string | null;
  mining_tage: number;
  bestaetigt_am: string | null;
}

const T = () => db().schema('chain2').from('aktion_teilnehmer');

function roh(adresse: string): string {
  return '\\x' + toHex(decodeAddress(adresse));
}

export type AnmeldeFehler = 'nicht_eingerichtet' | 'initdata' | 'adresse' | 'signatur' | 'db';

/**
 * Anmelden (idempotent). Jedes Telegram-Konto genau einmal. Kam der Nutzer
 * ueber einen Empfehlungslink und ist seine Wallet neu, wird er "offen" und
 * zaehlt, sobald er an 3 Tagen Mining-Ertraege hatte.
 */
export async function anmelden(e: {
  initData: string; adresse: string; publicKey: string; signatur: string; ref: string | null;
}): Promise<{ ok: true; zeile: Zeile } | { ok: false; fehler: AnmeldeFehler; detail?: string }> {
  const cfg = eingerichtet();
  if (!cfg) return { ok: false, fehler: 'nicht_eingerichtet' };
  const tgId = pruefeInitData(e.initData, cfg.token);
  if (tgId === null) return { ok: false, fehler: 'initdata' };
  const adresse = e.adresse.trim().toLowerCase();
  if (!isValidAddress(adresse)) return { ok: false, fehler: 'adresse' };

  // Die Wallet bestaetigt: Diese Adresse gehoert zu diesem Telegram-Konto.
  try {
    const pk = fromHex(e.publicKey);
    if (pk.length !== 32 || addressFor(pk) !== adresse) return { ok: false, fehler: 'signatur' };
    const nachricht = new TextEncoder().encode(anmeldeNachricht(tgId, adresse));
    if (!verifySignature(fromHex(e.signatur), nachricht, pk)) return { ok: false, fehler: 'signatur' };
  } catch { return { ok: false, fehler: 'signatur' }; }

  const fp = fingerabdruck(tgId, cfg.geheimnis);
  const alt = await T().select('*').eq('tg_fingerabdruck', fp).maybeSingle();
  if (alt.error) return { ok: false, fehler: 'db', detail: alt.error.message };
  if (alt.data) return { ok: true, zeile: alt.data as Zeile };

  // Diese Wallet ist schon einem anderen Telegram-Konto zugeordnet?
  const belegt = await T().select('*').eq('adresse', adresse).maybeSingle();
  if (belegt.data) return { ok: true, zeile: belegt.data as Zeile };

  // Eigener Code: das Adressstueck, bei Kollision laenger.
  let code = codeAusAdresse(adresse);
  for (const n of [8, 10, 12, 14, 16]) {
    code = codeAusAdresse(adresse, n);
    const k = await T().select('tg_fingerabdruck').eq('code', code).maybeSingle();
    if (!k.data) break;
  }

  const jetzt = Date.now();
  let status: Status = 'ohne';
  let grund: string | null = null;
  let geworbenVon: string | null = null;
  const ref = e.ref && /^[a-z0-9]{6,16}$/.test(e.ref) ? e.ref : null;
  if (ref && laeuft(jetzt)) {
    const werber = await T().select('adresse, code').eq('code', ref).maybeSingle();
    if (werber.data && werber.data.adresse !== adresse) {
      geworbenVon = ref;
      status = 'offen';
      // Neue Wallet? Schon Bewegung auf der Kette vor der Anmeldung -> zaehlt nicht.
      const { data: aktiv } = await db().schema('chain2').rpc('aktion_aktiv_vor', {
        p_addr: roh(adresse), p_vor: Math.floor(jetzt / 1000),
      });
      if (aktiv === true) { status = 'ungueltig'; grund = 'wallet_alt'; }
      else {
        // Hoechstens TAGESLIMIT gezaehlte Empfehlungen je Werber und Tag (UTC).
        const tag = new Date(jetzt); tag.setUTCHours(0, 0, 0, 0);
        const { count } = await T().select('tg_fingerabdruck', { count: 'exact', head: true })
          .eq('geworben_von', ref).neq('status', 'ungueltig').gte('angemeldet_am', tag.toISOString());
        if ((count ?? 0) >= TAGESLIMIT) { status = 'ungueltig'; grund = 'tageslimit'; }
      }
    } else if (werber.data) {
      grund = 'selbst';
    }
  }

  const zeile = {
    tg_fingerabdruck: fp, adresse, code, geworben_von: geworbenVon,
    angemeldet_am: new Date(jetzt).toISOString(), status, grund, mining_tage: 0, bestaetigt_am: null,
  };
  const ins = await T().insert(zeile).select('*').single();
  if (ins.error) {
    // Gleichzeitige zweite Anmeldung desselben Kontos: die erste gilt.
    const nochmal = await T().select('*').eq('tg_fingerabdruck', fp).maybeSingle();
    if (nochmal.data) return { ok: true, zeile: nochmal.data as Zeile };
    return { ok: false, fehler: 'db', detail: ins.error.message };
  }
  return { ok: true, zeile: ins.data as Zeile };
}

/**
 * Offene Empfehlungen pruefen: Mining-Tage aus der Kette zaehlen. Wird beim
 * Abruf des Stands erledigt (kein eigener Zeitplan noetig) und im
 * Ziehungsskript ein letztes Mal fuer alle.
 */
export async function pruefen(zeilen: Zeile[], jetzt = Date.now()): Promise<Zeile[]> {
  const raus: Zeile[] = [];
  for (const z of zeilen) {
    if (z.status !== 'offen') { raus.push(z); continue; }
    const von = Date.parse(z.angemeldet_am);
    const bis = fristFuer(von);
    const { data } = await db().schema('chain2').rpc('aktion_mining_tage', {
      p_addr: roh(z.adresse), p_von: Math.floor(von / 1000), p_bis: Math.floor(Math.min(bis, jetzt) / 1000),
    });
    const tage = typeof data === 'number' ? data : z.mining_tage;
    let neu: Zeile = { ...z, mining_tage: tage };
    if (tage >= MINING_TAGE) neu = { ...neu, status: 'bestaetigt', bestaetigt_am: new Date(jetzt).toISOString() };
    else if (jetzt > bis) neu = { ...neu, status: 'ungueltig', grund: 'frist' };
    if (neu.status !== z.status || neu.mining_tage !== z.mining_tage) {
      await T().update({
        status: neu.status, grund: neu.grund, mining_tage: neu.mining_tage,
        bestaetigt_am: neu.bestaetigt_am, geprueft_am: new Date(jetzt).toISOString(),
      }).eq('tg_fingerabdruck', z.tg_fingerabdruck);
    }
    raus.push(neu);
  }
  return raus;
}

export interface Stand {
  aktiv: boolean;
  ende: number;
  code: string;
  lose: number;
  selbst: { status: Status; mining_tage: number };
  empfehlungen: { adresse: string; status: Status; grund: string | null; mining_tage: number; angemeldet: string; frist: number }[];
  gewinn: { platz: number; betrag_usd: number; code: string } | null;
}

/** Stand fuer die App: eigene Lose, eigene Empfehlungen, nach der Ziehung der Gewinn. */
export async function stand(initData: string): Promise<{ ok: true; stand: Stand } | { ok: false; fehler: AnmeldeFehler }> {
  const cfg = eingerichtet();
  if (!cfg) return { ok: false, fehler: 'nicht_eingerichtet' };
  const tgId = pruefeInitData(initData, cfg.token);
  if (tgId === null) return { ok: false, fehler: 'initdata' };
  const fp = fingerabdruck(tgId, cfg.geheimnis);
  const ich = await T().select('*').eq('tg_fingerabdruck', fp).maybeSingle();
  if (ich.error || !ich.data) return { ok: false, fehler: 'db' };

  const [selbst] = await pruefen([ich.data as Zeile]);
  const { data: geworbene } = await T().select('*').eq('geworben_von', selbst!.code)
    .order('angemeldet_am', { ascending: false }).limit(200);
  const liste = await pruefen((geworbene ?? []) as Zeile[]);
  const bestaetigt = liste.filter(z => z.status === 'bestaetigt').length;

  const { data: g } = await db().schema('chain2').from('aktion_gewinner')
    .select('platz, betrag_usd, code').eq('adresse', selbst!.adresse).maybeSingle();

  return {
    ok: true,
    stand: {
      aktiv: laeuft(), ende: ENDE,
      code: selbst!.code,
      lose: lose(bestaetigt, selbst!.status === 'bestaetigt'),
      selbst: { status: selbst!.status, mining_tage: selbst!.mining_tage },
      empfehlungen: liste.map(z => ({
        adresse: z.adresse, status: z.status, grund: z.grund, mining_tage: z.mining_tage,
        angemeldet: z.angemeldet_am, frist: fristFuer(Date.parse(z.angemeldet_am)),
      })),
      gewinn: g ? { platz: g.platz, betrag_usd: g.betrag_usd, code: g.code } : null,
    },
  };
}

export { PRUEF_ENDE };
