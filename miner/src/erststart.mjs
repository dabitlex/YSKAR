/**
 * Erster Start: Adresse und Mining-Art erfragen.
 *
 * Bis 0.1.0 fragte der Miner nur nach der Adresse und rechnete dann solo --
 * mit einem einzelnen Rechner findet man solo aber praktisch nie einen Block.
 * Ab 0.2.0 waehlt der Nutzer selbst: einen der offenen Pools aus dem
 * oeffentlichen Pool-Verzeichnis oder Solo (Entscheidung Dabitlex 28.10.2026:
 * "Der Nutzer soll waehlen koennen"). Es gibt keine stille Vorgabe, solange
 * jemand am Terminal sitzt.
 *
 * Ohne Terminal (Dienst, HiveOS, Pipe) wird nicht gefragt; dort bleibt es
 * bei dem, was uebergeben wurde, sonst solo wie bisher.
 */
import { frage } from './frage.mjs';
import { liesRumpf, ANFRAGE_MS } from './pruefung.mjs';
import { zahl } from './anzeige.mjs';

/**
 * Das oeffentliche Pool-Verzeichnis -- dasselbe, das Website und Mini App
 * zeigen. Nur lesend (GET).
 */
export const POOL_VERZEICHNIS = 'https://yskar.vercel.app/api/v2/pools';

export const ADRESSE = /^ysr1[02-9ac-hj-np-z]{38,}$/;

/**
 * Offene Pools holen. Scheitert das, kommt eine leere Liste zurueck -- die
 * Auswahl bietet dann den Hauptpool und Solo an, statt abzubrechen.
 */
export async function ladePools(url = POOL_VERZEICHNIS) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(ANFRAGE_MS), redirect: 'error' });
    if (!res.ok) return [];
    const d = await liesRumpf(res);
    if (!Array.isArray(d.pools)) return [];
    return d.pools
      .filter(p => p && typeof p.host === 'string' && typeof p.name === 'string')
      .filter(p => p.status === undefined || p.status === 'offen' || p.status === 'open')
      // Nur Hostnamen mit optionalem Port -- nichts, was als Pfad oder
      // Befehl durchgeht. Der Eintrag kommt aus dem Netz.
      .filter(p => /^(https?:\/\/)?[a-z0-9.-]+(:\d{1,5})?\/?$/i.test(p.host))
      .map(p => ({
        name: p.name.slice(0, 40),
        api: (/^https?:\/\//i.test(p.host) ? p.host : `https://${p.host}`).replace(/\/+$/, ''),
        feeBps: Number.isFinite(Number(p.feeBps)) ? Number(p.feeBps) : null,
        belegt: Number.isFinite(Number(p.belegt)) ? Number(p.belegt) : null,
        plaetze: Number.isFinite(Number(p.plaetze)) ? Number(p.plaetze) : null,
      }))
      .slice(0, 9);
  } catch {
    return [];
  }
}

/** Nach der Adresse fragen. null = abgebrochen oder dreimal falsch. */
export async function frageAdresse(f, nummer) {
  const { grau, gruen, rot, fett, blau } = f;
  console.log(` ${blau(nummer)}  ${fett('Payout address')}`);
  console.log('    Mined YSR are paid to this address. The miner never asks for a private key');
  console.log('    or your 12 words.');
  console.log(grau('    Find it in your YSKAR wallet under Receive (YSKAR app, Mini App @YSKAR_bot or Node Core).\n'));

  for (let versuch = 0; versuch < 3; versuch++) {
    const roh = await frage(`    Address ${blau('›')} `);
    if (roh === null) return null;
    const eingabe = roh.replace(/\s+/g, '');
    if (ADRESSE.test(eingabe)) {
      console.log(gruen('    ✓ Valid YSKAR address\n'));
      return eingabe;
    }
    console.log(rot('    That does not look like a YSKAR address.'));
    console.log(grau('    It starts with ysr1 and is about 42 characters long.\n'));
  }
  return null;
}

/**
 * Nach der Mining-Art fragen.
 *
 * Mit eigenem --api gibt es keine Liste: Der Nutzer hat den Knoten schon
 * gewaehlt, offen ist nur Pool oder Solo AUF diesem Knoten.
 *
 * Rueckgabe { mode, api, poolName } oder null bei Abbruch.
 */
export async function frageModus(f, nummer, { api, apiGesetzt, vorgabeApi }) {
  const { grau, gruen, fett, blau } = f;
  console.log(` ${blau(nummer)}  ${fett('Mining mode')}`);
  console.log('    One computer alone rarely finds a whole block. In a pool you receive a share of');
  console.log('    every block the pool finds, paid directly in that block.\n');

  let wahl;
  if (apiGesetzt) {
    wahl = [
      { mode: 'pool', api, zeile: `Pool  on ${api}` },
      { mode: 'solo', api, zeile: `Solo  on ${api}  ${grau('— the full reward, but only for blocks you find yourself')}` },
    ];
  } else {
    let pools = await ladePools();
    if (!pools.length) {
      console.log(grau('    The pool list could not be loaded — showing the main pool only.\n'));
      pools = [{ name: 'YSKAR MAIN', api: vorgabeApi, feeBps: null, belegt: null, plaetze: null }];
    }
    // Der Hauptpool zuerst und als Empfehlung -- unabhaengig von der
    // Reihenfolge des Verzeichnisses.
    pools.sort((a, b) => (b.api === vorgabeApi) - (a.api === vorgabeApi));
    const breite = Math.max(...pools.map(p => p.name.length), 10);
    wahl = pools.map(p => ({
      mode: 'pool', api: p.api, poolName: p.name,
      zeile: `Pool  ${p.name.padEnd(breite)}  ${
        p.feeBps === null ? '          ' : `fee ${(p.feeBps / 100).toFixed(2)}%`.padEnd(10)}  ${
        p.belegt === null || p.plaetze === null ? '' : `${String(zahl(p.belegt)).padStart(3)}/${zahl(p.plaetze)} miners`}${
        p.api === vorgabeApi ? `   ${gruen('recommended')}` : ''}`,
    }));
    wahl.push({
      mode: 'solo', api: vorgabeApi,
      zeile: `Solo  ${grau('the full block reward, but only for blocks you find yourself')}`,
    });
  }

  wahl.forEach((w, i) => console.log(`      ${blau(String(i + 1))}  ${w.zeile}`));
  console.log('');

  for (let versuch = 0; versuch < 3; versuch++) {
    const roh = await frage(`    Choice ${grau('[1]')} ${blau('›')} `, { vorgabe: '1' });
    if (roh === null) return null;
    const n = Number(roh);
    if (Number.isInteger(n) && n >= 1 && n <= wahl.length) {
      const w = wahl[n - 1];
      console.log('');
      return { mode: w.mode, api: w.api, poolName: w.poolName ?? null };
    }
    console.log(grau(`    Please type a number from 1 to ${wahl.length}.`));
  }
  return null;
}
