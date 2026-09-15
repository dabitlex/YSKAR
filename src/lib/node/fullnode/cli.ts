#!/usr/bin/env node
/**
 * YSKAR Full Node — Kommandozeile.
 *
 * Holt die Kette und prueft jeden Block SELBST: Header, Proof of Work,
 * Merkle-Wurzel, Signaturen, Guthaben, Zustandswurzel, Difficulty-Regel.
 * Gespeichert wird lokal in SQLite, mit Block-Index und Gabelungen.
 *
 * Unterschied zum Beobachter: Der Beobachter kennt nur eine Kette und legt
 * Bloecke nach Hoehe ab. Dieser Knoten haelt mehrere Bloecke je Hoehe,
 * rechnet kumulierte Arbeit und kann auf einen anderen Zweig umschalten.
 *
 * Was er NOCH NICHT kann: Bloecke annehmen (P2P), selbst minen, Pool. Die
 * Bloecke kommen bis dahin ueber die oeffentliche Leseschnittstelle --
 * geprueft werden sie trotzdem vollstaendig und ohne dem Server zu glauben.
 */
import { stateRoot, totalSupply } from '../../core/state.ts';
import { toHex, fromHex } from '../../core/codec.ts';
import { NETWORK } from '../../core/params.ts';
import { ChainStore } from './ChainStore.ts';
import { ChainManager } from './ChainManager.ts';

const VERSION = '0.1.0';

/*
  Node warnt bei jedem Start, dass node:sqlite experimentell sei. Fuer den
  Nutzer ist das Rauschen -- er hat die Entscheidung nicht getroffen.

  Gefiltert wird NUR diese eine Warnung. Alle Warnungen abzuschalten wuerde
  auch die verstecken, die etwas bedeuten.
*/
// removeAllListeners zuerst: Node druckt Warnungen ueber einen eigenen
// Empfaenger, der bestehen bleibt, wenn man nur einen weiteren hinzufuegt.
// Ohne diese Zeile erscheint die Warnung trotz Filter -- so gesehen und
// korrigiert.
process.removeAllListeners('warning');
process.on('warning', w => {
  if (w.name === 'ExperimentalWarning' && /SQLite/i.test(w.message)) return;
  console.warn(`${w.name}: ${w.message}`);
});

interface Optionen {
  api: string; daten: string; befehl: string;
  einmal: boolean; intervall: number; help?: boolean;
}

function argumente(argv: string[]): Optionen {
  const o: Optionen = {
    api: 'https://yskar.vercel.app', daten: './knoten',
    befehl: argv[0] && !argv[0].startsWith('-') ? argv[0] : 'sync',
    einmal: false, intervall: 60,
  };
  for (let i = 0; i < argv.length; i++) {
    const [k, direkt] = argv[i].split('=');
    const wert = direkt ?? argv[i + 1];
    const nimm = () => { if (direkt === undefined) i++; return wert; };
    switch (k) {
      case '--api': o.api = nimm().replace(/\/+$/, ''); break;
      case '--data': case '-d': o.daten = nimm(); break;
      case '--interval': o.intervall = Number(nimm()); break;
      case '--once': o.einmal = true; break;
      case '--help': case '-h': o.help = true; break;
    }
  }
  return o;
}

const HILFE = `
YSKAR Full Node ${VERSION}

  yskar-node <befehl> [Optionen]

Befehle
  sync      Kette holen und jeden Block selbst prüfen (Vorgabe)
  status    Stand des lokalen Knotens
  chain     die letzten Blöcke der aktiven Kette
  tips      alle bekannten Zweigenden

Optionen
  -d, --data <ordner>   Ablage (Vorgabe: ./knoten)
      --api <url>       Quelle (Vorgabe: https://yskar.vercel.app)
      --interval <sek>  Abstand zwischen Abfragen (Vorgabe: 60)
      --once            einmal aufholen und beenden
`;

// ----------------------------------------------------------------- Ausgabe

