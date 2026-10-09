# YSKAR Node Core 0.5.2

A full YSKAR node for Windows with its own window: wallet, mining (solo, in a
pool, or as the operator of a pool), block explorer and peer list. It runs
the same node classes as the command-line node in `src/lib/node`.

## What it does

| Area | |
|---|---|
| **Node** | Full node on the P2P network. Checks every block itself, relays blocks and transfers. |
| **Wallet** | 12 words, encrypted on this PC (PBKDF2-SHA256 400,000 rounds, AES-256-GCM). Send with a review step, receive with QR code, contacts, history from the own chain. The password is asked before every transfer. |
| **Mining, solo** | CPU and NVIDIA GPU (CUDA). Work comes from the own node; a found block is announced to the peers directly. |
| **Mining, pool** | The same miners take their work from a pool node. The list is the one the app uses; any other pool can be entered by address. |
| **Run a pool** | The node pays every block out itself (PPLNS, coinbase with up to 64 recipients). Name, fee 0 to 5 %, number of places. |
| **Blockchain / Peers** | Blocks, transfers, accounts, search; connected peers, connect and disconnect by hand. |
| **Program** | German and English, start with Windows, keep running in the notification area, resume mining after start, update notice. |

## What changed in 0.5.2

- **The access token of the local interface is no longer in the page.**
  The program window gets it as a cookie (see "Local interface" below).
- **Running a pool** (shared with the command-line node,
  `src/lib/node/fullnode/MiningServer.ts`, `src/lib/pool/`):
  - the share target is fixed per job and changes only with the next job;
  - a place in the pool counts only for an active session: a new session
    gets a trial place for 2 minutes and keeps it by delivering a share at
    least every 10 minutes;
  - transaction fees are split by work, like the reward, instead of going to
    the largest output;
  - jobs are built from one block template per pool, and block lookups no
    longer walk the chain.
- **P2P limits** (`src/lib/node/p2p/`): header requests are limited per peer
  and answered later instead of dropped; a peer gets at most 16 blocks per
  request and is disconnected when 12 MiB are waiting for it. See
  [docs/P2P.md](../docs/P2P.md).
