# Consensus revision 3: fee per byte and dust limit

This is the design record of consensus revision 3. It explains how the minimum fee of a transfer changes
from a fixed amount to a rate per byte, why a smallest amount is introduced, and who has to update before
the activation height. The rules themselves are also part of the specification in
[PROTOCOL.md](PROTOCOL.md); the fee estimator and the relay policy are described in [FEES.md](FEES.md).

| | |
|---|---|
| Revision | 3 |
| Activation height | 4,000 |
| Constant | `FEE_V3_HEIGHT` in `src/lib/core/params.ts` |
| Status | Applies from height 4,000 |
| Decided | At height 2,880, on 2026-09-30 |

## What changes

| | Up to height 3,999 | From height 4,000 |
|---|---|---|
| Minimum fee (consensus) | `MIN_FEE` = 0.001 YSR, fixed | Size in bytes x `MIN_FEE_RATE` = 1 unit per byte. A transfer without a memo is 168 bytes and needs 168 units = 0.00000168 YSR |
| Smallest amount (consensus) | 1 unit | `DUST_LIMIT` = 100 units (0.000001 YSR) |
| Relay (policy, not consensus) | `MIN_FEE` | Size in bytes x `RELAY_FEE_RATE` = 10 units per byte. A waiting transfer is replaced only by one that pays at least the old fee plus this relay minimum |

The `fee` field of the transaction does not change; the rate is only the calculation `fee / bytes`. Old
blocks stay valid byte for byte, because below the activation height the old rule continues to apply.

The constants are in `src/lib/core/params.ts` (`FEE_V3_HEIGHT`, `MIN_FEE_RATE`, `DUST_LIMIT`,
`RELAY_FEE_RATE`), together with `minFeeAt()`, which returns the consensus minimum for a height and a
size. The check is in `checkTransfer()` in `src/lib/core/tx.ts`. When `checkTransfer()` is called without
a height it applies the old, stricter rule; the code never guesses the looser one.

## Why

**A rate instead of a fixed amount.** From height 4,000 the consensus demands almost nothing, and the
price is left to the market, as in Bitcoin. A larger transaction automatically pays more, without a new
rule.

**A dust limit.** Without a smallest amount, the state could be filled with millions of tiny accounts for
almost nothing.

**The lead time.** The activation height lies 1,120 blocks after the decision at height 2,880. At the
target block time that is seven to eight days, the time nodes and miners have to update before the rule
applies.

## The fee estimator still counts slots

The fee estimator (`src/lib/core/feemarket.ts`) continues to calculate per **slot**, not per byte. What
is scarce in a block is slots, not bytes: a block holds at most 2,000 transactions including the
coinbase, and a transfer is between 168 and 200 bytes. The relay minimum of the node is the floor below
which no tier of the estimate falls.

For this purpose the fee endpoint of the node (`GET /fees`, also reachable as `/api/v2/fees`) returns
`mindestJeByte`, the relay rate per byte, from the activation height on and `null` before it. The app
multiplies it by the size of its own transfer, which depends on the memo.

The estimator is not a consensus rule. A transfer that pays less than the estimate waits longer; it is
not rejected for that reason.

## The signature carries the chain ID of the network

Until this revision `signingBytes()` always used the chain ID of the main network, also on regtest. Now
the check takes the chain ID from the parameters of the network the node runs on: a signature that is
valid on regtest is invalid on the main network and the other way round.

For the main network nothing changes, because there the value was always the right one. This change is
not tied to the activation height.

## Who has to update before height 4,000

- **Full nodes** (the command-line node and Node Core) build and validate blocks. A node with older code
  rejects, from height 4,000, every block that contains a transfer with a fee below 0.001 YSR, and stops
  following the chain.
- **The web server** validates every block again before it writes it to the mirror
  (`POST /api/v2/block`). It uses the same code and receives the rule with a deployment; it applies the
  rule from height 4,000.
- **Standalone miners** are not affected. They only compute hashes.
- **The app** is not affected. It reads the minimum from the node.

Updating a command-line node that runs as the systemd unit from `deploy/yskar-node.service`:

```bash
cd ~/YSKAR && git pull
cd node && npm ci && npm run build
sudo systemctl restart yskar-node
sudo systemctl status yskar-node --no-pager
```

`~/YSKAR` stands for the directory of your checkout. More about updating is in
[OPERATIONS.md](OPERATIONS.md).

Before height 4,000 an updated node behaves exactly like an old one.

## Tests

`tests/gebuehr-v3.test.ts` checks both sides of the activation height:

- a transfer without a memo is 168 bytes, and the memo adds its length;
- below the activation height `MIN_FEE` applies unchanged and amounts below the dust limit are allowed;
- from the activation height the fee must be at least the size times the rate, a memo raises the minimum,
  and an amount below the dust limit is rejected;
- a signature is valid only in its own network;
- the mempool asks for the relay rate per byte and replaces a waiting transfer only for at least the
  relay minimum more;
- the fee estimator never falls below the floor it is given.
