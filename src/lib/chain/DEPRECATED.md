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
| `difficulty.ts` | First chain, superseded. | Only `tests/chain.test.ts` |
| `target.ts` | First chain, superseded. | Only `tests/chain.test.ts` |
| `vardiff.ts` | First chain, superseded. | Only `tests/chain.test.ts` |

## Do not reuse the superseded files

- `difficulty.ts` computes with floating-point numbers (`Number`, `Math.round`). On a single
  server that had no consequences; between several nodes it would be a consensus fault. The
  current rule is `src/lib/core/difficulty.ts`, which uses `BigInt` only.
- `target.ts` follows the same convention as `src/lib/core/params.ts`
  (`target = 2^240 / difficulty`). Use the functions in `src/lib/core/`.
- `vardiff.ts` adjusted the share difficulty per session on the first chain. The full node has
  its own share-target logic in `src/lib/node/fullnode/MiningServer.ts`.
