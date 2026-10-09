**YSKAR Node Core 0.6.0** — the full YSKAR node for Windows with its own window: wallet, mining (solo, in a pool, or running a pool), blockchain view and peers.

## Update before block height 7,000

From block **7,000** consensus revision 5 applies, a soft fork. **Please install this version before that height**, above all if your Node Core mines or runs a pool: an older version can build blocks that updated nodes reject, and such a block would be lost. Details in `docs/CONSENSUS_V5.md`.

## New in 0.6.0

- **Consensus revision 5 (from block 7,000).** Four rules become stricter: a block's timestamp is not earlier than its parent's; a block is encoded exactly the way the node writes it and is at most 1 MB; the coinbase uses version 1 or 2 and at most 32 bytes for the name; a pool payout contains no amounts below 100 units. Below block 7,000 nothing changes.
- **Mining jobs** never get a timestamp earlier than the previous block's, even if the PC's clock is behind.
- **Running a pool:** an address whose share in a block would be below 100 units receives nothing in that block; its work stays in the window and counts for the next blocks. A pool fee below 100 units is not taken.
- **Side branches.** The node no longer checks and stores blocks that branch off far below the tip of the chain without enough work behind them, and it deletes old blocks of side branches more than 2,000 blocks below the tip. A real competing block or a heavier chain is still taken over.

Nothing changes in the wallet or in the settings. Your data folder and your wallet stay as they are.

## Install

1. Download and run `YSKAR-Node-Core-Setup-0.6.0.exe`.
2. The installer is not signed. Windows therefore shows “Windows protected your PC” – choose “More info” and “Run anyway”.
3. If a Node Core is already running, quit it first – also in the notification area.

To be sure, compare the checksum with the `.sha256` file:

```powershell
Get-FileHash .\YSKAR-Node-Core-Setup-0.6.0.exe -Algorithm SHA256
```

**Requirements:** Windows 10 or 11 (64-bit). For GPU mining an NVIDIA card with a current driver; without it the processor does the work.
