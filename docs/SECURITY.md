# Security model

This document describes what the YSKAR system enforces by cryptography and consensus, what you
have to trust, how keys are stored, which network interfaces a node opens, and where the known
limits are. It is written for users, miners, node and pool operators, and developers. Nothing in
it is a guarantee.

## What cryptography and consensus enforce

### Every full node validates every block

A full node is a program that stores the whole chain and checks every rule itself. It accepts
a block only after it has checked it completely, whether the block comes from a peer (another
node), from the HTTP catch-up or from a miner connected to the node
(`ChainManager.accept` in `src/lib/node/fullnode/ChainManager.ts`, `validateBlock` in
`src/lib/core/validate.ts`). The checks run in this order:

| Check | What is verified |
|---|---|
| Structure | Version, at most 2,000 transactions, the transaction count in the header, exactly one coinbase (the transaction that creates the block reward) and in first position, the coinbase height, the Merkle root over the transaction IDs |
| Proof of work | `SHA-256(SHA-256(header))`, read as a number, is not larger than the target that follows from the difficulty in the header |
| Position | Height is the parent's height plus one; `prevHash` is the hash of the parent |
| Timestamp | Greater than the median of the last 11 block timestamps and at most 120 seconds ahead of the node's clock |
| Difficulty | The difficulty in the header lies in the range every node computes from the previous blocks |
| Transactions | Every transfer (a payment from one address to another) is applied to a copy of the account state: signature, sender, nonce, balance, fee rules, expiry. The coinbase must pay out exactly the block reward plus the fees. |
| State root | The Merkle root over all accounts after the block equals the `stateRoot` in the header |

The rules themselves are specified in [PROTOCOL.md](PROTOCOL.md).

### Proof of work and chain selection

The active chain is the valid chain with the most accumulated work, not the longest one. A block
that does not meet the target of the difficulty stated in its own header is rejected in the
structural check, before the node looks up its parent, verifies a signature or computes any
state. Whether the stated difficulty is the one the rules require is checked in a later step
(row "Difficulty" above). During synchronization every header a peer
sends must satisfy its own stated proof of work, and every block still goes through the full
validation.

### Signatures

A transfer carries the sender's Ed25519 public key and a signature. A node checks that the
sender address is derived from that public key and that the signature is valid
(`checkTransfer` in `src/lib/core/tx.ts`). Without the private key nobody can move coins from an
address.

- The signed data contains the chain ID of the network. A signature made for the test network
  is not valid on the main network.
- The nonce of a transfer must equal the account's nonce exactly, and the account's nonce then
  rises by one. A transfer can therefore be applied only once.
- A transfer may carry `validUntil`; above that height it is invalid.

### State root and supply

Every header commits to the complete account state after the block. A node that applies the
same blocks arrives at the same root or rejects the block. The total supply is limited to
21,000,000 YSR; the block reward follows a fixed schedule, and a coinbase that pays more than
reward plus fees makes the block invalid.

### What follows from this

**A pool cannot** pay out more than the block reward plus fees, cannot spend coins of its
miners, and never holds their coins: the payout to each miner is an output of the coinbase of
the block itself, and it is on the chain as soon as the block is.

**A peer cannot** make your node accept an invalid block or an invalid transfer, and cannot
change your node's view of an account without presenting a valid chain with more work.

**The mirror cannot** change the chain. The mirror is the Supabase database behind
`https://yskar.vercel.app` that the app and the explorer read from. It has no part in
consensus. Its only write path, `POST /api/v2/block`, takes the raw bytes of a block and
re-validates them with the same `validateBlock` function before it stores anything
(`src/app/api/v2/block/route.ts`). If the variable `YSKAR_SPIEGEL_TOKEN` is set on the server,
the route accepts blocks only with that token. The token only keeps foreign chains out of the
mirror; it is not what makes the blocks valid. If the variable is not set, the route accepts a
valid block from anyone.

**Nobody without your key** can sign for your address, including the operators of the web app,
of a pool and of the nodes.

## What you have to trust

### The software you run

The source code is public, and the rules above hold only for software that implements them. You
trust the program that holds your keys and the program that validates for you.

