# The node-to-node protocol (P2P)

This document describes how YSKAR full nodes talk to each other: the message framing, every
message and its limits, the handshake, how a node manages its connections and finds other nodes,
how it synchronizes the chain, and how nodes exchange miner statistics. It is written for people
who run a node or want to implement the protocol.

How to start a node is described in [FULLNODE.md](FULLNODE.md).

## Overview

Nodes connect over plain TCP, by default on port 8646. **The connection is not encrypted and not
authenticated.** Anyone on the network path can read the traffic. This does not let them forge
the chain: a peer only delivers data, and every block and every transfer is validated by the
receiving node itself.

The design follows Bitcoin's peer-to-peer protocol, because that design has been in use since
2009 and anyone who knows Bitcoin can read it at once. Where YSKAR deviates, this document says
so.

| File | Responsibility |
|---|---|
| `src/lib/node/p2p/wire.ts` | Framing: message header, list of allowed commands, payload limit, reassembly of messages from the TCP stream |
| `src/lib/node/p2p/messages.ts` | Encoding and decoding of the message payloads, with their limits |
| `src/lib/node/p2p/PeerConnection.ts` | One connection: handshake, keep-alive, timeouts |
| `src/lib/node/p2p/PeerManager.ts` | Connection slots, outbound connections, address book, `getaddr` and `addr` |
| `src/lib/node/p2p/SyncManager.ts` | Chain synchronization, relay of blocks and transfers |
| `src/lib/node/fullnode/NetzStatistik.ts` | Collecting the miner statistics that peers report |
| `src/lib/node/fullnode/cli.ts` | Wiring in the command-line node: `--seed`, `--p2p-port`, `--no-p2p`, sending `stats` |

`wire.ts` and `messages.ts` are pure functions without network access. They can be tested
without anything running.

## Framing

```text
magic(4) | command(12) | length(4) | checksum(4) | payload
```

This is the layout of Bitcoin's message header. The header is 24 bytes. All integers in the
protocol are little-endian.

**Magic** names the network. In YSKAR it is the first four bytes of the chain ID, so there is
nothing extra to maintain, and a main-network node and a regtest node cannot even start a
conversation. The magic is `952ee402` on the main network and `bbb27f1b` on regtest.

**Command** is twelve bytes of ASCII, padded with zero bytes. It is readable in a packet capture
and has a fixed length. The node keeps an allow-list of commands. A command that is not on the
list is rejected before the payload is read, so an unknown command cannot tie up memory.

**Length** is the payload length as an unsigned 32-bit integer.

**Checksum** is the first four bytes of the double SHA-256 of the payload.

A plain word about the checksum: TCP already has one, and this one does not stop a deliberate
attack, because whoever changes the payload recomputes it. Its real use is different. It detects
that the reader has lost its place in the stream and is reading bytes at the wrong position.

**Largest payload: 2 MiB (2,097,152 bytes).** Bitcoin Core allows 4 MB per message; the largest
possible YSKAR block is about 410,000 bytes. The number matters less than the point at which the
limit applies: as soon as the 24-byte header has been read. An announced length above the limit
is rejected at that point; the node does not wait for the payload or collect it. That is exactly
where an attacker would otherwise tie up memory, by announcing a huge length and never sending
the data.

**TCP has no message boundaries.** What was sent as one message may arrive in three pieces, and
three messages may arrive in one piece. The `FrameReader` in `wire.ts` collects bytes and hands
out every message that is complete.

Any framing error (wrong magic, unreadable or unknown command, length above the limit, wrong
checksum) closes the connection. Reading on after such an error would be guessing.

## Messages

