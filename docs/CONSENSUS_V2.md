# Consensus revision 2: coinbase with several recipients

This is the design record of consensus revision 2. It explains why the coinbase of a block may pay more
than one recipient, how the second layout is encoded, which rules apply to it and what had to change
around it. The rules themselves are also part of the specification in [PROTOCOL.md](PROTOCOL.md).

| | |
|---|---|
| Revision | 2 |
| Activation height | 2,000 |
| Constant | `COINBASE_V2_HEIGHT` in `src/lib/core/params.ts` |
| Status | Active |

## Purpose

Up to height 1,999 the coinbase has exactly one recipient. From height 2,000 it may have several.

This is the precondition for pool mining **without custody**: the block itself pays everyone who took
part, and the pool operator never holds coins that belong to others. The alternative, in which the pool
receives the block reward and passes it on with transfers, means custody with everything that comes with
it.

How a pool uses this layout is described in [POOL.md](POOL.md).

## What changes

| | |
|---|---|
| Activation height | `COINBASE_V2_HEIGHT = 2000` |
| Maximum number of recipients | `MAX_COINBASE_OUTPUTS = 64` |
| Version 1 | Unchanged, valid at every height |
| Version 2 | Valid only from the activation height |

**Blocks 0 to 1,999 stay unchanged byte for byte.** `tests/coinbase-v2.test.ts` pins the byte layout of
version 1. `tests/fullnode.test.ts` runs 15 real blocks of the main network (heights 0 to 14, stored in
`tests/fixtures/kette-0-14.json`) through the full validation of the current code. Decoding these 15
blocks and serializing them again reproduces every byte and every hash.

## Encoding

Version 1, unchanged:

```text
u16 version (= 1) | u8 type (= 0) | u32 height | to (20) | u64 amount | u8 len | extra
```

Version 2:

```text
u16 version (= 2) | u8 type (= 0) | u32 height | u8 count | count x ( to (20) | u64 amount ) | u8 len | extra
```

The difference is exactly one count byte after the height. Version 1 has none, and only for that reason
old blocks keep their bytes.

In memory the code always holds a list of outputs. Version 1 is the special case with exactly one entry,
so state and validation follow one path instead of two that could drift apart (`Coinbase` in
`src/lib/core/tx.ts`).

## The rules, one by one

Each of these rules is consensus. Loosening one of them changes the chain. They are checked in
`applyBlock()` in `src/lib/core/state.ts`; the count is also checked when the bytes are decoded
(`deserializeTx()` in `src/lib/core/tx.ts`).

**1 to 64 recipients.** The upper limit bounds the block size and the validation effort.

**The sum must match exactly.** The amounts of all outputs add up to `rewardAt(height)` plus the fees of
the block. One unit too much or too little is not a rounding error but an invalid block. The build helper
`buildCoinbaseV2()` in `src/lib/core/builder.ts` checks the sum and fails instead of adjusting it
silently.

**Addresses in strictly ascending order.** Without this rule the same payout would have several valid
encodings, and with them different Merkle roots for the same statement. The ordering also enforces that
no recipient appears twice.

**No recipient with amount zero.** Otherwise a block could be inflated with empty entries that have no
effect.

**Version 2 below the activation height is invalid.** This keeps the history unchangeable.

**Version 1 stays valid after the activation.** Solo mining does not change.

## Why height 2,000

The lead time was counted from height 850 (see the comment at `COINBASE_V2_HEIGHT` in
`src/lib/core/params.ts`). The 1,150 blocks from there to height 2,000 correspond to about eight days at
the target block time of 600 seconds. Whoever ran a node or a miner had that time to update before the
rule took effect.

A node with old code rejects a block with a version 2 coinbase and stays on its own branch. The lead time
was therefore not a courtesy but a necessity.

## Mirroring in the database

The public explorer and the web app read a copy of the chain from a database (the mirror, schema
`chain2`; see [OPERATIONS.md](OPERATIONS.md)). The mirror is not part of the consensus.

Its transaction table holds one row per transaction with a single recipient column. Migration
`00013_chain2_coinbase_outputs` adds the column `coinbase_outputs`. For a coinbase with more than one
recipient the recipient column stays **empty**, `amount` carries the total and `coinbase_outputs` holds
the split as JSON (`commitBlock()` in `src/lib/node/store.ts`). A coinbase with one recipient is stored as
before. Migration `00017_to_addr_nullable` allows the empty recipient column for exactly this case and
for no other.

"Recipient = first recipient, amount = total" would have been the obvious shortcut and exactly the wrong
one: it reads as if the first recipient had received everything.

The binding data is the `raw` field with the bytes of the transaction in any case.

## Account lookup and explorer

Both had a gap, and both gaps are closed.

The account lookup (`/api/v2/account/[address]`) used to search the recipient column only. For a coinbase
with several recipients that column is empty. A miner paid through a pool would not have found the
payment anywhere: not in the history and not in the number of blocks found. The balance would have been
right, but its origin invisible.

Now the split in `coinbase_outputs` is searched as well. A pool share appears in the account history as
an entry of `kind: 'pool'` with the number of recipients in `shares`, sorted by height among the other
entries, and the lookup returns the number of such blocks as `poolRewards`.

For a coinbase with several recipients the explorer shows every recipient with its share, not only the
total. Showing only the total would look as if nobody had received anything, and being able to check the
payout is the purpose of paying out through the chain.

## Tests

`tests/coinbase-v2.test.ts` checks every rule separately:

- version 1 keeps its byte layout, with no count byte before the address;
- version 2 carries the count byte directly after the height and survives a round trip through the codec;
- version 2 is rejected below the activation height and accepted from it;
- version 1 is still accepted after the activation;
- a sum that is off by one unit is rejected;
- unsorted recipients and a recipient that appears twice are rejected;
- a recipient with amount zero is rejected;
- more than 64 recipients are rejected, by the build helper and when raw bytes are decoded;
- the build helper sorts the recipients itself and checks the sum;
- fees are part of the sum.

## What does not change

This revision concerns the coinbase only. The genesis block, the chain ID, the block header, the
difficulty rule, the address format, the signature scheme and the state root are untouched.
