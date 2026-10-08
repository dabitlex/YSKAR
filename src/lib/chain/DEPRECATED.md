# Code of the first chain

This directory holds code that was written for the first YSKAR chain, plus one file that the
current system still uses. This note is for developers who wonder which of these files matter
and where new code belongs.

The first chain was run by a single server that kept the ledger in the database (schema
`public`). It was replaced by the current chain, whose consensus code is in `src/lib/core/`:
transactions are inside the block, all consensus arithmetic uses integers, and the account state
can be rebuilt from the blocks. The protocol of the current chain is described in
[PROTOCOL.md](../../../docs/PROTOCOL.md). A record of the first chain's security model is kept in
[FIRST_CHAIN_SECURITY.md](../../../docs/history/FIRST_CHAIN_SECURITY.md).

**New code belongs in `src/lib/core/`, not here.**

## What is in this directory

| File | Status | Used by |
|---|---|---|
| `finderName.ts` | Live code of the current chain. It converts the name of a block finder or pool to and from the `extra` field of the coinbase (`finderName`, `nameToExtra`, `MAX_FINDER_BYTES`). | The full node (`src/lib/node/fullnode/cli.ts`, `ReadApi.ts`), Node Core (`node-core/src/main.ts`, `PoolBetrieb.ts`, `WalletKette.ts`), the server route `src/app/api/v2/blocks/route.ts`, and tests |
| `blockView.ts` | First chain. Prepares a block row of the first chain for display. | The routes `src/app/api/v1/chain/blocks` and `src/app/api/v1/chain/blocks/[height]` |
| `params.ts` | First chain. Reads the parameters of the first chain from the database table `chain_params`. | The route `src/app/api/v1/chain/summary` |

## Removed files

`difficulty.ts`, `target.ts` and `vardiff.ts` of the first chain were removed on 9 October 2026
(issue #5). Only `tests/chain.test.ts` still used them, and they had drifted from the live code:
`difficulty.ts` computed with floating-point numbers, `vardiff.ts` had other limits than the
share-target logic of the full node. The current rules are `src/lib/core/difficulty.ts` and
`src/lib/core/params.ts` for the chain and `src/lib/node/fullnode/MiningServer.ts` for share
targets.
