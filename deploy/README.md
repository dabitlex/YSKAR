# Running the node as a systemd service

This guide shows how to run the YSKAR full node as a systemd service on Linux, so that it starts
at boot and comes back after a crash. It is written for operators of a node on a Raspberry Pi or a
server; the files in this folder are the ones the main node uses.

A node started by hand in a terminal stops when the session ends. While the main node is down, the
web app can neither mine solo nor send, because solo mining sessions and transfers go to that node,
and the public pool it runs is down as well. The explorer keeps working, because it reads from the
database mirror.

## The files

| File | Purpose | Who needs it |
|---|---|---|
| `yskar-node.service` | the node; starts at boot | every node |
| `yskar-spiegel.service` | one run of the `spiegel` command, which pushes missing blocks to the mirror | the main node only |
| `yskar-spiegel.timer` | starts that run every 5 minutes | the main node only |
| `node.env.example` | template for the file that holds the mirror token | the main node only |

The mirror (German "Spiegel") is the read-only database copy of the chain behind
`https://yskar.vercel.app`. Only the main node writes to it; see
[OPERATIONS.md](../docs/OPERATIONS.md).

## The values in the unit files are an example

The unit files contain the values of the main node. They are an example, not defaults:

| Setting | Value in the files | Change it to |
|---|---|---|
| `User`, `Group` | `cointastig` | the user that owns your checkout |
| `WorkingDirectory` | `/home/cointastig/YSKAR/node` | the `node` folder of your checkout |
| `ReadWritePaths` | `/home/cointastig/YSKAR/node/knoten` | your data folder (`--data`, resolved against the working directory) |
| Path to Node.js in `ExecStart` | `/usr/bin/node` | the output of `which node` |
| Start command in `ExecStart` | `mine --data ./knoten --bind 127.0.0.1 --port 8645 --p2p-port 8646 --pool yskar-main.dynv6.net --pool-fee 0` | see below |

The start command in `yskar-node.service` is the one of the main node. It has no `--seed` and no
`--no-upstream`, because the main node is the node that writes to the mirror, and it runs the
public pool under the name `yskar-main.dynv6.net` without a fee.

**Every other node uses the standard start command** with both seeds and `--no-upstream`:

```bash
node dist/yskar-node.cjs mine --data ./knoten --seed yskar-main.dynv6.net:8646 --seed 45.84.199.206:8646 --no-upstream
```

In the unit file that becomes:

```ini
ExecStart=/usr/bin/node dist/yskar-node.cjs mine \
    --data ./knoten \
    --seed yskar-main.dynv6.net:8646 \
    --seed 45.84.199.206:8646 \
    --no-upstream
```

If your node runs a pool, the pool flags follow (`--pool`, `--pool-fee`, `--pool-payout`,
`--pool-max`); see [POOL.md](../docs/POOL.md). All commands and flags of the node are described
in [FULLNODE.md](../docs/FULLNODE.md).

A node that is not the main node does not install `yskar-spiegel.service` and
`yskar-spiegel.timer` and needs no `node.env` file.

## Before you start: check the path to Node.js

This is where systemd units fail most often.

```bash
which node
node --version
```

systemd does not know the `PATH` of your shell and does not load nvm. If `which node` prints
anything other than `/usr/bin/node`, change the path in **both** service files. The version must
be 22 or newer: the node uses `node:sqlite`, which older versions do not have.

The node must be built before the service can start it (`npm install` and `npm run build` in the
`node` folder; see [FULLNODE.md](../docs/FULLNODE.md)).

## Set up the node service

```bash
cd ~/YSKAR

# 1. Is a node still running by hand? Stop it first.
pkill -INT -f "yskar-node.cjs mine"

# 2. Install the unit
sudo cp deploy/yskar-node.service /etc/systemd/system/
sudo systemctl daemon-reload

# 3. Start the node and enable it at boot
sudo systemctl enable --now yskar-node
systemctl status yskar-node

# 4. Watch whether it really runs
journalctl -u yskar-node -f
```

Check the node on the machine itself:

```bash
curl -s http://127.0.0.1:8645/api/v2/status
```

