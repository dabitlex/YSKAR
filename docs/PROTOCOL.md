# YSKAR protocol specification

This document specifies the consensus rules of YSKAR as the code in this repository implements them: data
formats, hashing, proof of work, difficulty adjustment, transactions, block validity and chain selection.
It is written for readers who want to verify the chain independently or write software that agrees with
the reference node byte for byte.

YSKAR is an independent proof-of-work blockchain. Blocks are found with double SHA-256, balances are kept
in an account model, transfers are signed with Ed25519, and the coin is called YSR. The reference
implementation is the TypeScript code in `src/lib/core/`; where this text and that code disagree, the code
decides.

## Notation

| Term | Meaning |
|---|---|
| `u8`, `u16`, `u32`, `u64` | Unsigned integers of 1, 2, 4 and 8 bytes, little-endian |
| `sha256d(x)` | `SHA-256(SHA-256(x))` |
| `floor(a / b)` | Integer division, rounded down |
| unit | The smallest amount, 0.00000001 YSR |
| height | Position of a block in its chain; the genesis block has height 0 |

All consensus arithmetic uses integers of arbitrary size. There is no floating point anywhere in the
rules, and every division rounds down.

Hashes are written as 64 hexadecimal digits in the order of their bytes. Nothing is reversed for display.
When a hash is compared with a number, its 32 bytes are read as one big-endian integer (first byte most
significant).

Addresses appear in blocks and transactions as 20 raw bytes. The text form `ysr1...` exists only outside
the chain.

## The benchmark that defines correctness

One test decides whether an implementation is correct:

> Delete all derived state, replay the blocks from height 0, and arrive at the identical state root.

The blocks are the only source of truth. Balances, nonces, snapshots and any database index are derived
data that can be thrown away and rebuilt. Every block header commits to the complete account state after
that block (the `stateRoot` field), so two implementations that replay the same blocks either compute the
same 32 bytes at every height or one of them is wrong.

The code applies this test in three places:

- `replay()` in `src/lib/core/state.ts` rebuilds the state from a list of blocks; `tests/core.test.ts`
  compares the rebuilt state root with the live one.
- `tests/fullnode.test.ts` feeds 15 real blocks of the main network (heights 0 to 14, stored in
  `tests/fixtures/kette-0-14.json`) through the full validation, deletes all snapshots, rebuilds the state
  and compares the root with the one in the last block.
- The full node does the same whenever it starts and whenever the tip of its active chain changes
  (`ChainManager.zustandHerstellen()` in `src/lib/node/fullnode/ChainManager.ts`): it recomputes the state
  from the latest snapshot if that snapshot's own root checks out, otherwise from block 0, and refuses to
  run if the result differs from the state root in the tip block.

## Network identity

| Parameter | Main network |
|---|---|
| Network name (`NETWORK`) | `yskar-main-1` |
| Chain ID (`CHAIN_ID`) | `SHA-256("yskar-main-1")` = `952ee402c8e77c34e006d7019780c93e2297795a02abb26c4decd627278af2e8` |

The chain ID is the single SHA-256 hash of the network name as ASCII text. It is part of the bytes that a
transfer signature covers, so a signature made for one network is invalid on every other. It is not
stored in blocks or transactions. The node-to-node protocol uses its first four bytes as the frame prefix
and exchanges the full value in the handshake; see [P2P.md](P2P.md).

## Parameters

All constants are in `src/lib/core/params.ts`.

| Parameter | Value | Constant |
|---|---|---|
| Coin | YSKAR, ticker YSR | |
| Smallest unit | 0.00000001 YSR; 1 YSR = 100,000,000 units | `UNIT`, `DECIMALS` = 8 |
| Maximum supply | 21,000,000 YSR, enforced on the state after every block | `MAX_SUPPLY` |
| Initial block reward | 875 YSR | `INITIAL_REWARD` |
| Halving interval | 12,000 blocks | `EPOCH_BLOCKS` |
| Target block time | 600 seconds | `TARGET_BLOCK_TIME` |
| Minimum difficulty | 4,096 | `MIN_DIFFICULTY` |
| Hashes per difficulty unit | 65,536 | `DIFFICULTY_UNIT` |

### Block reward

The block reward at height `h` is a bit shift:

```text
era       = floor(h / 12000)
reward(h) = 0                          if era >= 63   (MAX_HALVINGS)
reward(h) = 87,500,000,000 >> era      otherwise      (units)
```

The shift drops fractions of a unit. This is the function `rewardAt()`.

| Era | Heights | Reward per block | Issued in the era |
|---|---|---|---|
| 0 | 0 to 11,999 | 875 YSR | 10,500,000 YSR |
| 1 | 12,000 to 23,999 | 437.5 YSR | 5,250,000 YSR |
| 2 | 24,000 to 35,999 | 218.75 YSR | 2,625,000 YSR |
| 3 | 36,000 to 47,999 | 109.375 YSR | 1,312,500 YSR |
| 4 | 48,000 to 59,999 | 54.6875 YSR | 656,250 YSR |
| 5 | 60,000 to 71,999 | 27.34375 YSR | 328,125 YSR |
| ... | | | |
| 36 | 432,000 to 443,999 | 0.00000001 YSR | 0.00012 YSR |
| 37 and later | from 444,000 | 0 | 0 |

The shift yields 0 from era 37, long before the limit of 63 halvings is reached. The sum of all rewards
is 2,099,999,999,832,000 units, that is 20,999,999.99832 YSR, which is 0.00168 YSR below the maximum
supply. The 875 YSR of the genesis block are part of this sum and cannot be spent (see below).

