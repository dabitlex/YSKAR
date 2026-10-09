# The command-line full node

This document describes the YSKAR command-line full node: how to build and start it, every
command and option, its HTTP interface, and how it stores the chain, selects the best chain and
handles reorganizations. It is written for people who run a node, mine against their own node or
want to understand what the node does with a block.

The node-to-node protocol is described in [P2P.md](P2P.md), the consensus rules in
[PROTOCOL.md](PROTOCOL.md).

## What a full node does

A full node keeps its own copy of the chain and checks every block itself. Nothing is taken on
trust, whether a block comes from another node, from a web server or from a miner connected to
the node itself.

For every block the node checks:

- the header and the proof of work (double SHA-256 of the 136-byte header against the target),
- the Merkle root over the transactions,
- every transfer: signature, sender address, nonce, balance, fee and expiry,
- the coinbase: its amount must equal the block reward plus the fees,
- the timestamp rules and the difficulty rule,
- from height 7,000 (consensus revision 5, [CONSENSUS_V5.md](CONSENSUS_V5.md)): a timestamp not
  before the parent's, the canonical encoding of the block and at most 1 MiB, coinbase version 1
  or 2 with at most 32 bytes of `extra`, and no version 2 coinbase output below 100 units,
- the state root: the node applies the block to its own account state and compares the result
  with the root in the header.

On top of that the node:

