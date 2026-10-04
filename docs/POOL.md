# Pools

This document explains how pool mining works in YSKAR, how you join a pool as a miner and how you
run one as an operator. It also describes the accounting in enough detail to check it against the
code in `src/lib/pool/`.

## What a pool is

A pool in YSKAR is a full node that splits the reward of the blocks it builds. It is not a service
with accounts and there is no registry: any full node becomes a pool when it is started with a pool
name.

The principle: **the block pays, not the operator.** The split is written into the coinbase (the
first transaction of a block, which creates the block reward). The chain credits every participant
directly at the moment the block is accepted. The operator decides only how the reward is divided,
and the result is in the block for anyone to recompute. At no point does the operator hold a
miner's coins, so there is no balance an operator could withhold or lose.

This needs a coinbase with several recipients. That is consensus revision 2, active since height
2,000; see [CONSENSUS_V2.md](CONSENSUS_V2.md). A coinbase can pay at most 64 addresses.

Solo mining is unaffected. A solo miner gets a coinbase with exactly one recipient, and one node
serves solo and pool miners at the same time.

## For miners

### Join a pool

**Android app and Telegram Mini App.** Set the mining mode to "Pool". The app suggests the first
open pool of its list. "Change" shows every listed pool with its seats, hash power, blocks found
and fee. A pool that is not on the list can be entered under "Custom address".

**Node Core (Windows).** Choose "Pool" under Mining. Node Core shows the same list; a pool that is
not listed goes into "Your own pool address".

**Command-line miner.** From the `miner/` folder of the repository:

```bash
node src/cli.mjs --address <your-address> --api https://yskar-main.dynv6.net --mode pool
```

`--api` is the address of the pool node. `https://yskar-main.dynv6.net` is the public pool "YSKAR
Main"; for another pool, put its address there. `--mode pool` asks for a pool session; without it
the miner mines solo. The miner needs only your address (it begins with `ysr1`), never a key. All
options are described in [the miner guide](../miner/README.md).

A node that runs no pool rejects a pool session with `pool_unavailable`. It does not silently treat
the session as solo: otherwise you would mine in the belief that your work is shared and receive
nothing.

