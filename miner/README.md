# YSKAR miner

The command-line miner for Windows, macOS and Linux. This guide is for anyone who wants to mine
YSR from a terminal, either in a pool or against their own full node. The miner needs only an
address: no private key, no wallet and no sign-up.

The reward of a block goes to the address you give the miner. That is all the miner knows about
you. You can therefore run it on a computer you do not control, and someone else can mine for you
without being given anything secret.

The miner's own messages are in German. This guide quotes them as they appear and explains them.

## Requirements

The miner needs Node.js 20 or newer. Check what you have:

```bash
node --version
```

If the answer starts with `v20` or a higher number, continue with the next section.

- **Windows:** download the LTS version from [nodejs.org](https://nodejs.org) and run the
  installer. Then open a new Command Prompt window, because a window that was already open does
  not know `node` yet.
- **macOS:** install from [nodejs.org](https://nodejs.org), or with Homebrew:

  ```bash
  brew install node
  ```

- **Linux:** use the package manager of your distribution. On Debian, Ubuntu and Raspberry Pi OS:

  ```bash
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt install -y nodejs
  ```

## Get the code

Clone the repository and change into the `miner` folder:

```bash
git clone https://github.com/dabitlex/YSKAR.git
cd YSKAR/miner
```

There is nothing to install. The miner has no runtime dependencies, so `npm install` is not
needed. Everything it uses is in this folder: `src/` and the file `miner.<hash>.wasm`, which is
the hashing engine. Copying only the `miner` folder to another computer is enough.

## Run the self-test

```bash
node src/selbsttest.mjs
```

The self-test needs no network. It recomputes the hash of the genesis block (the first block of
the chain) and compares it with the known result, then measures one CPU core for a moment. It
prints five lines:

| Line | Meaning |
|---|---|
| `Engine` | The engine file that was found, for example `miner.57f237a2a4.wasm` |
| `Selbsttest  bestanden (Genesis-Hash stimmt)` | Passed: the computed genesis hash is correct |
| `Ein Kern` | Measured hashrate of one core |
| `Kerne` | Number of CPU cores |
| `Erwartet` | The one-core figure multiplied by the default number of threads |

If the test passes, the engine and the way the miner builds a block header fit together. If it
fails, do not mine with this folder. Every computing thread runs the same check when it starts
and reports `Thread <n>: Selbsttest fehlgeschlagen …` if it fails.

## Get an address

You need a YSKAR address. It begins with `ysr1` and has 42 characters, for example:

```text
ysr1at4jxzcln84ys38s0spw23l0wn7pquz5w6eyf4
```

Every YSKAR wallet shows your own address on its "Receive" screen: the Android app, Node Core, or
the Telegram Mini App. If you have no wallet yet, create one, write the twelve words down on
paper, and then copy the address.

The address is public and safe to pass on. The twelve words are not: whoever has them controls
the funds.

## Start mining

The server comes from `--api`; without it the miner uses the public main node (see below).
There are two choices.

### In the public pool

```bash
node src/cli.mjs --address ysr1… --api https://yskar-main.dynv6.net --mode pool
```

In a pool, the reward of every block the pool finds is split among the miners by the work they
contributed. The miner proves its work with shares: a share is a hash that meets an easier target
than a block. The block itself pays each address directly. [POOL.md](../docs/POOL.md) explains
how the split works. To mine in another pool, put its address after `--api`.

### Solo against your own full node

```bash
node src/cli.mjs --address ysr1… --api http://127.0.0.1:8645
```

Solo means that a block you find pays its whole reward to your address, and that you receive
nothing until you find one. You need a running full node started with the `mine` command; its
mining interface listens on `127.0.0.1:8645` by default. [FULLNODE.md](../docs/FULLNODE.md)
describes how to set one up.

### Without `--api`

Without `--api` the miner contacts the public main node, `https://yskar-main.dynv6.net`, in the
mode given by `--mode` (solo unless you choose `pool`). Until 9 October 2026 the default was
`https://yskar.vercel.app`, which no longer hands out mining work and answers every request for a
mining session with HTTP 410 (issue #8).

### Entering and saving the address

If you start the miner in a terminal without `--address` and no address is saved yet, it asks
for the address (`YSKAR-Adresse:`) and then whether to remember it
(`Adresse merken, damit die Frage künftig entfällt? [J/n]`; `J` or Enter means yes).

If you agree, it writes the file `yskar-miner.json` into the `miner` folder. The file holds the
address, the number of threads and the intensity, all of which are public. It does not hold the
server or the mode, so `--mode pool` is still needed on every start, and `--api` whenever you do
not use the public main node:

```bash
node src/cli.mjs --api https://yskar-main.dynv6.net --mode pool
```

The saved values are used only when `--address` is not given. `--forget` deletes the file.

### While the miner runs

At the start the miner prints two blocks of information. The most important lines:

| Line | Meaning |
|---|---|
| `RECHENWERK` | What computes: number of CPU threads, graphics card, intensity |
| `ADRESSE` | The address that receives the reward |
| `KNOTEN` | The server given with `--api` |
| `MODUS` | `Solo` or `Pool` |
| `NETZ` | Block height, network difficulty, active miners and network hashrate as reported by the server |
| `SITZUNG` | The ID of your mining session on the node |
| `SHARE-ZIEL` | The share difficulty the node asks of this session |
| `POOL` | Pool name, fee and number of miners (pool mode only) |
| `PARALLEL` | Shown when more than one miner is working for this address on this node |

Then events follow, one per line:

| Message | Meaning |
|---|---|
| `neue Arbeit · Block N · Difficulty D` | New work: the miner now works on block height N |
| `angenommen #n · Difficulty d · p % eines Blocks` | Share number n was accepted. `d` is the difficulty this hash reached; `p` is that value as a percentage of the block difficulty. At 100 % the share is a block. |
| `Ziel angepasst a → b` | The node changed the share difficulty of your session |
| `abgelehnt <reason>` | A share was rejected, with the node's reason |
| `BLOCK GEFUNDEN  #N   +R YSR` | You found block N. The next line shows the block hash. |
| `Einreichen fehlgeschlagen: …` | A share could not be sent (network error) |
| `Sitzung beim Knoten beendet (…) — melde neu an …` | The node no longer knows your session. The computing threads pause and the miner opens a new session. |
| `neu angemeldet · Sitzung …` | The new session is open and mining continues |
| `Anmeldung fehlgeschlagen: … — es wird alle 15 s erneut versucht` | The new session could not be opened yet. The miner keeps trying every 15 seconds and prints the reason once. |
| `Keine Arbeit vom Knoten: …` | The node answered the request for work with an error |
| `Job holen fehlgeschlagen: …` | New work could not be fetched (network error) |

Once a minute the miner prints the hashrate over the last 10 seconds, 60 seconds and 15 minutes,
the total number of hashes and the running time.

In a terminal with at least 20 rows, four lines stay fixed at the top: block height and
difficulty, the current hashrate with accepted and rejected shares, temperatures where the
system exposes sensors, and a separator. The fixed header is not used when the environment
variable `NO_COLOR` is set. While it is active, lines that scroll out at the top are not kept in
the scrollback of most terminals. Start with `--einfach` to turn the fixed header off and keep
the full scrollback. If the window looks wrong after the miner ends, type `cls` (Windows) or
`reset`.

Keys while the miner runs in a terminal:

| Key | Action |
|---|---|
| `h` | Hashrate over 10 s, 60 s and 15 min, per thread, and temperatures |
| `s` | Summary: running time, hashes, shares, blocks |
| `c` | Connection: server, address, session, share difficulty |
| `q` or Ctrl+C | Stop |

When you stop it with `q` or Ctrl+C in a terminal, the miner closes its session on the node and
prints a summary.

## Several miners on one address

Running several miners for the same address is intended: phone and computer at the same time,
several computers, or several instances on one computer. All rewards go to the same address.

Every session receives its own extranonce from the node. The extranonce is a field of the block
header, so two sessions never search the same hashes and no work is done twice.

The limits are on the node, not per address:

- A node keeps at most 5,000 open sessions in total.
- A session that the node has not heard from for 300 seconds expires. A miner that crashed
  therefore disappears by itself after five minutes.
- A pool has a limited number of seats (at most 64, or 63 if the pool charges a fee; the
  operator can set fewer). Seats count addresses, not devices: a second device mining for an
  address that already has a seat does not need another one. See [POOL.md](../docs/POOL.md).

## Options

Options can be written as `--option value` or `--option=value`.

| Option | Short | Meaning | Default |
|---|---|---|---|
| `--address <ysr1…>` | `-a` | Address that receives the reward | Required, unless saved in `yskar-miner.json` or entered at the prompt |
| `--workers <n>` | `-w` | Number of CPU threads | CPU cores minus 1, at least 1 |
| `--intensity <1-100>` | `-i` | Share of the time the CPU threads compute, in percent | `100` |
| `--api <url>` | | Server that hands out work: a pool or your own full node | `https://yskar-main.dynv6.net` (the public main node) |
| `--mode <solo\|pool>` | | Mine solo or in the pool of the node. Any value other than `pool` means solo. | `solo` |
| `--gpu` | | Compute with the graphics card instead of the CPU | Off |
| `--cpu-gpu` | | Compute with CPU and graphics card at the same time | Off |
| `--device <n>` | | Number of the graphics card to use | `0` |
| `--gpu-bin <path>` | | Path to the `yskar-cuda` program if the miner does not find it | Searched automatically, see below |
| `--forget` | | Delete the saved `yskar-miner.json` and exit | |
| `--einfach` | | No fixed header at the top; the scrollback stays complete ("einfach" means "plain") | Off |
| `--help` | `-h` | Print the help text and exit | |
| `--version` | `-v` | Print the version and exit | |

An unknown option ends the miner with an error and the help text.

```bash
# Mine in the background without slowing the computer down much
node src/cli.mjs -a ysr1… --api https://yskar-main.dynv6.net --mode pool -w 2 -i 50

# Use eight threads at full intensity
node src/cli.mjs -a ysr1… --api https://yskar-main.dynv6.net --mode pool -w 8 -i 100
```

By default the miner uses all cores but one, so that the computer stays usable.

`--intensity` really reduces the work: each thread computes for a moment and then sleeps for a
proportional time. At 50 the miner computes half as many hashes.

## GPU mining

The miner can use NVIDIA graphics cards. Other manufacturers are not supported.

GPU mining needs a separate program, `yskar-cuda` (`yskar-cuda.exe` on Windows), which is not
part of this folder. It is built from the sources in `node-core/gpu`; the build script there is
for Windows. See [node-core/gpu/README.md](../node-core/gpu/README.md).

```bash
# Graphics card only
node src/cli.mjs -a ysr1… --api https://yskar-main.dynv6.net --mode pool --gpu

# CPU and graphics card together
node src/cli.mjs -a ysr1… --api https://yskar-main.dynv6.net --mode pool --cpu-gpu
```

The miner looks for the program in these places, in this order:

1. `miner/gpu/`
2. `node-core/gpu/bin/` in the repository (where the build script puts it)
3. `gpu/bin/` below the current working directory
4. the current working directory

With `--gpu-bin <path>` it uses that file only.

Before the first job the miner runs the program's self-test, in which the card computes the
genesis hash. A card that fails is not used. What happens next depends on the mode:

| Situation | With `--gpu` | With `--cpu-gpu` |
|---|---|---|
| Program not found (`yskar-cuda nicht gefunden.`) | The miner stops | Mining continues on the CPU |
| Self-test fails (`GPU nicht verwendbar: …`) | The miner stops | Mining continues on the CPU |
| Program ends while mining (`GPU ausgefallen: …`) | The miner stops | Mining continues on the CPU |

With `--gpu` no CPU threads run, and `--workers` and `--intensity` have no effect.

With `--cpu-gpu` the CPU threads search the upper half of the nonce range (from 2^63), the card
counts up from 0, so the two never compute the same hash. Before 9 October 2026 CPU thread 0
started at 0 as well and mostly repeated the card's work (issue #4).

## Building a standalone executable

The scripts in `build/` are meant to pack the miner together with the Node.js runtime into a
single file that runs without an installed Node.js: `dist/yskar-miner.exe` on Windows,
`dist/yskar-miner` on macOS and Linux.

```bash
cd YSKAR/miner
npm install            # once, for building only (esbuild and postject)
npm run build:exe
```

Until 9 October 2026 this build stopped at start-up with `ERR_INVALID_ARG_TYPE`, because
`src/gpu.mjs` determined its own folder with `import.meta.url`, which does not exist in the bundled
file (issue #8). `src/gpu.mjs` now uses `__dirname` when it is bundled, as `src/cli.mjs` already
did. Tested on Linux: `npm run build:exe` finishes, and the executable answers `--version`.

How the build is designed:

- `build/bundle.mjs` combines the source into one CommonJS file, `dist/yskar-miner.cjs`. An
  executable has no folder of source files next to it, so the hashing engine is embedded as
  base64 text and the source of the computing threads is embedded as a string.
- `build/exe.mjs` uses the "single executable application" feature of Node.js 20 and newer: it
  turns the bundle into a data block, copies the `node` binary of the build machine, and writes
  the data block into the copy with `postject`.
- The executable is always built for the system the build runs on. A Windows `.exe` can only be
  built on Windows, because the Windows `node.exe` is its base.
- Node.js is needed to build. It is not needed to run the finished file.
- The source is the same as when the miner runs from the folder; `src/cli.mjs` detects both
  cases.

In Windows PowerShell, `npm` may be refused because PowerShell does not run scripts by default.
Use `npm.cmd install` and `npm.cmd run build:exe` there, or use the Command Prompt (`cmd`).

## Installing as a command

To make `yskar-miner` available from any folder:

```bash
cd YSKAR/miner
npm link
yskar-miner -a ysr1… --api https://yskar-main.dynv6.net --mode pool
```

Undo it with `npm unlink -g yskar-miner`.

## Running permanently as a service

On Linux with systemd, create `/etc/systemd/system/yskar-miner.service`:

```ini
[Unit]
Description=YSKAR miner
After=network-online.target

[Service]
ExecStart=/usr/bin/node /path/to/YSKAR/miner/src/cli.mjs --address ysr1… --api https://yskar-main.dynv6.net --mode pool --intensity 80
Restart=always
RestartSec=15
User=your-user
Nice=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now yskar-miner
journalctl -u yskar-miner -f
```

`Nice=10` gives other programs priority.

Notes for running without a terminal:

- The miner cannot ask for the address. Pass `--address`, or the miner ends with
  `Es fehlt die Adresse.` ("the address is missing").
- When the service is stopped, the miner exits at once without closing its session. The node
  drops the session after 300 seconds.
- If the node restarts or forgets the session, the miner opens a new session by itself and
  continues. No restart of the service is needed.

## Troubleshooting

**`Verbindung fehlgeschlagen: …` (connection failed).** The server refused the session or cannot
be reached. Check that `--api` is set and correct. The miner prints the address to test; for the
public pool:

```bash
curl https://yskar-main.dynv6.net/api/v2/summary
```

If the message continues with `Mining und Transaktionen laufen nicht mehr über diese Adresse`,
you are talking to `https://yskar.vercel.app`, the old default of miner versions before 9 October
2026: update the miner or set `--api https://yskar-main.dynv6.net`. If it continues with
`Pool voll`, all seats of the pool are taken by active miners; a seat of a miner who stops
becomes free again after a few minutes.

**`Das sieht nicht nach einer YSKAR-Adresse aus.` (this does not look like a YSKAR address).**
The address begins with `ysr1` and has 42 characters. A space or a line break is easily copied
along with it.

**The self-test fails.** If it prints `miner.<hash>.wasm nicht gefunden.`, the engine file is
missing: fetch the folder again. If it prints `Selbsttest fehlgeschlagen`, the engine file does
not match this version of the miner.

**The node refuses the session at start.** The miner prints the reason and ends. It never
continues without a session:

- `Der Knoten nimmt diese Adresse nicht an.` ("the node does not accept this address"): the
  address contains a typing error. The miner checks only the form of the address; the node also
  checks its checksum.
- `Dieser Knoten betreibt keinen Pool.` ("this node runs no pool"): you asked for `--mode pool`,
  but the node at `--api` runs no pool. The miner does not fall back to solo mining. Start it
  without `--mode pool`, or against a node that runs a pool.
- `Der Knoten hat zu viele offene Sitzungen.` ("the node has too many open sessions"): the node
  has reached its limit. Try again a few minutes later.

**`Sitzung beim Knoten beendet … melde neu an`.** The node no longer knows your session: it was
restarted, it did not hear from the miner for 300 seconds, or its name now points to another
machine. The miner pauses its threads, opens a new session and continues; you see
`neu angemeldet` when it has succeeded. If the node cannot be reached or refuses the session,
the miner prints `Anmeldung fehlgeschlagen` with the reason and tries again every 15 seconds.
In pool mode it waits for the pool and never switches to solo mining by itself.

**Other rejected shares.** Single rejections are normal. They happen when the node has just
changed the share difficulty of the session. Rejections with the reasons `duplicate` and
`low_difficulty` are counted but not printed. A share that the node answers with `stale_job` (the
chain has moved on) or `job_expired` (the work is too old) is not counted as rejected; the miner
fetches new work instead.

**No shares although a hashrate is shown.** A new session starts with a low share difficulty,
and the node then adjusts it so that a share arrives about every 30 seconds. If no share is
accepted for several minutes, stop the miner and run the self-test.

**`yskar-cuda nicht gefunden.`** The GPU program is not in any of the places listed under
"GPU mining". Build it, or give its location with `--gpu-bin`.

## What the miner does not do

It handles no keys, cannot move any funds, and stores nothing except the optional
`yskar-miner.json`. It knows one address and computes hashes.

What it does can be checked: the source code is public, and every share it submits is recomputed
by the node. The miner cannot claim work it has not done.