For the main node, also check from outside. The web server passes `/api/v2/summary` through from
the main node:

```bash
curl -s https://yskar.vercel.app/api/v2/summary | head -c 200
```

If a height comes back instead of HTTP 503 with `chain_unreachable`, the node is up and reachable.

What the unit does:

- `Restart=always` with `RestartSec=10` restarts the node ten seconds after it ends, whether it
  crashed or exited cleanly.
- `StartLimitBurst=5` and `StartLimitIntervalSec=120` stop the restarts after five failed starts
  within two minutes. Then something is broken that a restart does not fix, and
  `systemctl status yskar-node` shows it.
- `KillSignal=SIGINT` stops the node the way Ctrl+C does, so that it closes its SQLite store in an
  orderly way.
- Output goes to the journal: `journalctl -u yskar-node -f`.

## Main node only: the mirror service and timer

The running node pushes every block it accepts to the mirror at once. The timer is the safety net
for every block where that failed: the web server was briefly away, the node was restarted, the
connection dropped. The mirror accepts only the next block, so a single lost block stops all that
follow.

```bash
sudo cp deploy/yskar-spiegel.service /etc/systemd/system/
sudo cp deploy/yskar-spiegel.timer   /etc/systemd/system/
sudo systemctl daemon-reload

sudo systemctl enable --now yskar-spiegel.timer
systemctl list-timers yskar-spiegel.timer
```

The timer starts the first run two minutes after boot and then one run every five minutes, each
with a random delay of up to 60 seconds (`OnBootSec=2min`, `OnUnitActiveSec=5min`,
`RandomizedDelaySec=60`). A run with nothing to push costs one HTTP request.

To trigger a run at once instead of waiting:

```bash
sudo systemctl start yskar-spiegel
journalctl -u yskar-spiegel -n 30 --no-pager
```

The `spiegel` command ends with exit status 0 even when the mirror rejects a block. Read its
output in the journal; the status of the service alone does not tell you.

## Main node only: lock the mirror with a token

Do this only when node and timer run cleanly.

```bash
openssl rand -hex 32

sudo mkdir -p /etc/yskar
sudo cp deploy/node.env.example /etc/yskar/node.env
sudo nano /etc/yskar/node.env          # enter the value
sudo chown root:root /etc/yskar/node.env
sudo chmod 600 /etc/yskar/node.env
sudo systemctl restart yskar-node
```

The restart ends all mining sessions and empties the PPLNS window of a pool the node runs; see
"Updating a node" in [OPERATIONS.md](../docs/OPERATIONS.md#updating-a-node).

**Only then** set `YSKAR_SPIEGEL_TOKEN` to the same value in the Vercel app project and redeploy.
The order matters: the other way round the web server already requires the token while the node
does not send it yet, every block is rejected with HTTP 401, and the mirror stops. The reason is
explained in `node.env.example` and in [OPERATIONS.md](../docs/OPERATIONS.md#the-mirror-token).

Both service files read `/etc/yskar/node.env` (`EnvironmentFile=-/etc/yskar/node.env`). The
leading `-` means: if the file is missing, the service starts anyway and sends no token.

## Two things you should know

**The timer run reads the store while the node writes to it.** That works because the store is a
SQLite database in WAL mode and the `spiegel` command writes no blocks. If a run fails anyway, the
next timer run makes up for it; the chain takes no harm.

**`ProtectHome=read-only` with `ReadWritePaths` on the data folder.** The service may write to its
data folder and nowhere else in the home directory. If you move the data folder, change this line
too. Otherwise the node starts and cannot store anything.

## If something does not work

```bash
systemctl status yskar-node
journalctl -u yskar-node -n 50 --no-pager
```

| Symptom | Cause |
|---|---|
| `status=203/EXEC` | Almost always the wrong path to Node.js. See above. |
| `Read-only file system` when writing | `ReadWritePaths` does not point to the data folder that is actually used. |
| The node runs, but `https://yskar.vercel.app/api/v2/summary` answers 503 | Not the service. Look at the reverse proxy, the DNS name or the dynamic DNS service in front of the node. |
