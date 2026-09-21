/*
 * YSKAR Node Core — eigenständige Test-GUI.
 *
 * WICHTIG:
 * Diese Datei verändert keine bestehende YSKAR-Datei.
 * Sie verwendet ausschließlich die vorhandenen Full-Node-Klassen aus src/.
 * Die GUI läuft als lokales Dashboard und wird von einer nativen Desktop-Hülle
 * (Electron) in einem eigenen Fenster dargestellt. Der Full Node läuft im selben Prozess.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir, platform } from 'node:os';

import { ChainStore } from '../../src/lib/node/fullnode/ChainStore.ts';
import { ChainManager } from '../../src/lib/node/fullnode/ChainManager.ts';
import { TxPool } from '../../src/lib/node/fullnode/TxPool.ts';
import { MiningCoordinator } from '../../src/lib/node/fullnode/MiningCoordinator.ts';
import { MiningServer } from '../../src/lib/node/fullnode/MiningServer.ts';
import { PeerManager } from '../../src/lib/node/p2p/PeerManager.ts';
import { SyncManager } from '../../src/lib/node/p2p/SyncManager.ts';
import { MAINNET } from '../../src/lib/core/networks.ts';
import { NETWORK } from '../../src/lib/core/params.ts';
import { stateRoot, totalSupply } from '../../src/lib/core/state.ts';
import { toHex } from '../../src/lib/core/codec.ts';

const VERSION = '0.3.1';
const APP_NAME = 'YSKAR Node Core';
const GUI_PORT = 8650;
const DEFAULT_NODE_PORT = 8645;
const DEFAULT_P2P_PORT = 8646;
const DEFAULT_SEED = 'yskar-main.dynv6.net:8646';

function defaultDataDir(): string {
  if (process.platform === 'win32') {
    return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'YSKAR', 'Node');
  }
  return join(homedir(), '.yskar', 'node');
}

function json(res: ServerResponse, value: unknown, status = 200): void {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function html(res: ServerResponse, body: string): void {
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolveBody, reject) => {
    let raw = '';
    req.on('data', c => {
      raw += c;
      if (raw.length > 65536) {
        req.destroy();
        reject(new Error('Anfrage zu groß'));
      }
    });
    req.on('end', () => {
      try { resolveBody(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('Ungültiges JSON')); }
    });
    req.on('error', reject);
  });
}

export class NodeCoreApp {
  private store: ChainStore | null = null;
  private chain: ChainManager | null = null;
  private pool: TxPool | null = null;
  private mining: MiningCoordinator | null = null;
  private miningServer: MiningServer | null = null;
  private peers: PeerManager | null = null;
  private sync: SyncManager | null = null;
  private guiServer = createServer((req, res) => this.handleGui(req, res));
  private configured = false;
  private running = false;
  private startedAt = 0;
  private logs: string[] = [];
  private configPath: string;
  private config: {
    dataDir: string;
    nodePort: number;
    p2pPort: number;
    seed: string;
  };

  constructor() {
    const base = process.platform === 'win32'
      ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'YSKAR', 'Node Core')
      : join(homedir(), '.yskar', 'node-core');
    mkdirSync(base, { recursive: true });
    this.configPath = join(base, 'config.json');
    this.config = {
      dataDir: defaultDataDir(),
      nodePort: DEFAULT_NODE_PORT,
      p2pPort: DEFAULT_P2P_PORT,
      seed: DEFAULT_SEED,
    };
    if (existsSync(this.configPath)) {
      try {
        const saved = JSON.parse(readFileSync(this.configPath, 'utf8'));
        this.config = { ...this.config, ...saved };
        this.config.dataDir = String(this.config.dataDir || defaultDataDir());
        this.config.nodePort = Number(this.config.nodePort || DEFAULT_NODE_PORT);
        this.config.p2pPort = Number(this.config.p2pPort || DEFAULT_P2P_PORT);
        this.config.seed = String(this.config.seed || '');
        this.configured = true;
      } catch {
        this.log('Konfiguration konnte nicht gelesen werden. Standardwerte werden verwendet.');
      }
    }
  }

  private log(text: string): void {
    const line = `[${new Date().toLocaleTimeString('de-DE')}] ${text}`;
    this.logs.push(line);
    if (this.logs.length > 200) this.logs.shift();
    console.log(line);
  }

  async startGui(): Promise<void> {
    await new Promise<void>((resolveGui, reject) => {
      this.guiServer.once('error', reject);
      this.guiServer.listen(GUI_PORT, '127.0.0.1', resolveGui);
    });
    this.log(`GUI-Server gestartet · 127.0.0.1:${GUI_PORT}`);
  }

  async shutdown(): Promise<void> {
    await this.stopNode();
    if (this.guiServer.listening) {
      await new Promise<void>(resolveGui => this.guiServer.close(() => resolveGui()));
    }
  }

  private async configure(body: Record<string, unknown>): Promise<void> {
    const dataDir = String(body.dataDir || this.config.dataDir).trim();
    const nodePort = Number(body.nodePort || this.config.nodePort);
    const p2pPort = Number(body.p2pPort || this.config.p2pPort);
    const seed = String(body.seed ?? this.config.seed).trim();
    if (!dataDir) throw new Error('Datenordner fehlt.');
    if (!Number.isInteger(nodePort) || nodePort < 1024 || nodePort > 65535) throw new Error('Ungültiger Node-Port.');
    if (!Number.isInteger(p2pPort) || p2pPort < 1024 || p2pPort > 65535) throw new Error('Ungültiger P2P-Port.');
    if (nodePort === p2pPort) throw new Error('Node-Port und P2P-Port müssen unterschiedlich sein.');
    this.config = { dataDir, nodePort, p2pPort, seed };
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    this.configured = true;
    this.log(`Konfiguration gespeichert. Daten: ${dataDir}`);
  }

  async startNode(): Promise<void> {
    if (this.running) return;
    if (!this.configured) throw new Error('Assistent noch nicht abgeschlossen.');

    const db = join(resolve(this.config.dataDir), 'chain.db');
    this.store = new ChainStore(db);
    this.chain = new ChainManager(this.store, MAINNET);
    this.pool = new TxPool();
    this.mining = new MiningCoordinator(this.chain, this.store, this.pool, MAINNET);
    this.miningServer = new MiningServer({ chain: this.chain, store: this.store, pool: this.pool, mining: this.mining }, {
      host: '127.0.0.1', port: this.config.nodePort, params: MAINNET,
    });

    this.miningServer.onBlock = (height, hash, address) => {
      this.log(`BLOCK GEFUNDEN #${height} · ${hash.slice(0, 32)}… · ${address.slice(0, 16)}…`);
      this.sync?.kuendigeAn(this.hexToBytes(hash));
    };
    this.miningServer.onFehler = (where, e) => this.log(`Fehler ${where}: ${e.message}`);
    this.miningServer.onUpstream = result => this.log(result.ok ? `Block weitergegeben: Höhe ${result.hoehe}` : `Block nicht weitergegeben: ${result.grund}`);

    this.peers = new PeerManager({
      params: MAINNET,
      agent: `yskar-node-core/${VERSION}`,
      listenPort: this.config.p2pPort,
      seeds: this.config.seed ? [this.parseSeed(this.config.seed)] : [],
      kette: () => {
        const tip = this.chain!.tip();
        return { height: tip?.height ?? -1, chainWork: tip?.chainWork ?? 0n };
      },
      onReady: p => {
        this.log(`Peer verbunden: ${p.host}:${p.port} · Höhe ${p.fremdeHoehe()}`);
        this.sync?.aufPeer(p);
      },
      onMessage: (p, frame) => this.sync?.aufNachricht(p, frame),
      onClose: (p, reason) => this.log(`Peer getrennt: ${p.host}:${p.port} · ${reason}`),
      onLog: text => this.log(text),
    });

    this.sync = new SyncManager({
      chain: this.chain,
      store: this.store,
      peers: this.peers,
      params: MAINNET,
      onBlock: (height, hash, from) => {
        this.mining?.invalidate();
        this.log(`Block #${height} von ${from} · ${hash.slice(0, 32)}…`);
      },
      onLog: text => this.log(text),
    });

    await this.peers.start();
    this.sync.start();
    await this.miningServer.listen('127.0.0.1', this.config.nodePort);
    this.running = true;
    this.startedAt = Date.now();
    this.log(`Full Node gestartet · ${NETWORK} · P2P :${this.config.p2pPort} · API :${this.config.nodePort}`);
  }

  private parseSeed(seed: string): { host: string; port: number } {
    const i = seed.lastIndexOf(':');
    if (i < 1) throw new Error(`Seed "${seed}" muss host:port sein.`);
    const port = Number(seed.slice(i + 1));
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Ungültiger Seed-Port.');
    return { host: seed.slice(0, i), port };
  }

  private hexToBytes(hex: string): Uint8Array {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }

  async stopNode(): Promise<void> {
    if (!this.running) return;
    this.sync?.stop();
    await this.peers?.stop();
    await this.miningServer?.close();
    this.running = false;
    this.log('Full Node gestoppt.');
  }

  private status() {
    const tip = this.chain?.tip() ?? null;
    const peers = this.peers?.info() ?? [];
    const state = this.chain?.state();
    const targetHeight = peers.length ? Math.max(...peers.map(p => p.height)) : null;
    const currentHeight = tip?.height ?? -1;
    const syncing = targetHeight !== null && targetHeight > currentHeight;
    const progress = targetHeight !== null && targetHeight >= 0
      ? Math.max(0, Math.min(100, Math.round(((currentHeight + 1) / Math.max(1, targetHeight + 1)) * 100)))
      : null;
    return {
      version: VERSION,
      network: NETWORK,
      running: this.running,
      configured: this.configured,
      dataDir: this.config.dataDir,
      nodePort: this.config.nodePort,
      p2pPort: this.config.p2pPort,
      seed: this.config.seed,
      height: tip?.height ?? null,
      nextHeight: currentHeight + 1,
      targetHeight,
      syncProgress: progress,
      syncing,
      tipHash: tip ? toHex(tip.hash) : null,
      chainWork: tip?.chainWork?.toString() ?? '0',
      difficulty: tip?.difficulty?.toString() ?? null,
      blocksStored: this.store?.count() ?? 0,
      tips: this.store?.tips().length ?? 0,
      totalSupply: state ? totalSupply(state).toString() : '0',
      stateRoot: tip && state ? toHex(stateRoot(state)) : null,
      peers: peers.map(p => ({ host: p.host, port: p.port, direction: p.richtung, height: p.height, chainWork: p.chainWork.toString() })),
      peerCount: peers.length,
      outboundPeers: this.peers?.zahlAus() ?? 0,
      inboundPeers: this.peers?.zahlEin() ?? 0,
      peerBook: this.peers?.buchGroesse() ?? 0,
      syncPending: this.sync?.fehlendeBloecke() ?? 0,
      syncRequests: this.sync?.offeneAnfragen() ?? 0,
      uptimeSeconds: this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : 0,
    };
  }

  private recentBlocks(limit = 12) {
    const out: { height: number; hash: string; time: string; txCount: number; difficulty: string }[] = [];
    const tip = this.chain?.tip();
    if (!tip || !this.store) return out;
    const max = Math.min(limit, tip.height + 1);
    for (let i = 0; i < max; i++) {
      const b = this.store.mainAt(tip.height - i);
      if (!b) continue;
      out.push({
        height: b.height,
        hash: toHex(b.hash),
        time: new Date(Number(b.blockTime) * 1000).toISOString(),
        txCount: b.txCount,
        difficulty: b.difficulty.toString(),
      });
    }
    return out;
  }

  private async handleGui(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/') return html(res, UI);
      if (req.method === 'GET' && url.pathname === '/wizard/2') return html(res, UI_WIZARD_2);
      if (req.method === 'GET' && url.pathname === '/api/status') return json(res, this.status());
      if (req.method === 'GET' && url.pathname === '/api/logs') return json(res, { logs: this.logs });
      if (req.method === 'GET' && url.pathname === '/api/blocks') return json(res, { blocks: this.recentBlocks() });
      if (req.method === 'POST' && url.pathname === '/api/configure') {
        await this.configure(await readBody(req));
        return json(res, { ok: true, config: this.config });
      }
      if (req.method === 'POST' && url.pathname === '/api/start') {
        await this.startNode();
        return json(res, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/api/stop') {
        await this.stopNode();
        return json(res, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/api/shutdown') {
        json(res, { ok: true });
        setTimeout(async () => { await this.stopNode(); this.guiServer.close(); process.exit(0); }, 50).unref();
        return;
      }
      json(res, { error: 'not_found' }, 404);
    } catch (e) {
      json(res, { error: (e as Error).message }, 400);
    }
  }
}

const UI = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>YSKAR Node Core</title>
<style>
:root{font-family:"Segoe UI",Inter,Arial,sans-serif;color:#e7ebf2;background:#0b0e13;--bg:#0b0e13;--panel:#11151c;--panel2:#0e1218;--line:#252c36;--line2:#303844;--text:#e7ebf2;--muted:#8d98a8;--accent:#6ea8ff;--accent2:#4f8ee8;--good:#54d39a;--warn:#e5b85c;--bad:#ef7c86;--shadow:0 16px 40px rgba(0,0,0,.28)}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:linear-gradient(180deg,#0b0e13 0%,#090c11 100%);font-size:13px}.app{min-height:100vh;display:flex}.sidebar{width:230px;background:#0e1218;border-right:1px solid var(--line);padding:20px 14px;display:flex;flex-direction:column}.brand{display:flex;align-items:center;gap:11px;padding:4px 8px 24px}.brandmark{width:34px;height:34px;border:1px solid #385b8d;background:#15243a;border-radius:9px;display:grid;place-items:center;color:#80b4ff}.brandmark svg{width:19px;height:19px}.brandname{font-size:16px;font-weight:700;letter-spacing:.2px}.version{font-size:10px;color:var(--muted);margin-top:2px}.nav{display:grid;gap:4px}.nav button{display:flex;align-items:center;gap:11px;width:100%;padding:10px 11px;border:1px solid transparent;border-radius:8px;background:transparent;color:#aeb7c5;text-align:left;cursor:pointer}.nav button:hover{background:#151a22;color:#e6ebf3}.nav button.active{background:#182438;border-color:#263b5b;color:#eaf2ff}.nav svg{width:16px;height:16px;stroke:currentColor}.sidebottom{margin-top:auto;padding:12px 8px;color:var(--muted);font-size:11px;line-height:1.5}.main{flex:1;min-width:0}.topbar{height:66px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 24px;background:rgba(11,14,19,.94)}.pageTitle{font-size:18px;font-weight:650}.pageSub{color:var(--muted);font-size:11px;margin-top:3px}.status{display:flex;align-items:center;gap:8px;padding:7px 11px;border:1px solid var(--line);border-radius:8px;color:var(--muted);background:#10151c}.dot{width:7px;height:7px;border-radius:50%;background:#687282}.status.good{color:var(--good);border-color:#24533f}.status.good .dot{background:var(--good)}.status.warn{color:var(--warn);border-color:#5a4927}.status.warn .dot{background:var(--warn)}.content{padding:22px 24px 32px;max-width:1500px}.view{display:none}.view.active{display:block}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:18px}.toolbar h1{font-size:22px;margin:0}.toolbar p{margin:4px 0 0;color:var(--muted)}.actions{display:flex;gap:8px;flex-wrap:wrap}.btn{font:inherit;border:1px solid var(--line2);border-radius:7px;padding:8px 13px;background:#151a22;color:#e4e9f1;cursor:pointer}.btn:hover{background:#1a212b}.btn.primary{background:#356fbe;border-color:#4c83cf;color:white}.btn.primary:hover{background:#407bc9}.btn.danger{color:#ffb8bd;border-color:#65333a;background:#261519}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.card{background:var(--panel);border:1px solid var(--line);border-radius:9px;box-shadow:var(--shadow)}.stat{padding:15px 16px}.label{color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.08em}.value{font-size:21px;font-weight:650;margin-top:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wide{grid-column:1/-1}.half{grid-column:span 2}.section{padding:16px}.sectionhead{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:13px}.sectionhead h2{font-size:14px;margin:0;font-weight:650}.muted{color:var(--muted)}.small{font-size:11px;color:var(--muted)}.progress{height:7px;background:#1a2029;border:1px solid #252c36;border-radius:99px;overflow:hidden}.progress i{display:block;height:100%;width:0;background:linear-gradient(90deg,#4e86d8,#6ea8ff);transition:width .35s}.syncrow{display:flex;justify-content:space-between;margin-top:8px;color:var(--muted);font-size:11px}.tablewrap{overflow:auto}.table{width:100%;border-collapse:collapse;font-size:12px}.table th{text-align:left;color:#7f8a9a;font-weight:600;padding:9px 10px;border-bottom:1px solid var(--line)}.table td{padding:10px;border-bottom:1px solid #1b212a;color:#cbd2dc}.table tr:last-child td{border-bottom:0}.mono{font-family:Consolas,"SFMono-Regular",monospace}.hash{max-width:390px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pill{display:inline-flex;align-items:center;padding:3px 7px;border-radius:5px;background:#12251d;color:#6fe0aa;border:1px solid #234c3a;font-size:10px}.peer{display:flex;justify-content:space-between;gap:10px;padding:10px 0;border-bottom:1px solid #1c222c}.peer:last-child{border-bottom:0}.log{height:230px;overflow:auto;background:#0a0d12;border:1px solid var(--line);border-radius:7px;padding:12px;font:11px Consolas,monospace;color:#adb7c6;white-space:pre-wrap}.kv{display:grid;grid-template-columns:150px 1fr;gap:9px 14px;font-size:12px}.kv .k{color:var(--muted)}.wizard{max-width:720px;margin:8vh auto;padding:0 20px}.wizard .card{padding:28px}.wizard h1{margin:0 0 8px;font-size:25px}.wizard p{color:#aab4c2;line-height:1.6}.steps{display:flex;gap:6px;margin-bottom:24px}.step{height:3px;flex:1;background:#252c36;border-radius:99px}.step.on{background:#5f98e8}.field{margin-top:16px}.field label{display:block;color:#aeb7c4;font-size:12px;margin-bottom:7px}.field input{width:100%;padding:10px 11px;border:1px solid var(--line2);border-radius:7px;background:#0b0f15;color:#e7ebf2;outline:none}.field input:focus{border-color:#4d7fc4}.hint{font-size:11px;color:var(--muted);margin-top:5px}.hidden{display:none!important}.wizardActions{display:flex;justify-content:space-between;gap:10px;margin-top:24px}.confirm{background:#0d1219;border:1px solid var(--line);padding:12px;border-radius:7px;margin-top:18px}.navOnly{cursor:pointer}.settingsGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.empty{padding:22px;color:var(--muted);text-align:center;border:1px dashed #2a313c;border-radius:7px}
@media(max-width:1050px){.sidebar{width:190px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.half{grid-column:span 2}}@media(max-width:760px){.sidebar{width:62px;padding:15px 8px}.brandname,.version,.nav span,.sidebottom{display:none}.brand{justify-content:center;padding:4px 0 20px}.nav button{justify-content:center}.topbar{padding:0 14px}.content{padding:16px}.grid{grid-template-columns:1fr}.half,.wide{grid-column:1}.settingsGrid{grid-template-columns:1fr}}
</style></head><body>
<div id="wizard" class="wizard">
<div class="card"><div class="steps"><div class="step on"></div><div class="step"></div><div class="step"></div></div>
<section id="w1"><h1>YSKAR Node Core</h1><p>Dieser Full Node läuft als eigenständige Windows-Anwendung. Die Blockchain-, Validierungs- und P2P-Implementierung des YSKAR-Repositories bleibt unverändert.</p><p class="hint">Der Standard-Seed zeigt auf deinen bereits getesteten Node #1.</p><div class="wizardActions"><span></span><button class="btn primary" id="beginButton">Einrichtung starten</button></div></section>
<section id="w2" class="hidden"><h1>Node konfigurieren</h1><p>Lege Datenordner und Netzwerkports fest. Für einen normalen Windows-Node können die Standardwerte beibehalten werden.</p><div class="field"><label>Datenordner</label><input id="dataDir"><div class="hint">Hier wird die lokale chain.db gespeichert.</div></div><div class="field"><label>Node-API-Port (localhost)</label><input id="nodePort" type="number" value="8645"></div><div class="field"><label>P2P-Port</label><input id="p2pPort" type="number" value="8646"></div><div class="field"><label>Seed</label><input id="seed" value="yskar-main.dynv6.net:8646"></div><div id="err" class="hint" style="color:#ef7c86;margin-top:10px"></div><div class="wizardActions"><button class="btn" id="backButton">Zurück</button><button class="btn primary" id="saveButton">Weiter</button></div></section>
<section id="w3" class="hidden"><h1>Bereit für den Start</h1><p>Der Node startet auf YSKAR Mainnet, öffnet den P2P-Port und synchronisiert die Blockchain.</p><div class="confirm"><div class="small">Datenordner</div><div id="confirmData" class="mono" style="margin-top:6px;word-break:break-all"></div></div><div style="display:flex;gap:7px;margin-top:13px"><span class="pill">Mainnet</span><span class="pill">P2P 8646</span></div><div class="wizardActions"><button class="btn" id="backConfigButton">Zurück</button><button class="btn primary" id="startButton">Full Node starten</button></div></section>
</div></div>
<div id="app" class="app hidden">
<aside class="sidebar"><div class="brand"><div class="brandmark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3 19 7v10l-7 4-7-4V7l7-4Z"/><path d="m8 10 4-2 4 2-4 2-4-2Zm0 4 4 2 4-2"/></svg></div><div><div class="brandname">YSKAR</div><div class="version">Node Core 0.2.2</div></div></div><nav class="nav"><button class="active" data-view="overview"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg><span>Übersicht</span></button><button data-view="blocks"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M5 7h14M5 12h14M5 17h14"/><circle cx="3" cy="7" r=".7" fill="currentColor"/><circle cx="3" cy="12" r=".7" fill="currentColor"/><circle cx="3" cy="17" r=".7" fill="currentColor"/></svg><span>Blockchain</span></button><button data-view="peers"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="16" r="3"/><path d="m10.5 10.5 3 3"/></svg><span>Peers</span></button><button data-view="settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m4 13-1-1 1-1 1-2-1-1 2-2 1 1 2-1 1-2h2l1 2 2 1 1-1 2 2-1 1 1 2 2 1v2l-2 1-1 2 1 1-2 2-1-1-2 1-1 2h-2l-1-2-2-1-1 1-2-2 1-1-1-2-2-1v-2Z"/></svg><span>Einstellungen</span></button></nav><div class="sidebottom">YSKAR Mainnet<br>Full Node · P2P</div></aside>
<main class="main"><header class="topbar"><div><div id="pageTitle" class="pageTitle">Übersicht</div><div id="pageSub" class="pageSub">Netzwerkstatus und Synchronisation</div></div><div id="status" class="status"><i class="dot"></i><span>Nicht gestartet</span></div></header>
<div class="content">
<section id="view-overview" class="view active"><div class="toolbar"><div><h1>Netzwerkübersicht</h1><p>Lokaler YSKAR Full Node</p></div><div class="actions"><button class="btn" id="refreshButton">Aktualisieren</button><button class="btn" id="stopButton">Node stoppen</button><button class="btn danger" id="shutdownButton">Beenden</button></div></div><div class="card section" style="margin-bottom:10px"><div class="sectionhead"><h2>Synchronisation</h2><span id="syncText" class="small">Warte auf Status…</span></div><div class="progress"><i id="progressBar"></i></div><div class="syncrow"><span id="syncLeft">Warte auf Peer</span><span id="syncPct">—</span></div></div><div class="grid"><div class="card stat"><div class="label">Blockhöhe</div><div id="height" class="value">—</div></div><div class="card stat"><div class="label">Netzwerkziel</div><div id="target" class="value">—</div></div><div class="card stat"><div class="label">Peers</div><div id="peers" class="value">—</div></div><div class="card stat"><div class="label">Gespeicherte Blöcke</div><div id="blocks" class="value">—</div></div><div class="card stat"><div class="label">Chain Work</div><div id="work" class="value">—</div></div><div class="card stat"><div class="label">Difficulty</div><div id="difficulty" class="value">—</div></div><div class="card stat"><div class="label">P2P</div><div id="p2p" class="value">—</div></div><div class="card stat"><div class="label">Uptime</div><div id="uptime" class="value">—</div></div><div class="card section half"><div class="sectionhead"><h2>Verbindungen</h2><span id="peerMeta" class="small"></span></div><div id="peerList" class="muted">Keine verbundenen Peers.</div></div><div class="card section half"><div class="sectionhead"><h2>Lokaler Node</h2><span class="small">Konfiguration</span></div><div class="kv"><div class="k">Node API</div><div id="api" class="mono">—</div><div class="k">Datenordner</div><div id="dataPath" class="mono" style="word-break:break-all">—</div><div class="k">Seed</div><div id="seedView" class="mono">—</div></div></div></div></section>
<section id="view-blocks" class="view"><div class="toolbar"><div><h1>Blockchain</h1><p>Die zuletzt gespeicherten Mainnet-Blöcke</p></div></div><div class="card section"><div class="tablewrap"><table class="table"><thead><tr><th>Höhe</th><th>Hash</th><th>Zeit</th><th>TX</th><th>Difficulty</th></tr></thead><tbody id="blockRows"><tr><td colspan="5" class="muted">Noch keine Daten.</td></tr></tbody></table></div></div></section>
<section id="view-peers" class="view"><div class="toolbar"><div><h1>Peers</h1><p>Aktive P2P-Verbindungen und Synchronisationsstatus</p></div></div><div class="grid"><div class="card stat"><div class="label">Aktive Peers</div><div id="peerCountLarge" class="value">—</div></div><div class="card stat"><div class="label">Ausgehend</div><div id="outboundLarge" class="value">—</div></div><div class="card stat"><div class="label">Eingehend</div><div id="inboundLarge" class="value">—</div></div><div class="card stat"><div class="label">Peer-Buch</div><div id="peerBookLarge" class="value">—</div></div><div class="card section wide"><div id="peerTable" class="empty">Keine verbundenen Peers.</div></div></div></section>
<section id="view-settings" class="view"><div class="toolbar"><div><h1>Einstellungen</h1><p>Aktuelle Node-Konfiguration</p></div></div><div class="card section"><div class="settingsGrid"><div class="field"><label>Datenordner</label><input id="settingsDataDir"></div><div class="field"><label>Node-API-Port</label><input id="settingsNodePort" type="number"></div><div class="field"><label>P2P-Port</label><input id="settingsP2pPort" type="number"></div><div class="field"><label>Seed</label><input id="settingsSeed"></div></div><div style="margin-top:18px"><button class="btn primary" id="saveSettings">Konfiguration speichern</button></div><div id="settingsMsg" class="small" style="margin-top:9px"></div></div><div class="card section" style="margin-top:10px"><div class="sectionhead"><h2>Node-Log</h2><span class="small">Live</span></div><div id="logs" class="log"></div></div></section>
</div></main></div>
<script>
const $=id=>document.getElementById(id);let timer=null,lastStatus=null;
async function api(path,opt){const r=await fetch(path,opt);const b=await r.json();if(!r.ok||b.error)throw new Error(b.error||'Fehler');return b}
function fmt(n){return n===null||n===undefined?'—':Number(n).toLocaleString('de-DE')}
function duration(sec){sec=Number(sec||0);const d=Math.floor(sec/86400);sec%=86400;const h=Math.floor(sec/3600);sec%=3600;const m=Math.floor(sec/60);const s=sec%60;return(d?d+'T ':'')+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')}
function showStep(n){[1,2,3].forEach(i=>$('w'+i).classList.toggle('hidden',i!==n));document.querySelectorAll('.steps .step').forEach((x,i)=>x.classList.toggle('on',i<n))}
function showApp(){ $('wizard').classList.add('hidden');$('app').classList.remove('hidden') }
function setView(v){document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id==='view-'+v));const meta={overview:['Übersicht','Netzwerkstatus und Synchronisation'],blocks:['Blockchain','Lokale Chain-Daten'],peers:['Peers','Aktive P2P-Verbindungen'],settings:['Einstellungen','Node-Konfiguration']};$('pageTitle').textContent=meta[v][0];$('pageSub').textContent=meta[v][1]}
async function init(){try{const s=await api('/api/status');$('dataDir').value=s.dataDir;$('nodePort').value=s.nodePort;$('p2pPort').value=s.p2pPort;$('seed').value=s.seed||'';if(s.configured){$('confirmData').textContent=s.dataDir;showStep(3)}}catch(e){$('err').textContent=e.message}}
async function saveSetup(){try{$('err').textContent='';const b=await api('/api/configure',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({dataDir:$('dataDir').value,nodePort:Number($('nodePort').value),p2pPort:Number($('p2pPort').value),seed:$('seed').value})});$('confirmData').textContent=b.config.dataDir;showStep(3)}catch(e){$('err').textContent=e.message}}
async function startNode(){try{await api('/api/start',{method:'POST'});showApp();setView('overview');await refresh();if(!timer)timer=setInterval(refresh,1500)}catch(e){alert(e.message)}}
async function stopNode(){try{await api('/api/stop',{method:'POST'});await refresh()}catch(e){alert(e.message)}}
function updateStatus(s){const el=$('status');el.className='status '+(s.running?(s.syncing?'warn':'good'):'');el.querySelector('span').textContent=s.running?(s.syncing?'Synchronisiere':'Node läuft'):'Nicht gestartet'}
function renderPeers(s){$('peerList').innerHTML=s.peers.length?s.peers.map(p=>'<div class="peer"><span>'+p.host+':'+p.port+' <span class="pill">'+p.direction+'</span></span><span>Höhe '+fmt(p.height)+'</span></div>').join(''):'Keine verbundenen Peers.';$('peerTable').innerHTML=s.peers.length?'<table class="table"><thead><tr><th>Adresse</th><th>Richtung</th><th>Höhe</th><th>Chain Work</th></tr></thead><tbody>'+s.peers.map(p=>'<tr><td class="mono">'+p.host+':'+p.port+'</td><td><span class="pill">'+p.direction+'</span></td><td>'+fmt(p.height)+'</td><td class="mono">'+p.chainWork+'</td></tr>').join('')+'</tbody></table>':'Keine verbundenen Peers.'}
async function refresh(){try{const s=await api('/api/status');lastStatus=s;updateStatus(s);$('height').textContent=fmt(s.height);$('target').textContent=fmt(s.targetHeight);$('peers').textContent=fmt(s.peerCount);$('blocks').textContent=fmt(s.blocksStored);$('work').textContent=s.chainWork;$('difficulty').textContent=s.difficulty||'—';$('p2p').textContent='0.0.0.0:'+s.p2pPort;$('api').textContent='127.0.0.1:'+s.nodePort;$('uptime').textContent=duration(s.uptimeSeconds);$('dataPath').textContent=s.dataDir;$('seedView').textContent=s.seed||'—';$('peerMeta').textContent=s.outboundPeers+' ausgehend · '+s.inboundPeers+' eingehend · Buch '+s.peerBook;$('syncText').textContent=s.running?(s.syncing?'Synchronisiere Blockchain…':'Mainnet · aktuell'):'Node gestoppt';$('syncLeft').textContent=s.targetHeight!==null?(s.syncing?(fmt(Math.max(0,s.targetHeight-s.height))+' Blöcke offen'):'Chain aktuell'):'Warte auf Peer';$('syncPct').textContent=s.syncProgress===null?'—':s.syncProgress+' %';$('progressBar').style.width=(s.syncProgress===null?0:s.syncProgress)+'%';renderPeers(s);$('peerCountLarge').textContent=fmt(s.peerCount);$('outboundLarge').textContent=fmt(s.outboundPeers);$('inboundLarge').textContent=fmt(s.inboundPeers);$('peerBookLarge').textContent=fmt(s.peerBook);$('settingsDataDir').value=s.dataDir;$('settingsNodePort').value=s.nodePort;$('settingsP2pPort').value=s.p2pPort;$('settingsSeed').value=s.seed||'';const b=await api('/api/blocks');$('blockRows').innerHTML=b.blocks.length?b.blocks.map(x=>'<tr><td>'+fmt(x.height)+'</td><td class="mono hash" title="'+x.hash+'">'+x.hash+'</td><td>'+new Date(x.time).toLocaleString('de-DE')+'</td><td>'+fmt(x.txCount)+'</td><td class="mono">'+x.difficulty+'</td></tr>').join(''):'<tr><td colspan="5" class="muted">Noch keine Blöcke.</td></tr>';const l=await api('/api/logs');$('logs').textContent=l.logs.join('\\n');$('logs').scrollTop=$('logs').scrollHeight}catch(e){$('syncText').textContent='Statusfehler: '+e.message}}
async function saveSettings(){try{const b=await api('/api/configure',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({dataDir:$('settingsDataDir').value,nodePort:Number($('settingsNodePort').value),p2pPort:Number($('settingsP2pPort').value),seed:$('settingsSeed').value})});$('settingsMsg').textContent='Konfiguration gespeichert.';setTimeout(()=>{$('settingsMsg').textContent=''},2500)}catch(e){$('settingsMsg').textContent=e.message}}
async function shutdown(){if(confirm('YSKAR Node Core wirklich beenden?'))await api('/api/shutdown',{method:'POST'})}
function bind(){document.querySelectorAll('.nav button').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));$('beginButton').onclick=()=>showStep(2);$('backButton').onclick=()=>showStep(1);$('saveButton').onclick=saveSetup;$('backConfigButton').onclick=()=>showStep(2);$('startButton').onclick=startNode;$('refreshButton').onclick=refresh;$('stopButton').onclick=stopNode;$('shutdownButton').onclick=shutdown;$('saveSettings').onclick=saveSettings}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{bind();init()});else{bind();init()}
</script></body></html>`;

const UI_WIZARD_2 = UI.replace('<section id="w1">','<section id="w1" class="hidden">').replace('<section id="w2" class="hidden">','<section id="w2">');