const FARBE = process.stdout.isTTY && !process.env.NO_COLOR;
const f = (c: string, s: string) => FARBE ? `\x1b[${c}m${s}\x1b[0m` : s;
const gruen = (s: string) => f('32', s), rot = (s: string) => f('31', s);
const gelb = (s: string) => f('33', s), grau = (s: string) => f('90', s);
const fett = (s: string) => f('1', s);
const uhr = () => new Date().toTimeString().slice(0, 8);
const nf = (n: number | bigint) => Number(n).toLocaleString('de-DE');

// -------------------------------------------------------------------- Netz

async function hole(api: string, pfad: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${api}/api/v2${pfad}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(body.detail ?? body.error ?? `HTTP ${res.status}`));
  return body as Record<string, unknown>;
}

// ------------------------------------------------------------------ Befehle

function status(store: ChainStore, chain: ChainManager): void {
  const tip = chain.tip();
  console.log(fett(`\nYSKAR Full Node ${VERSION}`));
  console.log(grau('─'.repeat(56)));
  console.log(`  Netz            ${NETWORK}`);
  console.log(`  Höhe            ${tip ? nf(tip.height) : '—'}`);
  console.log(`  Bester Block    ${tip ? toHex(tip.hash) : '—'}`);
  console.log(`  Chain Work      ${tip ? nf(tip.chainWork) : '—'}`);
  console.log(`  Difficulty      ${tip ? nf(tip.difficulty) : '—'}`);
  console.log(`  Blöcke gespeichert ${nf(store.count())}`);
  console.log(`  Zweigenden      ${store.tips().length}`);
  if (tip) {
    console.log(`  Zustandswurzel  ${toHex(stateRoot(chain.state()))}`);
    console.log(`  Im Umlauf       ${nf(Number(totalSupply(chain.state())) / 1e8)} YSR`);
    const alter = Math.round(Date.now() / 1000 - Number(tip.blockTime));
    console.log(`  Letzter Block   vor ${alter < 90 ? alter + ' s' : Math.round(alter / 60) + ' min'}`);
  }
  console.log(grau('─'.repeat(56)) + '\n');
}

function chainListe(store: ChainStore): void {
  const tip = store.mainTip();
  if (!tip) { console.log('Noch keine Blöcke.'); return; }
  console.log('');
  for (let h = Math.max(0, tip.height - 14); h <= tip.height; h++) {
    const b = store.mainAt(h);
    if (!b) continue;
    const andere = store.atHeight(h).length - 1;
    console.log(
      `  ${grau('#' + String(h).padStart(6))}  ${toHex(b.hash).slice(0, 32)}…  ` +
      `${grau('Diff')} ${String(nf(b.difficulty)).padStart(9)}` +
      (andere > 0 ? gelb(`  +${andere} Zweig${andere > 1 ? 'e' : ''}`) : ''));
  }
  console.log('');
}

function tipsListe(store: ChainStore): void {
  const alle = store.tips();
  console.log('');
  if (alle.length === 0) { console.log('  Keine.'); return; }
  for (const t of alle) {
    const aktiv = t.mainChain;
    console.log(
      `  ${aktiv ? gruen('aktiv ') : grau('Zweig ')} ` +
      `${grau('#' + String(t.height).padStart(6))}  ${toHex(t.hash).slice(0, 32)}…  ` +
      `${grau('Arbeit')} ${nf(t.chainWork)}`);
  }
  console.log('');
  if (alle.length > 1) {
    console.log(grau('  Mehrere Zweigenden heißt: Es gab eine Gabelung. Aktiv ist der\n' +
                     '  mit der meisten kumulierten Arbeit.\n'));
  }
}

/**
 * Kette aufholen.
 *
 * Stapelweise, weil ein Aufruf je Block bei zehntausenden Bloecken
 * unzumutbar waere. Jeder Block wird einzeln geprueft -- der Stapel ist
 * nur die Transportform.
 */
