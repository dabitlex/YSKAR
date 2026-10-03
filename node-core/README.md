# YSKAR Node Core 0.4.1

Native Windows desktop application for the YSKAR Full Node.

## What changed in 0.4.1

Three fixes in the node's interface (port 8645), found in an independent
review. They are the only changes compared to 0.4.0:

- A request for the path `//` ended the whole program. A web page open in a
  browser on the same PC could trigger that. It now costs only that request.
- Reports about miners from other nodes (`stats`) could fill the memory when
  a peer sent them with an ever-changing identifier. One report per
  connection is kept now.
- In pool operation (command-line node) the same share could be credited
  repeatedly. A share now counts once per job.

## What changed in 0.4.0

**Update required.** From block 4,000 on the network applies consensus
revision 3 (fee per byte). A Node Core built before 30 September 2026 still
demands the old minimum fee: it rejects the first block from that height
that contains a cheaper transfer and stays behind from there. 0.4.0 bundles
the current node classes, including consensus revisions 3 and 4.

- **Transactions.** The node now accepts transfers from its peers, relays
  them and includes them in the blocks it mines. Before, a block found by
  Node Core contained only the reward.
- **Network statistics.** The node announces `+stats` and reports its
  built-in miners to its peers, so they count in "active miners".
- **Mining waits for sync.** Mining only starts once the node has a peer and
  is at the height of the network (median of its outbound peers, one block
  of tolerance). Mining on an old tip would produce worthless blocks. The
  node only knows it is behind because peers say so, and peers can lie: a
  claimed backlog therefore stops blocking after two minutes without a
  single accepted block. The price: if a real sync stalls that long, mining
  may start on an old tip until the next block arrives.
- **A failed start cleans up.** If the node cannot start (for example
  because a port is in use), everything already started is stopped again.
  Before, the P2P port stayed bound and every further attempt failed.
- **Local interface protected.** See "Local interface" below.
- Removed leftovers: `build-installer.ps1` (0.2.2) and the bundles that had
  been committed under `dist/` at the repository root.

## Local interface

The GUI server listens on `127.0.0.1:8650` only. That alone is not enough:
any web page open in a browser on the same PC can send requests to
`127.0.0.1`. Since 0.4.0 every request has to pass three checks:

1. `Host` must be `127.0.0.1:8650` or `localhost:8650` (stops DNS rebinding).
2. If the browser sends `Origin` or `Sec-Fetch-Site`, it must be the
   interface's own origin.
3. Everything under `/api/` needs the header `x-yskar-token`. The token is
   created at every start and is only contained in the page the server
   delivers itself; a foreign page cannot read it.

A request body must be declared as `application/json`. The page is served
with `X-Frame-Options: DENY` and a Content-Security-Policy that loads
nothing from outside.

This protects against web pages. It does not protect against malware
running on the PC itself.

## Desktop application

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

API (localhost GUI server, port 8650, header `x-yskar-token` required):

```
GET  /api/mining/status
POST /api/mining/start    { address, mode, cpuWorkers, cpuIntensity, gpuDevice }
POST /api/mining/stop
POST /api/mining/detect
```

**Fixed in 0.3.1:** jobs expire after 90 s, but a block at mainnet
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

`node-core\release\YSKAR-Node-Core-Setup-0.4.1.exe`

## Tests

```
npm run build:gpu-emu   # once, for the GPU tests
npm test
```

`test/kern.test.ts` runs the real application class on the test network:
two nodes over TCP, a transfer travelling from one to the other and into a
block, the statistics, the checks of the local interface.

## Development

```powershell
npm install
npm start
```

Do not open the GUI URL manually. The application creates its own native desktop window.
