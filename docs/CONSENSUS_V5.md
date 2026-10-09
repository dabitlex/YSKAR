# Consensus revision 5: stricter rules for timestamps, encoding and the coinbase

This is the design record of consensus revision 5. It is a soft fork: from the activation height four
rules apply in addition to the existing ones, and each of them only forbids something that was allowed
before. The rules themselves are also part of the specification in [PROTOCOL.md](PROTOCOL.md).

| | |
|---|---|
| Revision | 5 |
| Activation height | 7,000 |
| Constant | `V5_HEIGHT` in `src/lib/core/params.ts` (`v5Height` in `src/lib/core/networks.ts`) |
| Status | Planned, applies from height 7,000 |
| Decided | At height 4,111, on 2026-10-09 |
| Kind | Soft fork |

## The rules

From height 7,000 a block is valid only if, in addition to all existing rules:

1. **Timestamp not before the parent.** Its `timestamp` is greater than or equal to the timestamp of
   its parent (`before_parent`). An equal timestamp is allowed. The median rule and the future limit
   stay as they are.
2. **Canonical encoding.** The bytes of the block are exactly the bytes that `serializeBlock()` writes
   for the decoded block: no bytes after the last transaction and no bytes after the last field of a
   transaction inside its length frame (`nicht_kanonisch`). The block is at most 1,048,576 bytes
   (`MAX_BLOCK_BYTES`, `block_zu_gross`).
3. **Coinbase version and `extra`.** The coinbase has `version` 1 or 2 (`coinbase_fassung`), and its
   `extra` field is at most 32 bytes (`MAX_COINBASE_EXTRA`, `coinbase_extra`).
4. **No dust in a version 2 coinbase.** Every output of a version 2 coinbase is at least 100 units
   (`DUST_LIMIT`, `coinbase_output_staub`). A version 1 coinbase is not subject to this rule.

Code: `checkParentTimestamp()` and `checkEncoding()` in `src/lib/core/validate.ts`, the coinbase checks
in `applyBlock()` in `src/lib/core/state.ts`. Below height 7,000 none of the four checks runs, and every
existing block keeps its validity and its bytes.

## Why

In all four places the rules accepted more than the node itself ever produces. None of it was needed,
and each gap made the chain harder to reason about.

**1. Timestamps.** Until now a block only had to state a time above the median of the last 11 blocks,
so it could state an earlier time than its parent. The difficulty adjustment and the emergency rule
both measure time from the parent's timestamp; an interval below zero is counted as 1 second. A
timestamp before the parent therefore gives them a measurement that does not match the time that has
passed. With the new rule the timestamps of a chain never go backwards. A more detailed analysis will be
published after the activation.