- **Web app and Telegram Mini App.** The UI is delivered by the deployment at
  `https://yskar.vercel.app` every time it loads. Whoever controls that deployment controls the
  code that handles your PIN and your 12 words.
- **Android app.** The APK is a shell that loads the same web UI from the same address
  (`capacitor.config.ts`), so the point above applies as well. The APK itself is signed with the
  project's key. Android installs an update only if its signature matches the installed app.
  Every release also contains a `.sha256` file with the checksum of the APK.
- **Node Core.** The program ships its UI inside the installer and serves it locally. The
  Windows installer is not signed, so Windows shows "Windows protected your PC" when you run
  it. To check that your download is the file that was published, compare its checksum with the
  `.sha256` file of the release:

  ```powershell
  Get-FileHash .\YSKAR-Node-Core-Setup-0.5.1.exe -Algorithm SHA256
  ```

  A matching checksum tells you that the file was not altered between the release page and your
  disk. It is not a signature and says nothing beyond that.
- **Command-line node, CLI miner, observer.** You build them from the source yourself.

Download only from `https://www.yskar.app` and from the project on GitHub
(`https://github.com/dabitlex/YSKAR`).

### A pool's share counting

A pool is a node that lets several miners work on the same blocks and divides the reward among
them. A share is a hash that meets the easier target the node sets for one miner; it proves work
without being a block. When you mine in a pool, the pool node counts your shares and decides how
each block's coinbase is divided.

Consensus checks the coinbase only for its form and its sum: 1 to 64 outputs, addresses in
strictly ascending order, every amount greater than zero, the sum equal to reward plus fees. It
does not check that the division matches the work done. The node software divides by PPLNS (pay
per last N shares: the most recent shares in a window count) and limits the operator's fee to
5 % (`src/lib/pool/`), but an operator runs their own node and could run modified software.

What you can check yourself: every payout is public in the coinbase of each block the pool
finds, and the pool's reported fee and seat numbers are visible before you join. What you cannot
check from outside is whether your shares were all counted. See [POOL.md](POOL.md).

### The mirror and the explorer backend, for display only

The app reads balances, history, blocks and the pool list from the server at
`https://yskar.vercel.app`, which answers from the mirror and, for live figures, from a full
node. The app does not re-validate these answers. A wrong or outdated answer can show you a
wrong balance or history. It cannot move coins: a transfer is built and signed on your device
from the recipient, amount and fee that the review step shows you. A wrong account nonce from
the server can make your transfer fail. It cannot change the recipient or the amount.

The explorer goes one step further. For every block it displays, it rebuilds the 136-byte
header from the individual fields in your browser, computes the double SHA-256 itself, compares
the result with the reported hash, checks the proof of work against the recorded difficulty and
follows the link to the previous block (`public/explorer.html`). It does not re-check
transactions, signatures or the state root. If you want all of it checked, run a full node or
the observer (`observer/`), which fetches the chain over HTTP and runs the full block validation
on every block.

## Keys and wallets

### The 12 words

A wallet is 12 words (BIP39, English word list). The private key is derived from them with
SLIP-0010 for Ed25519 on the path `m/44'/9077'/account'/0'/index'`, and the address from the
public key (`src/lib/core/wallet.ts`). The same words give the same address in the web app, in
the Android app and in Node Core. The balance is on the chain, not in any program.

**Whoever has the words has the coins. If you lose the words, the coins are lost.** There is no
account, no server-side copy and nobody who can reset or recover them. Write the words on
paper. Never type them into a website other than the app itself, and never send them to anyone.

### Web app and Telegram Mini App

- The 12 words are stored encrypted in the `localStorage` of the browser or WebView that shows
  the app, under the key `yskar.vault.v1` (`src/lib/wallet/vault.ts`). They are not sent to a
  server. The storage belongs to that browser or WebView: another device, or Telegram on
  another platform, has its own storage and needs the 12 words.
- Encryption: the key is derived from your six-digit PIN with PBKDF2-HMAC-SHA-256, 400,000
  iterations and a random 16-byte salt. The words are encrypted with AES-256-GCM and a random
  12-byte IV. The address is stored next to the ciphertext in plain text; it is public anyway.
