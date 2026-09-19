/*
 * YSKAR Node Core — eigenständige Test-GUI.
 *
 * WICHTIG:
 * Diese Datei verändert keine bestehende YSKAR-Datei.
 * Sie verwendet ausschließlich die vorhandenen Full-Node-Klassen aus src/.
 * Die GUI ist ein lokales Dashboard, das über Microsoft Edge im App-Modus
 * angezeigt wird. Der eigentliche Full Node läuft im selben Prozess.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir, platform } from 'node:os';
import { execFile, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

const VERSION = '0.1.0';
const APP_NAME = 'YSKAR Node Core';
const GUI_PORT = 8650;
const DEFAULT_NODE_PORT = 8645;
const DEFAULT_P2P_PORT = 8646;
const DEFAULT_SEED = '80.145.153.251:8646';

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

class NodeCoreApp {
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
    this.log(`GUI erreichbar unter http://127.0.0.1:${GUI_PORT}`);
    this.openBrowser();
  }

  private openBrowser(): void {
    const url = `http://127.0.0.1:${GUI_PORT}/`;
    if (process.platform !== 'win32') return;
    const candidates = [
      join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ];
    const edge = candidates.find(existsSync);
    if (edge) {
      execFile(edge, [`--app=${url}`, '--new-window'], () => {});
    } else {
      execFile('cmd.exe', ['/c', 'start', '', url], () => {});
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
    const target = tip ? Number(tip.difficulty) : null;
    const state = this.chain?.state();
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
      nextHeight: (tip?.height ?? -1) + 1,
      tipHash: tip ? toHex(tip.hash) : null,
      chainWork: tip?.chainWork?.toString() ?? '0',
      difficulty: target,
      blocksStored: this.store?.count() ?? 0,
      tips: this.store?.tips().length ?? 0,
      totalSupply: state ? totalSupply(state).toString() : '0',
      stateRoot: tip && state ? toHex(stateRoot(state)) : null,
      peers: peers.map(p => ({ host: p.host, port: p.port, direction: p.richtung, height: p.height, chainWork: p.chainWork.toString() })),
      peerCount: peers.length,
      syncPending: this.sync?.fehlendeBloecke() ?? 0,
      syncRequests: this.sync?.offeneAnfragen() ?? 0,
      uptimeSeconds: this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : 0,
    };
  }

  private async handleGui(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/') return html(res, UI);
      if (req.method === 'GET' && url.pathname === '/api/status') return json(res, this.status());
      if (req.method === 'GET' && url.pathname === '/api/logs') return json(res, { logs: this.logs });
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
:root{font-family:Inter,Segoe UI,Arial,sans-serif;color:#eef1f8;background:#070910;--line:#202533;--muted:#8d96a9;--card:#0d111a;--accent:#5b8def;--good:#45d483;--warn:#eab65c;}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 20% 0%,#111b31 0,#070910 40%,#05070c 100%)}
.wrap{width:min(980px,calc(100% - 36px));margin:38px auto}.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:22px}.brand{font-size:22px;font-weight:700;letter-spacing:.2px}.sub{font-size:12px;color:var(--muted);margin-top:4px}.badge{border:1px solid var(--line);border-radius:999px;padding:7px 11px;color:var(--muted);font-size:12px}.badge.good{color:var(--good);border-color:#245a3d}.card{background:rgba(13,17,26,.92);border:1px solid var(--line);border-radius:16px;padding:24px;box-shadow:0 18px 60px #0005}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.stat{border:1px solid var(--line);border-radius:12px;padding:15px;background:#0a0e15}.label{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}.value{font-size:20px;margin-top:8px;font-weight:650}.wide{grid-column:1/-1}.row{display:flex;gap:12px;align-items:center}.steps{display:flex;gap:8px;margin-bottom:24px}.step{height:4px;flex:1;background:#222938;border-radius:9px}.step.on{background:var(--accent)}h1{font-size:25px;margin:0 0 8px}p{color:#aeb6c5;line-height:1.55}label{display:block;color:#aeb6c5;font-size:13px;margin:16px 0 7px}input{width:100%;padding:12px 13px;border-radius:10px;border:1px solid #2a3040;background:#090d14;color:#eef1f8;font:inherit;outline:none}input:focus{border-color:#466fbe}button{border:0;border-radius:10px;padding:11px 16px;background:var(--accent);color:white;font-weight:650;cursor:pointer}button.secondary{background:#171d29;border:1px solid #2a3040}button.danger{background:#4a2024}.actions{display:flex;justify-content:space-between;margin-top:22px}.hidden{display:none}.muted{color:var(--muted)}.log{height:220px;overflow:auto;background:#070a10;border:1px solid var(--line);border-radius:10px;padding:12px;font:12px Consolas,monospace;white-space:pre-wrap;color:#b7c0cf}.peer{padding:11px 0;border-bottom:1px solid #1c2230;display:flex;justify-content:space-between}.peer:last-child{border-bottom:0}.pill{font-size:11px;padding:4px 8px;border-radius:999px;background:#13251b;color:var(--good)}.error{color:#ff8f98;margin-top:12px}.hint{font-size:12px;color:var(--muted)}
@media(max-width:720px){.grid{grid-template-columns:1fr 1fr}.wide{grid-column:1/-1}}
</style></head><body><div class="wrap">
<div class="top"><div><div class="brand">YSKAR Node Core</div><div class="sub">Full Node · Mainnet · Testversion 0.1.0</div></div><div id="badge" class="badge">Nicht gestartet</div></div>
<div id="wizard" class="card"><div class="steps"><div class="step on"></div><div class="step"></div><div class="step"></div></div>
<section id="w1"><h1>Willkommen bei YSKAR</h1><p>Dieser Assistent richtet den bestehenden YSKAR Full Node für einen lokalen Windows-Test ein. Die Blockchain- und P2P-Implementierung des Repos wird nicht verändert.</p><p class="hint">Beim ersten Test wird als Seed standardmäßig dein bereits funktionierender Node #1 verwendet.</p><div class="actions"><span></span><button onclick="next(2)">Einrichtung starten</button></div></section>
<section id="w2" class="hidden"><h1>Node konfigurieren</h1><label>Datenordner</label><input id="dataDir"><div class="hint">Hier liegt später die lokale chain.db. Standard: %LOCALAPPDATA%\\YSKAR\\Node</div><label>Node-API-Port (nur localhost)</label><input id="nodePort" type="number" value="8645"><label>P2P-Port</label><input id="p2pPort" type="number" value="8646"><label>Seed</label><input id="seed" value="80.145.153.251:8646"><div id="err" class="error"></div><div class="actions"><button class="secondary" onclick="next(1)">Zurück</button><button onclick="saveAndNext()">Weiter</button></div></section>
<section id="w3" class="hidden"><h1>Bereit für den Start</h1><p>Der Node läuft auf <b>YSKAR Mainnet</b>, lauscht lokal auf der Mining-/Node-API und nimmt auf dem P2P-Port Verbindungen an. Die Synchronisation erfolgt über P2P und jeder Block wird lokal geprüft.</p><div class="stat"><div class="label">Datenordner</div><div id="confirmData" class="value" style="font-size:14px;word-break:break-all"></div></div><div class="row" style="margin-top:14px"><span class="pill">P2P aktiviert</span><span class="pill">Mainnet</span></div><div class="actions"><button class="secondary" onclick="next(2)">Zurück</button><button onclick="startNode()">Full Node starten</button></div></section>
</div>
<div id="dash" class="card hidden"><div class="top"><div><h1>YSKAR Full Node</h1><div id="syncText" class="sub">Warte auf Status…</div></div><div class="row"><button class="secondary" onclick="refresh()">Aktualisieren</button><button class="danger" onclick="shutdown()">Programm beenden</button></div></div><div class="grid"><div class="stat"><div class="label">Blockhöhe</div><div id="height" class="value">—</div></div><div class="stat"><div class="label">Peers</div><div id="peers" class="value">—</div></div><div class="stat"><div class="label">Gespeicherte Blöcke</div><div id="blocks" class="value">—</div></div><div class="stat"><div class="label">Chain Work</div><div id="work" class="value">—</div></div><div class="stat"><div class="label">P2P</div><div id="p2p" class="value">—</div></div><div class="stat"><div class="label">Node API</div><div id="api" class="value">—</div></div><div class="stat wide"><div class="label">Peers</div><div id="peerList" class="muted" style="margin-top:8px">Keine verbundenen Peers.</div></div><div class="stat wide"><div class="label">Node-Log</div><div id="logs" class="log"></div></div></div></div>
</div>
<script>
const $=id=>document.getElementById(id);let timer=null;
async function api(path,opt){const r=await fetch(path,opt);const b=await r.json();if(!r.ok||b.error)throw new Error(b.error||'Fehler');return b}
async function init(){try{const s=await api('/api/status');$('dataDir').value=s.dataDir;$('nodePort').value=s.nodePort;$('p2pPort').value=s.p2pPort;$('seed').value=s.seed||'';if(s.configured){next(3);$('confirmData').textContent=s.dataDir;}}catch(e){$('err').textContent=e.message}}
function next(n){[1,2,3].forEach(i=>$('w'+i).classList.toggle('hidden',i!==n));document.querySelectorAll('.step').forEach((x,i)=>x.classList.toggle('on',i<n));}
async function saveAndNext(){try{$('err').textContent='';const b=await api('/api/configure',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({dataDir:$('dataDir').value,nodePort:Number($('nodePort').value),p2pPort:Number($('p2pPort').value),seed:$('seed').value})});$('confirmData').textContent=b.config.dataDir;next(3)}catch(e){$('err').textContent=e.message}}
async function startNode(){try{await api('/api/start',{method:'POST'});$('wizard').classList.add('hidden');$('dash').classList.remove('hidden');refresh();if(!timer)timer=setInterval(refresh,1500)}catch(e){alert(e.message)}}
async function refresh(){try{const s=await api('/api/status');$('badge').textContent=s.running?'● Node läuft':'Nicht gestartet';$('badge').className='badge '+(s.running?'good':'');$('height').textContent=s.height===null?'—':s.height.toLocaleString('de-DE');$('peers').textContent=s.peerCount;$('blocks').textContent=s.blocksStored.toLocaleString('de-DE');$('work').textContent=s.chainWork;$('p2p').textContent='127.0.0.1:'+s.p2pPort;$('api').textContent='127.0.0.1:'+s.nodePort;$('syncText').textContent=s.running?('Mainnet · '+(s.syncPending>0?'Synchronisiere…':'Bereit')+' · '+s.peerCount+' Peer'+(s.peerCount===1?'':'s')):'Node gestoppt';$('peerList').innerHTML=s.peers.length?s.peers.map(p=>'<div class="peer"><span>'+p.host+':'+p.port+' <span class="pill">'+p.direction+'</span></span><span>Höhe '+p.height.toLocaleString('de-DE')+'</span></div>').join(''):'Keine verbundenen Peers.';const l=await api('/api/logs');$('logs').textContent=l.logs.join('\\n');$('logs').scrollTop=$('logs').scrollHeight}catch(e){$('syncText').textContent='Statusfehler: '+e.message}}
async function shutdown(){if(confirm('YSKAR Node Core wirklich beenden?'))await api('/api/shutdown',{method:'POST'})}
init();
</script></body></html>`;

const app = new NodeCoreApp();
await app.startGui();
