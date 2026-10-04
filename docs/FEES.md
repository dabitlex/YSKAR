# Fees

This document explains the transaction fees of YSKAR: which fee rules are part of consensus,
which minimum a node applies before it keeps and passes on a transfer, and how the fee estimator
behind `GET /api/v2/fees` works. It is written for wallet and node developers and for anyone who
wants to know what a transfer costs and why.

A fee is paid by the sender of a transfer, in addition to the amount. The fees of all transfers
in a block go to the coinbase of that block, together with the block reward. All amounts in this
document are in base units; 1 YSR is 100,000,000 units.

## Three layers

| Layer | Decides | Where |
|---|---|---|
| Consensus rules | Whether a transfer, and with it a block, is valid. The same for every node | `src/lib/core/params.ts`, `checkTransfer()` in `src/lib/core/tx.ts` |
| Relay policy | Whether a node takes a transfer into its mempool and announces it to other nodes. Each node's own decision | `src/lib/node/fullnode/TxPool.ts` |
| Fee estimator | Nothing. It is information: how long a transfer will probably wait, and what it would have to pay to be faster | `src/lib/core/feemarket.ts` |

The mempool is the list of valid transfers a node holds that are not in a block yet.

Only the first layer can make a transfer invalid. If a recommendation became a rule, different
nodes would have different rules, and the chain would split over a number nobody had fixed.

## Consensus rules

The rule depends on the height of the block that contains the transfer.

| | Before height 4,000 | From height 4,000 (consensus revision 3) |
|---|---|---|
| Minimum fee | `MIN_FEE` = 100,000 units (0.001 YSR), fixed | Size in bytes × `MIN_FEE_RATE`, with `MIN_FEE_RATE` = 1 unit per byte |
| Smallest amount | Any amount above zero | `DUST_LIMIT` = 100 units (0.000001 YSR) |

The switch height is `FEE_V3_HEIGHT` = 4,000. Blocks below it stay valid under the old rule,
byte for byte.

A transfer is 168 bytes plus the length of its memo, and a memo is at most 32 bytes. From height
4,000 the consensus minimum is therefore between 168 units (0.00000168 YSR, no memo) and 200
units (32-byte memo).

The dust limit keeps the account state from being filled with a very large number of tiny
accounts for almost nothing.

Two more rules involve the fee at every height:

- The sender's balance must cover the amount plus the fee.
- The outputs of the coinbase must add up to exactly the block reward plus the fees of all
  transfers in the block.

Revision 3 does not change the `fee` field of a transfer. A fee rate is only the calculation
`fee ÷ size in bytes`.

On the regtest network revision 3 applies from height 0. The design record of the revision is
[CONSENSUS_V3.md](CONSENSUS_V3.md); the transaction format is in [PROTOCOL.md](PROTOCOL.md).

## Relay policy of a node

A node asks for more than consensus does before it keeps a transfer. This is protection against
spam. It is policy, not consensus: a block that contains a transfer paying less than a node's
relay minimum is still valid for that node, as long as the transfer meets the consensus minimum.
Because it is not consensus, the rate can be changed without a fork. It is a constant in the
code; the command-line node has no option for it.

| | Before height 4,000 | From height 4,000 |
|---|---|---|
| Relay minimum | `MIN_FEE` = 100,000 units | Size in bytes × `RELAY_FEE_RATE`, with `RELAY_FEE_RATE` = 10 units per byte |
| Transfer without memo | 100,000 units | 1,680 units (0.0000168 YSR) |
| Transfer with a 32-byte memo | 100,000 units | 2,000 units (0.00002 YSR) |

The height that counts is the height of the next block. The relay minimum applies to transfers
submitted over a node's HTTP interface (`POST /tx`) and to transfers received from other nodes.
A transfer below it is rejected with `fee_too_low`.

**Replacement.** A pending transfer can be replaced by another transfer from the same sender
with the same nonce. The node accepts the replacement only if its fee is at least the old fee
plus the relay minimum of the new transfer. Otherwise it answers `fee_not_higher`. Without this
step a pending transfer could be re-announced across the network again and again for one unit
more each time.

