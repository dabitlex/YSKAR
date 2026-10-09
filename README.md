# YSKAR

YSKAR is an independent proof-of-work blockchain with its own coin, YSR. Blocks are found with
double SHA-256, balances are kept in an account model, and transfers are signed with Ed25519.
Anyone can run a full node, and every full node checks every block itself.

The genesis block carries the inscription **proof, not promise**. It is the standard for
everything in this repository: nothing is simulated, and nothing is promised.

This repository contains the complete source code: the consensus rules, the full node, the pool
accounting, the wallet and mining apps, the miners, the explorer and the website.

## Download

| | | |
|---|---|---|
| **Android app** | YSKAR Wallet with mining | [Download the APK](https://github.com/dabitlex/YSKAR/releases/latest) |
| **Node Core for Windows** | Full node, wallet and mining in one program | [Installer 0.5.2](https://github.com/dabitlex/YSKAR/releases/download/node-core-v0.5.2/YSKAR-Node-Core-Setup-0.5.2.exe) · [Notes and checksum](https://github.com/dabitlex/YSKAR/releases/tag/node-core-v0.5.2) |
| **Telegram Mini App** | Nothing to install | [@YSKAR_bot](https://t.me/YSKAR_bot) |
| **Website** | Guides, whitepaper, explorer | [www.yskar.app](https://www.yskar.app) |
| **Telegram channel** | Releases and news | [@yskar_official](https://t.me/yskar_official) |
| **Community chat** | Questions and discussion | [Telegram group](https://t.me/+GxAmtTMeG1w1M2Yy) |

## At a glance

| | |
|---|---|
| Coin | YSKAR (YSR), 8 decimal places |
| Proof of work | `SHA-256(SHA-256(header))` over a 136-byte block header |
| Target block time | 600 seconds |
| Difficulty adjustment | Every block, LWMA over the last 45 blocks, with an emergency rule after 1,800 seconds without a block |
| Block reward | 875 YSR, halved every 12,000 blocks |
| Maximum supply | 21,000,000 YSR, enforced by every node |
| Ledger | Account model: one balance and one nonce per address |
| Signatures | Ed25519 |
| Addresses | bech32m, beginning with `ysr1` |
| Wallet | BIP39 seed words (12 or 24), SLIP-0010 derivation |
| Network | `yskar-main-1`; genesis block timestamp 2026-09-09T00:00:00Z |
| Node-to-node port | 8646 (TCP) |

The consensus parameters are constants in [`src/lib/core/params.ts`](src/lib/core/params.ts)
and [`src/lib/core/networks.ts`](src/lib/core/networks.ts). The full specification is
[docs/PROTOCOL.md](docs/PROTOCOL.md).

## How it works

### Proof of work

A block header is 136 bytes long. It contains the height, the hash of the previous block, a
Merkle root over the block's transactions, a Merkle root over all account balances after the
block (the state root), a timestamp, the difficulty, the transaction count, an extranonce and a
nonce.

A miner hashes the header twice with SHA-256 and reads the result as a number. The block is valid
only if that number is not larger than the target, and the target follows from the difficulty:
`target = floor(2^240 / difficulty)`. One unit of difficulty therefore stands for 65,536 expected
attempts. There is no shortcut. The only way to find a block is to try nonces, and anyone can
check the result with two hash computations.

The first 128 bytes of the header stay the same while a miner works on a job; only the nonce in
the last 8 bytes changes. Miners use this to precompute part of the hash once per job.

### Difficulty

The difficulty is recomputed for every block with a linearly weighted moving average (LWMA) over
the last 45 blocks. Recent blocks count more than older ones, a single block's time counts for at
most 3,600 seconds, and the result may move by at most a factor of 4 per block. If more than
1,800 seconds pass without a block, the required difficulty falls in proportion to the waiting
time, so the chain cannot get stuck after a sudden loss of hash power.

Every node computes the same range from the same blocks and rejects a block that states a
difficulty outside it. Timestamps must be later than the median of the last 11 blocks and at
most 120 seconds ahead of the node's clock.

### Blocks, rewards and supply

Every block contains exactly one coinbase transaction. It creates the block reward and collects
the fees of the transfers in the block. The reward starts at 875 YSR and is halved every
12,000 blocks, which is about 83 days at the target block time:

| Heights | Reward per block |
|---|---|
| 0 to 11,999 | 875 YSR |
| 12,000 to 23,999 | 437.5 YSR |
| 24,000 to 35,999 | 218.75 YSR |
| and so on | half of the previous era |

The sum of all rewards stays just below 21,000,000 YSR. The chain started with an empty state:
there is no other way to create coins than a block reward. The reward of the genesis block went
to the address that consists of zero bytes only, for which no key is known.

### Accounts and transfers

YSKAR does not use unspent outputs. The state is a table from address to balance and nonce. A
transfer names sender, recipient, amount, fee, the sender's next nonce, an optional expiry
height and an optional memo of up to 32 bytes, and it is signed with the sender's Ed25519 key.
The nonce makes every transfer usable exactly once, and the chain ID in the signed bytes ties it
to this network.

An address is the first 20 bytes of the SHA-256 hash of the public key, written in bech32m with
the prefix `ysr`. Keys are derived from BIP39 seed words along the path
`m/44'/9077'/account'/0'/index'`. The seed words stay on the device that created them.

The state root in every header commits to all balances. A node that replays the blocks from the
genesis block arrives at the same balances as every other node, or it rejects the block.

### Chain selection

The active chain is the valid chain with the most accumulated work, where the work of a block is
its difficulty. A full node stores competing blocks, validates each one against the state of its
own branch, and switches branches when another one has more work.

### Pools

From height 2,000 a coinbase may pay up to 64 recipients. Pools are built on this: the pool's
accounting (PPLNS, "pay per last N shares") becomes the coinbase of the block, and the chain
pays every participant directly in the block that was found. A pool operator never holds other
miners' coins. See [docs/POOL.md](docs/POOL.md).

### Consensus revisions

Rule changes are tied to block heights, so that every node switches at the same block.

| Revision | Applies from height | Change | Design record |
|---|---|---|---|
| 2 | 2,000 | Coinbase with several recipients | [CONSENSUS_V2.md](docs/CONSENSUS_V2.md) |
| 3 | 4,000 | Minimum fee per byte instead of a fixed fee, and a dust limit | [CONSENSUS_V3.md](docs/CONSENSUS_V3.md) |
| 4 | 6,000 | Wider encoding of the difficulty field in the header | [CONSENSUS_V4.md](docs/CONSENSUS_V4.md) |

## Components

**Full node (command line).** Stores the chain in a SQLite file, validates every block, keeps
the pool of pending transfers, exchanges blocks and transfers with other nodes, hands out work
to miners and can run a pool. Sources in `src/lib/node/`, build folder `node/`. See
[docs/FULLNODE.md](docs/FULLNODE.md) and [docs/P2P.md](docs/P2P.md).

**Node Core (Windows).** The same full node as a desktop program with a built-in wallet, CPU
and GPU mining and pool operation. No Node.js installation is needed. See
[node-core/README.md](node-core/README.md).

**YSKAR Wallet (Android).** Wallet and mining on the phone, with fingerprint unlock, mining in
the background, a home-screen widget and notifications. Distributed as an APK through GitHub
Releases. See [docs/APP.md](docs/APP.md).

**Telegram Mini App.** The same user interface inside Telegram. Ownership depends on the seed
words, not on the Telegram account. Sources in `src/app/` and `src/components/`.

**Explorer.** [www.yskar.app/explorer](https://www.yskar.app/explorer) shows blocks,
transactions and addresses. It rebuilds each header from its fields and recomputes the hash in
your browser. Source: `public/explorer.html`.

**Command-line miner.** A miner for the CPU, and with an extra program for NVIDIA graphics
cards. It needs only an address, never a key and has no dependencies to install. See [miner/README.md](miner/README.md).

**Observer.** Downloads the chain and recomputes every block without building any. See
[observer/README.md](observer/README.md).

**Website.** The static site at [www.yskar.app](https://www.yskar.app). See
[website/README.md](website/README.md).

**Mirror.** The server behind the app keeps a read copy of the chain in a database, so that the
explorer, balances and history load quickly. It validates every block it stores, but it is a
convenience, not the authority: the chain is what the full nodes agree on. See
[docs/OPERATIONS.md](docs/OPERATIONS.md).

## Run a full node

You need Node.js 22.13 or newer and Git.

```bash
git clone https://github.com/dabitlex/YSKAR.git
cd YSKAR/node
npm install
npm run build
node dist/yskar-node.cjs mine --data ./knoten --seed yskar-main.dynv6.net:8646 --seed yskar-seed2.dynv6.net:8646 --no-upstream
```

The node connects to the seed nodes, downloads the chain, checks every block and then
follows the network. `--data` names the folder for the chain data. `--no-upstream` belongs in
this command: without it the node would also send blocks to the mirror, which is the task of
the main node alone.

On Windows, type `npm.cmd` in place of `npm` in PowerShell.

Mine against your own node, with the miner in a second terminal:

```bash
cd YSKAR/miner
node src/cli.mjs --address ysr1... --api http://127.0.0.1:8645
```

Or mine in the public pool without running a node:

```bash
node src/cli.mjs --address ysr1... --api https://yskar-main.dynv6.net --mode pool
```

Replace `ysr1...` with your own address. All options are described in
[docs/FULLNODE.md](docs/FULLNODE.md) and [miner/README.md](miner/README.md).

## Repository layout

```text
src/lib/core/            consensus: header, difficulty, transactions, state, wallet derivation
src/lib/node/fullnode/   full node: chain, mempool, mining interface, read API, command line
src/lib/node/p2p/        node-to-node protocol
src/lib/pool/            PPLNS accounting and coinbase split
src/app/                 web app and server API (Next.js)
src/components/, src/hooks/   user interface of the app and the Mini App
src/i18n/, src/content/  texts of the app in ten languages
src/lib/native/          bridge to the Android app
android/                 Android app (Capacitor)
node/                    build of the command-line full node
node-core/               Node Core for Windows (Electron), including the GPU miner in gpu/
miner/                   command-line miner
observer/                observer
website/                 static website www.yskar.app
public/                  explorer, mining engine (WebAssembly), brand assets
wasm/                    source of the mining engine, WebAssembly text format
scripts/                 genesis block data, notification watcher
deploy/                  systemd units for a node on a server
supabase/migrations/     database changes of the mirror, as a record
tests/                   tests of consensus, node, P2P, pool and wallet
docs/                    documentation
```

## Build and test

```bash
npm install
npm test                 # consensus, node, P2P, pool, wallet
npx tsc --noEmit         # type check
npm run build            # web app
```

Node Core has its own tests:

```bash
cd node-core
npm run build:gpu-emu    # once: builds the stand-in for the GPU program (needs g++)
npm test
```

The tests need Node.js 22.13 or newer. The Android app and the Node Core installer are built by
the workflows in `.github/workflows/`.

## Documentation

| Document | Content |
|---|---|
| [docs/PROTOCOL.md](docs/PROTOCOL.md) | Protocol specification: formats, hashing, difficulty, transactions, validity rules, test vectors |
| [docs/CONSENSUS_V2.md](docs/CONSENSUS_V2.md), [V3](docs/CONSENSUS_V3.md), [V4](docs/CONSENSUS_V4.md) | Design records of the consensus revisions |
| [docs/FULLNODE.md](docs/FULLNODE.md) | The command-line full node: commands, options, HTTP interface, storage, reorganization |
| [docs/P2P.md](docs/P2P.md) | The protocol between nodes |
| [docs/FEES.md](docs/FEES.md) | Fee rules and the fee estimate |
| [docs/POOL.md](docs/POOL.md) | Pools: joining one, running one, how the accounting works |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | The public infrastructure: main node, HTTPS, mirror, environment variables |
| [docs/APP.md](docs/APP.md) | The Android app: build, signing, release, notifications, testing |
| [docs/SECURITY.md](docs/SECURITY.md) | Security model and known limits |
| [deploy/README.md](deploy/README.md) | Running a node as a service on a server |
| [node-core/README.md](node-core/README.md) | Node Core for Windows |
| [node-core/gpu/README.md](node-core/gpu/README.md) | The GPU miner of Node Core |
| [miner/README.md](miner/README.md) | The command-line miner |
| [observer/README.md](observer/README.md) | The observer |
| [website/README.md](website/README.md) | The website |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How changes are made and committed |
| [docs/history/](docs/history/) | Records of earlier stages of the project |

## Status and limits

Named plainly, so that nobody expects more than there is.

- **A young, small network.** The network has two seed nodes and one public pool, and all three
  are run by the same operator. Proof of work protects a chain only as long as no single party controls most of
  the hash power. [docs/SECURITY.md](docs/SECURITY.md) lists the known limits.
- **Node Core exists for Windows only.** On Linux and macOS the full node runs from the command
  line.
- **The Android app is distributed as an APK** through GitHub Releases. It is not in an app
  store. There is no iOS app.
- **No license has been chosen yet.** The source code is public and can be read and verified.
  Without a license file, the usual rights of the authors apply.

## No promises

YSR has no price and no market, and it is not listed on any exchange. Nothing here promises that
this will change, and nobody should mine in that expectation.
