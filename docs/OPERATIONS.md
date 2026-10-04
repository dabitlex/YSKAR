# Operations

This document describes how the public infrastructure of YSKAR is run: the main node, the web
server on Vercel, the database mirror and the settings that connect them. It is written for the
operator of the main node and for anyone who wants to know which component is authoritative.

## Components and who is authoritative

| Component | Where | Task | Authoritative for |
|---|---|---|---|
| Full nodes | anywhere; connected over P2P on port 8646 | validate every block, build blocks, hold the mempool (the pending transfers) | which blocks are valid and which chain is active |
| Main node | `yskar-main.dynv6.net`, a server with the fixed address `45.84.199.206` | a full node like any other, with extra duties (below) | nothing beyond what any full node decides |
| Mirror (German "Spiegel") | Supabase, schema `chain2` | read-only database copy of the chain for fast queries | nothing |
| App project | Vercel, `https://yskar.vercel.app` | serves the web app, the explorer and the read API; writes blocks into the mirror | nothing |
| Website project | Vercel, `https://www.yskar.app` | static website with guides and whitepaper | nothing |
| Push watcher | a service next to a node | sends notifications to Android devices | nothing |

**Full nodes decide validity.** A block is valid because every full node recomputes it: proof of
work, signatures, balances and the state root (the hash in the block header that commits to all
balances). The active chain is the valid chain with the most work. See [PROTOCOL.md](PROTOCOL.md)
and [FULLNODE.md](FULLNODE.md).

**The mirror is a convenience, never the truth.** It exists so that the app and the explorer can
answer questions such as "all transfers of this address" with one database query. If the mirror
and a full node disagree, the full node is right.

The main node is special in four operational ways, none of which gives it authority over the
chain:

- It is the only node that writes blocks into the mirror.
- It is the node the Vercel server asks for live data (variable `YSKAR_FULLNODE_URL`).
- It is the node the web app sends solo mining sessions and transfers to (variable
  `NEXT_PUBLIC_MINING_BASE`), and it runs the public pool "YSKAR Main".
- It is the first seed of the main network, `yskar-main.dynv6.net:8646`. Without a name lookup
  it is reached as `45.84.199.206:8646`.

The second seed, `yskar-seed2.dynv6.net:8646`, is an ordinary full node on a different machine
and a different connection: a Raspberry Pi on a home connection whose address changes. It has
none of the duties above. It is run by the same operator as the main node.

```text
  other full nodes
        ^
        |  P2P, port 8646
        v
  main node (yskar-main.dynv6.net)  <---  miners, app: mining sessions and transfers
        |                                 (HTTPS proxy in front of 127.0.0.1:8645)
        |  every accepted block: POST /api/v2/block
        v
  Vercel app project (yskar.vercel.app)   re-validates the block, then commits it
        |
        v
  Supabase, schema chain2 (the mirror)
        ^
        |  read routes of the Vercel server: blocks, accounts, history, search
  app, explorer, website
```

## The two Vercel projects

| Project | Address | Content |
|---|---|---|
| App | `https://yskar.vercel.app` | The Next.js application from the repository root: the web app (Telegram Mini App, and the user interface inside the Android app), the explorer (`public/explorer.html`) and the API under `/api/v2`. |
| Website | `https://www.yskar.app` | The static files in `website/`. |

The website has no API and no explorer of its own. `website/vercel.json` passes these paths on to
the app project:

| Path on `www.yskar.app` | Destination |
|---|---|
| `/explorer`, `/explorer.html` | `https://yskar.vercel.app/explorer.html` |
| `/api/v2/*` | `https://yskar.vercel.app/api/v2/*` |
| `/marke/*`, `/schrift/*` | logo and fonts of the explorer on `yskar.vercel.app` |

There is one explorer and one API. The address bar shows `www.yskar.app/explorer`, the content
comes from the app project.

Both projects build from the same repository. The `ignoreCommand` in the root `vercel.json` skips
a build of the app project when a commit changed only files under `website/`; the one in
`website/vercel.json` skips a build of the website when nothing under `website/` changed.

## What the Vercel server does today

