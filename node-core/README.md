# YSKAR Node Core 0.3.1

Native Windows desktop application for the YSKAR Full Node.

## What changed

- Native Electron desktop window instead of Microsoft Edge.
- Modern desktop UI inspired by Bitcoin Core / Electrum, with a cleaner 2026 visual language.
- Sidebar navigation: Overview, Blockchain, Peers, Mining, Settings.
- Existing YSKAR Full Node classes remain the backend.
- Data stays in `%LOCALAPPDATA%\YSKAR\Node`.
- Node Core configuration stays in `%LOCALAPPDATA%\YSKAR\Node Core\config.json`.
- P2P default port: 8646.
- Node API default port: 8645 on localhost.
- Default seed: `yskar-main.dynv6.net:8646`.

## Mining

CPU and GPU mining run inside the node. Both take their jobs from the
existing `MiningCoordinator` and submit through `submitNonce()` -- the same
full validation as every other block. There is no second consensus path.

| Backend | File | Engine |
|---|---|---|
| CPU | `src/LocalMiner.ts` | the same WASM engine as the Mini App and CLI miner, copied (never modified) into `dist/miner.wasm` at build time |
| GPU | `src/GpuMiner.ts` + `gpu/yskar_cuda.cu` | CUDA, separate process -- see `gpu/README.md` |

Modes: CPU, GPU, CPU + GPU. Without an NVIDIA GPU the node runs normally and
shows GPU mining as unavailable.

Mining settings are stored separately in
`%LOCALAPPDATA%\YSKAR\Node Core\mining.json`, so they never touch the
node configuration.

API (localhost GUI server, port 8650):

```
GET  /api/mining/status
POST /api/mining/start    { address, mode, cpuWorkers, cpuIntensity, gpuDevice }
POST /api/mining/stop
POST /api/mining/detect
```

**Fixed in this version:** jobs expire after 90 s, but a block at mainnet
difficulty takes around half an hour to find. The CPU miner never refreshed
its job, so almost every block it found would have landed on an expired job
and been lost. Both miners now refresh every 30 s.

## Build on Windows

Requirements:

- Node.js 22 or newer
- Windows 10/11
- The full YSKAR repository one directory above `node-core`
- Internet access for the first `npm install` so Electron can be downloaded

From `YSKAR-main\node-core`:

```powershell
powershell -ExecutionPolicy Bypass -File .\build-desktop.ps1
```

The finished installer is created under:

`node-core\release\YSKAR-Node-Core-Setup-0.3.1.exe`

## Development

```powershell
npm install
npm start
```

Do not open the GUI URL manually. The application creates its own native desktop window.