- **Blocks are stored and forwarded in their own encoding**
  (`ChainManager.accept`). Extra bytes a peer attaches to a block are dropped
  on arrival (issue #10).
- **GPU miner** (`gpu/yskar_host.cpp`): when only the share target changes,
  it continues where it was instead of searching the same range again
  (issue #4).

Consensus rules, wallet, settings and data folder are unchanged.

## What changed in 0.5.1

- **Catching up over more than 2,000 blocks** (`src/lib/node/p2p/SyncManager.ts`).
  A node that far behind asked for the same 2,000 headers again after every
  answer and loaded about 16 blocks per 20 to 30 seconds. It now asks for the
  headers behind the last one it received. See
  [docs/P2P.md](../docs/P2P.md#catching-up-over-several-messages).
- **Block acceptance** (`src/lib/node/fullnode/ChainManager.ts`) no longer
  walks back to the genesis block for every block and no longer rebuilds the
  state from the last snapshot after every block. The rules are unchanged.
- **A second built-in seed**, `yskar-seed2.dynv6.net:8646` (see "Defaults"
  below).

Interface, wallet, mining and settings are the same as in 0.5.0.

## What changed in 0.5.0

- **New interface** from separate files (`ui/`), served by the local server
  with a strict Content-Security-Policy. No framework, no inline scripts.
- **Wallet** (`src/Wallet.ts`). See "Wallet" below.
- **Mining in a pool** (`src/PoolQuelle.ts`) and **running a pool**
  (`src/PoolBetrieb.ts`). See "Pool" below.
- **Program settings and Windows shell.** See "Windows shell" below.
- **Messages in the language of the interface.** Every message of the node
  carries a code; the interface shows its own text for it.
- **The YSKAR crystal as program icon and in the interface**, on a
  transparent ground (`build/icon.ico`, `ui/kristall.png`).
- **Fixes from an independent review.** Among them three in the node's
  interface that also concern the command-line node: a request for the path
  `//` ended the process, the same share could be credited repeatedly in a
  pool, and reports about miners (`stats`) could fill the memory.

0.4.0 (transfers, statistics, protected local interface, consensus
revisions 3 and 4) is included.

## Local interface

The GUI server listens on `127.0.0.1:8650` only. That alone is not enough:
any web page open in a browser on the same PC can send requests to
`127.0.0.1`. Every request has to pass three checks:

1. `Host` must be `127.0.0.1:8650` or `localhost:8650` (stops DNS rebinding).
2. If the browser sends `Origin` or `Sec-Fetch-Site`, it must be the
   interface's own origin.
3. Everything under `/api/` needs the access token. It is created at every
   start and is **not** contained in the page. The program window gets it as
   a cookie (`yskar_zugang`, HttpOnly, SameSite=Strict, valid until the
   program ends) that `electron-main.mjs` sets in the window's session
   before the page loads. Tools can send it in the header `x-yskar-token`.
   Until version 0.5.1 the token was written into the page, so any program
   that could reach `127.0.0.1:8650` could read it from there.

A request body must be declared as `application/json`.

This protects against web pages. It does not protect against malware
running on the PC itself.

### The node's own interface (port 8645)

This is the interface miners talk to. Without a pool it answers this PC
only, and not to requests that come from a web page. With a running pool it
is an offer to others: it then answers the own PC and the own network
(private address ranges), never a connection from the internet directly --
also not when "share in the home network" makes it listen on all network
cards and one of them faces the internet.

## Wallet

- `wallet.json` in the program folder (see "Files") holds the encrypted 12
  words and the address. The address is readable without the password (mining and the pool
  fee need it); everything else is not.
- Sending, showing the words, changing the password and removing the wallet
  need the password every time. The private key is derived for the one
  signature and overwritten afterwards.
- Five wrong passwords in a row pause further attempts for 30 seconds.
  Attempts are checked one after the other, so many at once are not more.
- The wallet locks itself after 5, 10 or 30 minutes without activity (or
  never), and when Windows is locked or goes to sleep.
- A forgotten password can be replaced with the 12 words of *this* wallet.
  Without words and password there is no way back -- nobody can reset it.
- If the address in the file does not match the words, unlocking refuses.

The note of a transfer is written into the chain (up to 32 bytes) and is
public, as in the app.

## Pool

### Mining in a pool

The miners log in at the pool node with the address, fetch work with the
pool's share target, and submit hits -- the same interface the app and the
command-line miner use. One session per device (CPU, GPU).

- The pool is a foreign computer. Every field of its answers is checked
  before it reaches a worker or the GPU program; at most 64 KB are read, no
  redirect is followed, a target easier than difficulty 1 is refused.
- Before the start the pool is asked whether it exists and has a place. If
  not, nothing starts and the reason is shown.
- If the pool later refuses (full, no pool any more), mining stops and says
  why. **It never silently continues solo.**
- If the pool gives no work for 90 seconds, the miners pause until it
  answers again.
- Blocks per pool and the last payout are read from the own chain, not
  asked from the pool. The mining address is only sent to the chosen pool.

### Running a pool

- Name (3 to 32 plain characters, written into every block of the pool),
  fee 0 to 5 % in steps of 0.25 %, places 1 to 64 (63 with a fee).
- The fee goes to the wallet of this PC. A change applies from the next
  block -- also across a restart: the fee that last applied is stored with
  the window.
- The PPLNS window is saved (`pool-fenster.json`) every two minutes and when
  the pool stops, and loaded again at start. A file that cannot be read is
  put aside as `.unlesbar` and reported, never silently overwritten.
- Switching the pool off ends all pool sessions. Otherwise the miners would
  keep getting work with a coinbase for a single address.
- The own miner joins like everyone else: the own pool is first in the pool
  list.
- "Share in the home network" opens port 8645 for the own network. App and
  Mini App from the internet need HTTPS with a certificate; Node Core does
  not set that up -- see [docs/POOL.md](../docs/POOL.md).

## Windows shell

`src/electron-main.mjs` shows the interface in its own window and provides
what only the operating system can: folder dialog, Explorer, browser, start
with Windows, the icon in the notification area.

The window is a sandboxed page without access to the system. Whatever the
interface needs from Windows it asks from the local server (token as
everywhere), which passes it on:

- "Open folder" opens the program folder or the data folder, nothing else.
- Links open in the user's browser, and only addresses from a fixed list
  (this repository on GitHub, yskar.app). The window itself never loads a
  foreign page.
- Only one instance runs. A second start brings the window to the front.
- "Keep running when closed" hides the window in the notification area --
  only if the icon could be created there.
- "Start with Windows" starts the program without a window.
- Updates: the program asks GitHub for the newest release tagged
  `node-core-vX.Y.Z` and shows it. Nothing is downloaded or installed by
  itself.

## Files

In `%LOCALAPPDATA%\YSKAR\Node Core`, which the interface calls the program
folder:

| File | |
|---|---|
| `config.json` | data folder, ports, seed |
| `einstellungen.json` | language and program settings |
| `mining.json` | mining address, target (solo/pool), devices |
| `wallet.json`, `kontakte.json` | encrypted wallet, contacts |
| `pool.json`, `pool-fenster.json` | own pool: settings, saved window |
| `protokoll.log` | log, at most 2 MB (`.alt` keeps the previous one) |

The blockchain is in the data folder, by default `%LOCALAPPDATA%\YSKAR\Node`.

Defaults: P2P port 8646, node API port 8645, seed `yskar-main.dynv6.net:8646`.

On the main network a second seed, `yskar-seed2.dynv6.net:8646`, is built in
and is used in addition to the configured one (`WEITERE_SEEDS` in
`src/main.ts`). It is a different machine on a different connection than the
default seed, so a new Node Core finds the network when one of the two is off.
If the seed field is left empty, no seed is used at all.
The second seed is built in since 0.5.1.

## Mining engines

| Backend | File | Engine |
|---|---|---|
| CPU | `src/LocalMiner.ts` | the same WASM engine as the Mini App and CLI miner, copied (never modified) into `dist/miner.wasm` at build time |
| GPU | `src/GpuMiner.ts` + `gpu/yskar_gpu.cu` | CUDA, separate process -- see `gpu/README.md` |

Without an NVIDIA GPU the node runs normally and shows GPU mining as
unavailable. In the installed program the GPU program is only taken from
the program's own folder.

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

`node-core\release\YSKAR-Node-Core-Setup-0.5.2.exe`

A release build on GitHub is described in
`.github/workflows/node-core-release.yml`: setting the branch
`node-core-release` to a commit builds the installer for the version in
`package.json` and attaches it to a **draft** release with the text from
`RELEASE_NOTES.md`. Publishing the draft by hand creates the tag
`node-core-vX.Y.Z`. The Android app stays the repository's "latest" release
(`.github/workflows/neueste-veroeffentlichung.yml`).

After publishing a new version, the download link and the version number
have to be updated in three places: the section "YSKAR Node Core" in
`website/index.html`, the Node Core guide in `website/anleitungen.html` and
the block "Download" in the repository's `README.md`. The same workflow warns if they still point to the old version.

## Tests

```
npm run build:gpu-emu   # once, for the GPU tests
npm test
```

The tests run the real application class on the test network: several nodes
over TCP, the built-in miners with the real engine, a pool with guests, the
wallet with real transfers.

**Not covered by tests:** the Electron shell (window, notification area,
start with Windows, installer) and a real graphics card. They can only be
checked on a Windows PC.

## Development

```powershell
npm install
npm run build
npm start
```
