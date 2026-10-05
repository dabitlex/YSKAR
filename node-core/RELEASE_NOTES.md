**YSKAR Node Core 0.5.1** — the full YSKAR node for Windows with its own window: wallet, mining (solo, in a pool, or running a pool), blockchain view and peers.

## New in 0.5.1

- **Loading the chain is fast again.** A freshly installed Node Core, or one that had been off for a long time, loaded only about 16 blocks every 20 to 30 seconds as long as it was more than 2,000 blocks behind, and lost its connections on the way. That is fixed. In a test on the main network the same node code loaded 3,576 blocks from an empty folder in 16 seconds; before the fix the same PC needed 78 minutes and a restart.
- **Blocks are checked faster.** The work per block no longer grows with the length of the chain. The rules are unchanged: every block is still checked completely.
- **A second way into the network.** Besides the seed from the settings, a second seed on a different machine and a different connection is built in. A new Node Core finds the network when one of the two is off.

Nothing changes in the wallet, in mining or in the settings. Your data folder and your wallet stay as they are.

## Install

1. Download and run `YSKAR-Node-Core-Setup-0.5.1.exe`.
2. The installer is not signed. Windows therefore shows “Windows protected your PC” – choose “More info” and “Run anyway”.
3. If a Node Core is already running, quit it first – also in the notification area.

To be sure, compare the checksum with the `.sha256` file:

```powershell
Get-FileHash .\YSKAR-Node-Core-Setup-0.5.1.exe -Algorithm SHA256
```

**Requirements:** Windows 10 or 11 (64-bit). For GPU mining an NVIDIA card with a current driver; without it the processor does the work.

**Update before block height 4,000:** from that height consensus revision 3 applies. Older nodes stop there. Details in `docs/CONSENSUS_V3.md`.