The server no longer issues mining jobs and no longer accepts transfers. It serves the web app,
answers read requests and keeps the mirror up to date.

| Routes under `/api/v2` | Source |
|---|---|
| `GET /summary`, `GET /fees` | passed through from the full node in `YSKAR_FULLNODE_URL`. These answers depend on the mempool and on live mining data, which are not mirrored. |
| `GET /account/:address` | balance, nonce and the first page of the history from the mirror; pending transfers and `nextNonce` from the full node. If the node cannot be reached, the pending list is empty and the balance is still answered. |
| `GET /blocks`, `/blocks/:height`, `/tx/:txid`, `/search`, `/finder`, `/sync`, `/account/:address/verlauf`, `/account/:address/einnahmen` | the mirror |
| `GET /pools` | asks every pool of the list in `src/lib/pool/verzeichnis.ts` for its state; block counts come from the mirror. See [POOL.md](POOL.md). |
| `GET /news`, `POST /news` | table `chain2.news`; writing needs `YSKAR_ADMIN_TOKEN`. See [APP.md](APP.md). |
| `POST /push/register`, `POST /push/unregister` | table `chain2.push_geraete`. See [APP.md](APP.md). |
| `POST /block` | the write path of the mirror, described below |

If `YSKAR_FULLNODE_URL` is not set, `/summary` and `/fees` answer HTTP 503 with
`fullnode_not_configured`. If the node cannot be reached or answers with an error, they answer
HTTP 503 with `chain_unreachable`.

### Retired routes

Mining and the submission of transfers moved to the full nodes. These routes still exist so that
an old client gets a clear answer instead of a 404:

- `POST /api/v2/session`, `POST /api/v2/session/stop`, `GET /api/v2/job`, `POST /api/v2/share`,
  `POST /api/v2/tx`
- `/api/v1/mining/session`, `/session/stop`, `/job`, `/share`, `/status`

Each answers HTTP 410 (`src/lib/api/stillgelegt.ts`). The addresses in this example depend on
`YSKAR_FULLNODE_URL`:

```json
{
  "error": "moved_to_fullnode",
  "detail": "Mining und Transaktionen laufen nicht mehr über diese Adresse. Der Full Node ist die Wahrheit; hier liegt nur noch ein Lesespiegel.",
  "fullnode": "https://yskar-main.dynv6.net",
  "stattdessen": "https://yskar-main.dynv6.net/api/v2/session"
}
```

`fullnode` is the value of `YSKAR_FULLNODE_URL`, or `null` if it is not set. `stattdessen`
("instead") names the same path at the full node.

The reason is the rule that only one place may hand out work. A mining job fixes the parent block,
the transactions and the state root; it lives 90 seconds and must stand on the current tip. A
mirror is behind by definition and must not issue jobs.

The command-line miner still has `https://yskar.vercel.app` as its default `--api`. Because that
address answers 410, every miner command has to name a full node with `--api`.

The routes under `/api/v1/chain/` and `/api/v1/auth/telegram` belong to the first chain (see
[history/FIRST_CHAIN_SECURITY.md](history/FIRST_CHAIN_SECURITY.md)). Nothing in the current app,
explorer, miner or node calls them.

## The mirror

### How blocks get in

`POST /api/v2/block` with the body `{"raw": "<block as hex>"}` is the only path that writes chain
data into the database (`src/app/api/v2/block/route.ts`).

The server trusts nothing in the request except the raw bytes. It deserializes the block, checks
structure and proof of work, loads tip, account state and recent block times from the mirror, runs
the same `validateBlock` function a full node uses, applies the block, compares the resulting
state root with the one in the header and only then commits block, transactions and changed
accounts in one database call (`chain2.commit_block`).

The mirror is **strictly linear**. It accepts only the block that follows its own tip:

| Answer | HTTP | Meaning |
|---|---|---|
| `accepted: true` with `height`, `hash`, `txs`, `reward`, `recipients` | 200 | committed |
| `reason: "stale"` | 200 | the block's height is not above the mirror's tip |
| `reason: "height_gap"` | 200 | the block is more than one height ahead; a block in between is missing |
| `reason: "wrong_parent"` | 200 | the height fits, but the block does not build on the mirror's tip |
| `reason: "spiegel_token"` | 401 | the mirror token is required and missing or wrong |
| `bad_json`, `missing_raw`, `too_large`, `not_hex`, `malformed`, `structure`, a validation code, `apply_failed`, `state_root` | 400 | the request or the block is invalid |
| `reason: "commit_failed"` | 409 | the database refused the commit, for example because another block was committed in the meantime |
| `reason: "chain_unreachable"` | 503 | the mirror could not be read |

A request body may carry at most 1,048,576 bytes of block data. The database enforces the linkage
a second time. As defined in migration `00007_chain2_core.sql`, one trigger on `chain2.blocks`
accepts only the next height with the matching parent hash, and another forbids changing a stored
block.

A read error never counts as "the chain is empty". `loadTip()` and `loadState()` throw, and the
route answers 503. Otherwise an unreadable database would look like an empty one, and the route
would accept a second genesis block.

### Who pushes blocks

A full node started with `mine` forwards every block it accepts to its upstream address: blocks
found by its own miners and blocks that arrived over P2P (`MiningServer.weitergeben`). The
upstream address is `--upstream`, or `--api` if `--upstream` is not given; the default of `--api`
is `https://yskar.vercel.app`. With `--no-upstream` the node forwards nothing and also fetches no
blocks over HTTP from `--api`.

A failed forward is reported in the node's log (`nicht weitergegeben: <reason>`) and not repeated.
The mirror must never hold up the chain.

### The `spiegel` command and the timer

Because a failed forward is not repeated and the mirror accepts only the next block, one lost
block stops all that follow: each later block is answered with `height_gap`. The `spiegel` command
closes such a gap:

```bash
node dist/yskar-node.cjs spiegel --data ./knoten --api https://yskar.vercel.app
```

It reads the height of the newest block from `<address>/api/v2/blocks?limit=1`, compares it with
the height of the local chain and posts every missing block of the local main chain, one by one in
ascending order. It asks `/blocks` and not `/summary` on purpose: `/summary` is passed through
from the node and would report the node's own height. An empty mirror is filled from height 0.

The command stops at the first block the mirror does not accept and prints the reason. Its exit
status is 0 in that case too, so a rejected block shows up in the output, not in the status of the
service. It exits with status 1 only when the address cannot be reached or does not answer with a
block list.

On the main node a systemd timer runs the command two minutes after boot and then every five
minutes (`deploy/yskar-spiegel.service`, `deploy/yskar-spiegel.timer`). A run with nothing to push
costs one HTTP request. The command reads blocks from the store and writes none; it can run while
the node is running because the store is a SQLite database in WAL mode (write-ahead logging, in
which reading does not block writing). See [deploy/README.md](../deploy/README.md).

### When the mirror falls behind

While the mirror is behind the chain:

- Everything read from the mirror shows the older state: the explorer, block lists, balances,
  history, search and the block counts of pools.
- `/summary` and `/fees` stay current, because they come from the full node. The height shown by
  the app can therefore be ahead of the newest block in the explorer.
- Mining and transfers are not affected. They go to full nodes.
- A node or tool that fetches the chain over HTTP from `https://yskar.vercel.app/api/v2/sync` (the
  `sync` command, the observer, a node started without `--no-upstream`) sees the chain only up to
  the mirror's height.

The next successful `spiegel` run closes the gap.

### When the mirror is on a branch that lost

The mirror **cannot reorganize**. A full node keeps competing blocks and switches to the branch
with the most work. The mirror has one block per height and no way back.

If the main node forwards a block and the network then settles on a competing block at the same
height, the mirror holds a block that is no longer part of the active chain. From then on:

- the competing block is answered with `stale`, because its height is not above the mirror's tip;
- the next block of the active chain is answered with `wrong_parent`;
- `spiegel` either reports that there is nothing to push (if the mirror's height is not below the
  node's) or stops at the first block with `wrong_parent`.

The mirror then stays where it is. The explorer, balances and history show a history that full
nodes no longer regard as the active chain, from the height of the fork onward. The chain itself,
mining and transfers are not affected.

No route and no command moves the mirror back, and the repository contains no tested procedure
for it. Bringing the mirror back onto the active chain is manual work in the database that has
to be planned for the case at hand. The rule in the next section exists to keep this case from
happening.

### Only the main node writes to the mirror

The rule exists because the mirror cannot reorganize. If two nodes forward blocks, the mirror
commits whichever valid block for the next height arrives first, and a block of a branch that
later loses gets in more easily.

Every full node that is not the main node is therefore started with both seeds and
`--no-upstream`:

```bash
node dist/yskar-node.cjs mine --data ./knoten --seed yskar-main.dynv6.net:8646 --seed yskar-seed2.dynv6.net:8646 --no-upstream
```

Such a node gets the chain over P2P and announces its blocks to other nodes. The main node
receives them over P2P and forwards them to the mirror. Node Core never forwards blocks to the
mirror.

### The mirror token

`YSKAR_SPIEGEL_TOKEN` restricts the write path to nodes that know a shared secret.

- On Vercel: if the variable is set, `POST /api/v2/block` requires the header
  `Authorization: Bearer <token>` and answers 401 `spiegel_token` otherwise. If it is not set, the
  route accepts a valid next block from anyone.
- On the node: if the variable is set, the node sends the header with every forwarded block, and
  the `spiegel` command sends it too (`src/lib/node/fullnode/spiegelKopf.ts`). If it is not set,
  requests go out without the header.

The token is not a defense against invalid blocks; every block is recomputed in any case. It keeps
blocks of other nodes out of the mirror.

**Activation order: node first, then Vercel.**

1. Generate a value: `openssl rand -hex 32`.
2. On the main node, put it into `/etc/yskar/node.env` (template:
   [deploy/node.env.example](../deploy/node.env.example)) and restart the node service. Vercel
   does not require the token yet and ignores the header. Nothing changes, which is the point.
3. Only then set `YSKAR_SPIEGEL_TOKEN` to the same value in the Vercel app project and redeploy.

The other way round there is a period in which Vercel already requires the token and the node does
not send it yet. Every block in that period is rejected with 401, and because the mirror accepts
only the next block, the first rejected block stops all that follow until a `spiegel` run with the
token closes the gap.

## The database

The mirror lives in a Supabase project, in the Postgres schema `chain2`. Two settings are not
checked by the build and still stop everything when they are missing:

1. **`chain2` must be an exposed schema.** Supabase serves only schemas that are listed under
   "Exposed schemas" in the Data API settings of the project; by default these are `public` and
   `graphql_public`. Without `chain2` in that list the application builds and starts normally, and
   every call of `/api/v2/*` that reads the database fails at run time.
2. **The service role needs rights on `chain2`.** The server uses the service role key. That role
   bypasses row level security but not the rights on schemas and tables. Migration
   `00010_chain2_service_role_grants.sql` grants usage of the schema, all privileges on its tables
   and sequences, execution of its functions, and the same as default privileges for objects
   created later.

Row level security is enabled on the chain tables. The policies in migration
`00007_chain2_core.sql` allow reading only; there is no policy that allows writing. The server
reads and writes with the service role key.

The files in `supabase/migrations` are applied by hand. The repository contains no Supabase
configuration that applies them, and they are a record of what was changed, not a history that can
be replayed against an empty database. Migration `00016_commit_block_u64.sql`, for example,
contains only a description; the full body of the changed function exists in the database alone.
Migrations `00001` to `00006` belong to the first chain (schema `public`); `00007` and later
belong to `chain2`.

When a consensus change widens a value, the database has to follow before the height at which the
change applies. Migration `00020_difficulty_numeric.sql` did this for the difficulty of revision
4, which applies from height 6,000. A block the database cannot store stops the mirror in the same
way as a lost block.

## Environment variables

**Vercel app project** (Settings → Environment Variables; a change needs a new deployment):

| Variable | Required | Effect |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Address of the Supabase project. Read by `src/lib/db/service.ts`. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service role key for the database. Bypasses row level security; it must never reach a browser. |
| `YSKAR_FULLNODE_URL` | yes | Base address of the full node the server reads live data from, without a trailing slash, for example `https://yskar-main.dynv6.net`. Used by `/summary`, `/fees`, `/account/:address` and named in the 410 answers. |
| `NEXT_PUBLIC_MINING_BASE` | yes | Address of the full node the web app uses for solo mining sessions and for submitting transfers. It is built into the client code, so a change takes effect only with a new build. If it is empty, the app sends these requests to its own server, which answers 410. Pool mining goes to the address of the chosen pool instead. |
| `YSKAR_SPIEGEL_TOKEN` | no | Mirror token, see above. |
| `YSKAR_ADMIN_TOKEN` | no | Token for `POST /api/v2/news`. Without it that route answers 401 to every request. |
| `TELEGRAM_BOT_TOKEN`, `JWT_SECRET`, `TELEGRAM_INITDATA_MAX_AGE` | no | Read only by `/api/v1/auth/telegram`, a route of the first chain that nothing calls any more. |

The website project needs no variables.

**Main node** (`/etc/yskar/node.env`, read by `yskar-node.service` and `yskar-spiegel.service`):

| Variable | Required | Effect |
|---|---|---|
| `YSKAR_SPIEGEL_TOKEN` | no | Sent as bearer token with every block pushed to the mirror. Must equal the value on Vercel. |

**Push watcher** (environment of its service):

| Variable | Required | Effect |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | yes | Access to the device list, the delivery record and the news table in `chain2`. |
| `YSKAR_FULLNODE_URL` | yes | Full node to watch. |
| `FCM_SERVICE_ACCOUNT_FILE` | yes | Path to the JSON file of the Firebase service account. |
| `PUSH_TAKT_MS` | no | Polling interval in milliseconds. Default 8000. |

**Android build:**

| Variable | Required | Effect |
|---|---|---|
| `YSKAR_APP_URL` | no | Address the app loads its user interface from (`capacitor.config.ts`). Default `https://yskar.vercel.app`. |

## The main node

The main node is the command-line full node (see [FULLNODE.md](FULLNODE.md)) running as a systemd
service. Its start command differs from that of every other node: it has no `--no-upstream`,
because it is the node that writes to the mirror, and it runs the public pool. The unit file and
the setup are described in [deploy/README.md](../deploy/README.md).

### Ports

| Port | Protocol | Bound to | Reachable from outside |
|---|---|---|---|
| 8645 | HTTP: mining interface and read API of the node | `127.0.0.1` | no; only through the HTTPS proxy |
| 8646 | P2P between nodes, plain TCP | all interfaces | yes |
| 443 | HTTPS, the reverse proxy | all interfaces | yes |

Port 8645 accepts work and builds blocks. It has no access control and no rate limiting of its
own, so it is bound to `127.0.0.1` and a reverse proxy stands in front of it.

### HTTPS reverse proxy with Caddy

The web app and the Mini App are loaded over HTTPS from `https://yskar.vercel.app` and call the
node directly from the device. That needs HTTPS with a valid certificate under a host name. It
also needs CORS headers, the response headers with which a server allows a web page from another
origin to call it, because the node has a different origin than the app. Caddy obtains the
certificate itself. The same configuration serves any pool that wants to be reachable by the app; see
[POOL.md](POOL.md).

```bash
sudo apt install caddy
```

`/etc/caddy/Caddyfile`, with your own host name in the first line:

```text
node.example.org {
    reverse_proxy 127.0.0.1:8645

    # The web app has a different origin than the node.
    header Access-Control-Allow-Origin "*"
    header Access-Control-Allow-Methods "GET, POST, OPTIONS"
    header Access-Control-Allow-Headers "content-type"

    @options method OPTIONS
    respond @options 204
}
```

```bash
sudo systemctl reload caddy
curl https://node.example.org/api/v2/summary
```

The host name must point to the machine before Caddy can obtain a certificate. The main node
runs on a server with a fixed address, and its name `yskar-main.dynv6.net` points to that
address permanently. A machine at home with a changing address needs a dynamic DNS name
instead, and every change of address interrupts the service until all name servers hand out
the new one.

The node sends no CORS headers itself and does not handle `OPTIONS`. The `header` lines add the
headers to every answer, and the `@options` block answers the preflight request a browser sends
before a `POST` with a JSON body.

### Firewall

```bash
sudo ufw allow 8646/tcp   # P2P
sudo ufw allow 443/tcp    # HTTPS proxy
```

Port 8645 stays closed. For a machine behind a home router, forward 8646 and 443 in the router as
well.

## Push watcher

`scripts/push-watcher.ts` sends notifications to the Android app. It runs as its own service next
to a full node, not on Vercel, because it polls every 8 seconds. In each round it asks the node
for new blocks and for pending incoming transfers of the registered addresses, reads the device
list and unsent news from the `chain2` tables, and sends each event once per device through
Firebase Cloud Messaging. Tokens that Firebase reports as invalid are removed. Setup, the service
unit and the Firebase side are described in [APP.md](APP.md).

## Updating a node

```bash
cd ~/YSKAR && git pull
cd node && npm ci && npm run build
sudo systemctl restart yskar-node
systemctl status yskar-node --no-pager
```

A node that does not run as a service is stopped with Ctrl+C, rebuilt and started again with its
start command.

Things to know before you restart:

- **Consensus revisions.** A node must run code that knows a revision before the chain reaches the
  height at which it applies. Otherwise it can reject valid blocks from that height on and stop
  following the chain. Revision 3 applies from height 4,000 and revision 4 from height 6,000; the code in
  this repository contains both. Before those heights an updated node behaves exactly like an older
  one.
- **The Vercel server validates too.** The mirror's write path uses the same consensus code as the
  node. Deploy the app project before a revision's height as well, otherwise the mirror rejects
  the first block that uses the new rule and stops.
- **The pool window.** The command-line node keeps the PPLNS window of its pool in memory. A
  restart of the main node empties the window of the public pool; see [POOL.md](POOL.md).
- **Sessions.** Mining sessions are held in memory. Miners open new sessions after the restart.

## After a deployment

Run these checks after a deployment of the app project or a restart of the main node.

1. **Live data reaches the server.**

   ```bash
   curl -s https://yskar.vercel.app/api/v2/summary
   ```

   The answer contains `height` and `stateRoot`. HTTP 503 with `fullnode_not_configured` means
   `YSKAR_FULLNODE_URL` is missing. HTTP 503 with `chain_unreachable` means the node, the proxy
   or the DNS name in front of it does not answer.

2. **The mirror is up to date.**

   ```bash
   curl -s "https://yskar.vercel.app/api/v2/blocks?limit=1"
   ```

   The `height` of the block in the answer should equal the `height` from step 1, or follow it
   within one timer interval. If it stays behind, read the journal of the mirror service:
   `journalctl -u yskar-spiegel -n 30 --no-pager`.

3. **The database is reachable.** If step 2 answers HTTP 503 with `chain_unreachable`, check the
   exposed schema and the rights of the service role.

4. **The retired routes are closed.**

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST https://yskar.vercel.app/api/v2/session
   ```

   The answer is `410`.

5. **The write path asks for the token, if one is set.**

   ```bash
   curl -s -X POST https://yskar.vercel.app/api/v2/block -H "content-type: application/json" -d "{}"
   ```

   With `YSKAR_SPIEGEL_TOKEN` set on Vercel the answer is HTTP 401 with `spiegel_token`. Without
   a token it is HTTP 400 with `missing_raw`.

6. **The node answers from outside.**

   ```bash
   curl -s https://yskar-main.dynv6.net/api/v2/status
   curl -s https://yskar-main.dynv6.net/api/v2/pool
   ```

7. **The website passes the API through.**

   ```bash
   curl -s https://www.yskar.app/api/v2/summary
   ```

   The answer has the same fields as in step 1.

Comparing the state root of the node's `status` command with `/api/v2/summary` proves nothing any
more: the summary is passed through from that same node. To compare two independent computations,
compare the `stateRoot` of `/api/v2/summary` with the state root that the `status` command prints
on a different full node at the same height.
