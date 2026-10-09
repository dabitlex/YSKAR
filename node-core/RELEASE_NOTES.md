**YSKAR Node Core 0.5.2** — the full YSKAR node for Windows with its own window: wallet, mining (solo, in a pool, or running a pool), blockchain view and peers.

## New in 0.5.2

- **Safer local interface.** The access token of the interface is no longer written into the page. The program window gets it as a cookie. Before, any program that could reach `127.0.0.1:8650` could read it from the page.
- **Running a pool works like the main pool.** The share target stays fixed for each job. A place in the pool counts only for an active miner: a new session gets a trial place for 2 minutes and keeps it by delivering a share at least every 10 minutes. Transaction fees are split by work, like the block reward, instead of going to the largest output. Jobs are built faster.
- **More robust in the network.** Limits against peers that flood the node or never deliver. Blocks are stored and passed on only in their clean encoding; extra bytes a peer attaches to a block are dropped.
- **GPU mining.** When only the share target changes, the GPU miner continues where it was instead of searching the same range again.

Nothing changes in the wallet or in the settings. Your data folder and your wallet stay as they are. The consensus rules are the same as in 0.5.1.

## Install

1. Download and run `YSKAR-Node-Core-Setup-0.5.2.exe`.
2. The installer is not signed. Windows therefore shows “Windows protected your PC” – choose “More info” and “Run anyway”.
3. If a Node Core is already running, quit it first – also in the notification area.

To be sure, compare the checksum with the `.sha256` file:

```powershell
Get-FileHash .\YSKAR-Node-Core-Setup-0.5.2.exe -Algorithm SHA256
```

**Requirements:** Windows 10 or 11 (64-bit). For GPU mining an NVIDIA card with a current driver; without it the processor does the work.

**Coming:** a network upgrade at block height 7,000 (soft fork). It needs a later Node Core version, which will be published well before that height.
