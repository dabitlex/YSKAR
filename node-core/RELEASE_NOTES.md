**YSKAR Node Core 1.2.0** — the full YSKAR node with its own window for Windows and Linux: wallet, mining (solo, in a pool, or running a pool), blockchain view and peers. This version keeps the node responsive when many transfers are waiting at once.

## New in 1.2.0

- **Stays responsive under heavy load.** When tens of thousands of transfers are waiting, the node no longer freezes. In a test network of 5 nodes running the same node code, with 190,000 waiting transfers, the longest pause of a node fell from 36–47 seconds to about 5 seconds, and a new block reached all nodes within about 6 seconds instead of up to 39.
- **Less traffic between nodes.** Announcements of new transfers are collected for a quarter of a second and sent together instead of one message per transfer. A node that connects receives the waiting transfers right away, so all nodes see the same queue.
- **Compact blocks.** Between nodes of this version a new block travels as a short list of transfer IDs instead of all transfers again; only missing transfers are fetched. Older nodes keep receiving blocks as before. No consensus rule changes: 1.2.0 accepts exactly the same blocks as 1.1.0.
- **Mempool page** shows the newest 200 waiting transfers without going through the whole queue every few seconds.

## Consensus revision 6 (since block 10,000)

Since block 10,000 the network follows consensus revision 6. Node Core 1.0.0 and newer follow it; **0.7.1 and earlier no longer follow the network.** Wallet, settings and data folder stay as they are when you update; your address, balance and 12 words do not change.

Revision 6 brings shared accounts (`ysr1p…`, e.g. 2 of 3 signatures), batch payments to up to 1,000 recipients with one fee, pools paying up to 255 miners, more room per block and locked amounts.

## New in 1.1.0

- **Sign messages.** In the wallet, “Sign” signs a text with your address, for example to prove that an address is yours. The password is asked every time. “Verify” checks a signed message from someone else.
- **Sign in to YSKAR Lab with one click.** On [lab.yskar.app](https://lab.yskar.app), “Sign in with wallet” opens Node Core. It shows the website, your address and how long the request is valid, and signs only after you confirm with your password. Your 12 words and your password never leave your PC. Only `yskar.app` and its subdomains are accepted. With the Linux AppImage the browser does not always hand the link to Node Core; use the `.deb` package or sign the message by hand.
- **GPU mining on AMD and Intel cards.** Next to NVIDIA cards, Node Core now mines on AMD and Intel graphics cards with OpenCL. All cards appear in one list on the Mining page. Before a card mines, it computes the genesis hash as a self-test; a card that fails is not used.

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

1. Download and run `YSKAR-Node-Core-Setup-1.2.0.exe`.
2. The installer is not signed. Windows therefore shows “Windows protected your PC” – choose “More info” and “Run anyway”.
3. If a Node Core is already running, quit it first – also in the notification area.

```powershell
Get-FileHash .\YSKAR-Node-Core-Setup-1.2.0.exe -Algorithm SHA256
```

**Requirements:** Windows 10 or 11 (64-bit).

## Install on Linux

**Ubuntu, Debian, Linux Mint:**

```bash
sudo apt install ./YSKAR-Node-Core-1.2.0-amd64.deb
```

Then start “YSKAR Node Core” from the application menu.

**Other distributions:** make the AppImage executable and start it:

```bash
chmod +x YSKAR-Node-Core-1.2.0-x86_64.AppImage
./YSKAR-Node-Core-1.2.0-x86_64.AppImage
```

AppImages need FUSE 2 (on Ubuntu the package `libfuse2`, on 24.04 `libfuse2t64`).

Compare the checksum with the `.sha256` file:

```bash
sha256sum -c YSKAR-Node-Core-1.2.0-amd64.deb.sha256
```

**Requirements:** a 64-bit PC (x86-64) with a desktop. ARM computers such as the Raspberry Pi are not supported. The icon next to the clock needs a desktop that shows such icons (on GNOME the AppIndicator extension); without it the program runs normally.

## HiveOS

In HiveOS create a flight sheet with a custom miner: miner name `yskar-hiveos`, installation URL `https://github.com/dabitlex/YSKAR/releases/download/node-core-v1.2.0/yskar-hiveos-1.2.0.tar.gz`, wallet template `%WAL%`, pool URL `https://pool.yskar.app` and extra config `MODE=pool`. Details and all options are in [hiveos/README.md](https://github.com/dabitlex/YSKAR/blob/main/hiveos/README.md).

## GPU mining

- **NVIDIA:** one or more cards with a current driver (on Linux a driver for CUDA 12).
- **AMD and Intel (new):** a current graphics driver with OpenCL. On Windows the normal driver is enough. On Linux, AMD cards need ROCm or the AMDGPU-PRO OpenCL driver, Intel cards the Intel Compute Runtime. AMD and Intel support is new; if your card fails its self-test or mines slower than expected, please tell us in the group.

Without a suitable card the processor does the work. The GPU miners are also attached as single files, `yskar-cuda-1.2.0-linux-x86_64` and `yskar-opencl-1.2.0-linux-x86_64`, for mining systems without a desktop. The command-line miner chooses with `--gpu-api auto|cuda|opencl`.
