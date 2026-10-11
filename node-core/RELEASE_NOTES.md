**YSKAR Node Core 0.7.1** — the full YSKAR node with its own window for Windows and Linux: wallet, mining (solo, in a pool, or running a pool), blockchain view and peers. This version mines with several graphics cards at once and adds a package for HiveOS.

## New in 0.7.1

- **Several graphics cards at once.** The Mining page lists every NVIDIA card with a checkbox. Each selected card runs its own GPU program with its own self-test, so no two cards check the same work. In a pool all cards of one address take a single place. If one card fails, the others keep mining, and the page shows the reason next to that card. The measurements show the sum and each card.
- **Reworked GPU kernel.** The SHA-256 work now stays entirely in the card's registers instead of partly in its slower local memory. The results are identical; they are checked against an independent implementation. On a GeForce 940MX the hashrate is unchanged (about 106 MH/s before and after). Whether newer cards gain has not been measured yet.
- **HiveOS package.** `yskar-hiveos-0.7.1.tar.gz` contains the command-line miner, the GPU miner and Node.js for HiveOS rigs: one miner per card, logs per card, hashrate and shares in the HiveOS dashboard, no fee. The flight sheet is described in [hiveos/README.md](https://github.com/dabitlex/YSKAR/blob/main/hiveos/README.md). It builds on the package by derhier.
- **Command-line miner:** after a new block in the network it now fetches new work at once. Before, it could keep working on outdated work for up to 45 seconds and counted the answers as rejected shares (`job_unknown`). This applies to the command-line miner and the HiveOS package; Node Core itself already handled it.

Wallet, settings and data folder stay as they are. Consensus revision 5 from block 7,000 is included since 0.6.0.

The HiveOS package has passed the automatic checks: it is installed the way HiveOS does it and mines against a test pool. It has not yet run on a real HiveOS rig; please report anything that does not work as an issue on GitHub.

## Install on Windows

1. Download and run `YSKAR-Node-Core-Setup-0.7.1.exe`.
2. The installer is not signed. Windows therefore shows “Windows protected your PC” – choose “More info” and “Run anyway”.
3. If a Node Core is already running, quit it first – also in the notification area.

```powershell
Get-FileHash .\YSKAR-Node-Core-Setup-0.7.1.exe -Algorithm SHA256
```

**Requirements:** Windows 10 or 11 (64-bit).

## Install on Linux

**Ubuntu, Debian, Linux Mint:**

```bash
sudo apt install ./YSKAR-Node-Core-0.7.1-amd64.deb
```

Then start “YSKAR Node Core” from the application menu.

**Other distributions:** make the AppImage executable and start it:

```bash
chmod +x YSKAR-Node-Core-0.7.1-x86_64.AppImage
./YSKAR-Node-Core-0.7.1-x86_64.AppImage
```

AppImages need FUSE 2 (on Ubuntu the package `libfuse2`, on 24.04 `libfuse2t64`).

Compare the checksum with the `.sha256` file:

```bash
sha256sum -c YSKAR-Node-Core-0.7.1-amd64.deb.sha256
```

**Requirements:** a 64-bit PC (x86-64) with a desktop. ARM computers such as the Raspberry Pi are not supported. The icon next to the clock needs a desktop that shows such icons (on GNOME the AppIndicator extension); without it the program runs normally.

## HiveOS

In HiveOS create a flight sheet with a custom miner: miner name `yskar-hiveos`, installation URL `https://github.com/dabitlex/YSKAR/releases/download/node-core-v0.7.1/yskar-hiveos-0.7.1.tar.gz`, wallet template `%WAL%`, pool URL `https://yskar-main.dynv6.net` and extra config `MODE=pool`. Details and all options are in [hiveos/README.md](https://github.com/dabitlex/YSKAR/blob/main/hiveos/README.md).

## GPU mining

One or more NVIDIA cards with a current driver (on Linux a driver for CUDA 12). Without one the processor does the work. The GPU miner is also attached as a single file, `yskar-cuda-0.7.1-linux-x86_64`, for mining systems without a desktop.