async function sync(opt: Optionen, store: ChainStore, chain: ChainManager): Promise<boolean> {
  let geprueft = 0;
  const t0 = Date.now();

  for (;;) {
    const von = chain.height() + 1;
    const antwort = await hole(opt.api, `/sync?from=${von}&count=200`);
    const bloecke = (antwort.blocks ?? []) as { height: number; hash: string; body: string }[];
    if (bloecke.length === 0) break;

    for (const b of bloecke) {
      const r = chain.accept(fromHex(b.body));
      if (!r.ok) {
        // Der Zweck dieses Programms. Ab hier ist jede weitere Aussage wertlos.
        console.log('');
        console.log(rot(fett('BLOCK ABGELEHNT')));
        console.log(rot(`  Höhe ${b.height}: ${r.grund}`));
        if (r.detail) console.log(rot(`  ${r.detail}`));
        console.log('');
        console.log(grau('  Der Server liefert etwas, das der Kette widerspricht.'));
        console.log(grau(`  Lokal geprüft bis Höhe ${chain.height()}.`));
        return false;
      }
      if (r.stored) {
        geprueft++;
        if (r.reorg) {
          console.log(`${grau('[' + uhr() + ']')} ${gelb('Reorg')} ` +
            `auf Höhe ${r.height}, neuer Tip ${toHex(r.tip).slice(0, 16)}…`);
        }
      }
    }
  }

  if (geprueft > 0) {
    const tip = chain.tip()!;
    console.log(
      `${grau('[' + uhr() + ']')} ${gruen('✓')} ${geprueft} Blöcke geprüft ` +
      `${grau('·')} Höhe ${nf(tip.height)} ` +
      `${grau('·')} Arbeit ${nf(tip.chainWork)} ` +
      `${grau('·')} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } else if (process.stdout.isTTY) {
    process.stdout.write(`\r\x1b[2K${grau('[' + uhr() + ']')} ` +
      `auf Höhe ${nf(chain.height())}, warte…`);
  }
  return true;
}

// --------------------------------------------------------------------- Lauf

async function main(): Promise<void> {
  const opt = argumente(process.argv.slice(2));
  if (opt.help) { console.log(HILFE); return; }

  const store = new ChainStore(`${opt.daten}/chain.db`);
  let chain: ChainManager;
  try {
    chain = new ChainManager(store);
  } catch (e) {
    console.error(rot(`\nDie lokale Ablage ist nicht verwendbar:`));
    console.error(rot(`  ${(e as Error).message}\n`));
    console.error(grau(`  Ordner ${opt.daten} entfernen und neu synchronisieren.\n`));
    process.exit(1);
  }

  if (opt.befehl === 'status') { status(store, chain); store.close(); return; }
  if (opt.befehl === 'chain') { chainListe(store); store.close(); return; }
  if (opt.befehl === 'tips') { tipsListe(store); store.close(); return; }
  if (opt.befehl !== 'sync') {
    console.error(rot(`Unbekannter Befehl: ${opt.befehl}`));
    console.log(HILFE); process.exit(1);
  }

  console.log(fett(`\nYSKAR Full Node ${VERSION}`));
  console.log(grau('─'.repeat(56)));
  console.log(`  Netz     ${NETWORK}`);
  console.log(`  Quelle   ${opt.api}`);
  console.log(`  Ablage   ${opt.daten}/chain.db`);
  console.log(`  Stand    Höhe ${chain.height() < 0 ? '—' : nf(chain.height())}`);
  console.log(grau('─'.repeat(56)) + '\n');

  let laeuft = true;
  const aufhoeren = () => { laeuft = false; };
  process.on('SIGINT', aufhoeren);
  process.on('SIGTERM', aufhoeren);

  for (;;) {
    try {
      const ok = await sync(opt, store, chain);
      if (!ok) { store.close(); process.exit(2); }
    } catch (e) {
      console.log(`${grau('[' + uhr() + ']')} ${gelb('!')} ${(e as Error).message}`);
    }
    if (opt.einmal || !laeuft) break;
    await new Promise(r => setTimeout(r, opt.intervall * 1000));
  }

  console.log('');
  status(store, chain);
  store.close();
}

main().catch(e => { console.error(rot(`\n${e.stack ?? e.message}`)); process.exit(1); });
