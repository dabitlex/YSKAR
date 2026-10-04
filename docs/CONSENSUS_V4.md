# Consensus revision 4: difficulty without an upper limit

This is the design record of consensus revision 4. It explains why the difficulty field of the block
header needed a wider range, how the same four bytes are read from the activation height on, and what
that means for nodes, miners and everything that displays a difficulty. The rules themselves are also
part of the specification in [PROTOCOL.md](PROTOCOL.md).

| | |
|---|---|
| Revision | 4 |
| Activation height | 6,000 (the first block of season 2) |
| Constant | `DIFF_V4_HEIGHT` in `src/lib/core/params.ts` |
| Status | Applies from height 6,000 |
| Decided | At height 2,942, on 2026-10-01 |

## The problem

The difficulty is stored in the header as a `u32`. The field ends at 4,294,967,295, which corresponds to
a network hashrate of about **469 GH/s** (4,294,967,295 x 65,536 hash attempts in 600 seconds). Above
that, the adjustment could no longer follow:

1. The LWMA asks for a value above the `u32` range, and the node cannot build a header. `/job` answers
   with HTTP 500, and no miner gets work.
2. After 30 minutes without a block the emergency rule eases the requirement until the value fits again.
   The next block falls at once, and everything starts over.

A simulation with the real adjustment function shows the pattern. At 200 TH/s two blocks arrive within
about a second each, then the chain pauses for a little over 30 minutes, again and again. The average
block time still comes out near 10 minutes, because the LWMA counts the pauses. The issuance of new YSR
would have stayed on schedule, but mining would have happened in bursts.

## The solution: the same field, read differently

The field stays 4 bytes. The header size (136 bytes), the position of the nonce and the midstate do not
change. From height 6,000 the field is read as follows:

| Top bit | Meaning | Range |
|---|---|---|
| 0 | difficulty = field | 1 to 2,147,483,647 |
| 1 | `e` = bits 23 to 30, `m` = bits 0 to 22, difficulty = (2^23 + `m`) x 2^`e` | 2^31 to `MAX_DIFFICULTY` |

- **Below 2^31 the bytes are the same as before**, before and after the activation. When the revision was
  decided, the highest difficulty the chain had reached was 1,831,228.
- From 2^31 on the field is a floating-point number with 24 bits of precision. It rounds by less than
  2^-23 (about 0.000012 %).
- `MAX_DIFFICULTY` = (2^24 - 1) x 2^216, just below 2^240. There the target is 1, which is the limit of
  SHA-256 itself, not of YSKAR.
- **Unambiguous:** every value has exactly one encoding. An exponent below 8 (the value would lie below
  2^31) or above 216 is invalid, and such a header is rejected when it is read.

Below the activation height the old reading remains: the field is a plain `u32` up to 2^32 - 1. The
height in the same header decides which reading applies.

The activation height is the same on every network, because it acts inside the header codec, which does
not know the network parameters. For regtest this is harmless: below 2^31 the two readings do not differ.

Code: `encodeDifficulty()`, `decodeDifficulty()` and `floorDifficulty()` in `src/lib/core/params.ts`. In
memory `BlockHeader.difficulty` is always the real value, never the field.

## The rule

`checkDifficulty()` in `src/lib/core/validate.ts`:

```text
regular = floor(LWMA(...))
eased   = floor(emergency rule(LWMA(...), elapsed))
valid if eased <= difficulty <= regular
```

`floor` rounds down to the nearest representable value (`floorDifficulty()`), and to `MAX_DIFFICULTY` at
most. Because `floor` is monotonic, the range never becomes empty. Below 2^31 `floor` rounds nothing, and
there the rule is exactly the old one.

The node (`MiningCoordinator` in `src/lib/node/fullnode/MiningCoordinator.ts`) builds its mining jobs
with exactly this rounded value.

## Compatibility

| | Has to be updated? |
|---|---|
| Full nodes (command-line node, Node Core) and the web server | **Yes, before height 6,000.** Up to a difficulty of 2^31 (about 234 GH/s) old and new nodes nevertheless compute identically. |
| Database mirror | Yes. Migration `00020_difficulty_numeric` is that update: it changes `difficulty` to `numeric(78,0)` and adapts `commit_block`. |
| App, Mini App, CLI miner, GPU miner | No. The node sends the **raw header field** in `job.difficulty`, and every miner writes exactly that at offset 112. Newer versions read the real value from `difficultyWert`. |

With older miners only the **display** is wrong above 2^31 (it shows the raw field); the computation is
right. This is checked in `tests/konsens-v4.test.ts` with the unchanged `miner/src/header.mjs`.

## Outside the consensus

| Place | Change |
|---|---|
| API (`/summary`, `/blocks`, `/job`) | Additionally returns `difficultyWert`, the real difficulty as decimal text. JavaScript numbers are exact only up to 2^53 (about 9 x 10^15). |
| Reading the database mirror | `difficulty::text`, for the same reason |
| Miner statistics in the node-to-node protocol | A hashrate above the `u64` range (18.4 EH/s) is capped instead of raising an error. This affects the display only. |
| Displays | Units up to YH/s (`src/lib/format/hashrate.ts`, explorer, CLI miner); a large difficulty is shown in compact form |
| Explorer | Computes the encoding itself (`diffFeld` in `public/explorer.html`) before it checks the block hash |
| `src/lib/chain/` | Unchanged. This is the retired code path of the first chain (see `src/lib/chain/DEPRECATED.md`). |

## Tests

`tests/konsens-v4.test.ts`:

- byte identity of the header for more than 500 values below 2^31, at five heights;
- below the activation height the old behavior is unchanged: the field is a plain `u32`, and a larger
  value cannot be written;
- representation and rounding for more than 2,000 values between 2^31 and 2^240;
- monotonicity of the rounding;
- unambiguity over 20,000 random fields, and rejection of invalid exponents;
- the rule: a value above the `u32` range is accepted, one step too high or a value too low is rejected,
  and the emergency rule works above the `u32` range;
- the header built by the old CLI miner code against the header of the node, byte for byte;
- the encoding of the explorer against the core;
- the miner statistics cap an oversized hashrate instead of raising an error;
- **a simulation at 5 TH/s, 200 TH/s and 10^21 H/s: 540 to 660 seconds per block on average, and fewer
  than 8 % of the blocks take longer than 30 minutes.** With exponentially distributed block times about
  5 % are to be expected. Under the old rule about a third of the blocks at 200 TH/s came after a pause
  of more than 30 minutes.

## What does not change

The hash function (double SHA-256), the header size, the block time, the block reward, the halvings, the
21,000,000 YSR, the fees, addresses, wallets and all existing blocks.
