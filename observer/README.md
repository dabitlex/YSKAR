# YSKAR observer

The observer is a small read-only tool that downloads the YSKAR chain and recomputes every block
itself. This guide is for anyone who wants to check the published chain independently without
running a full node, for example on a Raspberry Pi.

The observer's own messages are in German. This guide quotes them as they appear and explains
them.

## What it checks

The observer fetches blocks from the public read interface, `/api/v2/sync` on
`https://yskar.vercel.app`. That interface serves the mirror: a database copy of the chain that
the main node writes to and that the explorer reads from. The observer therefore verifies the
mirror's copy of the chain. It trusts none of the fields the server sends and recomputes, for
every block in order:

- that the block can be decoded and carries the expected height;
- the structure: block version, transaction count, exactly one coinbase (the transaction that
  pays the block reward) in first position, the Merkle root of the transactions, and the proof of
  work;
- that the block hash named by the server is the hash of the header;
- the consensus rules, with the same `validateBlock` function that the full node uses: link to
  the previous block, timestamp, difficulty, the signature, nonce, fee and balance of every
  transfer, the coinbase amount (block reward plus fees) and the maximum supply;
- that the state root in the header equals the root of the account state the observer computed
  itself.

Every verified block is stored on disk, so the observer also keeps a complete copy of the chain
it has checked.

## What it does not do

The observer does not take part in the network. It does not connect to other nodes, accepts no
blocks or transactions from anyone, does not choose between competing branches and cannot follow
a reorganization. It reads one source in one direction. If a block it receives does not build on
the last block it verified, it reports a deviation and stops.

Because it reads only the mirror, it cannot tell whether the mirror shows the chain with the most
work. A full node can: it performs the same verification and also takes part in the network. See
[FULLNODE.md](../docs/FULLNODE.md). The observer is the lightweight read-only alternative.

## Setup

The steps below are for Linux, including Raspberry Pi OS (64-bit). A desktop environment is not
needed.

### 1. Install Node.js

The observer requires Node.js 22 or newer.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
```

### 2. Get the code

```bash
cd ~
git clone https://github.com/dabitlex/YSKAR.git
cd YSKAR/observer
```

The whole repository is needed, not only the `observer` folder: the observer uses the consensus
code in `src/lib/core/`.

### 3. Build

```bash
npm install
npm run build
```

This bundles the observer and the consensus code into one file, `dist/yskar-observer.cjs`.

### 4. First run

```bash
node dist/yskar-observer.cjs --data ~/yskar-observer-data --once
```

The observer prints its version, the network (`Netz`), the server (`Server`) and the data folder
(`Ablage`). On the first run it reports `Kein Prüfpunkt — beginne bei Block 0.` ("no checkpoint,
starting at block 0") and then verifies the chain from the genesis block. When it has caught up,
it prints one line:

```text
[<time>] ✓ <n> Blöcke geprüft · Höhe <height> · Umlauf <amount> YSR · <seconds>s
```

That is: the number of blocks verified in this round, the height reached, the circulating supply
according to the observer's own account state, and the time taken.

With `--once` the observer catches up and exits. Without it, it keeps running and asks for new
blocks once per interval; while there is nothing new it shows `auf Höhe <height>, warte…`
("at height …, waiting").

Stop it with Ctrl+C. It ends after its current wait, which can take up to one interval.

### 5. Run as a service

Create `/etc/systemd/system/yskar-observer.service`. Replace `your-user` with your user name:

```ini
[Unit]
Description=YSKAR observer
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/home/your-user/YSKAR/observer
ExecStart=/usr/bin/node dist/yskar-observer.cjs --data /home/your-user/yskar-observer-data
Restart=always
RestartSec=30
RestartPreventExitStatus=2
Nice=10