From height 444,000 a block creates no new coins and its coinbase pays out fees only.

At the target block time an era of 12,000 blocks corresponds to 7,200,000 seconds, about 83 days.

### Seasons

The code also defines seasons of 6,000 blocks (`SEASON_BLOCKS`; `seasonAt(h) = floor(h / 6000) + 1`). A
season is a display unit. It has no effect on any consensus rule.

## Genesis block

The genesis block of the main network carries the timestamp 2026-09-09T00:00:00Z. It was built and mined
with `scripts/genesis.ts`; its values are stored in `scripts/genesis.json` and frozen by a test in
`tests/core.test.ts`, which rebuilds the block from its inputs and compares Merkle root, state root and
hash.

| Field | Value |
|---|---|
| Height | 0 |
| Hash | `000000090a14a03f1562d11113d539c1208b8078c6391da6c48f6bcf72c33c66` |
| Version | 1 |
| Previous hash | 32 zero bytes |
| Merkle root | `1007612ea5c27b0b7c6ae79c745da364cfd64224eb6f5519bf559dc3b09fe840` |
| State root | `e2860175f61cefa97ff34e88d35402a7ee373a8764adbdda0b97ef200bbeca57` |
| Timestamp | 1788912000 (2026-09-09T00:00:00Z) |
| Difficulty | 4,096 |
| Transaction count | 1 |
| Extranonce | 0 |
| Nonce | 50773796 |
| Size | 198 bytes |

Its only transaction is a version 1 coinbase:

| Field | Value |
|---|---|
| Transaction ID | `d6a742de01ac71ef6243d28402afe5f05e8f2c60b5daa68c7631ea36c9bf2c4f` |
| Recipient | 20 zero bytes, in text form `ysr1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqregwfw` |
| Amount | 87,500,000,000 units (875 YSR) |
| `extra` | The 18 ASCII bytes `proof, not promise` |

The recipient is the zero address. No key is known whose hash is 20 zero bytes, so the 875 YSR exist in
the state but cannot be spent. Paying the genesis reward to this address keeps the reward function free
of a special case for height 0. The state starts empty and coins are created only by the coinbase of a
block, so there is no allocation outside the block rewards (no premine).

