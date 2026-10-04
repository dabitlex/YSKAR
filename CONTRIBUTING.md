# Contributing

How changes to this repository are checked, committed and released. It is written for anyone who
changes code or documentation here.

## Before every push

Run the checks from the repository root. All of them must pass.

```bash
npm install
npx tsc --noEmit                               # type check of the app, the node and the pool
npx tsc -p node-core/tsconfig.json --noEmit    # type check of Node Core
npm test                                       # consensus, node, P2P, pool, wallet
git status --short                             # nothing generated may show up here
```

Node Core has its own tests. They use the packages installed in the repository root.

```bash
cd node-core
npm run build:gpu-emu    # once: builds the stand-in for the GPU program (needs g++)
npm test
```

On Windows, type `npm.cmd` and `npx.cmd` in PowerShell.

The tools in `node/` and `observer/` have their own `package.json` and need their own
installation; one in the repository root is not enough for their builds:

```bash
(cd node && npm install && npm run build)
(cd observer && npm install && npm run build)
```

The miner in `miner/` has no dependencies. `node src/selbsttest.mjs` in that folder checks it.

## What does not belong in the repository

The `.gitignore` files cover these. Check `git status` anyway.

```text
node_modules/                      anywhere
.next/  out/                       build output of the web app
node/dist/  miner/dist/  observer/dist/  /dist/  /release/
*.db  *.db-wal  *.db-shm           chain data of a node
node/knoten/  observer/daten/      data folders
.env  .env.local
wasm/sha256d_miner.wasm            build output; the binding file is public/miner.<hash>.wasm
scripts/genesis.state.json
android/app/google-services.json
*.jks  *.keystore                  signing keys
```

Secrets never go into the repository: no seed words, no private keys, no keystore, no tokens,
no service-account files. The release workflows read what they need from GitHub secrets; see
[docs/APP.md](docs/APP.md).

## Changes to the consensus rules

The code in `src/lib/core/` decides what a valid block is. A change there can split the chain.

- A rule change is tied to a block height and gets a constant in `src/lib/core/params.ts`.
  Below that height the code must behave exactly as before.
- The height must leave enough time for every node operator to update.
- Every revision gets a design record in `docs/` (see `docs/CONSENSUS_V2.md` to `V4.md`) and
  tests that cover the blocks on both sides of the activation height.
- The server that keeps the mirror validates with the same code. It must be deployed before
  the height as well; see [docs/OPERATIONS.md](docs/OPERATIONS.md).

[docs/PROTOCOL.md](docs/PROTOCOL.md) is the specification. Keep it in step with the code.

## Database migrations

The files in `supabase/migrations/` are applied to the database by hand. They are a record of
what was changed and are not edited afterwards. See "The database" in
[docs/OPERATIONS.md](docs/OPERATIONS.md).

## Texts and languages

- The app's texts are in `src/i18n/`, one file per language, all with the same keys.
- The website's texts are in `website/assets/i18n/`; after a change to them, the `?v=` number in the
  HTML files has to be raised. See [website/README.md](website/README.md).
- Documentation is written in English.

## Releases

- **Android app:** built and signed by `.github/workflows/android-release.yml`. See
  [docs/APP.md](docs/APP.md).
- **Node Core:** built by `.github/workflows/node-core-release.yml`. After publishing a new
  version, update the version and the download link in `website/index.html`,
  `website/anleitungen.html` and the "Download" table of `README.md`. See [node-core/README.md](node-core/README.md).
- **Web app and website:** deployed by Vercel from the `main` branch. The checks to run after a
  deployment are listed under "After a deployment" in [docs/OPERATIONS.md](docs/OPERATIONS.md).