# The observer needs write access to its data folder only.
ProtectSystem=strict
ReadWritePaths=/home/your-user/yskar-observer-data
PrivateTmp=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now yskar-observer
journalctl -u yskar-observer -f
```

The data folder must exist before the service starts; the first run in step 4 creates it.
`Nice=10` gives other programs priority. `ProtectSystem=strict` makes the file system read-only
for the service, and `ReadWritePaths` opens the one folder it writes to.
`RestartPreventExitStatus=2` keeps systemd from restarting the observer after it has found a
deviation.

## Options

| Option | Meaning | Default |
|---|---|---|
| `--api <url>` | Server whose `/api/v2/sync` route is read | `https://yskar.vercel.app` |
| `--data <folder>`, `-d` | Folder for blocks, checkpoint and log | `./daten` |
| `--interval <seconds>` | Pause between two requests for new blocks | `60` |
| `--from-scratch` | Ignore the saved checkpoint and verify again from block 0 | Off |
| `--once` | Catch up once and exit | Off |
| `--help`, `-h` | Print the help text and exit | |
| `--version`, `-v` | Print the version and exit | |

A full node serves the same `/api/v2/sync` route on its own interface (`127.0.0.1:8645` by
default). With `--api http://127.0.0.1:8645` the observer verifies the active chain of that node
instead of the mirror. Because the observer cannot follow a reorganization, it stops with a
deviation if that node switches to another branch below the height already verified.

## Storage layout

```text
daten/
  pruefpunkt.json              checkpoint: state and height, so that a restart is fast
  beobachter.log               log of the reported results, with timestamps
  bloecke/0000/00000000.bin    block 0
  bloecke/0000/00000001.bin    block 1
  …
  bloecke/0001/00001000.bin    block 1,000
```

Each `.bin` file is one block exactly as it was received and verified: the 136-byte header,
the transaction count and the transactions. Blocks are grouped in folders of 1,000 so that no
single directory grows large.

`pruefpunkt.json` ("checkpoint") holds the network name, the height and hash of the last verified
block, the state root, all account balances and nonces, and the recent block times and
difficulties that the difficulty rule needs. With it, a restart continues at the next block
instead of recomputing the whole chain.

The checkpoint is a shortcut, not a proof. When it is loaded, the observer checks that the stored
accounts produce the stored state root; if they do not, it reports
`Prüfpunkt beschädigt — beginne bei Block 0.` ("checkpoint damaged") and starts over. If you do
not want to rely on the checkpoint, start with `--from-scratch`: every block is then fetched and
verified again.

## When it finds a deviation

```text
ABWEICHUNG GEFUNDEN
  Block <height>: <kind>
  <detail>

  Der Server liefert etwas, das der Kette widerspricht.
  Geprüft bis Höhe <height>. Die Blöcke bis dahin liegen in
  <data folder>/bloecke und lassen sich nachrechnen.
```

In English: "Deviation found. The server delivers something that contradicts the chain. Verified
up to height …. The blocks up to there are in … and can be recomputed."

The observer then exits with exit code 2. This is intended: after a deviation, nothing further it
could report would be reliable. The same lines are written to `beobachter.log`.

The kind names the check that failed:

| Kind | Meaning |
|---|---|
| `unlesbar` | The block could not be decoded |
| `falsche_hoehe` | The block carries a different height than the one requested |
| `struktur` | A structural check failed. The detail names it, for example `merkle_mismatch` (the transactions do not match the Merkle root) or `pow_failed` (the hash does not meet the target). |
| `hash_stimmt_nicht` | The hash named by the server is not the hash of the header |
| `height`, `prev_hash` | The block does not follow the previous block |
| `timestamp` | The timestamp breaks the timestamp rules |
| `difficulty` | The difficulty in the header is outside the range the rules allow |
| `state` | A transaction cannot be applied. The detail names the transaction and the reason, for example `insufficient_funds`. |
| `state_root` | The state root in the header is not the root of the computed account state |
| `anwenden` | Applying the block to the observer's account state failed |

A network error is not a deviation. The observer prints it as `[<time>] ! <message>` and tries
again after the interval.