- The private key exists only in memory while the wallet is unlocked. After a reload the PIN is
  needed again. The app locks itself when it was hidden for longer than the configured time
  (default one minute; the setting can also be "Never", which turns the automatic lock off).
  Sending and showing the words decrypt the vault again and therefore ask for the PIN every
  time.
- **What the PIN protects against:** someone who picks up your unlocked device. A tool that
  copies the browser storage gets the encrypted vault, not the words in plain text. **What it
  does not protect against:** an attacker who obtains a copy of the vault and is determined.
  A six-digit PIN has one million possible values, and they can all be tried offline; the
  400,000 iterations slow each attempt down but do not prevent this. The app does not limit
  PIN attempts. Do not keep larger amounts on a phone.

### Android app

- The vault is the same and lies in the app's WebView storage. The manifest sets
  `android:allowBackup="false"`, and `data_extraction_rules.xml` excludes all app data from
  cloud backup and device transfer, so the vault does not travel to another device through the
  Google account.
- The app accepts no cleartext traffic (`android:usesCleartextTraffic="false"`).
- **Biometrics** is a convenience on top of the PIN, not a second lock. When you turn it on,
  your PIN is stored through the plugin `@aparajita/capacitor-secure-storage`, encrypted with a
  key from the Android Keystore. To unlock or send, the app asks for the system's biometric
  confirmation and then reads the PIN (`src/lib/native/biometrie.ts`). The device PIN or
  pattern is not accepted in place of the sensor.
  - It protects against someone who holds your unlocked phone.
  - It does not protect against a device with root access; there the stored PIN could be read
    without touching the sensor. Biometric confirmation and reading the PIN are two separate
    steps in the app.
  - It does not make the vault stronger. The vault stays encrypted with the PIN alone.

  Details are in [APP.md](APP.md).
- **Push notifications** are opt-in. Turning them on registers your address together with a
  device token on the server, which links the address to a device.

### Node Core wallet

- `wallet.json` in `%LOCALAPPDATA%\YSKAR\Node Core` holds the 12 words, encrypted the same way
  (PBKDF2-HMAC-SHA-256 with 400,000 iterations, AES-256-GCM), with a password of at least
  8 characters instead of a PIN (`node-core/src/Wallet.ts`). The address is readable without the
  password, because mining and the pool fee need it.
- "Unlocked" only means that the interface may show balance, history and contacts. Sending,
  showing the words, changing the password and removing the wallet ask for the password every
  time. The private key is derived for the one signature and overwritten afterwards.
- Five wrong passwords in a row pause further attempts for 30 seconds. Attempts are processed
  one after the other. This slows down someone guessing at the running program; it does not
  stop someone who has copied the file.
- The wallet locks after 5, 10 or 30 minutes without activity (10 by default; the automatic
  lock can be turned off), and when Windows is locked or goes to sleep.
- If the address in the file does not match the words, unlocking refuses, so that an edited
  file cannot redirect mining income to another address unnoticed.
- A forgotten password can be replaced only with the 12 words of the same wallet. Without words
  and password there is no way back.

## The network surface of a node

### P2P, port 8646

A node listens for other nodes on TCP port 8646 on all network interfaces. `--p2p-port 0` makes
the command-line node outbound-only and `--no-p2p` turns P2P off. Details are in
[P2P.md](P2P.md).

- **Not encrypted and not authenticated.** The protocol is plain TCP. Anyone on the path can
  read the traffic. This does not affect validity, because blocks and transfers are public and
  checked by every node.
- **What a peer learns:** your IP address; from the handshake your node's software identifier,
  block height, accumulated work and listening port; which blocks and transfers your node
  announces; and, between nodes that support it, the miner statistics your node reports: the
  addresses with an active mining session on your node, the combined measured hashrate of these
  sessions and the number of sessions. These statistics are for display and have no effect on
  consensus.
- **Limits:** messages of at most 2 MiB; unknown commands are rejected before the payload is
  read; at most 8 outbound and 32 inbound connections; a handshake must complete within
  10 seconds; a connection without any data for 150 seconds is closed; a foreign network or
  chain ID ends the connection.
