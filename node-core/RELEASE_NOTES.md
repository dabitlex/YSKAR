**YSKAR Node Core 1.0.0** — the full YSKAR node with its own window for Windows and Linux: wallet, mining (solo, in a pool, or running a pool), blockchain view and peers. This version is ready for consensus revision 6, which becomes active at block 10,000, and comes with a completely new design.

## Update before block 10,000

From block 10,000 the network follows consensus revision 6. Node Core 1.0.0 switches over by itself at that height. **Older versions (0.7.1 and earlier) stop following the network from block 10,000**, so please install 1.0.0 before then. Wallet, settings and data folder stay as they are; your address, balance and 12 words do not change.

What revision 6 brings:

- **Shared accounts:** several people manage one account, and spending needs enough signatures, e.g. 2 of 3. Their addresses start with `ysr1p…`.
- **Batch payments:** one transfer to up to 1,000 recipients, with one fee for all.
- **Larger pools:** a block can pay up to 255 miners instead of 64.
- **More room per block** when the network is busy.
- **Locked amounts** that unlock only with a secret or from a certain height.

In the last 3 blocks before block 10,000 (about 30 minutes) sending is paused. Receiving and mining continue.

## New in 1.0.0

- **New design.** Every page has a large header card with the most important figure, a YSKAR illustration and the key numbers. The window keeps its proportions when maximised; content is limited in width instead of stretching. German and English as before.
- **Overview:** the block height rolls up when a new block arrives. Hover over a bar in “Last 24 hours” to see the blocks of that hour, the average block time, who found them and the longest gap.
- **Blocks, addresses and transfers open in a window** on top of the page, on the Overview and on the Blockchain page. Use ← and → to step through blocks, Esc to close.
- **Shared accounts in the wallet** (from block 10,000): create or join an account, propose a payment, pass the co-signing file on, sign and submit it.
- **Raise the fee** of a transfer that is still waiting.
- **Notices** when you find a block solo or when a pool payout arrives.
- **Search** with Ctrl K: height, hash, address or a command.
- **Peers:** IP addresses are partly hidden by default (good for screenshots); one click shows them.
- **New app icon:** only the Y sign, transparent.
- **Linux:** the program draws its own title bar; under Settings you can switch back to the title bar of your system.

The command-line miner and the HiveOS package now use the public pool at `https://pool.yskar.app` when no address is given; otherwise they are unchanged.

## Install on Windows

1. Download and run `YSKAR-Node-Core-Setup-1.0.0.exe`.
2. The installer is not signed. Windows therefore shows “Windows protected your PC” – choose “More info” and “Run anyway”.
3. If a Node Core is already running, quit it first – also in the notification area.

```powershell
Get-FileHash .\YSKAR-Node-Core-Setup-1.0.0.exe -Algorithm SHA256
```

**Requirements:** Windows 10 or 11 (64-bit).

## Install on Linux

**Ubuntu, Debian, Linux Mint:**

```bash
sudo apt install ./YSKAR-Node-Core-1.0.0-amd64.deb
```

Then start “YSKAR Node Core” from the application menu.

**Other distributions:** make the AppImage executable and start it:

```bash
chmod +x YSKAR-Node-Core-1.0.0-x86_64.AppImage
./YSKAR-Node-Core-1.0.0-x86_64.AppImage
```

AppImages need FUSE 2 (on Ubuntu the package `libfuse2`, on 24.04 `libfuse2t64`).

Compare the checksum with the `.sha256` file:

```bash
sha256sum -c YSKAR-Node-Core-1.0.0-amd64.deb.sha256
```

**Requirements:** a 64-bit PC (x86-64) with a desktop. ARM computers such as the Raspberry Pi are not supported. The icon next to the clock needs a desktop that shows such icons (on GNOME the AppIndicator extension); without it the program runs normally.

## HiveOS

In HiveOS create a flight sheet with a custom miner: miner name `yskar-hiveos`, installation URL `https://github.com/dabitlex/YSKAR/releases/download/node-core-v1.0.0/yskar-hiveos-1.0.0.tar.gz`, wallet template `%WAL%`, pool URL `https://pool.yskar.app` and extra config `MODE=pool`. Details and all options are in [hiveos/README.md](https://github.com/dabitlex/YSKAR/blob/main/hiveos/README.md).

## GPU mining

One or more NVIDIA cards with a current driver (on Linux a driver for CUDA 12). Without one the processor does the work. The GPU miner is also attached as a single file, `yskar-cuda-1.0.0-linux-x86_64`, for mining systems without a desktop.