**2. Encoding.** The decoder ignores bytes it does not expect (issue #10). Such bytes change neither a
transaction ID nor the block hash, so one block could exist in many different byte forms. Since commit
`1ae8e25` the node stores and forwards every block in its own encoding; from height 7,000 a copy in any
other form is not accepted at all. The size limit of 1 MiB lies well above the largest possible block
in canonical encoding (about 410 KB, see [Limits](PROTOCOL.md#limits)) and equals the limit that the
mirror already applied.

**3. Coinbase.** A coinbase with a version other than 1 or 2 was read with the first layout. The value
had no meaning, but it changed the transaction ID. `extra` could be up to 255 bytes, although the node
writes at most a pool name of 32 characters there.

**4. Dust.** Since revision 3 a transfer cannot create an amount below 100 units. A version 2 coinbase
could still pay out such amounts to any number of its up to 64 recipients. The rule does not apply to
a version 1 coinbase, because from height 360,000 the block reward itself is below 100 units, and a
block without fees has to stay valid there.

## A non-canonical copy is not an invalid block

Rule 2 judges the bytes, not the block. A copy with extra bytes has the same hash as the clean copy. The
node therefore rejects only that copy: it stores nothing and does not mark the hash as invalid. The
clean copy of the same block is accepted when it arrives, from the same peer or another one. If the
block is already known, a non-canonical copy is answered as known (`bekannt`) and changes nothing.

## Soft fork

Every block that is valid under the new rules is also valid under the old ones. A node that has not
been updated therefore follows a chain built by updated nodes without any problem. The reverse does not
hold: a block that breaks one of the four rules is still accepted by an old node but rejected by an
updated one. As long as the majority of the hash power runs updated software, such a block stays on a
side branch, and old nodes switch to the longer chain of the updated nodes as soon as it overtakes.

Checked against the chain up to height 4,107 at the time of the decision: no block has trailing bytes,
every coinbase has version 1 or 2, the longest `extra` field has 20 bytes, the largest block has
1,249 bytes, and no version 2 coinbase has an output below 100 units. One block (height 3,402) states a
timestamp 2 seconds before its parent's. None of this matters for validity, because the rules apply only
from height 7,000.

## Compatibility

| | Has to be updated? |
|---|---|
| Nodes that mine or run a pool (command-line node, Node Core) | **Yes, before height 7,000.** An old node can build blocks that updated nodes reject: with a timestamp before its parent when its clock is behind, or, as a pool, with a coinbase output below 100 units. Such a block would be lost. |
| Other full nodes (command-line node, Node Core) | **Please update before height 7,000.** Without the update a node keeps following the chain but does not check the new rules itself: it can show a block for a while that updated nodes reject, and it lacks the protection against cheap side branches. |
| Web server (mirror, `/api/v2/block`) | Yes, before height 7,000. It checks rule 2 itself and the other rules through the core. |
| Observer (`observer/`) | Yes. It checks rule 2 itself. |
| App, Mini App, CLI miner, GPU miner | No. Miners take the timestamp from the job and do not build a coinbase. |

## Outside the consensus

| Place | Change |
|---|---|
| Mining jobs (`MiningCoordinator.ts`) | The timestamp of a job is never earlier than the parent's, even if the node's clock is behind. The value is only raised, never lowered, so the median rule stays met. This applies at every height. |
| Pool split (`settlement.ts`) | An address whose share would be below 100 units receives nothing in this block, like an address beyond the 64 seats; its share goes to the others, and its work stays in the window. A pool fee below 100 units is not taken. If every share would be below 100 units (only possible from height 360,000), the address with the most work receives the whole amount. |
| Block building (`builder.ts`, `waehleCoinbase()`) | A split with a single recipient below 100 units becomes a version 1 coinbase with the same amount to the same address. Only possible from height 360,000. |
| Choice of the best tip (`ChainStore.bestTip()`) | With equal chain work the smaller hash wins, as before. The database query now sorts by the hash as well; before, with more than eight tips of equal work, it was open which eight came back. |
| Node Core | Shows consensus revision 5. |

## Tests

`tests/konsens-v5.test.ts`, `tests/kanonisch-speichern.test.ts` and `tests/pool-settlement.test.ts`.
Every rule is checked twice: with regtest, where revision 5 applies from height 0, the block is
rejected; with the activation moved far back, the same block is accepted.

- the main network activates revision 5 at height 7,000;
- a timestamp before the parent is rejected, an equal timestamp is accepted, both in `validateBlock()`
  and in the pre-check of `ChainManager`;
- bytes after the block and bytes in a transaction frame are rejected, nothing is stored, and the clean
  copy is accepted afterwards; a non-canonical copy of a known block changes nothing; a block above
  1 MiB is rejected;
- a coinbase with version 7, `extra` of 33 bytes, and a version 2 output of 99 units are rejected; 32
  bytes and exactly 100 units are accepted; a version 1 coinbase of 10 units at height 400,000 is
  valid;
- a pool split at height 400,000 with a reward of 10 units yields a valid block;
- mining jobs never get a timestamp before the parent, even when the node's clock is 2,000 seconds
  behind;
- the pool split leaves out shares below 100 units and drops a fee below 100 units; over 1,000 random
  rounds every output is at least 100 units and the sum is exact;
- among twelve tips of equal work the one with the smallest hash wins;
- a node with the old rules accepts a chain built under the new ones.

## What does not change

The block format, the header, the hash function, the difficulty adjustment, the emergency rule, the
block time, the block reward, the halvings, the 21,000,000 YSR, the fees, transfers, addresses, wallets
and all existing blocks.