- **Misbehavior** ends the connection. There are no bans. A host that violated the framing or
  the handshake is remembered for 60 minutes in memory and is the first to be displaced when
  the inbound slots are full.

### Mining and read interface, port 8645

The command-line node serves its HTTP interface (mining sessions, jobs, shares, transfer
submission, read API) on `127.0.0.1:8645` by default (`src/lib/node/fullnode/MiningServer.ts`).
Only programs on the same machine can reach it. `--bind` changes the address; the node then
prints a warning, because the interface accepts work and builds blocks.

- The interface has no login. Everything it accepts is validated: a share is recomputed, a
  transfer is checked completely before it enters the mempool (the node's list of transfers
  waiting for a block).
- Limits: a request body of at most 64 KB; at most 5,000 open sessions; a session ends after
  300 seconds without a request; a duplicate nonce is rejected; only the job fetched last in a
  session is accepted.
- The node speaks plain HTTP and sends no CORS headers. A node that is offered to others, for
  example as a pool, needs an HTTPS reverse proxy in front of it; see
  [OPERATIONS.md](OPERATIONS.md) and [POOL.md](POOL.md).

### Node Core's local interface, port 8650

Node Core runs the same node and adds a local interface for its window on `127.0.0.1:8650`
(`node-core/README.md`, `node-core/src/main.ts`). Listening on localhost alone is not enough,
because any web page open in a browser on the same PC can send requests to `127.0.0.1`. Every
request therefore has to pass three checks:

1. `Host` must be `127.0.0.1:8650` or `localhost:8650`. This stops DNS rebinding.
2. If the browser sends `Origin` or `Sec-Fetch-Site`, it must be the interface's own origin.
3. Everything under `/api/` needs the access token. It is created at every start and compared
   in constant time. It is not contained in the page: the program window receives it as an
   HttpOnly, SameSite=Strict cookie that the program sets in the window's own session before the
   page loads; tools send it in the header `x-yskar-token`. Up to version 0.5.1 the token was
   written into the page, so every program on the PC that could reach `127.0.0.1:8650` (also
   one of another user account) could read it there.

A request body must be declared as `application/json`. The pages are served with a strict
Content-Security-Policy that allows scripts and styles only from the interface itself.

- **Port 8645 in Node Core.** Without a running pool it answers only this PC, and not requests
  that come from a web page. With a running pool it answers this PC and private address ranges
  (the home network), never a connection from a public address, even when "share in the home
  network" makes it listen on all network interfaces.
- **The window** is a sandboxed page without access to the system (`contextIsolation`, no Node
  integration, sandbox). Links open in your browser and only if they point to the project on
  GitHub, `yskar.app`, `www.yskar.app` or `yskar.vercel.app` (`linkErlaubt` in
  `node-core/src/Programm.ts`).
- **Answers from a pool** are treated as foreign input: every field is checked, at most 64 KB
  are read and no redirect is followed.
- **Updates** are only announced. Node Core downloads and installs nothing by itself.

This protects against web pages and other machines. It does not protect against malware running
on the PC itself.

## Mining clients

- **A modified client can only do real work.** A miner sends nothing but a nonce. The node
  rebuilds the header from its own data, computes the hash itself and accepts the share only if
  that hash meets the session's share target. A share for which no work was done cannot be
  submitted. The node cannot tell which
  program or device produced a nonce, and it does not try to: the `platform` field of a session
  is for display only.
- **Phones and graphics cards.** A graphics card computes far more hashes than a phone, and
  both do valid work. No rule favors a kind of device. Rewards follow the work.
- **Share target and block target.** A miner works against the share target of its session,
  which the node adjusts so that a share arrives about every 30 seconds. The block difficulty
  is in the header, but the miner does not compare against it. Whether a share also meets the
  block target is decided by the node when it recomputes the hash.
- **No SharedArrayBuffer in the web app.** Multi-threaded WASM over SharedArrayBuffer needs the
  COOP and COEP headers, and those break the loading of cross-origin resources that carry no
  CORP header, among them Telegram avatars. The web app uses several independent Web Workers
  with separate sections of the nonce space instead (`next.config.ts`,
  `src/workers/miner.worker.ts`).
