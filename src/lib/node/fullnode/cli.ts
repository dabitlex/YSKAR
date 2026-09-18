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
import { TxPool } from './TxPool.ts';
import { MiningCoordinator } from './MiningCoordinator.ts';
import { MiningServer } from './MiningServer.ts';
import { MAINNET, REGTEST, type ConsensusParams } from '../../core/networks.ts';
import { PeerManager } from '../p2p/PeerManager.ts';
import { SyncManager } from '../p2p/SyncManager.ts';

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
  bind: string; port: number; regtest: boolean;
  /** Lauschport fuer P2P. 0 = nur ausgehend. */
  p2pPort: number;
  /** Feste Startadressen, Form host:port. */
  seeds: string[];
  /** P2P ganz aus. */
  keinP2P: boolean;
  /** Wohin gefundene Bloecke gehen. Leer heisst: nirgends. */
  upstream?: string;
}

function argumente(argv: string[]): Optionen {
  const o: Optionen = {
    api: 'https://yskar.vercel.app', daten: './knoten',
    befehl: argv[0] && !argv[0].startsWith('-') ? argv[0] : 'sync',
    einmal: false, intervall: 60,
    bind: '127.0.0.1', port: 8645, regtest: false,
    p2pPort: 8646, seeds: [], keinP2P: false,
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
      case '--bind': o.bind = nimm(); break;
      case '--port': o.port = Number(nimm()); break;
      case '--regtest': o.regtest = true; break;
      case '--upstream': o.upstream = nimm().replace(/\/+$/, ''); break;
      case '--no-upstream': o.upstream = ''; break;
      case '--p2p-port': o.p2pPort = Number(nimm()); break;
      case '--seed': o.seeds.push(nimm()); break;
      case '--no-p2p': o.keinP2P = true; break;
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
  mine      Mining-Schnittstelle öffnen, damit Miner hier arbeiten können
  status    Stand des lokalen Knotens
  chain     die letzten Blöcke der aktiven Kette
  tips      alle bekannten Zweigenden

Optionen
  -d, --data <ordner>   Ablage (Vorgabe: ./knoten)
      --api <url>       Quelle (Vorgabe: https://yskar.vercel.app)
      --interval <sek>  Abstand zwischen Abfragen (Vorgabe: 60)
      --once            einmal aufholen und beenden
      --bind <adresse>  für "mine" (Vorgabe: 127.0.0.1)
      --port <nummer>   für "mine" (Vorgabe: 8645)
      --regtest         eigenes Testnetz statt der echten Kette
      --upstream <url>  wohin gefundene Blöcke gehen (Vorgabe: --api)
      --no-upstream     gefundene Blöcke nur lokal behalten
      --p2p-port <nr>   Lauschport für andere Knoten (Vorgabe: 8646)
      --seed host:port  ein bekannter Knoten, mehrfach angebbar
      --no-p2p          ohne Knotennetz laufen

Mit anderen Knoten verbinden
  yskar-node mine --data ./knoten --seed 203.0.113.5:8646

  Jeder Block, der über das Netz kommt, wird vollständig selbst geprüft --
  Header, Proof of Work, Signaturen, Guthaben, Zustandswurzel. Ein Peer
  liefert Daten, sonst nichts.

Mining gegen den eigenen Knoten
  yskar-node mine --regtest --data ./testnetz
  yskar-miner --address ysr1… --api http://127.0.0.1:8645

  Der bestehende Miner läuft unverändert -- der Knoten spricht dasselbe
  Protokoll wie der Server. Nur die Adresse ist eine andere.
`;

// ----------------------------------------------------------------- Ausgabe

/**
 * Meldung ausgeben, ohne die laufende Statuszeile zu zerreissen.
 *
 * Die Statuszeile wird mit \r an Ort und Stelle erneuert. Wer daneben
 * einfach console.log benutzt, haengt seinen Text an ihren Rest an -- so
 * entstand "Mempool 0[06:20:58] 1 Bloecke geprueft". Erst loeschen, dann
 * drucken.
 */
function melde(text: string): void {
  if (process.stdout.isTTY) process.stdout.write('\r\x1b[2K');
  console.log(text);
}

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
        melde('');
        melde(rot(fett('BLOCK ABGELEHNT')));
        melde(rot(`  Höhe ${b.height}: ${r.grund}`));
        if (r.detail) melde(rot(`  ${r.detail}`));
        melde('');
        melde(grau('  Der Server liefert etwas, das der Kette widerspricht.'));
        melde(grau(`  Lokal geprüft bis Höhe ${chain.height()}.`));
        return false;
      }
      if (r.stored) {
        geprueft++;
        if (r.reorg) {
          melde(`${grau('[' + uhr() + ']')} ${gelb('Reorg')} ` +
            `auf Höhe ${r.height}, neuer Tip ${toHex(r.tip).slice(0, 16)}…`);
        }
      }
    }
  }

  if (geprueft > 0) {
    const tip = chain.tip()!;
    melde(
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

/**
 * Mining-Schnittstelle oeffnen.
 *
 * Der Knoten baut die Jobs selbst und nimmt gefundene Bloecke selbst an --
 * ohne Server. Der bestehende Miner spricht dasselbe Protokoll und laeuft
 * unveraendert dagegen.
 */
async function mine(opt: Optionen, store: ChainStore, chain: ChainManager): Promise<void> {
  const params: ConsensusParams = opt.regtest ? REGTEST : MAINNET;
  const pool = new TxPool();
  const koordinator = new MiningCoordinator(chain, store, pool, params);
  const server = new MiningServer({ chain, store, pool, mining: koordinator }, {
    host: opt.bind, port: opt.port, params,
  });

  // Ohne Weitergabe laege ein gefundener Block nur hier und wuerde beim
  // naechsten Block der anderen Seite verdraengt. Im Testnetz gibt es
  // niemanden, dem man ihn geben koennte.
  const nachOben = opt.upstream !== undefined
    ? opt.upstream
    : (opt.regtest ? '' : opt.api);
  if (nachOben) server.upstream = nachOben;

  server.onUpstream = e => {
    melde(e.ok
      ? grau(`           weitergegeben, dort als Höhe ${nf(e.hoehe ?? 0)} angenommen`)
      : gelb(`           nicht weitergegeben: ${e.grund}`));
  };

  server.onFehler = (wo, e) => {
    melde(rot(`[${uhr()}] Fehler bei ${wo}: ${e.message}`));
    if (e.stack) melde(grau(e.stack.split('\n').slice(1, 4).join('\n')));
  };

  server.onBlock = (h, hash, adresse) => {
    melde('');
    melde(gruen(fett(`[${uhr()}] BLOCK GEFUNDEN  #${nf(h)}`)));
    melde(grau(`           ${hash}`));
    melde(grau(`           an ${adresse.slice(0, 16)}…`));
  };

  /*
    Das Knotennetz.

    Es laeuft neben der Mining-Schnittstelle und unabhaengig von ihr: Ein
    Knoten ohne Miner ist ein vollwertiger Teilnehmer, und ein Miner ohne
    Peers arbeitet weiter. Faellt das Netz aus, prueft der Knoten seine
    Kette trotzdem.
  */
  let netz: PeerManager | null = null;
  let abgleich: SyncManager | null = null;

  if (!opt.keinP2P) {
    const seeds = opt.seeds.map(s => {
      const i = s.lastIndexOf(':');
      if (i < 1) throw new Error(`Seed "${s}" muss host:port sein`);
      return { host: s.slice(0, i), port: Number(s.slice(i + 1)) };
    });

    netz = new PeerManager({
      params,
      agent: `yskar-node/${VERSION}`,
      listenPort: opt.p2pPort,
      seeds,
      kette: () => {
        const t = chain.tip();
        return { height: t?.height ?? -1, chainWork: t?.chainWork ?? 0n };
      },
      onReady: p => {
        melde(`${grau('[' + uhr() + ']')} ${grau('Peer')} ${p.host} ` +
          `${grau('· Höhe')} ${nf(p.fremdeHoehe())}`);
        abgleich?.aufPeer(p);
      },
      onMessage: (p, f) => abgleich?.aufNachricht(p, f),
      onClose: (p, g) => {
        if (p.ready) melde(grau(`[${uhr()}] Peer ${p.host} weg: ${g}`));
      },
      onLog: t => melde(grau(`[${uhr()}] ${t}`)),
    });

    abgleich = new SyncManager({
      chain, store, peers: netz, params,
      onBlock: (h, hash, von) => {
        koordinator.invalidate();
        melde(`${grau('[' + uhr() + ']')} ${gruen('Block')} ${grau('#')}${nf(h)} ` +
          `${grau('von')} ${von} ${grau(hash.slice(0, 16) + '…')}`);
      },
      onLog: t => melde(grau(`[${uhr()}] ${t}`)),
    });

    try {
      await netz.start();
      abgleich.start();
    } catch (e) {
      melde(gelb(`  Knotennetz konnte nicht starten: ${(e as Error).message}`));
      netz = null; abgleich = null;
    }
  }

  // Selbst gefundene Bloecke ins Netz geben.
  const vorherOnBlock = server.onBlock;
  server.onBlock = (h, hash, adresse) => {
    vorherOnBlock?.(h, hash, adresse);
    if (abgleich) {
      const n = abgleich.kuendigeAn(fromHex(hash));
      if (n > 0) melde(grau(`           an ${n} Peer${n > 1 ? 's' : ''} gemeldet`));
    }
  };

  await server.listen(opt.bind, opt.port);

  console.log(fett(`\nYSKAR Full Node ${VERSION}  ${grau('Mining')}`));
  console.log(grau('─'.repeat(56)));
  console.log(`  Netz     ${params.network}`);
  console.log(`  Ablage   ${opt.daten}/chain.db`);
  console.log(`  Kette    ${chain.height() < 0 ? '—' : 'Höhe ' + nf(chain.height())}`);
  console.log(`  Lauscht  http://${opt.bind}:${opt.port}`);
  console.log(`  Blöcke   ${nachOben ? '→ ' + nachOben : 'bleiben lokal'}`);
  console.log(`  Sync     ${nachOben ? 'alle 30 s von ' + opt.api : 'aus'}`);
  console.log(`  Knoten   ${netz
    ? (opt.p2pPort > 0 ? `lauscht auf ${opt.p2pPort}` : 'nur ausgehend') +
      (opt.seeds.length ? `, ${opt.seeds.length} Seed${opt.seeds.length > 1 ? 's' : ''}` : '')
    : 'aus'}`);
  console.log(grau('─'.repeat(56)));

  /*
    Einmal aufholen, bevor der erste Miner einen Job bekommt.

    Ohne das baut der Knoten die ersten Jobs auf dem Stand vom letzten
    Beenden -- und jeder Fund waere "stale", bis der Takt nach 30 Sekunden
    das erste Mal greift. Bei einer halben Stunde je Block waere das
    verlorene Arbeit.
  */
  if (nachOben) {
    melde(grau('  Hole auf…'));
    try {
      await sync({ ...opt, einmal: true }, store, chain);
      const tip = chain.tip();
      melde(grau(`  Stand: Höhe ${nf(chain.height())}`) +
        (tip ? grau(`, Difficulty ${nf(tip.difficulty)}`) : ''));
    } catch (e) {
      melde(gelb(`  Nicht erreichbar: ${(e as Error).message}`));
      melde(gelb('  Es wird auf dem lokalen Stand weitergebaut.'));
    }
  }

  console.log(grau('\n  Miner verbinden mit:'));
  console.log(`    yskar-miner --address ysr1… --api http://${opt.bind}:${opt.port}\n`);
  if (opt.bind !== '127.0.0.1') {
    console.log(gelb('  Diese Schnittstelle ist nicht nur lokal erreichbar.'));
    console.log(gelb('  Sie nimmt Arbeit entgegen und baut Blöcke -- nicht ' +
                     'ungeschützt ins Netz.\n'));
  }

  let laeuft = true;
  const aufhoeren = async () => {
    if (!laeuft) return;
    laeuft = false;
    clearInterval(syncTakt);
    clearInterval(takt);
    abgleich?.stop();
    await netz?.stop();
    await server.close();
    console.log('');
    status(store, chain);
    store.close();
    process.exit(0);
  };
  process.on('SIGINT', aufhoeren);
  process.on('SIGTERM', aufhoeren);

  /*
    Waehrend des Minens weiter synchronisieren.

    Ohne das steht der Knoten auf der Hoehe, die er beim Start hatte, und
    baut dort weiter -- waehrend die andere Seite laengst weiter ist. Jeder
    gefundene Block kaeme als "stale" zurueck, und die ganze Rechenarbeit
    waere verloren.

    Nach jedem neuen Block muessen die offenen Jobs verworfen werden: Sie
    zeigen auf einen Vorgaenger, den es als Kettenkopf nicht mehr gibt.
  */
  let syncLaeuft = false;
  const syncTakt = setInterval(async () => {
    if (syncLaeuft || !nachOben) return;
    syncLaeuft = true;
    const vorher = chain.height();
    try {
      await sync({ ...opt, einmal: true }, store, chain);
      if (chain.height() !== vorher) {
        koordinator.invalidate();
        const tip = chain.tip();
        melde(`${grau('[' + uhr() + ']')} ${grau('Kette weiter:')} ` +
          `Höhe ${nf(chain.height())}${grau(', Jobs neu gebaut')}`);
      }
    } catch (e) {
      melde(`${grau('[' + uhr() + ']')} ${gelb('!')} Sync: ${(e as Error).message}`);
    } finally { syncLaeuft = false; }
  }, 30_000);
  syncTakt.unref();

  const takt = setInterval(() => {
    if (!process.stdout.isTTY) return;
    const tip = chain.tip();
    // Gezeigt wird, WORAN GEARBEITET WIRD -- also der naechste Block, nicht
    // der letzte fertige. Beide haben verschiedene Difficulties, und die
    // Verwechslung ist naheliegend: Block 839 kann 63.980 haben, waehrend
    // an 840 mit 65.736 gearbeitet wird.
    const arbeit = koordinator.aktuelleArbeit();
    const naechste = arbeit ? arbeit.height : (tip ? tip.height + 1 : 0);
    process.stdout.write(`\r\x1b[2K${grau('[' + uhr() + ']')} ` +
      `${grau('Kette')} ${tip ? nf(tip.height) : '—'} ` +
      `${grau('· baut an')} ${nf(naechste)} ` +
      `${grau('· Diff')} ${arbeit ? nf(arbeit.difficulty) : grau('—')} ` +
      `${grau('·')} ${server.aktiveSessions()} Miner ` +
      `${grau('·')} Mempool ${pool.size()}` +
      (netz ? `${grau(' · ')}${netz.bereite().length} Peers` : ''));
  }, 1000);
  takt.unref();

  await new Promise(() => { /* bis Strg+C */ });
}

// --------------------------------------------------------------------- Lauf

async function main(): Promise<void> {
  const opt = argumente(process.argv.slice(2));
  if (opt.help) { console.log(HILFE); return; }

  const params: ConsensusParams = opt.regtest ? REGTEST : MAINNET;
  const store = new ChainStore(`${opt.daten}/chain.db`);
  if (opt.regtest) {
    // Eigene Kennung: Bloecke des Testnetzes sind im echten Netz nicht
    // einmal lesbar, und umgekehrt. Die Ablage haelt das fest.
    store.setMeta('network', params.network);
    store.setMeta('chain_id', toHex(params.chainId));
  }
  let chain: ChainManager;
  try {
    chain = new ChainManager(store, params);
  } catch (e) {
    console.error(rot(`\nDie lokale Ablage ist nicht verwendbar:`));
    console.error(rot(`  ${(e as Error).message}\n`));
    console.error(grau(`  Ordner ${opt.daten} entfernen und neu synchronisieren.\n`));
    process.exit(1);
  }

  if (opt.befehl === 'mine') { await mine(opt, store, chain); return; }
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