| Command | Payload | Purpose |
|---|---|---|
| `version` | `u32 protocol`, network name (length byte + text), `chainId(32)`, agent (length byte + text), `u32 height`, chain work (length byte + decimal text), `u64 nonce`, `u32 port`, `u64 timestamp` | Handshake: who am I, which chain, how much work |
| `verack` | empty | Handshake: acknowledged |
| `ping` | `u64 nonce` | Keep-alive |
| `pong` | `u64 nonce` | Answer to `ping` with the same nonce |
| `getheaders` | `u8 count`, `count × hash(32)`, `stop hash(32)` | Asks for the headers after the first known hash of the locator |
| `headers` | `u16 count`, `count × header(136)` | Raw block headers |
| `inv` | `u16 count`, `count × (u8 type, hash(32))` | Announcement: "I have this". Type 1 is a block, type 2 a transfer |
| `getdata` | same as `inv` | Request for the data behind the hashes |
| `block` | raw block | A complete block |
| `tx` | raw transfer | A transfer |
| `notfound` | same as `inv` | The requested items are not known |
| `getaddr` | empty | Asks for known node addresses |
| `addr` | `u16 count`, `count × (host as length byte + text, u32 port, u64 last seen)` | Known node addresses |
| `stats` | `u64 node ID`, `u64 hashrate`, `u32 sessions`, `u16 count`, `count × address(20)` | Miner statistics; see [Miner statistics](#miner-statistics-stats) |

### The rule above all

**No message carries a statement about validity.** A peer delivers data. Whether the data is
valid is decided by the receiving node.

That is why there is no field `valid`, no `accepted` and no error message about other nodes'
blocks. Such fields would invite a node to believe them. A test reads the source file
`messages.ts` and fails if such a field ever appears in it.

### Headers first

A node first asks for headers and only then for the blocks. 2,000 headers are 272,000 bytes; the
bodies of 2,000 full blocks would be roughly 800 MB. While catching up, the bodies are requested
only for headers that carry proof of work, so a node does not download data on a mere claim.

### The locator

`getheaders` carries a list of the sender's own block hashes: the ten most recent blocks one by
one, then blocks at a distance that doubles with every step, and the genesis block last. The
receiver looks for the first hash it knows on its active chain and answers with the headers that
follow it, at most 2,000. If it knows none of the hashes, it answers from height 0.

Sending only the height would be simpler and wrong. After a fork both sides have the same height
with different blocks. The locator finds the common ancestor in a few steps.

A stop hash of 32 zero bytes means "as far as possible".

While a node catches up over more than one `headers` message, it puts the last header it
received in front of this list. The receiver finds that hash on its active chain and continues
right behind it. If it does not know the hash, for example after a reorganization, it falls back
to the rest of the list, which starts at the sender's own tip.

### Limits on everything

Every list has a maximum number of entries and every text a maximum length.

| What | Limit |
|---|---|
| Entries in `inv`, `getdata`, `notfound` | 500 |
| Headers in `headers` | 2,000 |
| Addresses in `addr` | 500 |
| Hashes in a locator | 32 |
| Agent text in `version` | 64 bytes |
| Network name in `version` | 32 bytes |
| Chain work in `version` | 96 digits |
| Host in `addr` | 255 bytes |
| Port in `addr` | 1 to 65,535 |
| Addresses in `stats` | 500 |

The framing limit alone is not enough: two mebibytes are a great many small entries.

## The connection

`PeerConnection.ts` handles the handshake, the keep-alive, the framing and the limits of one
connection. It knows nothing about blocks and validates no chain. That is the layer above it.

### Handshake

```text
outbound  ->  version
          <-  version
          <-  verack
outbound  ->  verack
              ready
```

The side that opened the connection sends `version` first. Both sides state the protocol
version, the network name, the chain ID, their height, their cumulative chain work, a random
nonce, the port they listen on (0 if they accept no connections) and their current time. The
chain work tells each side who has to catch up.

These checks close the connection at once:

**Network name and chain ID.** The magic bytes cover only four bytes. The complete chain ID rules
out that two networks whose IDs happen to begin alike find each other.

**The node's own nonce.** If it comes back, the node is talking to itself. This happens easily
when the node's own address returns in an `addr` message, and the connection would otherwise
stay open forever and achieve nothing.

**The protocol version.** It must be 1. As long as there is only one version, leniency would be
guessing.

### Order is part of the protection

Before `version` has arrived, a node accepts **only `version`**. Between `version` and the
completed handshake it accepts only `verack`, `ping` and `pong`. Otherwise a peer could send
blocks at once, before it is clear that it belongs to the same network. A second `version` or a
second `verack` also closes the connection.

### Timers

| Timer | Value |
|---|---|
| Handshake must complete within | 10 s |
| `ping` interval | 60 s |
| Connection is closed after no received byte for | 150 s |

The handshake timeout is the most important one. Without it someone could open connections and
never send anything. The slots would be occupied without a single byte arriving, at no cost to
the attacker.

If a `ping` is still unanswered when the next one is due, the other side has stopped answering
and the connection is closed. A `pong` without a preceding `ping`, or with the wrong nonce,
counts as misbehavior. Otherwise a dead connection could be made to look alive.

### How it is tested

The connection tests (`tests/p2p-connection.test.ts`) run over real TCP on the loopback
interface, not with mock objects. A simulated connection would hide exactly the errors that
matter: bytes arriving in pieces, half-finished handshakes, peers that do not answer.

## Peer management

`PeerManager.ts` holds the connections, looks for new ones, accepts inbound ones and decides who
has to go when space runs out.

### Slots are the protection, not bans

| Direction | Slots |
|---|---|
| Outbound | 8 |
| Inbound | 32 |

The two are counted separately, and that is the point. A node with only inbound connections
could be surrounded by an attacker completely: all slots occupied, no contact with the real
network. Outbound connections are chosen by the node itself.

When all inbound slots are taken and a new connection arrives, **one** slot is freed: first from
a flagged peer, otherwise from the inbound peer that has waited longest without completing the
handshake. If there is neither, the new connection is refused. Without eviction an attacker could
occupy all slots and then let nobody else in.

### Flagging instead of banning

A peer that violates the framing, handshake or keep-alive rules, or sends an unreadable `addr`
message, is disconnected and its host is flagged for 60 minutes. A flagged peer is evicted first
when slots run out. **It is not locked out**, and the flag does not survive a restart. A test
(`tests/p2p-manager.test.ts`) pins this down: after misbehaving, the same host may connect again
at once.

A peer that sends an unreadable message, a header without proof of work or an invalid block is
disconnected without a flag.

### Address book

The address book holds up to 1,000 addresses (host, port, time last seen, number of failed
connection attempts in a row). It lives in memory and is empty again after a restart, apart from
the seeds.

Addresses received from other nodes pass three filters:

**From the future.** An entry whose time is more than 10 minutes ahead is dropped. The timestamp
comes from a stranger; far in the future it would be at the top of every ordering and could push
real peers out of the book.

**Older than 7 days.** Dropped as well.

**Implausible hosts.** A host must be 1 to 255 characters from the set `a-z A-Z 0-9 . : _ -`.
This is a coarse filter; the node does not resolve names at this point.

When the book is full, the oldest entry gives way, but only if the new one is more recent.
Without this condition a peer could replace the whole book with a flood of old addresses.

### Peer discovery

This is everything the code does to find other nodes:

- **Seeds.** The addresses given with `--seed` are put into the address book at start. The
  command-line node has no built-in seed. The main network has two fixed seeds,
  `yskar-main.dynv6.net:8646` and `yskar-seed2.dynv6.net:8646`, on two different machines;
  Node Core has both built in.
- **One `getaddr` per connection.** A node asks a peer for addresses once, at the moment the
  connection becomes ready. It does not ask again while the connection stays open.
- **Answers contain only recent addresses.** A `getaddr` is answered with at most 500 addresses
  that were seen in the last three hours and have no failed connection attempt. Passing on old
  addresses would send others into the same dead end. If no address qualifies, there is no
  answer. A node sends `addr` only as an answer to `getaddr`.
- **Peers that connect.** When a handshake completes, the node records the peer's address with
  the listening port from its `version` message, if the peer listens at all.
- **No DNS seeds.** There is no other source of addresses.

"Seen" is the time an address was added to the book, the time of the last successful outbound
connection or completed handshake, or a more recent time reported in an `addr` message. It is
not refreshed while a connection stays open.

**Outbound connections.** At start and then every 15 seconds the node makes at most one
connection attempt, as long as fewer than 8 outbound connections exist or are being opened. One
attempt per interval is deliberate: a burst of simultaneous connections would strain the node
and stand out as a pattern on the other side. Among the addresses it is not connected to, the
node prefers those with the fewest failed attempts and, among those, the most recently seen. An
attempt may take 8 seconds. Before the node tries an address again, it waits
`min(2^failures, 64) × 30` seconds, where `failures` is the number of failed attempts in a row.

### The node's own address

A node regularly gets its own address back in `addr` messages: a peer passes on whom it knows,
and that includes this node.

The own address is **learned, not guessed**, because a node cannot reliably determine its own
external address. If a connection attempt returns one of the node's own nonces, the node records
the target as its own address, removes it from the address book and does not add it again while
it runs.

For this the node keeps a list of the nonces it has sent. Every connection draws its own random
nonce. A single fixed nonce would be a mark by which every peer could recognize the node across
changing addresses.

In the case of a self-connection the receiving side still answers with its `version` before it
closes. Only the side that opened the connection knows the target port, and so the address that
has to leave the book. To a node of a **foreign network** nothing is sent back: any answer would
be information for someone who has no business here.

## Chain sync

`SyncManager.ts` connects the peers with the node's chain: it fetches missing blocks, answers
requests and passes on what is new.

**The rule that carries everything:** a peer delivers data and nothing else. Every block goes
through the same full validation as a block the node built itself, through
`ChainManager.accept()`. There is no shortcut for "trusted" peers, because there are no trusted
peers. No message transfers a state: a node that catches up computes the account state and the
state root itself.

### Sync follows work, not height

When a connection becomes ready, the node compares the peer's cumulative chain work from the
handshake with its own. If the peer has more, the node sends `getheaders`. A longer chain of
easy blocks is not the better chain, so the height is not what is compared.

### Proof of work on the header, at once

This is the most important protection while catching up. Headers are cheap to invent if the work
is left out. A peer could send two thousand of them and make the node request two thousand block
bodies.

For every header it receives, the node computes the hash and checks it against the difficulty
stated in that header. This costs microseconds, and a header without any work behind it is
rejected at once. A header that fails the check closes the connection. The check does not show
that the stated difficulty is the right one: the **full** validation, including that, follows
when the body arrives. Headers that state a low difficulty are therefore cheap to produce, and
the number of headers a node keeps waiting for their bodies is limited (below).

### Catching up over several messages

If a `headers` message contains the full 2,000 headers and brought at least one header the node
did not have yet, the node asks for the headers **behind the last one it received**. A node that
is 5,000 blocks behind gets its headers in three messages.

Until October 2026 the node asked again from its own tip instead. The tip only moves when block
bodies arrive, so the peer sent the same 2,000 headers again after every answer, for as long as
the node was more than 2,000 blocks behind, and comparing each of these messages with the list
of waiting headers kept the node busy for many seconds. A new node loaded about 16 blocks per
message that way.

At most 20,000 headers wait for their bodies at the same time. When that limit is reached, or
when a full message brought nothing new, the node does not ask further but notes that there is
probably more. The same note is made when a block arrives whose parent is missing.

When the last waiting block has been accepted, the node asks again from its own tip: the peer
that just delivered if such a note exists, and a peer that reported more chain work in its
handshake than the node has by then. The work from the handshake is as old as the connection
and is only what the peer claims, so it decides who is asked in addition, not instead.

### Limited window

At most 16 block bodies are requested at the same time. Requesting all of them at once would
ask for hundreds of megabytes on a long chain.

The blocks that wait in this list are requested from **one peer at a time**. A peer answers
requests in the order it received them; spread over two peers, the blocks would arrive out of
order, and a block that arrives before its parent is dropped.

A request without an answer is released after 30 seconds. A peer that lets one request expire
loses all its open requests and is no longer the peer the node orders from. Otherwise a peer
that delivers only now and then would keep the whole catch-up to itself. A peer that answers
`notfound` for a waiting block it was asked for is replaced in the same way.

The node then orders from the peer with the most chain work (as reported in the handshake)
that has not failed in this round. If every peer has failed, nothing is ordered at once; a
check that runs every five seconds starts the round again. The same check orders waiting blocks
that nobody has been asked for. The list of peers that failed is cleared as soon as a waiting
block is accepted.

### Blocks

Blocks have to be applied in order, so the node keeps the missing headers sorted by height.

When a block arrives:

- If it is valid and new, the node stores it, updates its mempool, and announces it with `inv`
  to all other peers, not to the one it came from.
- If its parent is missing, the node asks the same peer for headers again. This is not
  misbehavior; the node only lacks the history.
- If it is invalid, the node closes the connection and keeps nothing.

A node announces a block that one of its own miners found in the same way. A node that receives
an `inv` for a block it does not have and has not already requested asks for it with `getdata`.
There is one exception: a block whose header already waits in the list is not fetched on an
announcement if the node does not have its parent and is not fetching the parent with the same
announcement. It could not be accepted now and will be fetched in its turn.

### Transfers

A transfer that a node accepts into its mempool is announced to its peers with `inv` (type 2),
whether it came in over the HTTP interface or from another node. A node that receives the
announcement requests the transfer unless it already has it, has already requested it, or has
recently rejected it.

A received transfer passes the same mempool checks as one submitted over the HTTP interface
([FULLNODE.md](FULLNODE.md#the-mempool)). Only a transfer that was actually added is announced
further. That is also the protection against loops: a transfer that is already in the mempool
is rejected as a duplicate and not sent around again.

A rejected transfer is not a reason to disconnect; a correctly built transfer can be unusable
here, for example because its nonce has been used in the meantime. The node remembers the last
4,096 rejected transfer IDs so that it does not request the same transfer again and again. A
coinbase sent as a single transaction, or an unreadable transfer, closes the connection.

### How it is tested

The sync tests (`tests/p2p-sync.test.ts`, `tests/p2p-tx.test.ts`) run complete nodes on the
loopback interface, with a real chain and real TCP:

| Scenario | Expected result |
|---|---|
| An empty node fetches the whole chain | It computes the state itself and arrives at the same state root |
| A new block travels on | Announcement, request, validation |
| Across one node to a third one | A, B and C in a row; A and C are never connected |
| The branch with more work prevails | Reorg over the network |
| A header without work | Connection closed |
| An invalid block | Connection closed, nothing adopted |
| The same announcement three times | No request stays open |
| A transfer travels to the next node and across one node to a third | It ends up in each mempool |
| A rejected transfer | It is remembered and not requested again |

### In the node

```bash
node dist/yskar-node.cjs mine --data ./knoten --seed yskar-main.dynv6.net:8646 --seed yskar-seed2.dynv6.net:8646 --no-upstream
```

The node network runs next to the mining interface and independently of it. A node without
miners is a complete participant, and a miner without peers keeps working. If the network
fails, the node still validates its chain.

`--p2p-port` sets the listening port (default 8646). With `--p2p-port 0` the node only opens
outbound connections. `--no-p2p` switches the node network off. The listener binds to all
interfaces (`0.0.0.0`).

## Miner statistics (`stats`)

Every node knows only the mining sessions that are attached to **it**. A miner that works
through its own node does not appear in the session counts of any other node. The `stats`
message lets nodes tell each other about their sessions, for display only. It has no effect on
consensus.

### Two numbers from two sources

| Field in `/api/v2/summary` | Source | Provable? |
|---|---|---|
| `hashrate` (network hashrate) | Difficulty and block times of the last 24 blocks | **Yes.** It contains every miner, on whichever node it works, and nobody has to report anything |
| `minerHashrate`, `activeMiners`, `miningSessions` | The node's own sessions **plus the reports of its direct peers** | No. These figures are reported |
| `knoten` (German for "nodes") | Number of nodes with a valid report, this node included | — |

The network hashrate is the sum of the difficulties of the last 24 blocks times 65,536, divided
by the time those blocks took. It follows from the chain alone.

The reported hashrate of a node is the sum over its sessions. For each session the node
estimates the rate from the time between accepted shares and the share difficulty in force.

`activeMiners` counts **addresses** across all nodes. Someone who mines with the same address on
two nodes is counted once.

### How the report travels

A node sends `stats` to a peer when the connection becomes ready and then every 30 seconds. The
message contains:

- a node ID: a random 64-bit number chosen when the process starts,
- the measured hashrate of the node's own sessions in hashes per second,
- the number of sessions,
- the raw 20-byte addresses of the miners with an open session, at most 500.

The receiving node keeps the most recent report per connection (`NetzStatistik.ts`). A report
expires after 90 seconds. A report that arrives less than one second after the previous one from
the same connection is ignored, and a node keeps at most 256 reports. A report with the node's
own ID is ignored. If two connections lead to the same node ID, that node is counted once, with
its most recent report.

**`stats` is sent only to peers whose agent text contains `+stats`.** A node of an older version
does not know the command; it would treat it as a framing error and close the connection. Such a
node therefore never receives a report. The command-line node identifies itself as
`yskar-node/0.1.0 +stats`. The protocol version stays 1, because older nodes would reject a
higher one.

### Limits

- **Reported, not proven.** A node can report any figures. The provable number is the network
  hashrate from difficulty and block times.
- **Direct peers only.** Reports are not passed on. A node that is connected only through
  another node is missing from the sum.
- **Up to 30 seconds of delay** between nodes.
- Both nodes need a version that knows `stats`. Otherwise they do not see each other in the
  statistics; they still synchronize the chain.
- An unreadable `stats` message closes the connection.

## What was deliberately not taken from Bitcoin

**Bans.** Bitcoin Core moved away from them over the years. It replaced automatic bans with a
discouragement filter, on the reasoning that neither protects against denial of service, because
an attacker simply reconnects from other addresses. In 2025 it also stopped penalizing peers for
transactions that are invalid by consensus (Bitcoin Core pull request #33050). Careless banning
also raises the risk of splitting the network.

YSKAR does the same: disconnect on misbehavior, evict flagged peers first when slots run out,
but never lock anyone out permanently.

**Several address formats.** Bitcoin's original `addr` message has a fixed-size address field
and needed a second format (BIP155) for longer address types. Here the host is simply text,
which covers IPv4, IPv6 and names in one form. At these sizes, saving bytes there would be saving
in the wrong place.

**The 4 MB message limit.** YSKAR uses 2 MiB, which is already several times the largest
possible block.

## Open questions

**Encryption.** The connection is not encrypted. Bitcoin added an encrypted transport later
(BIP324). The chain is public, so there is nothing secret to protect, and an invalid block is
rejected no matter how it arrives. Whether and when to add encryption is not decided.

**Peer discovery.** Today it rests on the fixed seeds and on `addr`. There are no DNS seeds.
Whether to add them is not decided.
