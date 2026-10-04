# Security and limits of the first chain

> **Historical record.** This describes the first chain, which was replaced by the current chain.
> It does not describe the current system. For the security model of the current system see
> [../SECURITY.md](../SECURITY.md).

This document states what the system does and what it does not do. It is kept as it was written
for the first chain: a single server validated all work, accounts were Telegram accounts, and
rewards were paid per round. None of the points here was an open bug. They were properties of the
platform that the architecture had to deal with.

## What is cryptographically hard

**Share validation.** The server rebuilds the header from its own data and computes the hash
itself. Either the hash meets the target or it does not. There is no way to slip the server a
share for which no work was done.

**Telegram identity.** The initData is signed with a key derived from the bot token. A forged
user ID is caught by the HMAC comparison (`tests/chain.test.ts`).

On the data-check-string: for the HMAC method only `hash` is excluded; `signature` belongs in the
string. Excluding `signature` applies only to the Ed25519 method that third parties use for
verification. Confusing the two was the cause of the first `bad_signature` in production. The
check now accepts both variants. This does not weaken it, because the bot token is still needed
for both strings.

**Chain linking.** A database trigger enforces gapless heights and a matching `prev_hash`. Blocks
are immutable, even for the service role: `UPDATE` and `DELETE` on `blocks` raise an exception.

**Replay protection.** `unique (job_id, extranonce, nonce)` plus a job lifetime of 90 seconds.

## What is not possible

### A modified client cannot be detected

Someone who reimplements the API contract and hashes the header natively on a graphics card does
**real, correctly verifiable work**, only two to three orders of magnitude faster than a phone.
The server cannot tell this miner from a genuine one, because it *is* not distinguishable.

Any heuristic that tries to detect an "unrealistic hashrate" sooner or later only hits the user
with the new device.

**Countermeasure: limits instead of detection.** The account cap limits every participant to
`max(5 %, min(1, 3/N))` of the round reward. A graphics card is therefore useless after a few
percent. Whoever wants more needs many accounts, and that is Sybil, not client manipulation.

### The smartphone gate cannot be enforced

`Telegram.WebApp.platform` comes from the client unsigned. It is **not** part of the signed
initData and cannot be checked on the server.

What the gate achieves anyway: it keeps the *honest* desktop users out, and they are the larger
part of the real inequality. Whoever talks to the API directly does not open the Mini App in the
first place.

The gate therefore sits at the start of a session, not in the authentication route: blocks, the
leaderboard and the balance remain visible on the desktop.

### Sybil is the larger risk

Telegram accounts are cheap. Rewards depend directly on computing time, and one device can serve
any number of accounts. This cannot be solved technically, only economically: the reward per
account must be capped so that second accounts do not pay off.

Planned at the time of writing and not implemented then: a minimum age of the app account,
weighting by `is_premium`, IP clusters as a signal (not as proof), releasing rewards only after
N completed rounds.

Note: Telegram does **not provide the registration date of an account**. `users.first_seen_at` is
the first call to this app, nothing more.

### Screen lock

When the display locks, the platform halts the worker and mining ends in the middle of a job. To
prevent this, the app requests a wake lock for as long as it mines.

Two peculiarities matter here. The lock is released automatically as soon as the page becomes
invisible and must be requested again afterwards; otherwise it is silently gone. And it needs a
secure context; it is not available over http.

What it can NOT do: prevent the user from locking the device manually, or keep mining running in
the background. On devices without the interface the app says so explicitly instead of hiding it.

### No background mining

When the Mini App goes into the background or the display locks, the platform halts the worker or
throttles it hard, especially aggressively on iOS. This is not a matter of configuration.

`useMiner` therefore stops cleanly on `visibilitychange` and `pagehide` and lets the session
expire on the server.

### No SharedArrayBuffer

Multi-threaded WASM over SharedArrayBuffer needs COOP/COEP headers. These break the loading of all
cross-origin resources that carry no CORP header, among them the Telegram avatars. Instead:
several independent workers with separate nonce ranges. Same effect, no side effects from headers.

### No battery or temperature control

The Battery Status API exists on Android Chromium, not on iOS. A temperature API does not exist
in the browser at all. The power control is therefore a **duty cycle**: the worker computes and
sleeps in proportion. A lower percentage means fewer hashes computed, not a smaller number on the
display.

### One validator

The proof of work is real and verifiable, and the chain is really linked. But there is exactly
one validator: this server. That is acceptable for a community event; it must not be marketed as
a trustless blockchain.

## Known scaling limits

`shares` is not partitioned, because `unique (job_id, extranonce, nonce)` would otherwise have to
contain the partition key and would let duplicates through across day boundaries. From about
100 shares per second this becomes a partitioned table plus a separate deduplication layer.

`rounds.total_weight` is deliberately **not** updated on share insert. A row that every miner
locks on every share would be the bottleneck. The round total comes from `round_contributions`.

Up to about 500 simultaneous miners (around 17 shares per second) Vercel plus Supabase carry the
load directly. Above that, a dedicated coordinator with a persistent WebSocket connection and
batch inserts is needed. The share transport therefore sits behind an interface, so that the
switch does not require rebuilding the validation.

## Do not confuse share target and block target

The client mines against its **share** target, which comes from the VarDiff difficulty of its
session. The block target is in the header (field `difficulty`, because it has to be bit-exact
there), but the worker does not compare against it.

Whether a share happens to meet the block target as well is decided by the server alone when it
recomputes the hash. The client learns of it only from the response.

During the first test run in production the job route wrongly delivered the block target. The
miner computed correctly but searched for a whole block: 1.6 billion hashes instead of
8.4 million, with a job lifetime of 90 seconds. From the outside it looked as if mining did not
start.

Two lessons from this are now in the code: `tests/chain.test.ts` checks the distance between the
two targets, and rejected shares are shown in the user interface instead of being discarded
silently.

## Merkle root

`blocks.merkle_root` commits to the contributions and the payout of the **previous** round. The
current round cannot be in its own header; that would be circular.

At the time of writing this was a **flat hash** over the sorted list `user_id:amount`, not a real
Merkle tree. That was enough to anchor the payout history in the chain; it was not enough for
inclusion proofs of individual users. A real tree was left for the time it would be needed.
