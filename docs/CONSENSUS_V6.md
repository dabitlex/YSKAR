# Consensus revision 6: versioned foundation, condition scripts, state tree

**Status: draft specification, not yet in effect.** This document is the design record and the
normative specification of consensus revision 6. It is a hard fork: from the activation height blocks
and transactions take new forms that nodes of earlier revisions reject. Nothing in it applies before
the activation height, and every block below that height keeps its rules and its bytes.

| | |
|---|---|
| Revision | 6 |
| Activation height | Not yet set (`V6_HEIGHT` in `src/lib/core/params.ts`, `v6Height` in `src/lib/core/networks.ts`) |
| Status | Draft, open for review; direction decided on 2026-10-16 |
| Kind | Hard fork |
| Node software | Node Core 1.0.0 and the command-line node of the same release |

Where this document and the code disagree, the code is wrong until this document is changed. Where this
document and [PROTOCOL.md](PROTOCOL.md) disagree for heights at or above the activation height, this
document wins; PROTOCOL.md will be updated when the revision is implemented.

## Contents

1. [Scope and principles](#1-scope-and-principles)
2. [Activation and block version](#2-activation-and-block-version)
3. [Fork identifier in every signature](#3-fork-identifier-in-every-signature)
4. [Addresses with a version](#4-addresses-with-a-version)
5. [Accounts and the state tree](#5-accounts-and-the-state-tree)
6. [Transactions](#6-transactions)
7. [Condition scripts](#7-condition-scripts)
8. [Coinbase](#8-coinbase)
9. [Limits](#9-limits)
10. [The activation block](#10-the-activation-block)
11. [Behaviour of nodes around the fork](#11-behaviour-of-nodes-around-the-fork)
12. [Compatibility](#12-compatibility)
13. [Outside the consensus](#13-outside-the-consensus)
14. [Tests and test vectors](#14-tests-and-test-vectors)
15. [What does not change](#15-what-does-not-change)
16. [Decisions and open questions](#16-decisions-and-open-questions)
17. [References](#17-references)

## 1. Scope and principles

Revisions 2 to 5 corrected and tightened rules. Revision 6 changes the account record, the address
format and the transaction format so that capabilities can be added, and it adds the first of them:

- accounts controlled by a **condition script** (multi-signature, hash lock, time lock) instead of a
  single key;
- a **batch transfer** that pays many recipients in one transaction;
- a **state tree** that scales to many thousands of accounts and carries reserved fields for a later
  contract revision;
- a **block version** that names the revision, a **fork identifier** in every signature, and a defined
  behaviour for nodes that meet a revision they do not know.

Principles that every rule below follows:

1. The account model stays. There are no unspent outputs.
2. Every existing address, key and balance stays valid without any action by its owner.
3. Ed25519, BIP39 and the SLIP-0010 path stay. Nothing about how a wallet derives keys changes.
4. Emission, block time target, difficulty rules and the proof of work are untouched.
5. Blocks below the activation height are validated exactly as before, byte for byte.
6. Every new rule is deterministic from the block and the state before it. No rule depends on wall-clock
   time, on the order in which a node received things, or on anything outside the chain.

## 2. Activation and block version

### 2.1 Activation height

Revision 6 applies to every block whose `height` is at least `V6_HEIGHT`. The value is not set in this
draft: until it is, the constant holds `V6_HEIGHT_UNSET` (0xffffffff), a height no block reaches, and
the main network behaves exactly as revision 5. It will be set after the implementation has passed its
tests, with a lead time of several thousand blocks between the release of the node software and the
height. Two regtest networks exist: `REGTEST` keeps revision 6 unset and remains the basis of the
existing test suite; `REGTEST_V6` (own network name and chain ID) activates revision 6 at height 0 and
is the basis of `tests/konsens-v6.test.ts`.

### 2.2 Block header version

The header keeps its 136 bytes and its layout. The rule for the `version` field changes:

| Height `h` | Required `version` |
|---|---|
| `h < V6_HEIGHT` | exactly 1 (as today) |
| `h >= V6_HEIGHT` | exactly 6 |

A block whose `version` differs from the value required at its height is invalid (`bad_version`). The
check is exact, not "at least": a revision 7 will require exactly 7 from its own height, so revision
boundaries are unambiguous and a block can never claim a revision its height does not have. This follows
Monero's hard-fork table. The bits above the low byte are reserved: a later revision may give them a
meaning (for example miner signalling); until then they are zero because the whole field is compared.

`BLOCK_VERSION` in `src/lib/core/block.ts` becomes a function of the height.

### 2.3 Order of checks

The header is 136 bytes and decodable on its own. From the release that implements revision 6 a node
checks, in this order and before it decodes the body: the header decodes; `height` and `prevHash` are
plausible for a known parent; the proof of work meets the difficulty the header states and that
difficulty is the one the chain requires at this height; and only then the `version` rule of 2.2. A
block that fails the version rule after passing the proof of work is handled as described in 11.1. A
block that fails the proof of work is rejected as today, whatever its version. Today's code decodes
the whole body first (`ChainManager.accept()`), which would turn a block of a later revision into
`unlesbar` before its version is ever looked at; this order is therefore normative for revision 6
nodes.

## 3. Fork identifier in every signature

Every transaction valid from `V6_HEIGHT` signs the number of the revision it belongs to:

```text
FORK_ID_V6 = 6   (u32)
```

The fork identifier is the second item of every signing preimage defined in this document (after the
type byte, before the chain ID). A transaction signed under revision 6 is therefore never valid on a chain
that did not activate revision 6, and a transaction signed under revision 5 rules (transfer version 1)
is never valid from `V6_HEIGHT` (see 6.3). After a chain split at the fork, nothing can be replayed
from one side to the other. This follows Zcash's consensus branch ID (ZIP 200).

The chain ID stays. It separates networks; the fork identifier separates revisions of one network.

## 4. Addresses with a version

### 4.1 Address versions

An address is a version and a program. Two versions exist in revision 6:

| Version | Program | Meaning | Spent by |
|---|---|---|---|
| 0 | 20 bytes: first 20 bytes of `SHA-256(public key)` | Today's address, one key | Transfer (type 1) and batch transfer (type 3) |
| 1 | 32 bytes: `SHA-256(script)` | Account controlled by a condition script | Script spend (type 2) |
| 2 to 15 | reserved | Defined by later revisions | — |

The program of version 1 is 32 bytes and not 20, because the script of a multi-party account contains
keys chosen by several parties, and 20 bytes would give a party only 80 bits of collision resistance
against the others (the argument BIP 341 gives for 32-byte witness programs).

### 4.2 Text form

Today's text form has no version character: it is `bech32m(hrp, 20 bytes)`, 42 characters, and its first
data character varies with the hash. Revision 6 keeps that form unchanged for version 0 and adds a
version character only for versions 1 and up:

```text
version 0:  bech32m(hrp, program(20))                      42 characters, as today
version v:  bech32m(hrp, [v] | program)   for v = 1..15    version 1: 63 characters with ysr, 64 with tysr or rysr
```

`[v]` is one 5-bit data value; bech32m writes the value 1 as the character `p`. The program follows as
5-bit groups with the padding rules of BIP 173 (padding shorter than 5 bits, all zero).

**Only the length tells the versions apart, never the prefix.** A version 0 address also begins with
`ysr1p` whenever the first five bits of its hash are `00001` (PROTOCOL.md's own test vector
`ysr1pcy6c8vw2f…` is one). Software must not look at the first data character to decide anything.

Decoding is unambiguous by length: a payload of exactly 32 data characters is version 0. Any other
length is read as `[v] | program`; `v` must be 1 to 15, the program must be whole bytes, and its length
must be the length the version table gives (32 for version 1). A payload with 32 data characters cannot
be a versioned address, because 31 characters are 155 bits and not whole bytes. Text decoders accept
versions 2 to 15 syntactically and return the version, so that a wallet of revision 6 can read and
display an address of a later revision; what a node does with such an address inside a transaction is
in 4.4.

Human-readable parts:

| Network | HRP | Example prefix |
|---|---|---|
| Main network | `ysr` | `ysr1…` (version 0), `ysr1p…` (version 1) |
| Test network | `tysr` | `tysr1…` |
| Regtest | `rysr` | `rysr1…` |

The HRP is an encoding rule for wallets and tools, not a consensus rule: the chain stores raw programs.
Regtest used `ysr` until now; its fixtures change with this revision.

### 4.3 Raw form

Where an address is stored or hashed, the raw form is:

```text
version 0:  program(20)              20 bytes, unchanged
version 1:  0x01 | program(32)       33 bytes
```

Version 0 keeps the bare 20 bytes so that nothing about existing accounts changes. The two forms cannot
collide because their lengths differ.

In transaction fields that may name either version (`to` of all v6 transaction types), an address is
written as:

```text
u8 version | program
```

with 20 program bytes for version 0 and 32 for version 1. There is no length byte: the decoder knows the
lengths of versions 0 and 1, and a transaction with any other version byte cannot be decoded. That is
acceptable because a block of revision 6 may not contain such a transaction anyway, and a block of a
later revision is rejected by its header version before its body is decoded (2.3).

### 4.4 Rules

1. A transaction field that names an address with a version other than 0 or 1 is invalid
   (`unknown_address_version`; raised by the decoder, which makes the transaction and the block
   invalid). This is a consensus rule, not a wallet warning: a transfer to a version that does not exist
   yet cannot be included in a block.
2. A version 1 program of a length other than 32 bytes is invalid (`bad_address_length`).
3. Receiving on a version 1 address needs nothing from the script. The account comes into existence
   with the first incoming amount, exactly like a version 0 account. The chain cannot tell whether a
   well-formed script exists for the hash; funds sent to the hash of a malformed or unknown script are
   unspendable. Wallets must check a script against 7.2 before they show its address (13).
4. The zero address (20 zero bytes) stays the burn address of version 0.

## 5. Accounts and the state tree

### 5.1 Account record

From `V6_HEIGHT` the state maps a raw address (4.3) to an account record of version 1:

| Field | Type | Size | Content in revision 6 |
|---|---|---|---|
| `recordVersion` | `u8` | 1 | 1 (the layout of this record; unrelated to the address version) |
| `balance` | `u64` | 8 | as today |
| `nonce` | `u64` | 8 | as today |
| `codeHash` | bytes | 32 | all zero; reserved for a later contract revision |
| `storageRoot` | bytes | 32 | all zero; reserved for a later contract revision |

The serialized record is 81 bytes. An account is removed from the state when `balance` and `nonce` are
both 0 and `codeHash` and `storageRoot` are both zero, so the state does not depend on which accounts
were touched in the past (as today). The script of a version 1 account is not stored in the state: the
address is its hash, and the spending transaction reveals it (6.5).

The two reserved fields are the fields an Ethereum-style account carries for contract code and contract
storage (EIP-6800 lays out the same record). They are in the record now so that a later revision can fill
them without changing the key or the tree.

### 5.2 State tree

From `V6_HEIGHT` the `stateRoot` of the header is the root of a **binary sparse Merkle tree with leaf
compaction** over all accounts of the state after the block:

```text
key(account)    = SHA-256(raw address)                        32 bytes, 256 bits
leaf(account)   = sha256d(0x00 | key | serialized record)
node(l, r)      = sha256d(0x01 | l | r)
EMPTY           = 32 zero bytes

hash(d, S)  for a set S of accounts whose keys share the first d bits:
  S empty       -> EMPTY
  |S| = 1       -> leaf(the account)                       (compaction: whatever d is)
  |S| >= 2      -> node(hash(d + 1, S0), hash(d + 1, S1))
                   where S0 / S1 are the accounts of S whose key has bit d = 0 / 1
                   (most significant bit first)

stateRoot       = hash(0, all accounts)
```

A subtree with exactly one account has the hash of that account's leaf, at any depth. This is sound
because the leaf commits to the full key, so its position is implied; it is the construction of the
Jellyfish Merkle tree and it makes the cost of updating one account proportional to the depth at which
its key stops sharing a prefix with any other key, about `log2(number of accounts)` hashes, instead of
256. With 35,000 accounts changed in one block (the worst case for 1 MiB of batches) that is about half a
million `sha256d` calls, within reach of the reference implementation in TypeScript; a non-compacted tree
of depth 256 would need roughly fifteen times as much and is not used.

Keys of version 0 and version 1 accounts are SHA-256 of inputs of different lengths (20 bytes against
33 bytes). A collision between them is as unlikely as any SHA-256 collision; the different lengths do not
add to that, they only rule out that one raw address is the other. The root of an empty state is `EMPTY`; the state is never empty on the main
network, because the zero address holds a balance from genesis.

The hash function and the domain prefixes `0x00` and `0x01` are the ones the existing Merkle tree uses
(`hash.ts`). An implementation is free to store the tree as it likes (nodes keyed by height and path,
batch updates that share upper paths, cached subtrees); the root is defined by the construction above
and nothing else. The reason for a binary tree over a hexary or Patricia trie is given in the design
notes: smaller proofs, no RLP, no extension nodes, and far less code.

Below `V6_HEIGHT` the `stateRoot` is the flat tree of PROTOCOL.md, unchanged. A node contains both
procedures and chooses by height (see 10).

## 6. Transactions

### 6.1 Types

| Type byte | Name | Constant | Exists since |
|---|---|---|---|
| 0 | Coinbase | `TX_COINBASE` | genesis |
| 1 | Transfer | `TX_TRANSFER` | genesis; version 2 layout from `V6_HEIGHT` |
| 2 | Script spend | `TX_SCRIPT_SPEND` | `V6_HEIGHT` |
| 3 | Batch transfer | `TX_BATCH` | `V6_HEIGHT` |

Every transaction begins with `u16 version | u8 type`, as today, so the decoder reads version and type
before it knows the layout. From `V6_HEIGHT`:

- type 0 keeps its two layouts (8);
- type 1 must have version 2 (6.3); version 1 is invalid (`bad_version`);
- type 2 and type 3 must have version 1;
- any other type byte, or any other version for a known type, is invalid (`unknown_tx_type`,
  `bad_version`).

Below `V6_HEIGHT` nothing changes: types 2 and 3 and transfer version 2 are invalid there.

Every v6 layout has a `flags` byte directly after the type. In revision 6 it must be 0 (`bad_flags`). A
later revision can define bits in it to add fields without a new type.

**Decoder and validator.** Today the decoder enforces the transaction count, the coinbase output count
and the set of known types without knowing the height (`tx.ts`, `block.ts`), and the same decoder serves
the mempool, where there is no height. From revision 6 the decoder accepts the structural maximum of any
revision (5,000 transactions, 255 coinbase outputs, types 0 to 3, transfer versions 1 and 2) and the
validator applies the per-height rules; a type 2 or 3 transaction in a block below `V6_HEIGHT` is
therefore `unknown_tx_type` from the validator, not `unlesbar` from the decoder. For a script spend the
decoder reads `scriptLen` and `script` and takes the rest of the frame as opaque witness bytes; parsing
the script and the witness is part of validation (7.2, 7.3), so a malformed script yields `bad_script`
and a malformed witness `bad_witness`, never an undecodable block. The same holds for `scriptLen`
(any value the frame allows is read; 0 or more than 1,024 is `bad_script`) and for the batch `count`
(0 or more than 1,000 is `bad_output_count`). The order in which the checks of 6.3 to 6.5 run in the
reference code is: address fields, then version and flags, memo length, fee, validity window, then
amounts and the rest; it differs slightly from the numbering below, which lists rules, not an order.
A different order never changes validity, only which error a rejected transaction is given.

### 6.2 Signing preimage and transaction ID

All signatures of revision 6 are Ed25519 signatures over

```text
sighash = sha256d(preimage)
```

and every preimage begins with the same five fields:

```text
u8 type | u32 FORK_ID_V6 | chainId(32) | u16 version | u8 flags | …type-specific fields…
```

The type byte comes first so that a signature can never be valid for a different type (EIP-2718). The
fork identifier and the chain ID follow, then `version` and `flags`, then the type-specific fields in
their wire order, without the authorization data (public key and signature for a key account; witness
for a script account). Note that the preimage prefix is not in wire order: on the wire `version` comes
before `type`. The script of a script spend is part of the preimage, because it defines the sender.

The transaction ID stays `sha256d(wire bytes)`, authorization included. The wire bytes are the
transaction alone, starting with `u16 version`; the `u32` length that frames each transaction inside a
block body (PROTOCOL.md) is not part of them. For a script spend this means
the witness is part of the transaction ID and of the block's Merkle root; the consequence for
malleability is discussed in 7.6.

### 6.3 Transfer, version 2 (type 1)

A transfer from a version 0 account to one recipient. Compared with version 1 it adds `flags`, a lower
validity bound `validFrom`, and a versioned recipient.

| Size | Type | Field | Content |
|---|---|---|---|
| 2 | `u16` | `version` | 2 |
| 1 | `u8` | `type` | 1 |
| 1 | `u8` | `flags` | 0 |
| 20 | bytes | `from` | Sender address, version 0 |
| 1 + 20 or 32 | address | `to` | Recipient, `u8 version | program` |
| 8 | `u64` | `amount` | |
| 8 | `u64` | `fee` | |
| 8 | `u64` | `nonce` | |
| 4 | `u32` | `validFrom` | First height at which the transfer may be included; 0 = no lower bound |
| 4 | `u32` | `validUntil` | Last height; 0 = no limit (as today) |
| 1 | `u8` | `memoLen` | 0 to 32 |
| `m` | bytes | `memo` | |
| 32 | bytes | `publicKey` | |
| 64 | bytes | `signature` | |

A transfer with a version 0 recipient and no memo is 174 bytes (version 1: 168). The preimage is the
common prefix followed by `from | to | amount | fee | nonce | validFrom | validUntil | memoLen | memo`.

Validity, in the order of the code (`h` is the height of the containing block):

1. `version` is 2, `flags` is 0 (`bad_version`, `bad_flags`).
2. `to` has version 0 or 1 and the program length of its version (`unknown_address_version`,
   `bad_address_length`).
3. `amount > 0`, `amount >= DUST_LIMIT` (`bad_amount`, `dust`).
4. Memo at most 32 bytes (`memo_too_long`).
5. `fee >= minFeeAt(h, size in bytes)` (`fee_too_low`), size including authorization.
6. If `validFrom != 0`: `h >= validFrom` (`not_yet_valid`). If `validUntil != 0`: `h <= validUntil`
   (`expired`). If both are non-zero: `validFrom <= validUntil` (`bad_validity_window`).
7. First 20 bytes of `SHA-256(publicKey)` equal `from` (`pubkey_mismatch`).
8. The raw form (4.3) of `to` differs from the raw form of `from` (`self_transfer`). `to` is compared
   after decoding from `u8 version | program`, not as wire bytes.
9. Signature valid over the sighash (`bad_signature`).
10. With the state: `nonce` equals the sender's nonce (`nonce_mismatch`); balance at least
    `amount + fee` (`insufficient_funds`).

Effect: as today. The recipient account is keyed by the raw form of `to`.

### 6.4 Batch transfer (type 3)

A transfer from a version 0 account to several recipients in one transaction. Its purpose is pool
payouts beyond the coinbase (8) and any other many-recipient payment.

| Size | Type | Field | Content |
|---|---|---|---|
| 2 | `u16` | `version` | 1 |
| 1 | `u8` | `type` | 3 |
| 1 | `u8` | `flags` | 0 |
| 20 | bytes | `from` | Sender address, version 0 |
| 2 | `u16` | `count` | Number of outputs, 1 to `MAX_BATCH_OUTPUTS` |
| per output | | | `u8 version | program | u64 amount` |
| 8 | `u64` | `fee` | |
| 8 | `u64` | `nonce` | |
| 4 | `u32` | `validFrom` | |
| 4 | `u32` | `validUntil` | |
| 1 | `u8` | `memoLen` | |
| `m` | bytes | `memo` | |
| 32 | bytes | `publicKey` | |
| 64 | bytes | `signature` | |

`MAX_BATCH_OUTPUTS` = 1,000. A batch with 1,000 version 0 outputs and no memo is 29,147 bytes. The
preimage is the common prefix followed by `from | count | outputs | fee | nonce | validFrom | validUntil
| memoLen | memo`.

Validity: `version` is 1 and `flags` is 0 (`bad_version`, `bad_flags`); rules 4, 5, 6, 7, 9 and 10 of
6.3 apply with `amount` replaced by the sum of all outputs. In addition:

- `count` is 1 to 1,000 (`bad_output_count`);
- every output has a known address version and the matching length (`unknown_address_version`,
  `bad_address_length`);
- every output `amount >= DUST_LIMIT` (`dust`);
- no output's raw form (4.3) equals the raw form of `from` (`self_transfer`);
- the outputs are in strictly ascending order of their address in **wire form** (`u8 version |
  program`, so a version 0 address is compared as `0x00 | 20 bytes`), compared as byte strings
  (`outputs_unsorted`). The raw form of 4.3 is not used for this order, because version 0 carries no
  version byte there and would sort differently. This forbids duplicates and gives a set of payments
  exactly one encoding and one transaction ID; it is the rule the version 2 coinbase already follows;
- the sum of the outputs, and the sum plus `fee`, do not overflow 64 bits (`bad_amount`).

Effect: the sender's balance decreases by the sum plus `fee`, its nonce increases by 1, every recipient's
balance increases by its amount, `fee` is added to the fee total of the block.

A batch from a script account is not part of revision 6 (see 16).

### 6.5 Script spend (type 2)

A transfer from a version 1 account to one recipient. It reveals the script and the witness that
satisfies it.

| Size | Type | Field | Content |
|---|---|---|---|
| 2 | `u16` | `version` | 1 |
| 1 | `u8` | `type` | 2 |
| 1 | `u8` | `flags` | 0 |
| 32 | bytes | `from` | Program of the sender, version 1 (the script hash) |
| 1 + 20 or 32 | address | `to` | Recipient, `u8 version | program` |
| 8 | `u64` | `amount` | |
| 8 | `u64` | `fee` | |
| 8 | `u64` | `nonce` | |
| 4 | `u32` | `validFrom` | |
| 4 | `u32` | `validUntil` | |
| 1 | `u8` | `memoLen` | |
| `m` | bytes | `memo` | |
| 2 | `u16` | `scriptLen` | 1 to `MAX_SCRIPT_BYTES` |
| `s` | bytes | `script` | Condition script (7.1) |
| | | `witness` | One slot per leaf of the script, in leaf order (7.3) |

The preimage is the common prefix followed by `from | to | amount | fee | nonce | validFrom |
validUntil | memoLen | memo | scriptLen | script`. The witness is not signed; the signatures inside it are
over this sighash.

Validity, in the order of the code:

1. `version` is 1, `flags` is 0.
2. `to` has a known version and the matching length.
3. `amount > 0`, `amount >= DUST_LIMIT`; memo at most 32 bytes.
4. `fee >= minFeeAt(h, size in bytes)`, size including script and witness.
5. Validity window as in 6.3 rule 6.
6. `SHA-256(script) == from` (`script_mismatch`).
7. The script is well formed (7.2) (`bad_script`).
8. The raw form of `to` differs from the raw form of `from`, `0x01 | from` (`self_transfer`).
9. The witness satisfies the script for this transaction (7.4) (`script_unsatisfied`,
   `witness_excess`).
10. With the state: nonce and balance as in 6.3, with the sender keyed by `0x01 | from`.

Effect: as 6.3.

## 7. Condition scripts

A condition script is a tree of five kinds of node. It has no loops, no storage and no arithmetic;
checking it takes time proportional to its size, and its size is bounded. The design follows Cardano's
native scripts (Allegra) and Bitcoin's Miniscript policy language.

### 7.1 Encoding

| Tag | Node | Encoding | Satisfied when |
|---|---|---|---|
| `0x01` | `PK` | `0x01 | publicKey(32)` | A valid Ed25519 signature of this key over the sighash is present |
| `0x02` | `THRESH` | `0x02 | u8 k | u8 n | n child nodes` | At least `k` of the `n` children are satisfied (see 7.4 for the exact rule) |
| `0x03` | `HASH` | `0x03 | hash(32)` | A 32-byte preimage `x` with `SHA-256(x) == hash` is present |
| `0x04` | `AFTER` | `0x04 | u32 height` | `tx.validFrom >= height` |
| `0x05` | `BEFORE` | `0x05 | u32 height` | `tx.validUntil != 0` and `tx.validUntil <= height` |

Children of a `THRESH` node follow it directly, depth first, in the order the script author chose. The
script is the serialization of its root node. There is no length prefix inside the script; the
structure is self-delimiting.

The bytes and the tree correspond one to one, but a policy and its bytes do not: `THRESH(2, [PK A,
PK B])` and `THRESH(2, [PK B, PK A])` are different scripts with different addresses. So that an address
can be rebuilt from its keys without guessing, wallets write the `PK` children of a `THRESH` in
ascending order of the public key bytes, and write other children after the keys in the order `HASH`,
`AFTER`, `BEFORE`, nested `THRESH` (13). The consensus does not enforce this order. The rule fixes the
order only of keys and of the kinds of children; several `HASH`, `AFTER` or nested `THRESH` children
keep the order their creator chose. An address of such a script can therefore not be rebuilt from its
parts alone: the participants exchange the script bytes, and each checks that their hash is the
address.

`AFTER` and `BEFORE` compare against the validity window the transaction states, not against the height
of the block. Together with rule 6 of 6.3 (the block height lies inside the window) this gives the
intended meaning (`AFTER(X)`: the transaction is in a block at height at least `X`; `BEFORE(X)`: at most
`X`) while the script evaluation depends only on the transaction, and a satisfied script cannot become
unsatisfied by a reorganization that moves the transaction to another height inside its window. This is
Cardano's construction. Heights only; there is no time-based lock, and no rule mixes heights and
timestamps.

### 7.2 Well-formedness

A script is well formed when all of the following hold. A script that is not well formed makes the
transaction invalid; it is never evaluated.

1. Size: 1 to `MAX_SCRIPT_BYTES` = 1,024 bytes, and the serialization consumes exactly `scriptLen` bytes.
2. Tags: only the five tags above.
3. `THRESH`: `1 <= k <= n` and `1 <= n <= 16`.
4. Depth: the root is at depth 0. A `THRESH` may stand at depth 0, 1 or 2; a leaf may stand at depth 0,
   1, 2 or 3 (`MAX_SCRIPT_DEPTH` = 3). A script may consist of a single leaf (a 33-byte `PK` script is
   well formed; it is a one-key account with a version 1 address).
5. Keys: at most `MAX_SCRIPT_KEYS` = 16 `PK` leaves in the whole script, and no public key appears twice.
5a. Heights: `AFTER` and `BEFORE` carry a height of at least 1. `AFTER(0)` would always hold and
   `BEFORE(0)` never (it needs `validUntil != 0 && validUntil <= 0`); both are `bad_script`.
6. Every satisfying assignment needs a signature. Define `needsKey(node)`:
   - `PK`: true; `HASH`, `AFTER`, `BEFORE`: false;
   - `THRESH(k, children)`: true if and only if the number of children with `needsKey = false` is
     smaller than `k`.

   The root must have `needsKey = true`. Without this rule a script such as `THRESH(1, [PK(A),
   AFTER(T)])` would let anyone move the funds after height `T`; the refund branch of a swap must be
   `THRESH(2, [PK(A), AFTER(T)])`.
7. A `THRESH` with `n = 1` or `k = n` is allowed (it is OR with one branch, or AND); the encoding is
   still canonical because the tree is written exactly as given.

### 7.3 Witness

Every leaf of the script has one witness slot, in depth-first order of the script. The witness is the
concatenation of the slots:

| Leaf | Slot |
|---|---|
| `PK` | `0x00` (absent) or `0x01 | signature(64)` |
| `HASH` | `0x00` (absent) or `0x01 | preimage(32)` |
| `AFTER`, `BEFORE` | `0x00` (not claimed) or `0x01` (claimed) |

A slot byte other than `0x00` or `0x01`, a slot that ends inside its data, or a witness that does not
consume exactly the remaining bytes of the transaction frame is `bad_witness`.

### 7.4 Evaluation

Evaluation walks the tree depth first, in script order; the first error it meets is the error of the
transaction. Per node:

- A leaf whose slot is absent is **untouched** and unsatisfied.
- `PK` with a slot: satisfied iff `ed25519.verify(signature, sighash, publicKey)` holds (same library
  and acceptance rules as today).
- `HASH` with a slot: satisfied iff `SHA-256(preimage) == hash`.
- `AFTER` claimed: satisfied iff `tx.validFrom >= height`. Because `height >= 1`, this forces
  `validFrom != 0`, and rule 6 of 6.3 then puts the containing block at or above `validFrom`. `BEFORE`
  claimed: satisfied iff `tx.validUntil != 0 && tx.validUntil <= height`.
- `THRESH(k, children)`: let `t` be the number of children that are touched (a child is touched if any
  leaf below it has a slot that is not absent). If `t == 0` the node itself is untouched and
  unsatisfied, like an absent leaf; this is how the unused branch of an OR (the refund branch of a swap
  while claiming) is left alone. Otherwise the node is satisfied iff `t == k` and every touched child is
  satisfied; if `t != k` the transaction is invalid with `witness_excess` (more than `k`) or
  `script_unsatisfied` (fewer than `k`).

The reference implementation runs this in two passes: first the shape alone (which leaves are
touched, slot kinds, `t == k` at every touched `THRESH`), without looking at any signature or preimage;
only when the shape is right are signatures verified and preimages hashed. A witness with sixteen
signatures at a `THRESH(1)` therefore costs the counting, not sixteen verifications. The shape errors
(`bad_witness`, `witness_excess`, `script_unsatisfied` from a count) take precedence over a failed
signature.

The transaction is valid only if the root is satisfied. Requiring `t == k` rather than `t >= k` makes
the witness canonical and bounds the signature checks to what the script needs; a transaction carrying
more signatures than its script uses is invalid, as on Stellar. A touched child that is unsatisfied is
an error, never ignored: a wrong signature cannot be "padded around".

### 7.5 Examples

Sizes are script bytes; transaction sizes assume a version 0 recipient and no memo.

| Account | Script | Script bytes | Spend size |
|---|---|---|---|
| 2 of 3 | `THRESH(2, [PK A, PK B, PK C])` | 102 | 325 |
| 3 of 5 | `THRESH(3, [PK ×5])` | 168 | 457 |
| Swap (HTLC) | `THRESH(1, [THRESH(2, [PK B, HASH h]), THRESH(2, [PK A, AFTER T])])` | 113 | 305 (claim) / 273 (refund) |
| Savings, locked until `T` | `THRESH(2, [PK A, AFTER T])` | 41 | 199 |
| Channel funding | `THRESH(2, [PK A, PK B])` | 69 | 291 |

The spend size is 92 bytes of fixed fields (4 version, type, flags + 32 from + 21 to + 24 amount, fee,
nonce + 8 window + 1 memoLen + 2 scriptLen) plus script plus witness. For 2 of 3 the witness is
2 × 65 + 1 = 131 bytes. Fees at `MIN_FEE_RATE` = 1 unit per byte: a 2-of-3 spend pays 325 units at the
consensus floor, somewhat less than twice a plain transfer (174).

### 7.6 Malleability and the transaction ID

The witness is not signed, and the transaction ID covers it. A third party cannot add or replace a
signature (it has no key) and cannot supply a preimage it does not know, but where a script offers two
equivalent ways to satisfy a `THRESH` without a secret, for example two `AFTER` leaves that both hold
at the stated `validFrom`, anyone who relays the transaction can move the claim bit from one leaf to the
other. The sighash, the sender, the recipient, the amount and the validity are unchanged; only the
transaction ID differs. Funds are never at risk from this.

Consequences that implementations must respect:

- The mempool identifies a pending transaction by `(sender raw address, nonce)`, not by transaction ID,
  and treats a second transaction with the same pair as a replacement candidate, not as new.
- A wallet that waits for its script spend to confirm watches the sighash or the `(sender, nonce)`
  pair, never the transaction ID it computed locally.
- Wallets avoid the shape altogether where they can: a `THRESH` should not contain two lock leaves that
  can hold at the same time.

The alternative, a transaction ID that excludes the witness, would need a separate commitment to the
witness in the block (Bitcoin's witness commitment) and is more machinery than the problem warrants at
this size. It can be added in a later revision if needed.

### 7.7 Signature budget

A block of 1 MiB can hold about 630 script spends with 16 keys each, which is about 10,000 Ed25519
verifications against at most 1,999 today. To keep the cost of verifying a block bounded, revision 6
introduces a consensus limit:

```text
MAX_BLOCK_SIGOPS = 8,000
```

The signature operations of a block are: 1 for every transfer and every batch, plus the number of `PK`
slots that are present (`0x01`) in every script spend. A block above the limit is invalid
(`too_many_sigops`). A node checks the budget before it verifies any signature. The mempool stops
verifying a script spend at its first invalid signature.

Measured cost on the reference machine (cloud VM, 2 vCPU Intel Xeon at 2.1 GHz, 2026-10-17), for the
signature checks alone:

| Verifier | 8,000 signatures | Full block, 4,999 transfers (`applyBlock`) |
|---|---|---|
| `@noble/curves` (JavaScript) | about 10 s | about 6.7 s |
| ed25519-zebra as WebAssembly, one by one | about 0.85 s (Electron 38: 0.7 s) | — |
| ed25519-zebra as WebAssembly, batch (7.8) | about 0.27 s | about 0.52 s |

The limit of 8,000 is chosen for the batch verifier of 7.8. With JavaScript verification alone it would
be too high; nodes therefore use the WebAssembly verifier.

Confirmed on weak hardware on 2026-10-17 with `scripts/signatur-messung` (older Windows 10 laptop,
4 cores, Chrome 155): all 208 test vectors correct; 8,000 signatures one by one 1.59 to 1.66 s, as a
batch 0.51 to 0.55 s. The worst case for a node is a block whose batch fails because of one invalid
signature at the end: batch plus single verification, about 2.2 s on that laptop, and such a block
still needs valid proof of work. Against a block time of 600 s this leaves a wide margin; the limit
stays at 8,000.

### 7.8 Signature verification rule

Every Ed25519 signature in YSKAR, in every revision, is valid if and only if it satisfies **ZIP 215**
(Zcash, activated with the Canopy upgrade):

1. `A` (public key) and `R` (first half of the signature) are 32-byte encodings of points on the
   curve. Non-canonical encodings (y not reduced modulo p) are accepted.
2. `S` (second half) is an integer below the group order L, in little-endian. `S ≥ L` is invalid.
3. With `k = SHA-512(R ‖ A ‖ M)` over the bytes exactly as given, the cofactored equation
   `[8][S]B = [8]R + [8][k]A` holds. The equation without the cofactor must not be used.
4. Public keys and `R` of small or mixed order are not rejected for that reason.

This is not a new rule. It is the rule `@noble/curves` has applied with its default (`zip215: true`)
since genesis; revision 6 writes it down so that it no longer depends on a library.

**Why it matters.** Ed25519 implementations do not agree on these edge cases. OpenSSL (Node 22) and
BoringSSL (Electron 38), for example, check the equation without the cofactor and reject some of the
encodings above: of the 196 official ZIP 215 vectors they decide 184 differently. A node that verified
with such a library would disagree with the others on blocks an attacker can build on purpose. Such a
library must not be used for consensus, not even as a shortcut.

**Implementation.** Nodes verify with `ed25519-zebra` 5.0.0 (Zcash Foundation), the library Zcash's
node Zebra uses, compiled to WebAssembly (`crypto/zip215`, embedded in `src/lib/node/zip215Wasm.ts`).
It decides exactly like `@noble/curves` in every test (`tests/zip215.test.ts`): the 196 official
ZIP 215 vectors, the 12 cases of ed25519-speccheck (Chalkias, Garillot, Nikolaenko, *Taming the many
EdDSAs*, 2020), about 90 constructed edge cases (small and mixed order, non-canonical encodings,
`S + L`), 3,000 seeded random edge cases, and 1,000 real and tampered signatures. The module is loaded
only after a checksum and a self-test; if either fails, the node falls back to `@noble/curves`. The
Mini App and wallets keep `@noble/curves`, which signs and, where needed, verifies by the same rule.

**Batch verification.** Before applying a block, a node verifies all of its signatures in one batch
(random coefficients from a cryptographic source, fresh per call). ZIP 215 guarantees that batch and
single verification give the same result. If the batch fails, the node verifies one by one as before,
so the error and its position are the same as without the batch. A block's validity never depends on
whether it was batched; only the time does.

**Reproducible build.** `node crypto/zip215/build.mjs --pruefen` rebuilds the module with the pinned
compiler (`rust-toolchain.toml`) and dependencies (`Cargo.lock`) and compares the SHA-256 with the
embedded file (`12b6e504…a769bd3`). A rebuild in a different directory gives the same bytes.

Updating ed25519-zebra, the compiler or `@noble/curves` is a consensus decision and requires
`tests/zip215.test.ts` to pass unchanged.

## 8. Coinbase

The coinbase keeps both layouts and all rules of revisions 2 and 5, with one change:

- From `V6_HEIGHT` a version 2 coinbase may have 1 to **255** outputs (`MAX_COINBASE_OUTPUTS`, today
  64). The count field is already a `u8`; the layout does not change. A pool can therefore pay up to 254
  miners and itself directly in the block.

Coinbase outputs stay version 0 addresses (20 bytes). Paying a version 1 account from the coinbase is
not part of revision 6 (see 16). The dust rule of revision 5 applies to every output as before.

## 9. Limits

From `V6_HEIGHT`:

| Limit | Value | Constant | Before |
|---|---|---|---|
| Transactions per block, coinbase included | 5,000 | `MAX_TXS_PER_BLOCK` | 2,000 |
| Block size | 1,048,576 bytes | `MAX_BLOCK_BYTES` | unchanged |
| Signature operations per block | 8,000 | `MAX_BLOCK_SIGOPS` | — (implicitly 1,999) |
| Coinbase outputs (version 2) | 1 to 255 | `MAX_COINBASE_OUTPUTS` | 1 to 64 |
| Batch outputs | 1 to 1,000 | `MAX_BATCH_OUTPUTS` | — |
| Script size | 1 to 1,024 bytes | `MAX_SCRIPT_BYTES` | — |
| Keys per script | 16 | `MAX_SCRIPT_KEYS` | — |
| `THRESH` arity | 1 to 16 | — | — |
| Script depth | 3 | `MAX_SCRIPT_DEPTH` | — |
| Memo | 32 bytes | `MAX_MEMO_BYTES` | unchanged |
| Minimum fee | 1 unit per byte of the whole transaction | `MIN_FEE_RATE` | unchanged |
| Smallest amount | 100 units | `DUST_LIMIT` | unchanged |

5,000 transfers of 174 bytes plus the 4-byte length frame of each are about 890 KB, plus header and
coinbase; the byte limit and the count limit are therefore reached at a similar point. Verification
cost is bounded by `MAX_BLOCK_SIGOPS` (7.7), about four times today's maximum, and by the script size
limits; the state tree cost is discussed in 5.2.

## 10. The activation block

The block at height `V6_HEIGHT` is the first block with `version` 6, the first block that may contain
type 2 and 3 transactions and version 2 transfers, and the first block whose `stateRoot` is the root of
the sparse Merkle tree (5.2).

The state before it is the state after block `V6_HEIGHT - 1`, as every node already holds it. No
migration transaction exists and no operator acts: each node converts its state deterministically when
it validates the activation block, by writing every existing account into a record of version 1 with
zero reserved fields and keying it by `SHA-256` of its 20-byte raw address. Two nodes with the same state before the block
compute the same new root. A node that joins later and syncs from genesis performs the same conversion
at the same height.

Everything below `V6_HEIGHT` is validated with the rules of revisions 1 to 5 and the flat state tree. A
revision 6 node therefore contains both state-root procedures, both transfer layouts and both header
version rules, and selects by height. This is the principle of Cardano's hard-fork combinator applied in
the simplest possible form: no block is re-interpreted, no history is rewritten.

## 11. Behaviour of nodes around the fork

### 11.1 A node of revision 6 that sees a higher revision

If a block's header passes the proof-of-work check of 2.3 and its `version` is higher than the highest
revision the node knows, the node rejects the block (`bad_version`), does **not** disconnect the peer,
logs once that a higher revision was seen and that an update is required, and reports
`revision_status: outdated` in its status API. This replaces the current behaviour, where an invalid
block closes the connection (`ungueltiger_block`), for this one case. A node that is behind thereby stays
reachable and can be updated instead of dropping off the network.

The proof-of-work condition matters: without it, anyone could send a header with `version` 99 and no
work and make every node on the network report itself outdated. The condition is the full one of 2.3:
the parent is known and valid, the height follows it, and the difficulty is the one the chain requires
there, not merely the one the header states. A header with a higher version that fails any of this is
treated as any invalid block today (`bad_version`), and the peer is disconnected.

Independently of what it sees, a node compares the current time with the timestamp of the last
revision it knows (`V6_TIMESTAMP`, set when the height is set): after 180 days it reports
`update_recommended`, after 365 days `probably_forked`. Both are reports, never a reason to stop. These
two mechanisms follow Monero's `hardfork.cpp`.

A forced shutdown of old binaries at a fixed height (Zcash's end-of-service halt) is **not** adopted. It
is noted as an option for a later revision.

### 11.2 Before the activation height

Below `V6_HEIGHT` a revision 6 node behaves exactly like a revision 5 node: it builds version 1 headers
and version 1 transfers, rejects types 2 and 3, and uses the flat state tree.

### 11.3 Nodes of revision 5 and earlier at the fork

A node that has not been updated cannot follow the activation block. With today's code it will usually
fail to decode the body before it ever looks at the header version (a batch, a script spend or a coinbase
with more than 64 outputs is `unlesbar` to it; a version 2 transfer is read with the old layout and fails
the canonical-encoding rule), and it closes the connection to the peer that sent the block
(`block_unlesbar`, `ungueltiger_block`). It stays on the last pre-fork block until it is updated.
It cannot build a competing chain of any weight for long, because every pool and every miner of weight
will have updated, but it also receives no new blocks. This is why the lead time and the update of every
pool before the height matter.

### 11.4 Peer handshake

The handshake carries two new fields: the highest revision the node implements and the next activation
height it knows (0 if none). Peers whose revision is lower than the activation height requires are
preferred for eviction when inbound slots are full in the last 1,000 blocks before `V6_HEIGHT`, never the
last peer of a network group (ZIP 201). After the height, a peer that announces a revision below 6 is
not banned, but is not asked for blocks. The handshake is part of the network protocol ([P2P.md](P2P.md)),
not of the consensus.

## 12. Compatibility

| | Has to be updated? |
|---|---|
| Nodes that mine or run a pool (command-line node, Node Core) | **Yes, before `V6_HEIGHT`.** An old node cannot build or accept blocks from the height on. |
| Other full nodes | **Yes, before `V6_HEIGHT`.** An old node stops at `V6_HEIGHT - 1`. |
| Web server (mirror, `/api/v2/block`), observer | Yes. Both validate with the core and must decode the new transaction types, address versions and the new state root. The mirror's tables gain the address version, script accounts and the new transaction types. |
| Pool server | Yes. Coinbase with up to 255 outputs; batch payout mode for larger pools; mode reported to the pool directory (13). |
| App, Mini App, CLI wallet | **Yes, before `V6_HEIGHT`.** Version 1 transfers are invalid from the height; a wallet that has not been updated can no longer send. Receiving and balances are unaffected. |
| CLI miner, GPU miner, HiveOS package | No. Miners take jobs from the node and do not build transactions. The header bytes they hash do not change. |
| Explorer | Yes, to display version 1 addresses, scripts and the new types. Old data stays valid. |

## 13. Outside the consensus

| Place | Change |
|---|---|
| Wallets | Create and display version 1 addresses; build version 2 transfers (always, from the height; before the height version 1); create multi-signature and time-locked accounts; co-sign: exchange the unsigned transaction (or its sighash) between devices and assemble the witness. The transport (QR, file, message) is the wallet's choice. A wallet checks every script against 7.2 before it shows the address (4.4 rule 3), writes `PK` children in ascending key order (7.1), tracks pending script spends by sighash (7.6), and never derives anything from the first character after `ysr1` (4.2). |
| Mempool (`TxPool`) | Keys pending transactions by `(sender raw address, nonce)` (7.6); minimum fee from the actual size; refuses a transaction whose `validFrom` lies in the future (the refund branch of a swap is submitted once its height is reached); the witness shape check (7.4) stops a script spend before any signature is verified. |
| Block building (`selectTransactions`) | Respects the signature budget and the 1 MiB limit while choosing transactions, reserving room for the largest coinbase of the height. |
| Fee hints (`/fees`) | The floor is the size of a version 2 transfer (174 bytes) from the height; slots per block follow the height. |
| Pool server | Up to 254 miners paid in the coinbase; above that, or for pools that settle over several blocks, a batch transfer from the pool account. The pool reports its mode (`coinbase` or `batch`) to the directory, and the directory shows it, so that a miner knows whether the pool holds funds between block and payout. |
| Mining jobs | Header `version` 6 from the height. The 136-byte layout and the midstate optimisation are unchanged. |
| Node status API | `revision`, `nextActivationHeight`, `revision_status` (`current`, `outdated`, `update_recommended`, `probably_forked`). |
| Mirror (Supabase) | Stores the raw address with its version; new tables or columns for scripts revealed in spends, for batch outputs, and for the account record fields. The mirror mirrors the state root; it never computes consensus. |
| Node Core | Shows revision 6 and the activation height; version 1.0.0. |
| Fee estimator | Counts per byte as before; a script spend or a batch is simply larger. |

## 13a. Implementation status

Implemented on the branch `consensus-v6` (not merged):

*Consensus (phases 1 to 4):* `src/lib/core/params.ts` (constants, height helpers), `networks.ts`
(`v6Height`, `REGTEST_V6`), `address.ts` (versions, raw form, wire form, HRPs), `script.ts` (encoding,
well-formedness, witness, evaluation), `smt.ts` (state tree), `tx.ts` (transfer version 2, script
spend, batch, v6 sighash, checks, sigops), `state.ts` (account record, `stateRootAt`, budget, limits),
`block.ts` (`checkHeaderVersion`, `precheckHeader`, per-height limits), `validate.ts`, `builder.ts`.

*Node (phase 5):* `ChainManager.accept()` (header first, `fassung_unbekannt`, `hoehereFassungGesehen`),
`SyncManager` (keeps the peer on an unknown revision; does not order blocks at or above the height
from a peer of a lower revision, 11.4), `TxPool` (all spend types, keyed by sender raw address and
nonce, fee by actual size, `validFrom` in the future refused; after each block, entries the next
height no longer allows are dropped, so a version 1 transfer leaves the queue at the activation
height), `builder.selectTransactions` (signature budget and block size), `jobVorlage` (state root by
height), `ReadApi` (`/summary` with `revision`, `nextActivationHeight`, `revision_status`; `/fees`
with `fassung`, `basisBytes`, `sendepause`, `aktivierung` for wallets), `kettenIndex`, `store` (mirror
payload with `flags`, `valid_from`, `script`, `witness`), `src/lib/node/fassung.ts` (revision status
of 11.1, eviction window and block-source rule of 11.4), P2P handshake fields of 11.4
(`messages.ts`, `PeerConnection`, `PeerManager`; documented in [P2P.md](P2P.md)), command-line node
status, Node Core 1.0.0 (status API, settings page with revision and activation height, peer list
with revision).

*Pool server:* coinbase with up to 255 outputs from the height (`settlement.abrechnen` takes the
limit, `PoolCoordinator.plaetze(height)`, `aufteilung` by height); the pool reports `modus:
"coinbase"` under `/pool`; the directory (`verzeichnis.ts`) reads `modus` and both apps show a note
when a pool holds funds (`batch`). The batch payout mode itself (pool account, batch transfers,
owed-balance ledger) is **not** implemented: it needs a hot key on the pool server and is only
required above 254 miners per block; see 16.

*Wallets:* `tx.ts` offers `transferVersionAt` and `sendepause` (3 blocks before the height, no
transfer is submitted: a version 1 would be left in the queue at the boundary, a version 2 is not
yet accepted). Node Core wallet and Mini App (`Send.tsx`) pick the version from the node's `/fees`
answer and show the pause. `src/lib/wallet/mehrfach.ts` implements k-of-n accounts (7.1), the
co-signing file (JSON with hex fields: unsigned transaction, signatures per key), signing, and the
assembly of the witness with one slot per leaf (7.3), of which exactly k `PK` slots are filled, the first k signers in script order; `tests/wallet-mehrfach.test.ts` runs
the full 2-of-3 flow through the mempool. **No user interface for it yet** in Mini App, Node Core
or the command-line node; address input and display already accept version 1 addresses everywhere.

*Signature verification (7.8):* `src/lib/core/sigcheck.ts` (the one place signatures are checked,
ZIP 215, batch pre-check per block), `src/lib/node/zip215.ts` (WebAssembly verifier with checksum,
self-test and fallback; activated by `ChainManager` and `TxPool`), `crypto/zip215` (Rust source,
pinned toolchain, reproducible build), `tests/zip215.test.ts`, `tests/fixtures/ed25519-vektoren.json`
(official vectors with source and licence).

*Mirror:* `supabase/migrations/00027_konsensfassung_6.sql` (not applied): address lengths 20 or 33 in
transactions, accounts and mempool; types 2 and 3; columns `flags`, `valid_from`, `script`,
`witness`; `commit_block` writes them and accepts a missing `to_addr` for a batch. Prefix search of
version 1 addresses in the explorer is not adapted (a full address works).

Not yet done: batch payout mode, multi-signature user interfaces, signature budget benchmark (14),
remaining test vectors (14), `V6_HEIGHT` and `V6_TIMESTAMP`.

## 14. Tests and test vectors

Every rule above gets a test in the pattern of `tests/konsens-v5.test.ts`: with regtest (activation at
height 0) the invalid case is rejected and the valid case accepted; with the activation moved beyond the
test height the old rule applies. In addition, before the activation height is set:

- **Test vectors**, published in this document and pinned in `tests/konsens-v6.test.ts` and
  `tests/v6-vektoren.test.ts`. The first set,
  on `REGTEST_V6` (chain ID `sha256("yskar-regtest-v6")`), with keys derived by `keypairFromSeed` from a
  32-byte seed of all `0x01` (Alice), `0x02` (Bob), `0x03` (Carol):

  | Vector | Value |
  |---|---|
  | Alice public key | `01f5c342bb922ef3b00bc3c78a687c3ce2cb5f269b7c39270958071cc7f2aeb6` |
  | Bob public key | `f94804a21dfa5a45eb8193d7ecc0889bf726c3400e2657664335a158a84ad048` |
  | Transfer v2 Alice → Bob, 1,000 units, fee 1,000, nonce 7, validFrom 5, validUntil 50, memo `v6`: sighash | `d50aa0b8afee28c7fd97133ac5ef0c0bdab7ffabea0a051e3ebe98d26378f977` |
  | the same transfer: transaction ID | `595b251ceb0a88f4f711f3b6d899f7d41203429029c1dc0ebe5ae382e44ed27f` |
  | 2-of-3 address of Alice, Bob, Carol (keys sorted) | `ysr1pg95f6ku4e4d7us6xnf5l456uwmc8aerjd02ck72eh7szku28qjqqynpjww` |
  | State root (5.2) of {Alice: 5, Bob: 7}, nonces 0 | `51be0642ee68cd9f90a66f8e22ed2de2106789d5f6b40b0ce371e5052493df26` |

  The second set (2026-10-17), on the same network, covers every new transaction type. All inputs and
  every intermediate value (wire bytes, sighash, signature, witness) are in
  `tests/fixtures/v6-vektoren.json`; the table lists the end results:

  | Vector | Value |
  |---|---|
  | Alice, Bob, Carol, Dave: Ed25519 secret key | 32 bytes of 0x11, 0x22, 0x33, 0x44 (raw RFC 8032 secret, no derivation) |
  | Alice public key | `d04ab232742bb4ab3a1368bd4615e4e6d0224ab71a016baf8520a332c9778737` |
  | Alice address (main-net HRP) | `ysr1zzaxsty26y6389c73dtgsx4t30ts9wuq55e0fh` |
  | 2-of-3 script of Alice, Bob, Carol: address (main-net HRP) | `ysr1pdrxef4yzmkz4wklhfu5yqrh68nxd5natshha6t9cqhg24a06rvsq74ljqn` |
  | HTLC script (Bob with secret, else Alice from height 100): address (main-net HRP) | `ysr1pt9zrgtr6pjp5zukzek92ctq8t6lrneqjtcfvff85fa0ug582d3cq6m6ujn` |
  | Transfer v2 Alice → Bob, 1,000,000 units, fee 2,000, nonce 7, validFrom 5, validUntil 50, memo `v6`: txid | `fd4b2bba303efad4ed057384c8ce42ccaaabd166524065e13f2cc3a322cbbc03` |
  | Batch Alice → Carol 30,000, multisig 50,000, Bob 20,000, fee 3,000, nonce 8, memo `Auszahlung`: txid | `f97adc7e3faf3379f6958b456b3d805b0316e8caf1dc0bfea8bd1b3c456aa0cf` |
  | 2-of-3 spend → Dave 40,000, fee 4,000, nonce 2, memo `2von3`, signed by Alice and Carol: txid | `864e04e712e452fd1bcc0a19300c28bf4d9a04137dec73cd9cdd684a65a3fe88` |
  | HTLC claim → Bob 60,000, fee 5,000, validUntil 90, with the secret: txid | `a0d55b92ae0a8f8cf764b8864f1085238ad437932ea77aa6b3f37e8e90fc60a5` |
  | HTLC refund → Alice 60,000, fee 5,000, validFrom 100, memo `zurueck`: txid | `0c1668617f62908bcacfb5766ea9d9716566b3a1f7cd110b1c3d6245a1bdd6d8` |
  | State root of {Alice 5/0, Bob 7/3, multisig 9/2} (balance/nonce) | `645a52c94aadcb6fb3a668bfb73b8fa2dcaf476b8f091219953e4cd0354d5f71` |

  **Recomputation.** The second set was recomputed by a separate implementation in Python
  (standard library, `cryptography` for Ed25519, bech32m written from BIP 350), built from this
  document alone without access to the YSKAR source. All 46 values match. The same pass found ten
  unclear passages, corrected on 2026-10-17: the batch sort order (6.4), the version rule of the batch
  (6.4), the `self_transfer` comparison (6.3, 6.4, 6.5), the address length per HRP (4.2), the order of
  non-key script children (7.1), the collision argument of the state tree (5.2), the framing of the
  transaction ID (6.2), the witness wording (13a), and the key derivation and HRP of the first set
  (below). This is the project's own cross-check; a review by others remains desirable.

  Note on the first set: its keys come from YSKAR's wallet derivation (SLIP-0010 path
  `m/44'/9077'/0'/0'/0'` with the 32 bytes as seed, PROTOCOL.md), which is not consensus, and its 2-of-3
  address is written with the main-net HRP `ysr`. The second set uses raw keys for that reason.

  Still to add: the main network's state at a fixed height under the new tree, and main-network vectors
  once the chain ID and height are fixed. These vectors are the basis for any later hardware-wallet or
  third-party implementation.
- **Script checker**: a fuzzing harness that generates random trees and witnesses and compares the
  reference evaluator against an independent re-implementation; every well-formedness rule has a
  negative test; `needsKey` is tested on every example of 7.5 and on adversarial shapes.
- **State tree**: the main network's state is replayed from genesis to the current height with both
  procedures running side by side from the activation height of a regtest copy; roots must match the
  reference implementation at every block.
- **Fork behaviour**: a revision 5 node and a revision 6 node in one regtest before the height agree on
  every block; at the height the old node rejects and stays connected to nothing it cannot follow, the
  new node continues; a transaction signed under revision 5 is rejected after the height and one signed
  under revision 6 is rejected before it.
- **Batch and coinbase**: 1,000 outputs accepted, 1,001 rejected; unsorted or duplicate outputs
  rejected; 255 coinbase outputs accepted, 256 rejected; pool settlement with 300 miners produces a
  coinbase of 255 outputs plus a batch for the rest, with an exact sum.
- **Signature budget**: a block at exactly 8,000 signature operations is accepted, one above is rejected
  before any signature is verified.
- **Order of checks**: a block with a higher header version and valid work is rejected without
  disconnecting the peer and sets `revision_status: outdated`; the same header without valid work is
  rejected with a disconnect and changes no status.
- **Performance**: the reference implementation verifies a 1 MiB block at the signature budget and
  applies a block that changes 35,000 accounts within a fixed time on the main node's hardware
  (2 vCores, 4 GB); the budget is set from this measurement before the activation height.

The existing test suite must pass unchanged for heights below the activation height.

## 15. What does not change

The hash function, the proof of work, the header layout and its 136 bytes, the difficulty adjustment and
the emergency rule, the timestamp rules, the block time, the block reward, the halvings, the 21,000,000
YSR, the fee rate, the dust limit, the memo, BIP39, the SLIP-0010 path, Ed25519, the chain ID, the
transaction Merkle root, the coinbase layouts, every version 0 address, every balance, and every block
below the activation height.

## 16. Decisions and open questions

Decided on 2026-10-16 (design record in the project notes):

| Point | Decision |
|---|---|
| Model | Account model stays; UTXO rejected (lower throughput per byte, migration of every balance) |
| Scope | Foundation + addresses + scripts + state tree + batch + limits in one hard fork; split into 6a/6b only if no second reviewer is found |
| Activation | Fixed height with lead time; miner signalling not used (veto risk at two or three pools) |
| Replay protection | Fork identifier in every signature; transfer version 1 invalid from the height |
| Transfer version 1 transition | No grace period (decided 2026-10-16). Version 1 is invalid from `V6_HEIGHT` onward; a grace window would reopen replay for its duration. The transition is carried by lead time instead: wallets ship transfer version 2 before the height is announced and pick the version by chain height; nodes and wallets show the update hint (11.1) ahead of the height; wallets stop sending version 1 a few blocks before the height so no version 1 transaction is left in the mempool at the boundary. Nothing is lost for an outdated wallet: keys, addresses and balances are unchanged, it can send again after updating |
| Address version 1 | 32-byte program; HRPs `ysr` / `tysr` / `rysr` |
| Scripts | Five node kinds; height-based locks only; checked against the validity window; every branch needs a key; excess witness is invalid |
| State tree | Binary sparse Merkle tree over `SHA-256(raw address)`; record with two reserved 32-byte fields |
| Limits | 5,000 transactions per block; 255 coinbase outputs; 1,000 batch outputs; 8,000 signature operations per block (added after review, 2026-10-16; confirmed on weak hardware, 2026-10-17, 7.7) |
| Witness malleability | Accepted and documented (7.6); mempool and wallets key by sender and nonce or by sighash; no separate witness commitment in this revision |
| Node behaviour | Header version checked after proof of work and before body decoding; reject, warn, stay connected; time-based update hints; no forced halt |
| Node software | 1.0.0 |
| Testing | Internal, old and new nodes side by side; no public testnet |

Open, to be settled before the activation height is set:

1. **Coinbase to version 1 accounts.** A pool whose treasury is a multi-signature account cannot be paid
   from the coinbase in revision 6. Options: a coinbase version 3 with versioned outputs in this
   revision, or leave it to revision 7. Leaning: revision 7, to keep the coinbase untouched here.
2. **Batch from a script account.** A multi-signature pool treasury paying miners needs it. Options:
   type 3 version 2 with script authorization in a later revision. Leaning: later.
3. **`V6_HEIGHT` and `V6_TIMESTAMP`.** Set after 14 is complete.
4. **Mirror schema.** Written (`supabase/migrations/00027_konsensfassung_6.sql`), not yet applied.
5. **Pool batch payout mode.** Decided on 2026-10-17: YSKAR does not build it into its pool server. In
   this mode a pool holds miners' funds between block and payout and needs a signing key on the
   server; an operator who wants it builds it with type 3 (6.4). YSKAR provides a guide in
   [POOL.md](POOL.md) and test vectors (14), both still to be written. The directory and both apps
   already show the mode.

## 17. References

- Zcash ZIP 200 (activation height, consensus branch ID), ZIP 201 (peer eviction around upgrades)
- Monero `src/hardforks/hardforks.cpp`, `src/cryptonote_basic/hardfork.cpp` (height table, exact header
  version, update hints)
- Ethereum EIP-155 (chain ID in signatures), EIP-2124 (fork ID in the handshake), EIP-2718 (typed
  transaction envelope), EIP-6800 (account record layout), EIP-7864 (binary state tree)
- Bitcoin BIP 173 and BIP 350 (bech32m, witness versions, padding), BIP 341 (32-byte programs),
  Miniscript (condition trees, "every branch needs a key", no mixing of lock types)
- Cardano native scripts (Allegra): `sig`, `all`, `any`, `atLeast`, `after`, `before` checked against the
  transaction validity interval; the hard-fork combinator
- Algorand multi-signature addresses (hash of threshold and keys), validity windows
- Zcash ZIP 215 (Ed25519 validation rules for consensus); ZcashFoundation/ed25519-zebra (implementation
  and the 196 small-order vectors); Chalkias, Garillot, Nikolaenko, "Taming the many EdDSAs" (2020) and
  novifinancial/ed25519-speccheck
- Stellar: excess signatures invalid
- Jellyfish Merkle tree (Diem/Aptos): node keys by version and path