- **Screen lock in the web app.** While mining, the web app requests a screen wake lock
  (`src/hooks/useWakeLock.ts`). The browser releases it automatically when the page becomes
  invisible, so the app requests it again when the page is visible again. It needs a secure
  context (HTTPS). It cannot prevent you from locking the device, and it cannot keep mining
  running in the background: in Telegram and in a browser, mining stops when the page is
  hidden. Background mining exists only in the Android app, where a foreground service does
  the work (see [APP.md](APP.md)).

## Known limits

- **A small network.** The genesis block of the main network carries the timestamp
  2026-09-09T00:00:00Z. The network has two seed nodes, which a new node contacts first and which
  are both run by the same operator, and the app's pool list has one entry
  (`src/lib/pool/verzeichnis.ts`). Proof of work protects a chain only as far as no single
  party controls most of the hash power. Hash power that mines through one pool is, for the
  purpose of building blocks, directed by that pool's operator, who chooses the transactions
  and the parent of every block the pool works on. Whoever controls a majority of the hash
  power can build the chain with the most work, and with it replace blocks that were already
  accepted.
- **No checkpoints and no limit on reorganization depth.** A node switches to any valid chain
  with more work, however far back it forks (`ChainManager.ts`). Nothing is pinned by height.
  Treat a transfer as more final the more blocks are built on top of it.
- **Peer connections.** There is no limit per source address. Whoever completes the handshake
  32 times holds all inbound slots of a node; established connections are displaced only if
  the host was flagged. A node whose connections are all controlled by one party sees only the
  chain that party shows it. It still cannot be given an invalid chain.
- **Address gossip.** A node keeps at most 1,000 peer addresses and accepts addresses on a
  peer's word. The checks are a plausible host name, a timestamp not more than 10 minutes in
  the future and not older than 7 days. The address book does not record who reported an
  address. A peer that sends many fresh addresses can displace older entries.
- **No rate limiting on the HTTP interface.** Apart from the size and count limits listed
  above and the per-sender session limits of `--sender-ip`, port 8645 does not limit requests
  per client. On a publicly offered node, limiting has to be done by the reverse proxy.
- **Pool seats can be occupied cheaply.** A pool has at most 64 seats (63 with a fee), counted
  by address. Opening a pool session needs only a valid address, with no proof that the caller
  owns it. A new session counts as a seat for 2 minutes without any accepted share, and keeps
  the seat as long as a share is accepted at least every 10 minutes. Someone who opens sessions
  for many addresses can fill a pool, and new addresses are then refused with `pool_full`. With
  the option `--sender-ip`, sessions without a share hold at most two seats per sender, and a
  sender keeps at most 32 sessions without a share; this needs a reverse proxy that sets
  `X-Forwarded-For` itself (Caddy does), or no proxy at all (`--sender-ip socket`).
- **Mempool.** The mempool holds at most 5,000 transfers and at most 32 per sender. When it is
  full, new transfers are refused; there is no eviction by fee.
- **The mirror cannot reorganize.** It is strictly linear: it accepts only the block that
  extends its own tip and answers `stale`, `height_gap` or `wrong_parent` otherwise. After a
  reorganization of the chain, what the app and the explorer display can differ from the chain
  of the full nodes.
- **PIN strength.** See "Web app and Telegram Mini App" above.

## Reporting a vulnerability

Report security problems as an issue at <https://github.com/dabitlex/YSKAR/issues>. Issues are
public. Describe what you observed and how to reproduce it. Never post secrets: no 12 words, no
PIN or password, no wallet file, no tokens or keys.

Nobody from the project will ask you for your 12 words.

## Related documents

- [PROTOCOL.md](PROTOCOL.md): the consensus rules.
- [P2P.md](P2P.md): the node-to-node protocol and its limits.
- [POOL.md](POOL.md): how pools count and pay.
- [APP.md](APP.md): the Android app, including biometrics and push.
- [history/FIRST_CHAIN_SECURITY.md](history/FIRST_CHAIN_SECURITY.md): the security notes of the
  first chain, which the current chain replaced. Comments in older code and in early
  database migrations that refer to Telegram accounts, rounds and the account cap belong to
  that document.