**No eviction by fee.** A mempool holds at most 5,000 transfers and at most 32 per sender. A full
mempool rejects new transfers with `pool_full`, whatever they pay. All mempool rules are listed
in [FULLNODE.md](FULLNODE.md#the-mempool).

## The fee estimator

The estimator is not a consensus rule and not a relay rule. Whoever pays less than it recommends
waits longer; the transfer is not rejected for that.

### The scarce resource is a slot, not a byte

A block holds at most 2,000 transactions, one of which is the coinbase. That leaves 1,999 slots
for transfers. There is no consensus limit on the size of a block in bytes.

In Bitcoin, transactions differ widely in size and the block limit counts size, so fees there
are priced per byte. In YSKAR a transfer is between 168 and 200 bytes, a spread of about 19 %,
and the block limit counts **transactions**. What is scarce is a slot, and the price of a slot
is the absolute fee. Sorting by fee per byte would give almost the same order.

From height 4,000 the *minimum* is a rate per byte, in consensus and in the relay policy. The
*market* above that minimum still counts per slot: block building picks transfers by their
absolute fee, and so does the estimator.

### How the tiers are derived

The tiers do not come from fixed steps. They come from the node's actual mempool, by simulating
the next blocks:

```text
mempool
  |
  v
selectTransactions()   the same selection that builds real blocks
  |
  v   block 1 full? update the simulated account state, continue with the rest
distribution, for example:  block 1: 1,999 | block 2: 1,999 | block 3: 202
```

The estimator calls `selectTransactions()` from `src/lib/core/builder.ts`, the function the node
uses to fill a real block. This is the point of the design. A separately written sorting could
decide differently from block building, and the forecast would then be wrong systematically.

The simulation looks at most 8 blocks ahead. After each simulated block it updates balances and
nonces, so the next block starts from the right state.

From the result the estimator reads three tiers. "Minimum" below is the node's relay minimum for
a transfer without memo; no tier falls below it.

| Tier | Fee | Expected block |
|---|---|---|
| `schnell` (fast) | The cut-off or the minimum, whichever is higher, plus one step. A step is one tenth of the minimum, rounded down, and at least 1 unit | Next block |
| `normal` | The lowest fee in the second simulated block, but at least the minimum | Second block |
| `langsam` (slow) | The minimum | The last simulated block |

The **cut-off** (`kappung`) is the lowest fee that still makes it into the next block when that
block is full. If demand rises, it rises by itself. That is the market. The fast tier adds one
step, because a transfer that pays exactly the cut-off is level with the weakest transfer in the
block and its place depends on chance.

A transfer with a memo is larger than the one the minimum was computed for. A wallet therefore
computes its own floor, `mindestJeByte × (168 + memo length)`, and pays the higher of that floor
and the fee of the chosen tier.

### Without congestion there is nothing to choose

The estimator reports congestion (`andrang`) when more transfers are pending than fit into one
block, or when the simulated next block is full. Without congestion all three tiers are equal to
the minimum and point to the next block, and `kappung` is `null`.

The wallet in the app then shows no choice of tiers. Three buttons that do the same thing would
be misleading: the user would pay more and get nothing for it.

### "Expected" is not a figure of speech

The estimate holds under the assumption that nothing new arrives. If someone submits a transfer
with a higher fee a moment later, yours moves back. That is why every answer carries a note
(`hinweis`). A promise of "next block, for certain" would be untrue when thousands are waiting.
And if everybody chose the fast tier, everybody would pay more and nobody would get through
faster.

### The nonce chain

This is the difference from a model with unspent outputs, and it has real consequences. YSKAR
uses accounts, and every transfer carries the sender's next nonce. The transfers of one sender
therefore hang together: nonce 5 cannot enter a block before nonce 4, **whatever it pays**.
Block building skips a transfer whose nonce is not due yet:

```ts
if (t.nonce !== acc.nonce) continue;
```

Sorting by fee alone would simply be wrong. Because the estimator uses the same selection
function, its forecast respects the nonce order.

For a user this means: if the first pending transfer of a sender is stuck, everything behind it
is stuck too. Paying a high fee for nonce 7 does not help while nonce 6 waits with a low one.
`feemarket.ts` contains the function `blockiertDurch()` (German for "blocked by"), which returns
the earlier pending transfers of the same sender for a given nonce. It is a library function;
`GET /api/v2/fees` does not return this hint.

### When the market is no longer enough

If more than 1,999 transfers arrive per block permanently, the fee market only decides **who**
gets through, not **how many**. The backlog would stay and the fees would keep rising.

At that point the block limit itself is the question, and changing it is a consensus change with
an activation height. The same holds for a block limit in bytes, which would be the consequence
if transfers came to differ much in size; block building and the estimator would then select by
fee per byte. The `fee` field of a transfer would stay as it is in both cases, and existing
blocks would remain valid.

So that such a decision can be made with data, the interface returns the simulated distribution
(`bloecke`): how many transfers fit into the next block and how many do not. As long as
everything fits into the next block, there is no problem to solve.

## Interface

```text
GET /api/v2/fees
GET /api/v2/fees?fee=<amount>
```

A full node answers this route on its HTTP interface (port 8645, with or without the `/api/v2`
prefix; see [FULLNODE.md](FULLNODE.md#the-http-interface)). The answer is built in `fees()` in
`src/lib/node/fullnode/ReadApi.ts`.

The web server at `https://yskar.vercel.app` offers the same route
(`src/app/api/v2/fees/route.ts`). It does not calculate anything. It passes the request on to
the full node configured in `YSKAR_FULLNODE_URL` and returns that node's answer unchanged,
because the estimate depends on the mempool and the mempool exists only in a full node. Of the
query, only a numeric `fee` is passed on. If no node is configured or the node cannot be
reached, the web server answers HTTP 503 with `error` set to `fullnode_not_configured` or
`chain_unreachable`.

Most field names are German. They are part of the interface and stay as they are.

| Field | Type | Meaning |
|---|---|---|
| `minFee` | string | The node's relay minimum for a transfer without memo at height `hoehe` |
| `mindestJeByte` | string or `null` | "Minimum per byte": the node's relay rate. `null` while `hoehe` is below 4,000 |
| `hoehe` | number | "Height": the height of the next block, for which the estimate is made |
| `wartend` | number | "Waiting": number of transfers in the mempool |
| `plaetzeJeBlock` | number | "Slots per block": 1,999 |
| `andrang` | boolean | "Congestion": see above |
| `kappung` | string or `null` | "Cut-off": lowest fee in the simulated next block if that block is full |
| `stufen` | object | "Tiers": `langsam` (slow), `normal` and `schnell` (fast), each with `fee` and `block`. `block` counts from 1, the next block |
| `bloecke` | array | "Blocks": the simulated distribution. Each entry has `block`, `anzahl` (number of transfers) and `minFee` (lowest fee in that block) |
| `eigene` | object or `null` | "Own": only with `?fee=`. `fee` is the amount asked about, `rang` ("rank") is one more than the number of pending transfers that pay more, `von` ("of") is the number of pending transfers plus one |
| `hinweis` | string | "Note": a German sentence, see below |

`hinweis` is one of two sentences:

- `Voraussichtlich, unter der Annahme dass nichts Neues dazukommt.` ("Expected, assuming nothing
  new arrives.")
- `Kein Andrang -- die Mindestgebühr genügt für den nächsten Block.` ("No congestion; the minimum
  fee is enough for the next block.")

`rang` compares fees only. It does not take the nonce order into account.

An empty mempool below height 4,000 gives this answer (`hoehe` is an example value):

```json
{
  "minFee": "100000",
  "mindestJeByte": null,
  "hoehe": 3311,
  "wartend": 0,
  "plaetzeJeBlock": 1999,
  "andrang": false,
  "kappung": null,
  "stufen": {
    "langsam": { "fee": "100000", "block": 1 },
    "normal": { "fee": "100000", "block": 1 },
    "schnell": { "fee": "100000", "block": 1 }
  },
  "bloecke": [],
  "eigene": null,
  "hinweis": "Kein Andrang -- die Mindestgebühr genügt für den nächsten Block."
}
```

With congestion above height 4,000, and with `?fee=2000`, an answer has this shape. The numbers
are made up to show how the fields relate:

```json
{
  "minFee": "1680",
  "mindestJeByte": "10",
  "hoehe": 4321,
  "wartend": 4200,
  "plaetzeJeBlock": 1999,
  "andrang": true,
  "kappung": "5000",
  "stufen": {
    "langsam": { "fee": "1680", "block": 3 },
    "normal": { "fee": "2000", "block": 2 },
    "schnell": { "fee": "5168", "block": 1 }
  },
  "bloecke": [
    { "block": 1, "anzahl": 1999, "minFee": "5000" },
    { "block": 2, "anzahl": 1999, "minFee": "2000" },
    { "block": 3, "anzahl": 202, "minFee": "1680" }
  ],
  "eigene": { "fee": "2000", "rang": 3640, "von": 4201 },
  "hinweis": "Voraussichtlich, unter der Annahme dass nichts Neues dazukommt."
}
```

Here the fast tier is the cut-off of 5,000 plus one step of 168, a tenth of the minimum of
1,680.

The estimator always simulates with main-network parameters. On a regtest node the distribution
`bloecke` therefore stays empty.

## Files

| File | Content |
|---|---|
| `src/lib/core/params.ts` | `MIN_FEE`, `FEE_V3_HEIGHT`, `MIN_FEE_RATE`, `DUST_LIMIT`, `RELAY_FEE_RATE`, `minFeeAt()` |
| `src/lib/core/tx.ts` | `checkTransfer()`, `transferBytes()` |
| `src/lib/core/builder.ts` | `selectTransactions()` |
| `src/lib/node/fullnode/TxPool.ts` | Relay minimum and replacement rule |
| `src/lib/core/feemarket.ts` | Simulation, tiers, rank, nonce chain |
| `src/lib/node/fullnode/ReadApi.ts` | `GET /fees` on the node |
| `src/app/api/v2/fees/route.ts` | Pass-through on the web server |
| `src/components/wallet/Send.tsx` | Fee display and tier choice in the app |
| `tests/feemarket.test.ts`, `tests/gebuehr-v3.test.ts` | Tests of the estimator and of the revision 3 rules |
