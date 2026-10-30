# YSKAR on HiveOS

This package runs the official YSKAR command-line miner on HiveOS, with one process per
graphics card: NVIDIA, AMD and Intel. It is attached to every Node Core release as `yskar-hiveos-<version>.tar.gz`.

The package contains:

- the CLI miner from [`miner/`](../miner) in this repository,
- `yskar-cuda`, the GPU miner for NVIDIA cards, built in the same release run (CUDA 12.8,
  GTX 9xx to RTX 50xx, glibc 2.17 or newer),
- `yskar-opencl`, the GPU miner for AMD and Intel cards (OpenCL), built in the same release run.
  It needs the OpenCL driver that HiveOS installs for AMD cards,
- Node.js 22 in the "glibc-217" build from the Node.js project's unofficial builds, so it also
  runs on older HiveOS images,
- the HiveOS scripts in [`yskar-hiveos/`](yskar-hiveos).

AMD and Intel support is new. It has been verified for correctness on an OpenCL runtime for the
processor, not yet on a rig with AMD or Intel cards; the self-test runs on each card before it
mines.

The stock HiveOS miners do not work with YSKAR. YSKAR's block header is 136 bytes long, not 80,
and the pool does not speak Stratum.

## Flight sheet

Create a wallet first: in HiveOS open **Wallets**, add one with coin `YSR` and your `ysr1…`
address. Then create a flight sheet:

| Field | Value |
|---|---|
| Coin | `YSR` |
| Wallet | your YSR wallet |
| Pool | Configure in miner |
| Miner | Custom |

Under **Setup Miner Config** of the custom miner:

| Field | Value |
|---|---|
| Miner name | `yskar-hiveos` |
| Installation URL | `https://github.com/dabitlex/YSKAR/releases/download/node-core-v<version>/yskar-hiveos-<version>.tar.gz` |
| Hash algorithm | leave empty |
| Wallet and worker template | `%WAL%` |
| Pool URL | `https://pool.yskar.app` (the public pool), or the address of your own pool |
| Extra config arguments | `MODE=pool` (see below) |

The miner name must be exactly `yskar-hiveos`. HiveOS takes it from the file name of the
installation URL and refuses to start a miner whose name does not match.

If your HiveOS offers **Import from Clipboard** on the flight sheet page, this does the same
(replace `<version>` twice, then choose your own wallet):

```json
{"isFavorite":false,"items":[{"coin":"YSR","pool_ssl":false,"dpool_ssl":false,"miner":"custom","miner_alt":"yskar-hiveos","miner_config":{"url":"https://pool.yskar.app","miner":"yskar-hiveos","template":"%WAL%","install_url":"https://github.com/dabitlex/YSKAR/releases/download/node-core-v<version>/yskar-hiveos-<version>.tar.gz","user_config":"MODE=pool"},"pool_geo":[]}]}
```

## Extra config arguments

One setting per line:

```
MODE=pool
GPUS=all
```

- `MODE=pool` mines in the pool given as Pool URL. `MODE=solo` mines solo against that node: a
  block pays its whole reward to you, and until then you receive nothing. Solo needs a node that
  allows it, usually your own.
- `GPUS=all` uses every card. `GPUS=0,2` uses only cards 0 and 2, counted in PCI bus order as
  HiveOS shows them, across all manufacturers. The list the package uses is written to
  `.karten` in the package folder (number, program, number in that program, bus).
- `EXTRA=…` passes further options to the CLI miner (its options are listed in
  [miner/README.md](../miner/README.md)). Most are not needed here: the package already sets
  address, node, mode, card and the program for the card.

A wallet template such as `%WAL%.%WORKER_NAME%` also works; the part after the dot is ignored,
because the miner knows only the address.

## Good to know

- Each card runs its own miner process with its own pool session. Several sessions of the same
  address take only one seat in a pool, because seats are counted per address.
- If a card's miner ends (pool unreachable, card failed), only that card restarts after 15
  seconds. The others keep mining.
- Before it mines, each process lets its card compute the hash of the genesis block and compares
  it bit by bit. A card that computes wrong does not mine.
- The miner needs no private key. It knows only the address that receives the reward.
- Logs on the rig: `/var/log/miner/custom/yskar-hiveos_gpuN.log`, one per card. The screen shown
  by `miner` prefixes every line with its card. A log that grows beyond 5 MB is cut back to its
  last 2000 lines; the share counters carry on.
- The hashrate shown in HiveOS is the 10-second value the miner prints once a minute. It appears
  about a minute after the start. A card whose log has been silent for three minutes counts as 0.

## Check the download

Every package has a `.sha256` file next to it in the release:

```bash
sha256sum -c yskar-hiveos-<version>.tar.gz.sha256
```

## Build it yourself

```bash
bash hiveos/node-holen.sh /tmp/node                  # Node.js, checked against its checksums
bash hiveos/bauen.sh <version> <path/to/yskar-cuda> /tmp/node/node-*.tar.xz release [path/to/yskar-opencl]
```

`yskar-cuda` for Linux is built by `node-core/gpu/build-gpu.sh` in the container
`nvidia/cuda:12.8.1-devel-ubuntu20.04`, `yskar-opencl` by `node-core/gpu/build-opencl.sh` in
`ubuntu:20.04`; see [node-core/gpu/README.md](../node-core/gpu/README.md).
The release workflow does exactly these steps and then installs the package the way HiveOS does
and mines with it against a local test pool (`hiveos/test/paket.test.ts`).

## Credits

The HiveOS scripts follow the package that Alexander (derhier) built and published at
[derhier/yskar-hiveos](https://github.com/derhier/yskar-hiveos).