The genesis block carries the minimum difficulty of 4,096, which corresponds to 268,435,456 expected
hash attempts. The script searches the nonces upward from 0, so the solution at nonce 50,773,796 was found
well before the expected number of attempts. The difficulty that is expected for block 1 is a separate
constant, `GENESIS_DIFFICULTY` = 24,576 (see [Difficulty adjustment](#difficulty-adjustment)).

The validation code does not contain the genesis hash. It accepts as the first block of a chain any block
with height 0 and a previous hash of 32 zero bytes that passes the structure and state checks; the
timestamp and difficulty rules do not apply to it. A node of the main network receives this block like
any other block: from its peers, or over HTTP from the server given with `--api` (see
[FULLNODE.md](FULLNODE.md)). If you verify the main network yourself, compare the hash of your block 0
with the value in the table.

The complete block is listed under [Test vectors](#test-vectors).

## Keys and addresses

Code: `src/lib/core/wallet.ts`, `src/lib/core/address.ts`.

### From seed words to a key

1. **Seed words.** BIP39 with the English word list. The code creates 12 words (128 bits) or 24 words
   (256 bits). Before use the words are normalized: Unicode NFKD, leading and trailing whitespace removed,
   lower case, runs of whitespace replaced by one space.
2. **Seed.** The BIP39 seed (64 bytes) from the words and an optional passphrase. A different passphrase
   gives a completely different wallet.
3. **Key derivation.** SLIP-0010 for Ed25519 along the path

   ```text
   m/44'/9077'/account'/0'/index'
   ```

   SLIP-0010 allows only hardened derivation for Ed25519, so every level is hardened. The master node is
   `HMAC-SHA512(key = "ed25519 seed", data = seed)`; a child is
   `HMAC-SHA512(key = parent chain code, data = 0x00 | parent key | u32 big-endian (index + 2^31))`. In
   both cases the first 32 bytes are the key and the last 32 bytes the chain code.
4. **Key pair.** The 32-byte key at the end of the path is the Ed25519 private key (the seed of RFC 8032);
   the public key is the 32-byte Ed25519 public key that belongs to it.

The default is account 0, index 0. Coin type 9077 is not registered in SLIP-0044.

Whoever has the seed words controls the coins. There is no way to recover a wallet without them.

### Address

```text
address (20 bytes) = first 20 bytes of SHA-256(public key)
text form          = bech32m(hrp = "ysr", address)
```

Note the single SHA-256. The text form always begins with `ysr1` and is 42 characters long. Decoding
rejects any other prefix and any payload that is not exactly 20 bytes.

## Block header

Code: `src/lib/core/block.ts`.

The header is exactly 136 bytes.

| Offset | Size | Type | Field | Content |
|---|---|---|---|---|
| 0 | 4 | `u32` | `version` | Must be 1 |
| 4 | 4 | `u32` | `height` | Height of this block |
| 8 | 32 | bytes | `prevHash` | Hash of the parent block; 32 zero bytes in the genesis block |
| 40 | 32 | bytes | `merkleRoot` | Merkle root over the transaction IDs |
| 72 | 32 | bytes | `stateRoot` | Root of the account state after this block |
| 104 | 8 | `u64` | `timestamp` | Unix time in seconds |
| 112 | 4 | `u32` | difficulty field | Encoded difficulty, see [Encoding of the difficulty field](#encoding-of-the-difficulty-field) |
| 116 | 4 | `u32` | `txCount` | Number of transactions in the block, including the coinbase |
| 120 | 8 | `u64` | `extranonce` | Free value in the constant part; separates the search spaces of miners |
| 128 | 8 | `u64` | `nonce` | The value a miner varies |

The block hash is the hash of the header:

```text
block hash = sha256d(header bytes 0..135)
```

### Why 136 bytes

SHA-256 processes its input in blocks of 64 bytes and appends padding and the message length. A message
of 136 bytes becomes exactly three such blocks. Every field except the nonce lies in the first 128 bytes,
that is in the first two blocks. Their intermediate result (the midstate) is the same for every nonce of
one mining job and is computed once. For each nonce a miner then needs two compression steps: one for
the third block of the inner SHA-256 and one for the outer SHA-256 over the 32-byte result.

The extranonce sits in bytes 120 to 127, inside the constant part. A node gives every mining session its
own extranonce, so two sessions that work on the same block content still search different headers. The
consensus rules accept any value.

## Proof of work

```text
target = floor(2^240 / difficulty)
valid  : sha256d(header), read as a big-endian 256-bit integer, <= target
```

The difficulty is the decoded value of the header field and must be at least 1. A hash equal to the
target is valid.

One difficulty unit stands for 65,536 expected hash attempts: `2^240 = 2^256 / 65,536`. A block at
difficulty `d` therefore takes `d x 65,536` attempts on average.

| Difficulty | Target | Expected attempts |
|---|---|---|
| 1 | 2^240 | 65,536 |
| 4,096 (minimum) | 2^228 | 268,435,456 |
| 24,576 (expected for block 1) | `floor(2^240 / 24576)` | 1,610,612,736 |

## Difficulty adjustment

Code: `src/lib/core/difficulty.ts`, `checkDifficulty()` in `src/lib/core/validate.ts`.

Every block states its own difficulty in its header. The rules below define which values are allowed.
They use only the block itself and its ancestors on the same branch, so every node computes the same
bounds. The rules do not apply to the genesis block.

| Parameter | Value | Constant |
|---|---|---|
| Algorithm | LWMA (linearly weighted moving average) | |
| Window | 45 blocks | `LWMA_WINDOW` |
| Target block time `T` | 600 s | `TARGET_BLOCK_TIME` |
| Solve time bounds | 1 s to 3,600 s (`6 x T`) | `SOLVETIME_CAP` = 6 |
| Largest change per block | factor 4 up or down | `LWMA_CLAMP` = 4 |
| Minimum difficulty | 4,096 | `MIN_DIFFICULTY` |
| Expected difficulty of block 1 | 24,576 | `GENESIS_DIFFICULTY` |
| Emergency threshold | 1,800 s (`3 x T`) | `EMERGENCY_FACTOR` = 3 |

### Input

Let `B` be the block to validate, at height `h >= 1`, with the ancestors `A[0]` (genesis) to `A[h-1]`
(parent). For every ancestor `A[i]` with `i >= 1` define

```text
D[i] = difficulty of A[i]
S[i] = timestamp of A[i] - timestamp of A[i-1]      (may be zero or negative)
```

The genesis block contributes no pair. The window consists of the last `n = min(h - 1, 45)` pairs.

### Regular difficulty (LWMA)

If the window is empty (`h = 1`), the regular difficulty is 24,576.

Otherwise number the pairs of the window `j = 1 .. n` from oldest to newest and compute

```text
s[j]     = S[j], but at least 1 and at most 3600
weighted = sum of j x s[j]                      (the newest block has the highest weight)
sumD     = sum of D[j]
next     = floor( (sumD x 600 x n x (n + 1) / 2) / (n x weighted) )

last     = D[n]                                 (difficulty of the parent)
if next > last x 4            then next = last x 4
if next < floor(last / 4)     then next = floor(last / 4)
if next < 4096                then next = 4096
```

`n x (n + 1) / 2` is an integer and is computed first; after that there is exactly one division. The
formula is the average difficulty of the window multiplied by the target time and divided by the weighted
mean solve time. With 45 blocks at difficulty 1,000,000 and 600 seconds each, `next` is 1,000,000.

### Emergency rule

If nobody mines for a long time there are no new blocks and therefore no adjustment. The emergency rule
lowers the requirement while the chain waits:

```text
elapsed = timestamp of B - timestamp of the parent      (0 if not positive)

if elapsed <= 1800:  eased = next
else:                eased = floor(next x 1800 / elapsed), but at least 4096
```

The requirement halves each time the waiting time doubles. For `next` = 1,000,000 the eased value is
999,444 after 1,801 seconds and 500,000 after 3,600 seconds.

### Which difficulty a block may state

```text
below height 6000:   regular = next                       lower = eased
from height 6000:    regular = floorDifficulty(next)      lower = floorDifficulty(eased)

valid:   lower <= difficulty of B <= regular     and     difficulty of B >= 4096
```

`floorDifficulty()` rounds down to the nearest value that the header field can represent. It is defined
in the next section and changes nothing below 2^31. Because it never reverses the order of two values,
the range is never empty.

A block is thus allowed to state less than the regular difficulty only if its own timestamp lies more
than 1,800 seconds after its parent's. A block that states the eased value also counts with that lower
value in the chain work and in the windows of the following blocks.

### Timestamp rules

Code: `checkTimestamp()` in `src/lib/core/difficulty.ts`. Both rules apply to every block except the
genesis block.

1. **Median rule.** Take the timestamps of the last 11 blocks of the branch, ending with the parent (all
   of them if there are fewer than 11), sort them ascending and pick the element at zero-based index
   `floor(count / 2)`. The timestamp of the block must be strictly greater than this value.
2. **Future limit.** The timestamp must not be more than 120 seconds (`MAX_FUTURE_DRIFT`) ahead of the
   clock of the validating node.

The future limit is the only rule that depends on local time. A block that fails it is not stored and can
be accepted when it arrives again later.

### Encoding of the difficulty field

Code: `encodeDifficulty()`, `decodeDifficulty()`, `floorDifficulty()` in `src/lib/core/params.ts`.

The field at offset 112 is always 4 bytes, stored as a little-endian `u32`. The height in the same header
decides how it is read.

**Below height 6,000** the field is the difficulty: a plain `u32` from 1 to 4,294,967,295.

**From height 6,000** (consensus revision 4, `DIFF_V4_HEIGHT`):

| Top bit (bit 31) | Reading | Range |
|---|---|---|
| 0 | difficulty = field | 1 to 2^31 - 1 |
| 1 | `e` = bits 23 to 30, `m` = bits 0 to 22, difficulty = `(2^23 + m) x 2^e` | 2^31 to `MAX_DIFFICULTY` |

- `e` must be between 8 and 216. A header with the top bit set and any other exponent cannot be decoded,
  and the block is rejected.
- Every value has exactly one encoding. Values below 2^31 exist only in the plain form (with `e < 8` the
  second form would produce a value below 2^31), and the leading 1 of the 24-bit mantissa is implicit.
- `MAX_DIFFICULTY = (2^24 - 1) x 2^216`, just below 2^240. Its target is 1.
- A field of 0 decodes to difficulty 0, which has no target; such a block is invalid at every height.

From 2^31 upward only numbers with 24 significant bits can be written. The function that the validity
range uses to round down to such a number is

```text
floorDifficulty(v) = v                        if v < 2^31
floorDifficulty(v) = MAX_DIFFICULTY           if v >= MAX_DIFFICULTY
floorDifficulty(v) = (v >> e) << e            otherwise, with e = (bit length of v) - 24
```

The relative rounding error is below 2^-23.

To encode a representable value `v >= 2^31`: `e = (bit length of v) - 24`, `m = (v >> e) - 2^23`,
field = `2^31 + e x 2^23 + m`.

Examples for heights from 6,000:

| Difficulty | `floorDifficulty()` | Field | Bytes in the header |
|---|---|---|---|
| 4,096 | 4,096 | `0x00001000` | `00 10 00 00` |
| 2,147,483,647 | 2,147,483,647 | `0x7fffffff` | `ff ff ff 7f` |
| 2,147,483,648 | 2,147,483,648 | `0x84000000` | `00 00 00 84` |
| 4,294,967,295 | 4,294,967,040 | `0x847fffff` | `ff ff 7f 84` |
| 4,294,967,296 | 4,294,967,296 | `0x84800000` | `00 00 80 84` |
| 5,000,000,000,000 | 4,999,999,913,984 | `0x899184e7` | `e7 84 91 89` |
| `MAX_DIFFICULTY` | `MAX_DIFFICULTY` | `0xec7fffff` | `ff ff 7f ec` |

In this document "difficulty" always means the decoded value, and so does `BlockHeader.difficulty` in the
code. The `difficulty` field of a mining job is the exception: it carries the raw header field, and the
decoded value is in `difficultyWert`. The reasons for this encoding are recorded in
[CONSENSUS_V4.md](CONSENSUS_V4.md).

## Transactions

Code: `src/lib/core/tx.ts`, `src/lib/core/state.ts`.

### Account model

YSKAR uses accounts, not unspent outputs. The state is a map

```text
address (20 bytes)  ->  { balance, nonce }
```

An address that is not in the map has balance 0 and nonce 0. An account whose balance and nonce are both
0 is removed from the map, so the state does not depend on which addresses were touched in the past. The
nonce counts the transfers an account has sent. It protects against replay and fixes the order of an
account's transfers.

There are two transaction types:

| Type byte | Name | Constant |
|---|---|---|
| 0 | Coinbase | `TX_COINBASE` |
| 1 | Transfer | `TX_TRANSFER` |

Any other type byte makes a transaction, and with it the block, undecodable.

### Transfer wire format

A transfer is 168 bytes plus the length of its memo (`TRANSFER_BASE_BYTES` = 168).

| Offset | Size | Type | Field | Content |
|---|---|---|---|---|
| 0 | 2 | `u16` | `version` | Must be 1 |
| 2 | 1 | `u8` | `type` | 1 |
| 3 | 20 | bytes | `from` | Sender address |
| 23 | 20 | bytes | `to` | Recipient address |
| 43 | 8 | `u64` | `amount` | Units to transfer |
| 51 | 8 | `u64` | `fee` | Units paid to the coinbase of the block |
| 59 | 8 | `u64` | `nonce` | Must equal the sender's account nonce |
| 67 | 4 | `u32` | `validUntil` | Last height at which the transfer may be included; 0 = no limit |
| 71 | 1 | `u8` | `memoLen` | Length `m` of the memo, 0 to 32 |
| 72 | `m` | bytes | `memo` | Free bytes |
| 72 + `m` | 32 | bytes | `publicKey` | Ed25519 public key of the sender |
| 104 + `m` | 64 | bytes | `signature` | Ed25519 signature |

### Signing bytes and signature

The signature covers the chain ID and every field except the public key and the signature itself:

```text
signing bytes = chainId(32) | u16 version | u8 1 | from(20) | to(20) | u64 amount | u64 fee
                | u64 nonce | u32 validUntil | u8 memoLen | memo
sighash       = sha256d(signing bytes)
signature     = Ed25519 signature over the 32 bytes of sighash
```

The signing bytes are 104 bytes plus the memo. The chain ID is part of the signing bytes only; it is not
transmitted. The public key is bound to the transfer by the rule that its hash must equal `from`.

The reference code verifies with `ed25519.verify` of the library `@noble/curves` and its default options,
which follow the ZIP 215 acceptance rules (checked in version 2.4.0 of the library). An implementation
with stricter Ed25519 checks can disagree with it on unusual, non-canonical signatures or keys.

### Transaction ID

```text
txid = sha256d(wire bytes)
```

This holds for transfers and for the coinbase. The signature is part of the wire bytes and therefore of
the transaction ID.

### Validity rules of a transfer

The rules are checked in this order (`checkTransfer()`, then `applyBlock()`). `h` is the height of the
block that contains the transfer. The first failing rule makes the whole block invalid. The names in
parentheses are the error codes of the code.

Without the account state:

1. `version` is 1 (`bad_version`).
2. `amount` is greater than 0 (`bad_amount`).
3. The memo is at most 32 bytes long (`memo_too_long`).
4. Fee and smallest amount, see [Fees](#fees) (`dust`, `fee_too_low`).
5. If `validUntil` is not 0, then `h <= validUntil` (`expired`).
6. The first 20 bytes of `SHA-256(publicKey)` equal `from` (`pubkey_mismatch`).
7. `from` differs from `to` (`self_transfer`).
8. The signature is valid for the chain ID of the network (`bad_signature`).

With the account state, transfer after transfer in block order:

9. `nonce` equals the current nonce of the sender account exactly (`nonce_mismatch`).
10. The sender's balance is at least `amount + fee` (`insufficient_funds`).

Effect of a valid transfer: the sender's balance decreases by `amount + fee` and its nonce increases by
1; the recipient's balance increases by `amount`; `fee` is added to the fee total of the block.

Each transfer is applied to the state that the transfers before it in the same block have left. An
account can therefore send several transfers with consecutive nonces in one block, and it can spend what
it received earlier in the same block.

### Memo

The memo is 0 to 32 bytes (`MAX_MEMO_BYTES`) that the consensus rules do not interpret. It is signed, it
is stored in the block, and from height 4,000 its length raises the minimum fee.

### Expiry

`validUntil` lets a sender limit how long a transfer can wait. A transfer with `validUntil = N` is valid
in blocks up to and including height `N` and can never be included afterwards. The value 0 means no
limit.

## Fees

Every transfer states its fee in units. The fee is not destroyed: the coinbase of the block must pay out
the block reward plus the sum of all fees in the block.

| | Up to height 3,999 | From height 4,000 (revision 3, `FEE_V3_HEIGHT`) |
|---|---|---|
| Minimum fee | 100,000 units = 0.001 YSR, fixed (`MIN_FEE`) | size in bytes x 1 unit (`MIN_FEE_RATE`): 168 units without a memo, up to 200 units with a 32-byte memo |
| Smallest amount | 1 unit | 100 units = 0.000001 YSR (`DUST_LIMIT`) |

The size is the wire size of the transfer, `168 + memoLen` (`transferBytes()`); the function `minFeeAt()`
returns the minimum. From height 4,000 the amount check comes before the fee check.

These are the consensus limits; there is no upper limit for a fee. From height 4,000 a node asks for
more than the consensus minimum before it accepts a transfer into its mempool and relays it (10 units per
byte, `RELAY_FEE_RATE`). That relay minimum and the fee estimator are node policy, not consensus; they
are described in [FEES.md](FEES.md). The reasons for revision 3 are recorded in
[CONSENSUS_V3.md](CONSENSUS_V3.md).

## Coinbase

The coinbase is the transaction that creates the block reward and collects the fees. It has no sender, no
signature and no fee. There are two layouts; the `version` field selects between them.

### Version 1: one recipient

| Offset | Size | Type | Field | Content |
|---|---|---|---|---|
| 0 | 2 | `u16` | `version` | 1 |
| 2 | 1 | `u8` | `type` | 0 |
| 3 | 4 | `u32` | `height` | Height of the block |
| 7 | 20 | bytes | `to` | Recipient address |
| 27 | 8 | `u64` | `amount` | Units paid out |
| 35 | 1 | `u8` | `extraLen` | Length `x` of `extra` |
| 36 | `x` | bytes | `extra` | Free bytes |

### Version 2: several recipients

Valid from height 2,000 (revision 2, `COINBASE_V2_HEIGHT`).

| Offset | Size | Type | Field | Content |
|---|---|---|---|---|
| 0 | 2 | `u16` | `version` | 2 (`COINBASE_V2`) |
| 2 | 1 | `u8` | `type` | 0 |
| 3 | 4 | `u32` | `height` | Height of the block |
| 7 | 1 | `u8` | `count` | Number `c` of outputs, 1 to 64 |
| 8 | 28 x `c` | | outputs | `c` times: `to` (20 bytes), `amount` (`u64`) |
| 8 + 28 x `c` | 1 | `u8` | `extraLen` | Length `x` of `extra` |
| 9 + 28 x `c` | `x` | bytes | `extra` | Free bytes |

The only difference is the count byte after the height. Version 1 has none, which is why blocks from
before revision 2 keep their bytes.

### Rules

1. A block contains exactly one coinbase and it is the first transaction.
2. The `height` of the coinbase equals the height in the block header.
3. A coinbase with `version` = 2 uses the second layout. It is valid only at heights of 2,000 or more; it
   has 1 to 64 outputs (`MAX_COINBASE_OUTPUTS`); the addresses of its outputs are strictly ascending when
   compared byte by byte, which also excludes duplicates; and every output amount is greater than 0.
4. A coinbase with any other `version` value is read with the first layout and has exactly one output.
   The node writes 1. The code does not reject other values; because the version is part of the wire
   bytes, it still changes the transaction ID.
5. The sum of all output amounts equals `reward(height) + fees` exactly, where `fees` is the sum of the
   fees of all transfers in the block. One unit more or less makes the block invalid.
6. The outputs are credited after all transfers of the block have been applied. A transfer therefore
   cannot spend coins that the coinbase of the same block creates.
7. After the coinbase is credited, the sum of all balances must not exceed 21,000,000 YSR
   (`supply_exceeded`).

Version 1 stays valid at every height. A version 1 coinbase has no separate rule for its amount beyond
rule 5.

### The `extra` field

`extra` is not interpreted by the consensus rules. Its length is limited only by the one-byte length
field, so up to 255 bytes are valid. It makes transaction IDs distinct and carries a self-chosen name of
the pool or miner that found the block: the node writes the pool name there (printable ASCII, 3 to 32
characters, see `src/lib/chain/finderName.ts`) and leaves the field empty for solo sessions. The read API
returns the field as `memo` and the decoded name as `finder`. The name is a self-declaration and proves
nothing.

How a pool divides a block among its miners is described in [POOL.md](POOL.md); the reasons for the
second layout are recorded in [CONSENSUS_V2.md](CONSENSUS_V2.md).

## Merkle tree and state root

Code: `merkleRoot()` in `src/lib/core/hash.ts`, `stateRoot()` in `src/lib/core/state.ts`.

### Tree construction

One construction is used for both roots. Its input is an ordered list of byte strings.

```text
leaf  = sha256d(0x00 | item)
node  = sha256d(0x01 | left | right)
```

- Hash every item into a leaf. This is the first level.
- Build the next level by pairing neighbors from left to right. If a level has an odd number of entries,
  the last one moves up unchanged; it is not paired with itself.
- Repeat until one hash remains. That hash is the root.
- The root of a list with one item is its leaf hash. The root of an empty list is 32 zero bytes.

The prefixes `0x00` and `0x01` keep leaves and inner nodes apart, so an inner node can never be presented
as a leaf. Moving an odd entry up instead of duplicating it avoids the weakness known from Bitcoin as
CVE-2012-2459, where two different transaction lists produce the same root.

### Transaction Merkle root

The items are the transaction IDs of the block in block order, the coinbase first. The result is the
`merkleRoot` of the header.

### State root

The items are the accounts of the state after the block, sorted ascending by the raw bytes of the
address. Each item is 36 bytes:

```text
address(20) | u64 balance | u64 nonce
```

Accounts with balance 0 and nonce 0 are not part of the state and do not appear. The result is the
`stateRoot` of the header. The state root of the genesis block is the leaf hash of the single account of
the zero address with a balance of 87,500,000,000 and nonce 0.

## Block format

```text
block = header(136) | u32 count | count x ( u32 length | transaction bytes )
```

`count` repeats the number of transactions; each transaction is preceded by its length in bytes. A block
whose body announces more than 2,000 transactions is not decoded.

The block hash covers the header only. The transactions are bound to it through the Merkle root, and the
resulting balances through the state root.

**Decoding is tolerant.** The reference decoder reads the fields it expects and ignores bytes that follow
them: bytes after the last field of a transaction inside its length frame, and bytes after the last
transaction of a block. Transaction IDs are computed from the re-serialized fields, so such extra bytes
change neither a transaction ID nor the block hash, and the node accepts the block. Blocks built by the
node contain no such bytes.

## Block validity

A node accepts a block only if every check below passes. The order is the order of the code
(`ChainManager.accept()` in `src/lib/node/fullnode/ChainManager.ts`, `checkBlockStructure()` in
`src/lib/core/block.ts`, `validateBlock()` in `src/lib/core/validate.ts`): cheap checks first, the state
last. The names in parentheses are the error codes.

**1. Decoding.** The header is 136 bytes and its difficulty field is decodable at the stated height. The
body announces at most 2,000 transactions. Every transaction has type 0 or 1; a version 2 coinbase has 1
to 64 outputs. No field is cut short.

**2. Structure and proof of work.**

1. The header `version` is 1 (`bad_version`).
2. The block has at most 2,000 transactions (`too_many_txs`).
3. `txCount` in the header equals the number of transactions (`tx_count_mismatch`).
4. The first transaction is a coinbase (`no_coinbase`).
5. No other transaction is a coinbase (`multiple_coinbase`).
6. The coinbase height equals the header height (`coinbase_height`).
7. The Merkle root over the transaction IDs equals `merkleRoot` (`merkle_mismatch`).
8. The header hash meets the target of the difficulty stated in the header (`pow_failed`).

**3. Position in the chain.** For height 0: the previous hash is 32 zero bytes. For every other block:
the parent is known and valid, the height is the parent's height plus 1, and `prevHash` is the parent's
hash (`height`, `prev_hash`). A block whose parent is unknown is not judged; the node requests the
missing blocks.

**4. Timestamp.** The [timestamp rules](#timestamp-rules) (`timestamp`). Not for height 0.

**5. Difficulty.** The stated difficulty lies in the
[allowed range](#which-difficulty-a-block-may-state) (`difficulty`). Not for height 0.

**6. State.** Starting from the state after the parent (`state`):

1. Apply every transfer in block order with the [transfer rules](#validity-rules-of-a-transfer), adding
   up the fees.
2. Check the [coinbase rules](#rules) and credit the coinbase outputs.
3. Check the supply limit.

**7. State root.** The root of the resulting state equals `stateRoot` in the header (`state_root`).

A block that fails any check leaves no trace: the state is modified only on a copy, and an invalid block
is not stored.

Blocks on a side branch are validated against the state and the history of their own branch, not against
the current tip.

## Chain selection and reorganization

Code: `src/lib/node/fullnode/ChainWork.ts`, `src/lib/node/fullnode/ChainManager.ts`.

```text
work of a block  = its difficulty (the decoded value)
work of a chain  = sum of the work of all its blocks, from the genesis block to the tip
```

The expected number of hash attempts for a block is proportional to its difficulty, so the difficulty is
already a linear measure of work and needs no conversion.

- The active chain is the one that ends in the valid block with the most chain work. Height does not
  decide: a longer chain of easy blocks loses against a shorter chain with more work.
- If two tips have the same chain work, the one with the smaller block hash wins, compared byte by byte
  from the first byte. Arrival order would not be the same on every node; the hash is.

A node stores every valid block, including blocks on side branches. When the tip of another branch wins
this comparison, the node switches to it (a reorganization): it rebuilds the state for the new branch
and checks it against the state root of the new tip. There is no limit on the depth of a reorganization
and there are no checkpoints. The procedure, the snapshots and what happens to waiting transfers are
described in [FULLNODE.md](FULLNODE.md).

## Consensus revisions

A revision changes the rules from a fixed height on. Blocks below that height keep their old rules and
their bytes.

| Revision | Constant in `src/lib/core/params.ts` | Height | Change | Design record |
|---|---|---|---|---|
| 2 | `COINBASE_V2_HEIGHT` = 2000 | Active since height 2,000 | The coinbase may pay 1 to 64 recipients (version 2 layout) | [CONSENSUS_V2.md](CONSENSUS_V2.md) |
| 3 | `FEE_V3_HEIGHT` = 4000 | Applies from height 4,000 | Minimum fee of 1 unit per byte instead of a fixed 0.001 YSR; smallest amount 100 units | [CONSENSUS_V3.md](CONSENSUS_V3.md) |
| 4 | `DIFF_V4_HEIGHT` = 6000 | Applies from height 6,000 | The difficulty field can express values above 2^32 - 1, up to `MAX_DIFFICULTY` | [CONSENSUS_V4.md](CONSENSUS_V4.md) |

Together with revision 3 the code began to verify signatures against the chain ID of the network the
node runs on instead of a fixed constant. On the main network the value is the same as before, so this
changes nothing there and is not tied to a height.

## Limits

| Limit | Value | Source |
|---|---|---|
| Transactions per block | 2,000 including the coinbase, so at most 1,999 transfers | `MAX_TXS_PER_BLOCK` |
| Memo | 32 bytes | `MAX_MEMO_BYTES` |
| Transfer size | 168 to 200 bytes | `TRANSFER_BASE_BYTES` plus memo |
| Coinbase outputs | 1 (version 1); 1 to 64 (version 2) | `MAX_COINBASE_OUTPUTS` |
| Coinbase `extra` | 255 bytes | One-byte length field |
| Difficulty | At least 4,096 for every block after genesis; at most 2^32 - 1 below height 6,000 and `MAX_DIFFICULTY` from there | `MIN_DIFFICULTY`, `MAX_DIFFICULTY` |
| Supply | 21,000,000 YSR | `MAX_SUPPLY` |
| Block size in bytes | No consensus limit | |

Without a byte limit, the largest block in canonical encoding follows from the other limits: 136 bytes
header, 4 bytes count, a version 2 coinbase with 64 outputs and 255 bytes of `extra` (4 + 2,056 bytes)
and 1,999 transfers with full memos (1,999 x 204 bytes), together 409,996 bytes. Two transport limits
lie above that and are not consensus rules: a node-to-node message carries at most 2 MiB
([P2P.md](P2P.md)), and the mirror accepts blocks of at most 1,048,576 bytes.

## Regtest

Regtest is a second network for tests on one machine (`REGTEST` in `src/lib/core/networks.ts`, started
with the node flag `--regtest`). It runs the same code and the same rules with these differences:

| Parameter | Main network | Regtest |
|---|---|---|
| Network name | `yskar-main-1` | `yskar-regtest` |
| Chain ID | `952ee402...8af2e8` | `SHA-256("yskar-regtest")` = `bbb27f1ba0a195957f67593fb2d662db09747de8f79a19085c43f5573183a8ee` |
| Minimum difficulty | 4,096 | 1 |
| Expected difficulty of block 1 | 24,576 | 1 |
| Coinbase version 2 (revision 2) | From height 2,000 | From height 0 |
| Per-byte fee and dust limit (revision 3) | From height 4,000 | From height 0 |
| Difficulty encoding (revision 4) | From height 6,000 | From height 6,000 |

Everything else is identical: block time, LWMA window, bounds, emergency rule, formats and limits. At
difficulty 1 a block takes 65,536 hash attempts on average instead of 1,610,612,736 at difficulty 24,576,
so tests can mine whole branches and run forks and reorganizations through the full validation.

Regtest has no predefined genesis block; the first block of a regtest chain is mined by the node that
starts it. Because the chain ID differs, a transfer signed for regtest is invalid on the main network and
the other way round, and nodes of the two networks refuse each other's connections. A data directory
belongs to one network and cannot be reused for the other.

The activation height of revision 4 is the same on every network because it acts inside the header codec,
which does not know the network parameters. Below 2^31 both readings of the field are identical.

## Test vectors

All values in this section were computed with the code in `src/lib/core/`.

### Genesis block

The complete block, 198 bytes: the header, the count 1, the length 54 and the coinbase.

```text
01000000 00000000
0000000000000000000000000000000000000000000000000000000000000000
1007612ea5c27b0b7c6ae79c745da364cfd64224eb6f5519bf559dc3b09fe840
e2860175f61cefa97ff34e88d35402a7ee373a8764adbdda0b97ef200bbeca57
80a1a06a00000000 00100000 01000000 0000000000000000 24bf060300000000
01000000 36000000
0100 00 00000000 0000000000000000000000000000000000000000 000b685f14000000
12 70726f6f662c206e6f742070726f6d697365
```

The spaces and line breaks are for reading only. Lines 1 to 5 are the header (version, height; previous
hash; Merkle root; state root; timestamp, difficulty field, transaction count, extranonce, nonce). Line 6
is the number of transactions and the length of the coinbase. Line 7 is the coinbase: version, type,
height, recipient, amount. Line 8 is the length of `extra` and its bytes.

```text
sha256d(header)                    = 000000090a14a03f1562d11113d539c1208b8078c6391da6c48f6bcf72c33c66
txid = sha256d(coinbase)           = d6a742de01ac71ef6243d28402afe5f05e8f2c60b5daa68c7631ea36c9bf2c4f
merkle root = sha256d(0x00 | txid) = 1007612ea5c27b0b7c6ae79c745da364cfd64224eb6f5519bf559dc3b09fe840
state root  = sha256d(0x00 | 20 zero bytes | 000b685f14000000 | 0000000000000000)
                                   = e2860175f61cefa97ff34e88d35402a7ee373a8764adbdda0b97ef200bbeca57
target at difficulty 4096          = 0000001000000000000000000000000000000000000000000000000000000000
```

### Key derivation

The following seed words are a public test value. Never use them for a wallet.

```text
words       abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
passphrase  (empty)

path        m/44'/9077'/0'/0'/0'
public key  34792b244cfe851d8b3fc62ccb3033297ea2ca5bc31119b397bc3ec4132a751d
address     0e09ac1d8e52421a9417a8511746a700b539e98e
text form   ysr1pcy6c8vw2fpp49qh4pg3w348qz6nn6vw2fg7f0

path        m/44'/9077'/0'/0'/1'
public key  797f8401479c30ab450928c77840817587114534dab9b1572952be6582298526
address     417ac5b716bbeef1b0018eddbddf30319b4f4d00
text form   ysr1g9avtdckh0h0rvqp3mwmmhesxxd57ngqqmmtz2
```

### Transfer

A transfer on the main network from the first address above to the second: amount 100,000,000 units
(1 YSR), fee 100,000 units, nonce 0, `validUntil` 0, no memo.

```text
signing bytes (104 bytes)
952ee402c8e77c34e006d7019780c93e2297795a02abb26c4decd627278af2e8
0100 01
0e09ac1d8e52421a9417a8511746a700b539e98e
417ac5b716bbeef1b0018eddbddf30319b4f4d00
00e1f50500000000 a086010000000000 0000000000000000 00000000 00

sighash
5ee5d12db03c54a7cad6af072115b621b0ab15908be086923e0d9d84ce589998

signature
5d78a81f636235132804a025b0d76f292e7f57459e66015332dd95ad3d2ad382
b1d76058bfb34cf6803cc0619a51120cf50ebeb6c33cef3bc61e0f0720480206

wire bytes (168 bytes)
0100 01
0e09ac1d8e52421a9417a8511746a700b539e98e
417ac5b716bbeef1b0018eddbddf30319b4f4d00
00e1f50500000000 a086010000000000 0000000000000000 00000000 00
34792b244cfe851d8b3fc62ccb3033297ea2ca5bc31119b397bc3ec4132a751d
5d78a81f636235132804a025b0d76f292e7f57459e66015332dd95ad3d2ad382
b1d76058bfb34cf6803cc0619a51120cf50ebeb6c33cef3bc61e0f0720480206

txid
689752b4e0d589f7c54028672518fb3cc6cc6ce31d936eac704d00f8c921816a
```

Ed25519 signatures are deterministic, so signing the same bytes with the same key reproduces this
signature. The transfer passes the stateless rules at every height on the main network; verified against
the regtest chain ID it fails with `bad_signature`.

## Where the rules live in the code

| File | Content |
|---|---|
| `src/lib/core/params.ts` | Constants, reward function, target, difficulty field encoding, activation heights |
| `src/lib/core/networks.ts` | Parameter sets of the main network and regtest |
| `src/lib/core/codec.ts` | Little-endian reader and writer |
| `src/lib/core/hash.ts` | `sha256d`, Merkle tree |
| `src/lib/core/wallet.ts` | Seed words, key derivation, signing and verifying |
| `src/lib/core/address.ts` | Address derivation and text form |
| `src/lib/core/tx.ts` | Transaction formats, signing bytes, transaction ID, stateless transfer rules |
| `src/lib/core/state.ts` | Account state, state root, applying a block, coinbase rules, replay |
| `src/lib/core/block.ts` | Header and block format, structure check, proof of work |
| `src/lib/core/difficulty.ts` | LWMA, emergency rule, timestamp rules |
| `src/lib/core/validate.ts` | Full block validation, difficulty range |
| `src/lib/core/builder.ts` | Building a block template (not a consensus rule) |
| `src/lib/node/fullnode/ChainWork.ts` | Chain work and comparison of tips |
| `src/lib/node/fullnode/ChainManager.ts` | Accepting blocks, side branches, reorganization |