- stores all valid blocks, including blocks on side branches, in a local SQLite file; side
  blocks more than 2,000 blocks below the tip are deleted (see [P2P.md](P2P.md#side-branches-deep-below-the-tip)),
- makes the valid chain with the most cumulative work its active chain and switches branches
  when another one overtakes it (a reorganization, or reorg),
- exchanges blocks and transfers with other nodes over TCP port 8646 ([P2P.md](P2P.md)),
- keeps a mempool, the list of valid transfers that are not in a block yet,
- offers an HTTP interface on port 8645 for miners, wallets and explorers,
- builds mining jobs from its own chain tip, its own state and its own mempool,
- can run a pool ([POOL.md](POOL.md)).

The code is in `src/lib/node/fullnode/` and `src/lib/node/p2p/`. The consensus code it uses is in
`src/lib/core/`.

| File | Responsibility |
|---|---|
| `src/lib/node/fullnode/cli.ts` | Command line: commands, options, output |
| `src/lib/node/fullnode/ChainStore.ts` | SQLite store: blocks, block index, snapshots |
| `src/lib/node/fullnode/ChainManager.ts` | Accepting blocks, chain selection, reorgs, state |
| `src/lib/node/fullnode/ChainWork.ts` | Cumulative work and the tie rule |
| `src/lib/node/fullnode/TxPool.ts` | Mempool |
| `src/lib/node/fullnode/mempoolPflege.ts` | Mempool maintenance after each accepted block |
| `src/lib/node/fullnode/MiningCoordinator.ts` | Building jobs, checking submitted nonces |
| `src/lib/node/fullnode/jobVorlage.ts` | Job template: the session-independent part of a block, computed once per tip and mempool state |
| `src/lib/node/fullnode/kettenIndex.ts` | In-memory index of the active chain for `/account`, `/tx` and `/search` |
| `src/lib/node/fullnode/MiningServer.ts` | HTTP interface: sessions, jobs, shares, transfers |
| `src/lib/node/fullnode/ReadApi.ts` | HTTP read interface: blocks, accounts, search, fees |
| `src/lib/node/fullnode/NetzStatistik.ts` | Miner statistics reported by peers |
| `src/lib/node/fullnode/spiegelKopf.ts` | Request headers for forwarding blocks to the mirror |

Two related programs use the same code. Node Core (`node-core/`, see
[its README](../node-core/README.md)) is the desktop application built around this node. The
observer (`observer/`, see [its README](../observer/README.md)) only follows one chain and stores
blocks by height; it cannot represent a fork.

## Requirements

- **Node.js 22.13 or newer.** The node stores the chain with `node:sqlite`, the SQLite module built
  into Node.js. That module was added in Node.js 22.5.0 and works without a command-line flag
  from 22.13.0, so use a current 22.x release or newer. Because the module is built in, the node
  needs no native add-on and nothing has to be compiled on the target machine.
- **npm**, to install the build dependencies.
- **TCP port 8646** for other nodes. The node listens on all network interfaces. Your node works
  without inbound connections; open or forward the port only if other nodes should be able to
  reach yours.
- **A correct system clock.** A block whose timestamp is more than 120 seconds ahead of the
  node's clock is rejected.

## Build

```bash
cd node
npm install
npm run build
```

The build writes one file, `node/dist/yskar-node.cjs`. `node/build.mjs` bundles the TypeScript
sources with esbuild into a CommonJS file for Node.js 22; `node:sqlite` is left out of the bundle
because it is part of Node.js.

The `node/` folder is self-contained. It has its own `package.json` with the four libraries the
node needs (`@noble/curves`, `@noble/hashes`, `@scure/base`, `@scure/bip39`) and esbuild as build
tool. You do not need to run `npm install` in the repository root. If a dependency is missing,
the build script says which one and stops.

In Windows PowerShell, use `npm.cmd` instead of `npm` if the script execution policy blocks `npm`.

For development you can run the sources without building:

```bash
cd node
npm start -- status --data ./knoten
```

`npm start` runs `node --experimental-strip-types ../src/lib/node/fullnode/cli.ts`.

## Quick start

All commands in this document are run inside the `node/` folder.

```bash
node dist/yskar-node.cjs mine --data ./knoten --seed yskar-main.dynv6.net:8646 --seed yskar-seed2.dynv6.net:8646 --no-upstream
```

| Part | Meaning |
|---|---|
| `mine` | Run the node with its HTTP interface and the node network |
| `--data ./knoten` | Data directory. `knoten` is German for "node"; it is also the default |
| `--seed ...` | A known node to connect to first. The main network has two seed nodes; give both |
| `--no-upstream` | Do not send blocks to the project's web server and do not fetch blocks from it. See [Upstream and the mirror](#upstream-and-the-mirror) |

The command-line node has no seed built in. Without `--seed` it knows no other node.

On the first start the node:

1. creates `./knoten/chain.db` and records the network name and the chain ID in it,
2. opens the P2P listener on `0.0.0.0:8646` and starts connecting to the seeds,
3. opens the HTTP interface on `127.0.0.1:8645`,
4. prints its configuration,
5. downloads the chain from the first peer that has more work, and validates and stores every
   block.

The output is in German. On the first start it looks like this:

```text
YSKAR Full Node 0.1.0  Mining
────────────────────────────────────────────────────────
  Netz     yskar-main-1
  Ablage   ./knoten/chain.db
  Kette    —
  Lauscht  http://127.0.0.1:8645
  Blöcke   bleiben lokal
  Sync     aus
  Pool     aus (nur Solo-Mining)
  Knoten   lauscht auf 8646, 2 Seeds
────────────────────────────────────────────────────────

  Miner verbinden mit:
    yskar-miner --address ysr1… --api http://127.0.0.1:8645
```

| Line | Meaning |
|---|---|
| `Netz` | Network name |
| `Ablage` | Path of the store |
| `Kette` | Height of the local chain; `—` while the store is empty |
| `Lauscht` | Address of the HTTP interface |
| `Blöcke` | Where accepted blocks are forwarded over HTTP. `bleiben lokal` ("stay local") means no upstream is set. Blocks still go to other nodes over P2P |
| `Sync` | HTTP polling of `--api`: `aus` (off) or every 30 s |
| `Pool` | Pool name, fee and seats, or `aus (nur Solo-Mining)` (off, solo mining only) |
| `Knoten` | Node network: listening port and number of seeds, `nur ausgehend` (outbound only) or `aus` (off) |

After that the node reports events as they happen:

| Line | Meaning |
|---|---|
| `lauscht auf 0.0.0.0:8646` | The P2P listener is open. This line is printed before the configuration |
| `Peer <host> · Höhe <n>` | The handshake with a peer is complete; `<n>` is the peer's height |
| `<host> hat mehr Arbeit (...)` | The peer's chain has more work; the node asks it for headers |
| `<n> neue Header von <host>` | New headers arrived; the node requests the blocks |
| `Block #<n> von <host> <hash>…` | A block from the network was validated and stored |
| `Reorg auf Höhe <n>` | The node switched to another branch. Printed only for blocks fetched over HTTP from `--api` |
| `BLOCK GEFUNDEN  #<n>` | A miner connected to this node found a block |
| `Peer <host> weg: <reason>` | A connection was closed |
| `<host:port> nicht erreichbar: <reason>` | An outbound connection attempt failed |

In a terminal the last line is a status line that is refreshed every second:

```text
[12:00:00] Kette 3.310 · baut an 3.311 · Diff — · 0 Miner · Mempool 0 · 2 Peers
```

It shows the height of the active chain (`Kette`), the height of the block the node is building
jobs for (`baut an`), the difficulty of the most recent job (`Diff`, `—` until a job was built),
the number of mining sessions (`Miner`), the number of pending transfers (`Mempool`) and the
number of connected peers. Numbers are printed in German format, with a point as thousands
separator.

Stop the node with Ctrl+C. It closes its connections, prints the status of the chain and closes
the store. `SIGTERM` does the same.

Start a miner only after the node has caught up. The node builds jobs on its own chain tip, and
work on an old tip is lost.

## Commands

```text
node dist/yskar-node.cjs <command> [options]
```

The command must be the first argument. If the first argument is an option or is missing, the
command is `sync`.

| Command | What it does |
|---|---|
| `sync` | Downloads blocks over HTTP from `--api`, validates and stores them. Repeats every `--interval` seconds until you stop it; with `--once` it exits when it has caught up. No P2P, no HTTP interface |
| `mine` | Runs the full node: HTTP interface for miners and wallets, mempool, node network, optional pool |
| `spiegel` | Pushes blocks that the mirror is missing to the mirror, one by one. For the main node only; see [Upstream and the mirror](#upstream-and-the-mirror) |
| `status` | Prints the state of the local store: network, height, best block hash, chain work, difficulty, number of stored blocks, number of branch tips, state root, supply, age of the last block |
| `chain` | Prints the last 15 blocks of the active chain with hash and difficulty, and marks heights that have blocks on other branches |
| `tips` | Prints every known branch tip with height, hash and chain work; the active one is marked `aktiv` |

`status`, `chain` and `tips` do not change the chain. The store runs in SQLite's write-ahead-log
mode, so you can run them while a node is running on the same data directory. If the data
directory does not exist yet, they create an empty store.

`spiegel` is German for "mirror".

### `sync`

`sync` asks `<api>/api/v2/sync?from=<height>&count=200` for raw blocks, 200 at a time, and passes
each one through the same validation as any other block. `--api` can be any server that offers
this route: the web server at `https://yskar.vercel.app`, which answers from the mirror, or the
HTTP interface of another full node.

If the source follows a different branch that forks at or below the node's own tip, its next
block does not connect to anything the node has. The node then asks for earlier heights, 1, 2, 4,
… blocks further back, until the source delivers a block whose predecessor it knows, and
validates the source's branch from there. If that branch has more work, the node reorganizes to
it, as with blocks from peers. `mine` does the same in its 30-second sync and rebuilds its jobs
whenever the tip changes, also on a reorganization at the same height. Before 9 October 2026 the
node stopped at that point (issue #11).

If the source delivers a block that fails validation, the node prints `BLOCK ABGELEHNT` ("block
rejected") with the height and the reason, keeps what it has validated so far and exits with
code 2. A source on a chain with a different genesis block is rejected the same way.

`sync` does not connect to other nodes. To follow the network continuously, use `mine`.

### `mine`

`mine` starts everything: the store, the mempool, the HTTP interface, the node network and, if
you name one, the pool. The node is a complete participant even if no miner ever connects to it,
and miners keep working if the node has no peers.

What `mine` does with other servers depends on the upstream setting:

| | With an upstream (the default on the main network) | With `--no-upstream` |
|---|---|---|
| At start | Fetches missing blocks from `--api` over HTTP once | Nothing |
| Every 30 s | Fetches new blocks from `--api` over HTTP | Nothing |
| Each block accepted from a miner or from another node | POSTs it to `<upstream>/api/v2/block` | Nothing |
| Node network | Active | Active |

### Options

Options are written as `--name value` or `--name=value`. Options the node does not know are
ignored without a message.

| Option | Default | Used by | Meaning |
|---|---|---|---|
| `-d`, `--data <dir>` | `./knoten` | all | Data directory. The store is `<dir>/chain.db` |
| `--api <url>` | `https://yskar.vercel.app` | `sync`, `mine`, `spiegel` | HTTP source of blocks; also the default upstream |
| `--interval <seconds>` | `60` | `sync` | Pause between two polls |
| `--once` | off | `sync` | Catch up once and exit |
| `--bind <address>` | `127.0.0.1` | `mine` | Address the HTTP interface listens on |
| `--port <number>` | `8645` | `mine` | Port of the HTTP interface |
| `--regtest` | off | all | Use the regtest network instead of the main network |
| `--upstream <url>` | value of `--api`; none with `--regtest` | `mine`, `spiegel` | Server that receives accepted blocks |
| `--no-upstream` | off | `mine` | No forwarding and no HTTP fetching |
| `--p2p-port <number>` | `8646` | `mine` | Port for inbound node connections. `0` means outbound connections only |
| `--seed <host:port>` | none | `mine` | A known node. Can be given several times |
| `--no-p2p` | off | `mine` | Run without the node network |
| `--pool <name>` | none | `mine` | Run a pool with this name |
| `--pool-fee <bp>` | `0` | `mine` | Pool fee in basis points, 0 to 500 (100 = 1.00 %) |
| `--pool-payout <address>` | none | `mine` | Address that receives the pool fee. Required when the fee is above 0 |
| `--pool-max <n>` | chain limit | `mine` | Highest number of addresses in the pool, 1 to 64. The chain limit is 64, or 63 when a fee is set |
| `--sender-ip <proxy\|socket>` | none | `mine` | Recognize the sender of mining requests and apply the per-sender session limits. `proxy`: the last entry of `X-Forwarded-For`, for a node behind a reverse proxy that sets this header itself (Caddy does). `socket`: the address of the connection, only for a node without a proxy in front. Without this option there are no per-sender limits |
| `-h`, `--help` | | | Print the help text and exit |

Notes:

- `--bind` with anything other than `127.0.0.1` makes the HTTP interface reachable from other
  machines. The node prints a warning, because this interface accepts work and builds blocks.
- The P2P listener always binds to `0.0.0.0`. There is no option for a different address.
- A `--seed` value that is not of the form `host:port` stops the node with an error.
- The pool name is written into the coinbase of every pool block. It must be 3 to 32 printable
  ASCII characters and contain at least one letter or digit.

### Environment variables

| Variable | Meaning |
|---|---|
| `YSKAR_SPIEGEL_TOKEN` | If set, the node sends it as `Authorization: Bearer <token>` when it POSTs blocks to the upstream. Only the main node needs it; see [OPERATIONS.md](OPERATIONS.md) |
| `NO_COLOR` | If set, the output has no colors |

### Exit codes

| Code | When |
|---|---|
| 0 | Normal end, including Ctrl+C |
| 1 | The store cannot be used, an unknown command, invalid options, an unreachable mirror in `spiegel`, or an unexpected error |
| 2 | `sync` received a block that failed validation |

## The HTTP interface

`mine` opens an HTTP server on `127.0.0.1:8645`. Requests and answers are JSON. Every path works
with and without the prefix `/api/v2`, so `/api/v2/job` and `/job` are the same route.

The server sends no CORS headers and speaks plain HTTP. A web page from another origin cannot
call it directly, and it is not meant to be exposed to the internet as it is. How the public
node is put behind HTTPS is described in [OPERATIONS.md](OPERATIONS.md).

Amounts are integers in base units (1 YSR = 100,000,000 units) and are sent as decimal strings.

### Mining

| Method and path | Request | Purpose |
|---|---|---|
| `POST /session` | `{address, mode?, platform?}` | Opens a mining session for a payout address. `mode` is `"solo"` (default) or `"pool"`. Returns `sessionId`, `extranonce`, `mode`, `pool`, `shareDifficulty`, `address`, `concurrentSessions` |
| `GET /job?session=<id>` | | Builds a new job for the session |
| `POST /share` | `{sessionId, jobId, nonce}` | Submits a nonce for the session's current job |
| `POST /session/stop` | `{sessionId}` | Closes the session |
| `GET /pool` | optional `?address=<ysr1…>` | Pool name, fee, seats and work. With `address` the answer says whether that address already holds a seat (`dabei`). Answers 404 `pool_unavailable` if the node runs no pool |

**Sessions.** A session binds a payout address to an extranonce. The extranonce is a 64-bit
number in the block header that is unique per session, so two miners search different nonce
spaces and cannot find the same hash. Sessions live in memory. A session ends after 300 seconds
without a job or share request, and all sessions end when the node restarts. The node keeps at
most 5,000 sessions; when the table is full, a new session replaces the oldest session that has
never delivered a share, and only if every session has delivered shares is the new one refused
with `too_many_sessions`. The mode is fixed when the session is opened. A node without a pool rejects
`mode: "pool"` with `pool_unavailable` instead of silently treating the session as solo. A full
pool answers a new address with `pool_full` and HTTP status 409; the native miner of the Android
app gets the same answer with status 200.

**Jobs.** Every `GET /job` builds a block template for that session: the coinbase pays the
session's address (solo) or the pool's current split (pool), and the node selects transfers from
its mempool. The part that does not depend on the session (the selection of transfers, the
account state after them and the Merkle tree over that state) is computed once per chain tip and
mempool state; each job then only adds its coinbase (`jobVorlage.ts`). The first job of each kind
from a new template is also built the full way and compared byte for byte; on any difference
the node switches back to the full build until it restarts and logs the error. The answer contains `jobId`, `height`, `version`, `prevHash`, `merkleRoot`,
`stateRoot`, `timestamp`, `difficulty`, `difficultyWert`, `txCount`, `extranonce`, `target` and
`shareDifficulty`. The miner assembles the 136-byte header from these fields and varies only the
nonce.

- `difficulty` is the raw 4-byte difficulty field as it stands in the header. `difficultyWert`
  (German "Wert" = value) is the real difficulty as a decimal string. Below 2^31 the two are the
  same number; from height 6,000 larger values use a different encoding of the field, see
  [CONSENSUS_V4.md](CONSENSUS_V4.md).
- `target` is the **share target**, not the block target. A share is a hash that meets this
  easier target. Shares show that a miner is working, and in a pool they measure its work.

A job is valid for 90,000 ms. It also becomes invalid as soon as the chain tip changes. Only the
job a session fetched most recently is accepted.

**Share target.** A new session starts with share difficulty 128; the share target is
`floor(2^240 / shareDifficulty)`. The target belongs to the **job**: it is fixed when the job is
handed out, every hash submitted for that job is checked against it and credited with it, and
`shareDifficulty` in a share answer is the target of the running job. The node aims at one share
every 30 seconds per session. After each accepted share it stores a sample in seconds per unit of
difficulty: the time since the last share, each stretch divided by the share difficulty that was
in force during it (the target can change between two shares when a new job is fetched). It keeps
the last 8 samples. With at least 3 samples the share difficulty for the next job is `30 / mean of
the samples`. A change by a factor between 0.7 and 1.4 is ignored, and one step is limited to a
factor between 0.25 and 4. The share difficulty never exceeds the job's block difficulty divided
by 8 (but this limit is never below 128). A raise by a factor of 4 or more ends the running job
early: the next hash submitted for it gets `job_expired`. The next job of the session then has a
different `jobId`, if necessary with a timestamp one second later. The average over several
samples matters: the gaps between shares are random, and a rule that reacts to every single gap
makes the target swing instead of settling.

**Shares.** The miner sends only the nonce. The node computes the hash itself from the block it
kept for the job; a miner's claim about the difficulty it reached is never used.

- If the hash meets the block target, the node passes the finished block through the same full
  validation as a block from a stranger, stores it, updates the mempool, discards all open jobs,
  announces the block to its peers and, if an upstream is set, forwards it. The answer has
  `accepted: true, block: true` with `height`, `hash` and `reward`.
- If the hash meets only the share target, the answer has `accepted: true, block: false`. In a
  pool session the share is credited with the share difficulty of its job.
- Otherwise the answer has `accepted: false` and a `reason`.

| `reason` | Meaning |
|---|---|
| `session_inactive` | Unknown or expired session; open a new one |
| `job_foreign` | The job is not the session's current job |
| `duplicate` | This nonce was already credited for this job |
| `job_expired` | The job is older than 90 s, the session already has 10,000 credited nonces for it, or the node ended it early to raise the share target; fetch a new job |
| `job_unknown` | The node discarded the job, for example after a new block |
| `stale_job` | The chain tip changed since the job was built |
| `low_difficulty` | The hash does not meet the share target |
| `malformed` | The nonce is not an integer between 0 and 2^64 − 1 |

If a finished block fails the node's own validation, `reason` carries the validation error.

### Transfers

| Method and path | Request | Purpose |
|---|---|---|
| `POST /tx` | `{raw}` | Submits a signed transfer as hex. The node checks it against its mempool rules and, if it accepts it, announces it to its peers. Answers `{accepted: true, txid, replaced}` or `{accepted: false, reason, detail}` |

The reasons are listed under [The mempool](#the-mempool).

### Reading the chain

| Method and path | Purpose |
|---|---|
| `GET /status` | Node status: `network`, `height`, `bestBlock`, `chainWork`, `difficulty`, `difficultyWert`, `blocksStored`, `tips`, `mempool`, `sessions`, `openJobs` |
| `GET /summary` | Key figures of the chain: height, difficulty, hashrate, tip hash, state root, supply, next block reward, mempool size, miners |
| `GET /blocks?limit=<n>&before=<height>` | Recent blocks of the active chain, newest first. `limit` defaults to 25 and is at most 100 |
| `GET /blocks/<height>` | One block of the active chain with header, chain work and all transactions |
| `GET /tx/<txid>` | A transaction, `confirmed` or `pending`. Confirmed transactions are searched in the tip and the 5,000 blocks below it |
| `GET /account/<address>` | Balance, nonce, `nextNonce`, pending transfers and up to 40 history entries. `blocksFound` and `poolRewards` are counted over the same range of blocks; `historyDepth` says how many blocks were searched |
| `GET /search?q=<text>` | Classifies an address, a height, a block hash or a transaction ID |
| `GET /fees?fee=<amount>` | Fee estimate from the mempool; see [FEES.md](FEES.md) |
| `GET /sync?from=<height>&count=<n>` | Raw blocks of the active chain as hex, at most 200 per call. This is what the `sync` command and the observer read |

In `/summary`, `hashrate` is computed from the chain itself: the sum of the difficulties of the
last 24 blocks times 65,536, divided by the time those blocks took. While the tip is below
height 3, the field falls back to the reported figure. `minerHashrate`, `activeMiners`,
`miningSessions` and `knoten` (German for "nodes") are reported figures; see
[Miner statistics](P2P.md#miner-statistics-stats).

`/account`, `/tx` and `/search` use an index of the active chain kept in memory
(`kettenIndex.ts`): which block holds a transaction, and in which blocks an address appears. The
node builds it when the mining interface starts and updates it before each of these requests; when
the top of the index no longer matches the active chain (new block or reorg), it removes blocks
from the top until it matches and adds the new ones. The answers are the same as without the
index, including the range of 5,000 blocks. In `/summary`, `stateRoot` is the state root from the
header of the tip block, which the node checked when it accepted the block; supply and the
hashrate from the chain are computed once per tip.

### Limits and errors

| Limit | Value |
|---|---|
| Request body | 64 KB |
| Open sessions | 5,000 (a full table replaces the oldest session without a share) |
| Sessions without a share per sender | 32 (only with `--sender-ip`) |
| Session timeout | 300 s |
| Job lifetime | 90,000 ms |
| Credited nonces per session and job | 10,000 |
| `platform` text in a session | 64 characters |

| HTTP status | Body | When |
|---|---|---|
| 400 | `bad_request` | Unreadable URL, body too large, body is not a JSON object |
| 400 | `bad_address` | Invalid address in `/account` or `/pool` |
| 404 | `not_found` | Unknown route, block or transaction |
| 404 | `pool_unavailable` | `GET /pool` on a node without a pool |
| 409 | `pool_full` | New address for a full pool |
| 500 | `internal` | An error inside the node. The answer names the request (`where`) but not the error text; the node prints the error in its own log |

`POST /session`, `GET /job`, `POST /share` and `POST /tx` report refusals with HTTP status 200
and an `error` or `reason` field in the body.

## Mining against your own node

Start the node and let it catch up. Then start the command-line miner in a second terminal and
point it at the node:

```bash
cd ../miner
node src/cli.mjs --address ysr1... --api http://127.0.0.1:8645
```

Replace `ysr1...` with your address. The miner needs only the address, never a private key. Pass
`--api` explicitly: the miner's built-in default, `https://yskar.vercel.app`, no longer issues
mining jobs. The miner is described in [its README](../miner/README.md).

In this setup the miner works solo. The node builds every job itself and puts a coinbase to your
address into it. When the miner finds a block, the node validates it, adds it to its chain and
announces it to the other nodes. The block reward and the fees of that block go to your address.

If the node runs a pool, add `--mode pool` to the miner command to mine in that pool.

### Why the block body stays with the job

The node keeps the complete block for every job it hands out and does not rebuild it from the
mempool when a nonce comes back. Between handing out the job and finding the nonce the mempool
changes. The Merkle root and the state root in the header commit to exactly the transfers that
were selected when the job was built. If the block differed by one transfer, the header would be
a different one and the work done on it would be worthless.

## Storage

All data is in one SQLite file, `<data>/chain.db`. While the node runs, SQLite keeps recent
writes in `chain.db-wal` next to it. Stop the node before you copy or back up the data directory.

| Table | Content |
|---|---|
| `meta` | Network name, chain ID and store format version |
| `blocks` | Every valid block: hash, height, parent hash, cumulative work, difficulty, timestamp, Merkle root, state root, transaction count, the raw block, and whether it is on the active chain |
| `snapshots` | Saved account states of the active chain |

**Several blocks per height.** A store that files blocks by height cannot represent a fork. A
full node has to hold two blocks at the same height, find all blocks with a given parent, and
find the tip with the most work. That is why the store is a database with an index and not a
folder of files.

**Chain work as bytes.** The cumulative work is stored as 32 bytes, big-endian, so SQLite can
sort by it directly. Stored as decimal text the order would be wrong, because as text `9` sorts
after `10`.

**Pinned to one chain.** The first start writes the network name and the chain ID into the
store. A store created for `yskar-main-1` refuses to open for another network. Blocks of two
chains can never end up in the same file.

**Not stored.** The mempool, mining sessions, the pool's share log and the address book of known
nodes live in memory. After a restart the mempool is empty, miners open new sessions, and the
node starts again from its seeds.

### State snapshots

The state is the map from address to balance and nonce. The node keeps the state of the active
tip in memory. Every 200 blocks on the active chain it saves the complete state as a snapshot.
Without snapshots the node would have to replay the whole chain after every restart and every
reorg.

A snapshot is a shortcut, not a proof. When the node loads one, it recomputes the state root
from the snapshot's content and compares it with the stored root. If they differ, the node
ignores the snapshot and replays from block 0. After replaying up to the tip, the result must
match the state root in the tip's header; otherwise the node refuses to start with that store.

Snapshots are also the starting point when the node needs the state of a block that is not the
active tip (see [Reorganization](#reorganization)). There the snapshot's root must match the
state root in the header of the block it belongs to, a value the node verified itself when it
accepted that block. A snapshot that does not match is ignored and the node replays from block 0.

Snapshots above a fork point are deleted when the node switches branches. They belong to a
branch that is no longer active.

## Chain work and chain selection

The node chooses between competing chains by cumulative work, not by height. A longer chain of
easy blocks contains less work than a shorter chain of hard blocks. A node that decided by
height could be overtaken with cheap blocks.

```text
target    = floor(2^240 / difficulty)
blockWork = difficulty
chainWork = chainWork(parent) + blockWork
```

The expected number of hashes for one block is `2^256 / target`, which is proportional to the
difficulty. The difficulty already is the linear measure of work. Going through the target would
add a division and a multiplication that cancel out, and would introduce rounding.

All of this is computed with integers of unlimited size (`BigInt`). With floating-point numbers
two nodes could arrive at different sums for the same chain and disagree permanently.

### Ties

If two tips have exactly the same cumulative work, the tip with the smaller block hash wins. The
hashes are compared byte by byte from the first byte.

"First seen" would be the obvious rule, but it is not deterministic: two nodes see the same
blocks in different order and would stay on different chains. The hash is a value every node
computes independently and that is the same for everyone.

## Reorganization

A side-branch block is validated against the state of **its own branch**, not against the
active tip. The node walks from the block's parent back to the first block that is on the
active chain, takes the state of the active chain at that point (the latest snapshot at or
below it, plus the blocks after the snapshot), applies the blocks of the branch and validates
the new block against the result. This is slower than validating on the active tip, and it is
rare. The node keeps the state after the last side-branch block it accepted, so a branch that
arrives block by block is not recomputed for every block.

The time and difficulty rules read only the most recent blocks before the new one: the time
rule the last 11 timestamps, the difficulty rule the solve times of the last 45 blocks. The
node reads only those blocks, along the block's own branch, and not the whole chain. Both rules are checked before the state of a side branch is computed, so a block with a
wrong timestamp or difficulty is rejected before that work is done.

After a valid block is stored, the node selects the best chain:

1. Find the valid block with the most cumulative work, using the tie rule.
2. If that block is the current tip, nothing changes.
3. Walk from the new tip back to the first block that is already on the active chain. The
   height below that path is the fork point.
4. In one database transaction: remove every block above the fork point from the active chain,
   mark the blocks of the new path as active, and delete the snapshots above the fork point.
5. Rebuild the state from the latest valid snapshot on the active chain.
6. Check the resulting state root against the root in the new tip's header.
7. Report which blocks became active and which were displaced, so the mempool can be updated.

No block is deleted. The old branch stays in the store completely and can win again later if it
gains more work. There is no depth limit for a reorg and there are no checkpoints.

When a block simply extends the active chain, nothing is displaced and nothing has to be
rebuilt: the node marks the block as active and keeps the state it computed while validating
the block, whose root it has just compared with the root in the block's header. On a snapshot
height it saves that state as a snapshot. The node reports a reorg only when the new tip's
parent is not the old tip.

## The mempool

The mempool holds valid transfers that are not in a block yet. It is in memory only.

The mempool is an attack surface, and that shapes its rules. It accepts data from strangers
before that data is in a block, keeps it in memory and passes it on. Without limits a node could
be filled with worthless transfers, and passing on something unchecked would spread an attack on
the attacker's behalf. So the order is: check, then keep, then announce.

A transfer is checked against the state of the active tip and the height of the next block. The
checks run from cheap to expensive, and the signature comes last. A signature check costs far
more than a map lookup; a node that checked signatures first would let anyone keep it busy with
garbage.

| Order | Check | `reason` if it fails |
|---|---|---|
| 1 | Not already in the mempool | `duplicate` |
| 2 | Fee at least the node's relay minimum (see [FEES.md](FEES.md)) | `fee_too_low` |
| 3 | Amount above zero | `malformed` |
| 4 | Not expired (`validUntil`) | `expired` |
| 5 | The sender account exists | `unknown_account` |
| 6 | Nonce not below the account's nonce | `nonce_too_low` |
| 7 | Same sender and nonce already pending: the fee must be at least the old fee plus the relay minimum, then the new transfer replaces the old one | `fee_not_higher` |
| 8 | Otherwise: the nonce continues the sender's pending transfers without a gap | `nonce_gap` |
| 9 | At most 32 pending transfers per sender | `sender_limit` |
| 10 | At most 5,000 transfers in the mempool | `pool_full` |
| 11 | The balance covers the amounts and fees of all the sender's pending transfers plus this one | `insufficient_funds` |
| 12 | The consensus checks of a transfer, including the signature | `bad_signature`, `expired`, `fee_too_low` or `malformed` |

A full mempool rejects new transfers regardless of their fee. It does not evict cheaper ones.

After every accepted block, whether it came from a miner at this node, from another node or from
the HTTP source, the node updates the mempool in this order:

1. Transfers from displaced blocks go back into the mempool. They are checked again in full; if
   the new branch contains the same transfer, its nonce is already used and the check rejects it.
2. Transfers that are now in the chain are removed, and so is every pending transfer whose nonce
   is too low or whose amount is no longer covered.
3. Transfers that have waited longer than 3,600 seconds are dropped.

**Block templates.** For a job the node picks at most 1,999 transfers; the remaining slot of the
2,000 per block belongs to the coinbase. Transfers of one sender must be included in nonce
order. The node therefore selects greedily: in each step it takes, among the next due transfer
of every sender, the one with the highest fee.

## Upstream and the mirror

The mirror (German "Spiegel") is a database copy of the chain behind the web server at
`https://yskar.vercel.app`. That server's read routes for blocks, accounts and transactions
answer from it. The mirror is filled through one route, `POST /api/v2/block`, which validates
each block again before it stores it.

Three options control how a node deals with that server:

| Option | Effect |
|---|---|
| `--api <url>` | The server blocks are fetched from over HTTP: by `sync`, and by `mine` at start and every 30 seconds while an upstream is set. Also the default value of the upstream |
| `--upstream <url>` | The server that receives every block the node accepts from a miner at this node or from another node. The node POSTs `{raw}` to `<url>/api/v2/block`. Blocks fetched over HTTP from `--api` are not sent on |
| `--no-upstream` | No upstream. The node neither forwards blocks nor fetches blocks from `--api`. It talks to the network only through other nodes |

Forwarding runs in the background. A miner gets its answer at once and does not wait for the
upstream. The node prints the result: `weitergegeben, dort als Höhe <n> angenommen` (forwarded,
accepted there as height n) or `nicht weitergegeben: <reason>` (not forwarded). A refusal does
not change the local chain.

### Only the main node writes to the mirror

Start every node that is not the main node with `--no-upstream` and with both seeds. There are
three reasons:

- The mirror is strictly linear. It accepts only the block that follows its current tip and
  cannot switch branches. It answers `stale`, `height_gap` or `wrong_parent` to anything else.
  If a second node pushed a block that later loses a fork, the mirror would sit on the losing
  branch and refuse every following block.
- Without `--no-upstream` a node forwards every block it accepts from other nodes, including
  the blocks it downloads from them during its first sync. For any node but the main node this
  only creates load on the web server.
- The web server can require a token (`YSKAR_SPIEGEL_TOKEN`). It then answers 401 to blocks
  from nodes that do not have the token.

A node started with `--no-upstream` loses nothing. Its blocks reach the network through the
other nodes, and the main node passes them on to the mirror.

### `spiegel`

`spiegel` repairs a mirror that has fallen behind. It reads the mirror's height from
`<target>/api/v2/blocks?limit=1`, compares it with the local chain and POSTs each missing block
in order. The target is `--upstream` if given, otherwise `--api`. Because the mirror accepts
only the next block, the command stops at the first block the mirror refuses and names it.

The main node's configuration, the token and the timer that runs `spiegel` regularly are
described in [OPERATIONS.md](OPERATIONS.md).

## Running a pool

With `--pool <name>` the node accepts mining sessions in pool mode and pays all participants
directly in the coinbase of every block the pool finds, so the operator never holds other
people's coins. [POOL.md](POOL.md) explains how the split is calculated and how to run or join a
pool.

## The regtest network

Regtest is a private network for experiments. It has its own network name (`yskar-regtest`) and
its own chain ID, so its blocks and signatures are invalid on the main network and the two can
never connect. The minimum difficulty and the difficulty of the first blocks are 1, which means
about one hash in 65,536 is a block. Consensus revisions 2 and 3 apply from height 0.

```bash
node dist/yskar-node.cjs mine --regtest --data ./testnetz
```

In a second terminal:

```bash
cd ../miner
node src/cli.mjs --address ysr1... --api http://127.0.0.1:8645
```

The store starts empty. The first block a miner finds is the genesis block of your private
chain. Mining is real: the same header, the same hash function, the same validation and the same
difficulty rule as on the main network. Only the starting difficulty is lower. If blocks come
much faster than one per 600 seconds, the difficulty rises, by at most a factor of 4 per block.

A regtest node has no upstream unless you set one with `--upstream`.

To watch blocks travel and forks resolve, run two regtest nodes on one machine:

```bash
node dist/yskar-node.cjs mine --regtest --data ./testnetz-a --port 8645 --p2p-port 8646
node dist/yskar-node.cjs mine --regtest --data ./testnetz-b --port 8655 --p2p-port 8656 --seed 127.0.0.1:8646
```

Notes:

- Use a separate data directory for regtest and pass `--regtest` to every command that opens it,
  including `status`, `chain` and `tips`. Otherwise the node stops because the store belongs to
  another network.
- `status` and the header of `sync` always print the network name `yskar-main-1`, also for a
  regtest store.
- `/fees` evaluates pending transfers with main-network parameters. On regtest its projection
  (`bloecke`) stays empty.

## Running the node as a service

On a server the node should start at boot and restart after a failure. The folder `deploy/`
contains systemd unit files for that; [deploy/README.md](../deploy/README.md) describes how to
install them.

The node shuts down cleanly on `SIGINT` and `SIGTERM`: it closes the store before it exits.

## Troubleshooting

| What you see | Cause and remedy |
|---|---|
| `Diese Ablage gehoert zu network=..., erwartet wird ...` and exit code 1 | The data directory belongs to another network or has an older store format. Check `--data` and whether `--regtest` is set or missing |
| `Die lokale Ablage ist nicht verwendbar` and exit code 1 | The store could not be replayed: a block is missing on the active chain, a block cannot be applied, or the state root does not match. Remove the data directory and sync again |
| `BLOCK ABGELEHNT` and exit code 2 in `sync` | The HTTP source delivered a block that fails validation. The node names the height and the reason and keeps what it validated before |
| `Unbekannter Befehl: ...` and exit code 1 | The first argument is not a command |
| `Seed "..." muss host:port sein` | A `--seed` value has no port |
| `Knotennetz konnte nicht starten: ...` | The P2P listener could not open, usually because the port is in use. The node keeps running without the node network. Free the port or choose another with `--p2p-port` |
| The node exits with `EADDRINUSE` | The HTTP port is in use. Choose another with `--port` |
| `<host:port> nicht erreichbar: ...` | A seed or another node cannot be reached. The node retries with growing pauses |
| `<host:port> ist die eigene Adresse -- aus dem Buch genommen` | The node tried to connect to itself and removed that address from its address book. This is harmless |
| `nicht weitergegeben: ...` after every block | The node is forwarding blocks to an upstream that refuses them. A node that is not the main node should be started with `--no-upstream` |
| `Nicht erreichbar: ...` followed by `Es wird auf dem lokalen Stand weitergebaut.` | The HTTP source could not be reached at start. The node continues with its local chain |
| `--pool-fee ohne --pool-payout`, `--pool-payout ist keine gültige YSKAR-Adresse`, `Pool konnte nicht starten: ...` | The pool options are incomplete or invalid; the node exits with code 1 |
| Blocks from peers are rejected with `timestamp` | Check the system clock. Blocks more than 120 seconds in the future are invalid |
| A miner reports `session_inactive` | The session timed out or the node was restarted. The miner has to open a new session; the command-line miner does that by itself |
| `Kette` stays at `—` | The node has no peers. Check the `--seed` values and your outbound network access. If the seed names cannot be resolved, the main node is also reached as `45.84.199.206:8646` |
| Ctrl+C in `sync` does not stop at once | `sync` finishes its current pause first, which lasts up to `--interval` seconds |

Node.js prints a warning that `node:sqlite` is experimental. The node filters exactly this one
warning and shows all others.