A pool that has no free seat rejects a new address with `pool_full`; see [Seats](#seats).

### Solo and pool side by side

A session chooses its mode when it opens and keeps it. To change the mode, the miner opens a new
session.

| Session | Mode | Coinbase of its jobs |
|---|---|---|
| A | solo | everything to the address of A; no pool name in the block |
| B | pool | the current split of the pool; pool name in the block |
| C | pool | the same split |

Every session has its own extranonce, a number in the block header that the node assigns when the
session opens. Two sessions therefore never search the same range of hashes.

### What is counted

A share is a hash that meets the share target, a target much easier than the block target. The
node sets a share target per session and adjusts it so that a working miner delivers about one
share every 30 seconds.

- Each accepted share is credited with the **share difficulty that was in force**, not with the
  difficulty the hash happened to reach. Otherwise one lucky hash would count like a thousand
  shares, and luck would be paid instead of work. A share that happens to be a whole block is
  credited the same way.
- The payout address is the one given when the session opened. A later message cannot redirect
  work that has already been done.
- A nonce is credited once. The node accepts shares only for the job the session fetched last and
  rejects a nonce it has already credited for that job (`duplicate`).

How the credited work becomes a payout is described under
[How the accounting works](#how-the-accounting-works).

## For operators

### Run a pool with Node Core (Windows)

Node Core has a view "Run a pool": enter a name, set the fee and the number of seats, switch it
on. It is the same pool as in the command-line node, with a user interface.

| Setting | Behavior |
|---|---|
| Fee | Goes to the wallet of this PC. 0 to 5 % in steps of 0.25 %. A fee needs a wallet in Node Core. |
| Your own miner | Joins when you choose "Pool" under Mining; your own pool is listed first. |
| Devices in your home network | A switch with this name. Other PCs then connect with `http://<address of this PC>:8645`. |
| App and Mini App | Only through HTTPS with a name and a certificate. Node Core does not set this up; see [Make the pool reachable](#make-the-pool-reachable-for-the-app-and-the-mini-app). |
| PPLNS window | Saved to `pool-fenster.json` every two minutes and when the pool stops, and loaded at the next start. |

Port 8645 of Node Core answers only the PC itself and, with the switch on, private network
addresses. To offer the pool on the internet, put a web server with a certificate in front of it,
on the same PC or in the same network.

### Run a pool with the command-line node

Build the node as described in [FULLNODE.md](FULLNODE.md). Then start it with the standard command
of a full node, followed by the pool flags:

```bash
node dist/yskar-node.cjs mine --data ./knoten --seed yskar-main.dynv6.net:8646 --seed 45.84.199.206:8646 --no-upstream \
  --pool my-pool-name --pool-fee 100 --pool-payout <address>
```

| Flag | Meaning |
|---|---|
| `--data <folder>` | Folder of the block store. Default `./knoten`. |
| `--seed <host:port>` | A known node. The pool loads the chain through it and announces its blocks to the network. Repeatable; give both seeds of the main network. |
| `--no-upstream` | Blocks go only to other nodes, not to the database mirror behind `https://yskar.vercel.app`. Only the main node writes to the mirror; see [OPERATIONS.md](OPERATIONS.md). |
| `--bind <address>` | Address the HTTP interface listens on. Default `127.0.0.1`. |
| `--port <number>` | Port of the HTTP interface. Default `8645`. |
| `--p2p-port <number>` | Port for other nodes. Default `8646`. |
| `--pool <name>` | Switches the pool on. The name is written into every pool block. |
| `--pool-fee <bp>` | Fee in basis points: `100` = 1.00 %. A whole number from `0` to `500`. Default `0`. |
| `--pool-payout <address>` | Address that receives the fee. Required when the fee is greater than 0. |
| `--pool-max <n>` | Accept at most this many addresses, `1` to `64`. Default: the limit of the chain, 64 without a fee and 63 with one. |

Without `--pool` the node offers solo mining only, and the other pool flags have no effect.

**A fee needs a payout address.** The node checks the pool settings when it starts, not when the
first block is found. A fee without `--pool-payout`, a fee with a payout address that is not a valid
YSKAR address, a fee outside 0 to 500, a seat number outside 1 to 64 or an invalid name stops the
start with a message. A pool without a fee needs no payout address; `--pool-payout` is then not
read.

In the command-line node the fee is fixed by the flag for as long as the node runs.

### The name in the chain

`--pool my-pool-name` writes this name into the `extra` field of the coinbase of every block found
by a pool session. The explorer reads it from there and shows it with the block.

The rules for the name (`src/lib/chain/finderName.ts`): printable ASCII only, at least 3 and at
most 32 characters, at least one letter or digit. Whatever is in a block stays there for good.

Only pool blocks carry the name. A solo miner who mines through your node builds a block of their
own, and its `extra` field stays empty.

The name is a self-description. The chain proves that blocks carrying a name were found; it does
not prove who is behind the name.

### Seats

A pool admits as many **addresses** as one block can pay:

| Seats | Case |
|---|---|
| 64 | no fee |
| 63 | with a fee (one recipient is the operator) |

With `--pool-max` you can offer fewer seats, not more. A fee that has been announced for the next
block already counts, so the pool is not overbooked by one seat when it takes effect. The app and
Node Core call seats "places"; in the JSON answers the field is `plaetze`.

Addresses are counted, not devices. Three phones mining to one address occupy one seat, because
the coinbase pays each address once anyway.

**A full pool is closed.** When a new address opens a pool session at a full pool, the node
answers with HTTP 409:

```json
{ "error": "pool_full", "detail": "Pool voll: alle 64 Plätze sind belegt (pool_full).",
  "plaetze": 64, "belegt": 64 }
```

An address that already holds a seat may open more sessions. Solo mining at the same node is not
affected.

The other rejections of a session (`missing_address`, `bad_address`, `pool_unavailable`,
`too_many_sessions`) come with HTTP 200 and an `error` field. The miner inside the Android app
(`User-Agent: YSKAR-Wallet-Nativ/...`) also receives `pool_full` with HTTP 200: it treats every
status from 400 upward as a network error and would retry forever instead of stopping.

**When a seat becomes free:**

| Event | The seat is free |
|---|---|
| The miner stops (closes its session) | at once, unless another session of the same address still holds it |
| The miner goes silent (app frozen, crash, network gone) | the session expires after 5 minutes; the seat stays reserved for another 15 minutes |
| A session never delivered a share and goes silent | after 5 minutes, without a reservation |
| A session keeps fetching jobs but has no accepted share for 10 minutes | after those 10 minutes; the session stays open but no longer counts as a seat |

A seat belongs to whoever works. A session without an accepted share for ten minutes is not
closed. It only stops holding a seat, and another address can take it. When the session delivers a
share again, it counts again. This is why `miner` (connected addresses) can be higher than
`belegt` (occupied seats) in the status.

The reservation exists for phones. A frozen app does not close its session. When it wakes up after
ten minutes, the miner opens a new session without asking, and without a reservation it would face
a full pool although it never left. The reservation belongs to the session, not to the address:

- If a second device of the same address stops, the reservation of the frozen device stays.
- A stop request for the expired session itself deletes its reservation.
- If the device opens a new session after waking up and stops that one, the old reservation stays
  until it runs out, so the seat becomes free up to 15 minutes later. The node cannot know that the
  new session came from the same device.

### The status endpoint

Everyone can read the state of a pool:

```bash
curl https://pool.example.org/api/v2/pool
curl "https://pool.example.org/api/v2/pool?address=<address>"
```

The answer, with example values:

```json
{
  "name": "my-pool-name",
  "feeBps": 100,
  "feeBpsNext": null,
  "miner": 5,
  "hashrate": 146000000,
  "plaetze": 63,
  "belegt": 5,
  "frei": 58,
  "voll": false,
  "eintraege": 412,
  "arbeitGesamt": "1930112"
}
```

| Field | Meaning |
|---|---|
| `name` | Name of the pool, as written into its blocks. |
| `feeBps` | Fee in force, in basis points. |
| `feeBpsNext` | Fee that applies after the next block found by the pool, or `null` if no change is announced. |
| `miner` | Addresses with an open pool session. |
| `hashrate` | Sum of the hashrates the node measured from the shares of the pool sessions, in hashes per second. |
| `plaetze` | Seats the pool offers. |
| `belegt` | Occupied seats: addresses with a working session, plus reservations. |
| `frei` | Free seats, `plaetze` minus `belegt`, never below 0. |
| `voll` | `true` when `belegt` has reached `plaetze`. |
| `dabei` | Only when the request names an `address`: `true` if this address already holds a seat. |
| `eintraege` | Number of entries in the share log. |
| `arbeitGesamt` | Work held in the share log, in difficulty units, as decimal text. |

The answer gives numbers, never addresses. The same object is returned in the field `pool` when a
pool session opens.

A node without a pool answers with HTTP 404 and `{"error": "pool_unavailable", ...}`. An `address`
that cannot be decoded gives HTTP 400 and `bad_address`.

### Make the pool reachable for the app and the Mini App

The HTTP interface of the node listens on `127.0.0.1:8645` unless you bind it elsewhere. It accepts
work and builds blocks, so it should not be exposed to the internet directly. Which setup you need
depends on who mines with you:

| Who mines with you | What you need |
|---|---|
| You and devices in your home network | Node Core with "Run a pool" and "Devices in your home network" |
| Command-line miners from the internet | A node that runs all the time and can be reached from outside |
| The app and the Mini App | In addition: HTTPS under a host name with a valid certificate |

The app and the Mini App are web pages loaded over HTTPS from `https://yskar.vercel.app`. Their
mining code calls the pool directly from the device. Three things follow:

- **HTTPS with a valid certificate.** Telegram loads Mini Apps only over HTTPS, and a page loaded
  over HTTPS cannot call an `http` address. The pool needs a host name (a domain or a dynamic DNS
  name) and a certificate for it.
- **A reverse proxy.** A web server in front of the node obtains the certificate and passes the
  requests on to `127.0.0.1:8645`. Port 443 must be reachable from outside; for a node at home
  that means port forwarding in the router.
- **CORS headers.** These are the response headers with which a server allows a web page from
  another origin to call it. The pool has a different origin than the app, and the node sends no
  such headers itself. The proxy must add them and answer `OPTIONS` requests.

The proxy configuration for Caddy, including the CORS block, is in
[OPERATIONS.md](OPERATIONS.md#https-reverse-proxy-with-caddy). Check from outside:

```bash
curl https://pool.example.org/api/v2/pool
```

If the answer contains your pool name and the number of seats, the pool is reachable.

### Get into the pool list of the app

The chain has no pool registry. So that nobody has to type an address, the app and Node Core offer
a maintained list. It is in `src/lib/pool/verzeichnis.ts`:

```ts
export const POOLS: PoolEintrag[] = [
  { host: 'yskar-main.dynv6.net', name: 'YSKAR Main', kette: 'yskar-main.dynv6.net' },
];
```

`host` is the address of the pool node without `https://`, `name` the display name, and `kette`
the name the pool writes into its blocks. `kette` is only a fallback: when the node reports a valid
name itself, that name is used. A new entry is one line; `tests/pool-verzeichnis.test.ts` checks
the list.

Requirements for an entry:

- The pool is reachable over HTTPS with the CORS headers described above, because the app asks
  the pool directly before it starts mining.
- The node answers `GET /api/v2/pool`. A node version that does not know this route answers 404
  `not_found`; the app then shows the pool as "Reachable" without seat numbers.

The list is neither a check nor a recommendation. Miners, hash power, seats and fee are reported
by the pool itself. Only the number of blocks found is counted by the server from the chain, by
the name in the block, so it also rests on what the pool says about itself. The server route
`/api/v2/pools` collects these answers for the app; its answer can be about 20 seconds old.

A pool that is not on the list is not locked out: "Custom address" in the app, "Your own pool
address" in Node Core and `--api` in the command-line miner reach any pool node.

## How the accounting works

The accounting has three parts, all in `src/lib/pool/`:

| File | Task |
|---|---|
| `pplns.ts` | decides which work counts |
| `settlement.ts` | divides an amount among the work |
| `PoolCoordinator.ts` | holds the settings of the operator and builds the coinbase |

All amounts are integers in the smallest unit (1 YSR = 100,000,000 units) and all arithmetic uses
`BigInt`. Floating-point numbers would be fatal here: `0.1 + 0.2` is not `0.3`, and two nodes
could arrive at different results for the same block.

### The PPLNS window

PPLNS means "pay per last N shares". Paid is always the **last N units of work**, across block
finds. N is twice the network difficulty (`PPLNS_FAKTOR = 2`), measured in difficulty units; the
node uses the difficulty of the current chain tip.

The node keeps a log of the credited shares in the order they arrived. For a split it walks the
log from the newest entry backward and adds work until the window is full. If the log holds less
work than the window, it takes what is there; that is the normal case in the first hours of a pool.

The oldest entry inside the window counts only in part, with exactly the amount that still fits.
Taking it whole would make the real size of the window depend on how large the share at the edge
happened to be.

The window is not emptied when the pool finds a block. It moves on. After a block of its own the
pool only discards entries the window can no longer reach, and it keeps three times the window as
a reserve because the network difficulty can rise.

In regtest (the local test network) the network difficulty starts at 1, so the window starts
at 2. A single share with the starting share difficulty of 128 is larger than that window, and
the split then has exactly one recipient. That is the formula applied to degenerate parameters,
not a fault. To check the accounting in regtest, test it directly
(`tests/pool-anbindung.test.ts`) instead of through a running node.

### Why PPLNS instead of proportional

With a proportional split per round, a new count begins after every block. A miner who joins just
after a block and leaves soon holds a large part of a short round and receives, on average, more
than the work was worth. The miners who stay pay for it. This is known as pool hopping.

The PPLNS window has no round boundary. The moment of joining does not matter: one unit of work is
one unit of work.

The price, and it is a fair one: a new miner has to fill the window first, and a miner who stops
still receives something for a while, for exactly as long as it was missing at the start.

### The split

`abrechnen()` in `settlement.ts` divides a gross amount among the work in the window:

1. The fee is `gross × feeBps / 10,000`, rounded down.
2. Entries of the same address are merged.
3. The addresses are sorted by work, largest first; with equal work the smaller address comes
   first. The first 64 take part, or the first 63 when a fee is taken. The work of the others is
   returned in `uebertrag` and is not booked anywhere.
4. The net amount, gross minus fee, is divided by the **largest-remainder method**: every address
   first receives `net × work / total work`, rounded down. The units that are still missing, fewer
   than there are recipients, go one each to the addresses with the largest remainder. With equal
   remainders the smaller address wins. Without this second key the result would depend on the
   order of the input.
5. An address whose amount is 0 gets no output. The fee becomes an output of its own, or is added
   to the operator's output if the operator's address also mined.
6. The outputs are sorted by address in ascending order, the only order the chain accepts.

The node calls this with the block reward of the next height as the gross amount. The transaction
fees of the block are not known until the block is assembled; the node then adds them to the
output with the largest amount. The pool fee is therefore taken from the block reward, not from
the transaction fees.

If the window is empty, for example right after the start of the node, there is nothing to split.
The job then gets an ordinary coinbase with one recipient, the address of the session that fetched
it.

### The fee

- 0 to 500 basis points, that is 0.00 % to 5.00 % (`MAX_FEE_BPS`).
- Rounded down, in favor of the miners.
- A change takes effect only after the next block found by the pool. The work in the window was
  done under the old fee; raising it afterwards would take from work already done. Node Core uses
  this: it announces the new fee in `feeBpsNext`, and it stores the fee in force together with the
  window, so that switching the pool off and on does not change the fee for work already done.

### Invariants

- The sum of all outputs equals the gross amount exactly. `abrechnen()` checks this at the end and
  throws otherwise; the block builder checks the sum again against block reward plus fees.
- A coinbase has at most 64 outputs, each address appears once, every amount is greater than 0,
  and the addresses are in ascending order. These are also consensus rules: a block that breaks
  them is invalid.
- The result is deterministic. The same work gives the same outputs, whatever the order of the
  input.

### Limits from the code

| Value | Constant | Meaning |
|---|---|---|
| 64 | `MAX_COINBASE_OUTPUTS` | recipients per coinbase |
| 63 | `MAX_MINERS_JE_BLOCK` | miners per block when a fee is taken |
| 500 | `MAX_FEE_BPS` | highest fee in basis points (5 %) |
| 2 | `PPLNS_FAKTOR` | window size as a multiple of the network difficulty |
| 128 | `SHARE_START` | share difficulty of a new session |
| 30 s | `SHARE_ZIEL_SEKUNDEN` | intended time between two shares of a session |
| 300 s | `SESSION_TIMEOUT_MS` | a session without a request for this long expires |
| 900 s | `PLATZ_VORGEMERKT_MS` | reservation of a seat after a working session expired |
| 600 s | `PLATZ_OHNE_ARBEIT_MS` | an open session holds a seat this long without an accepted share |
| 5,000 | `SITZUNGEN_MAX` | open sessions per node, solo and pool together |

### A worked example

A block reward of 875 YSR, a fee of 100 basis points, and five addresses with this work in the
window:

| Recipient | Work | Amount | Part of the block |
|---|---|---|---|
| Operator (fee) | | 8.75 YSR | 1.00 % |
| A | 4,000 | 330.00 YSR | 37.71 % |
| B | 3,000 | 247.50 YSR | 28.29 % |
| C | 2,000 | 165.00 YSR | 18.86 % |
| D | 1,000 | 82.50 YSR | 9.43 % |
| E | 500 | 41.25 YSR | 4.71 % |
| Sum | 10,500 | 875.00 YSR | |

The fee is 1 % of 875 YSR. The remaining 866.25 YSR are divided in the ratio of the work; A, for
example, receives 866.25 × 4,000 / 10,500 = 330 YSR. Here every division comes out even.

When it does not, the largest-remainder method decides. Three addresses with equal work and no fee
share 87,500,000,000 units: each receives 29,166,666,666 units, and the two units left over go to
the two smaller addresses, which end up with 29,166,666,667.

## Honest limits

- **The share count must be trusted.** Shares are not in any block. You can see afterwards that an
  address received 37.71 % of a block, but not whether 37.71 % was its due. That is so with every
  pool. The design removes the need to trust the operator with your coins; it does not remove the
  need to trust the operator's counting.
- **Seats can be occupied cheaply.** Without any work a session holds its seat for ten minutes;
  after that a seat costs one accepted share per address every ten minutes. That is little.
  Somebody who sets out to do it can fill a pool with many addresses and little hash power: the
  node knows addresses, not persons. At present the only defense is a limit in the web server in
  front of the node.
- **The seat limit applies to admission, not to the window.** A miner who has left still has work
  in the window for a while. If the window therefore holds more addresses than one block can pay,
  the addresses with the most work receive their part and the smallest receive nothing in that
  block. Their work stays in the window and counts again at the next block, but the node keeps no
  separate balance for them.
- **The command-line node does not keep the window across a restart.** `PoolCoordinator` can
  export and load its share log, and Node Core does so. The command-line node does not: after a
  restart the window is empty and the work credited before is lost. Sessions and seat reservations
  are also held in memory only; miners open new sessions after a restart.
- **The node keeps no payout ledger.** Who received how much is in the coinbase of each block and
  nowhere else.
