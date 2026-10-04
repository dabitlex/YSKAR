# Migration: the chain moves to the full node

> **Historical record.** The migration described here is complete. For the current setup see
> [../OPERATIONS.md](../OPERATIONS.md).

This is the plan that was written for moving the authority over the chain from the server (Vercel
with Supabase) to a full node, addressed to the operator of that node. It is kept as it was
written. Paragraphs marked "Note (today)" were added later, where following the original text
would now do harm.

After the migration your node decides which block is valid, and Supabase no longer does. Supabase
stays, but as a **mirror**: explorer, balances, history, key figures.

**Steps 1 to 6 change nothing.** They can be done at any time and abandoned at any time. Only step
7 switches over, and it can be undone in a minute.

---

## The decisive sentence

> **Authority lies with whoever issues the mining jobs, not with whoever stores the data.**

A job fixes which parent, which transactions, which state root. That *is* the block. Whoever
builds it determines the chain. Whoever only files it afterwards determines nothing.

That is why **only four routes** move:

| Route | Where to | Why |
|---|---|---|
| `/session` `/job` `/share` | **node** | authority; deadline of 90 s |
| `POST /tx` | **node** | must reach the mempool of the builder |
| `/summary` `/blocks` `/account` `/search` | Supabase | a few seconds of delay do no harm |

A mirror must not issue jobs: a job lives 90 seconds and must stand on the **current** tip. A
mirror is behind by definition. The phones would build on an outdated parent, and their hits would
be `stale_job`.

---

## Step 1: set up the node

On the target machine. Node 22 or newer; there are no native modules.

```bash
git clone https://github.com/dabitlex/YSKAR.git
cd YSKAR
npm install
cd node && npm install && npm run build
```

## Step 2: fetch the chain and compare

```bash
node dist/yskar-node.cjs sync --data ./knoten --once
node dist/yskar-node.cjs status --data ./knoten
```

**The state root must match the one from `https://yskar.vercel.app/api/v2/summary`.**

This is the actual proof: two states computed independently, the same result. If they do not
match, stop here and report it.

## Step 3: start it as a service

```bash
sudo tee /etc/systemd/system/yskar.service > /dev/null <<'EOF'
[Unit]
Description=YSKAR Full Node
After=network-online.target

[Service]
Type=simple
User=yskar
WorkingDirectory=/home/yskar/YSKAR/node
ExecStart=/usr/bin/node dist/yskar-node.cjs mine --data ./knoten \
  --bind 127.0.0.1 --port 8645 --p2p-port 8646
Restart=always
RestartSec=10
ProtectSystem=strict
ReadWritePaths=/home/yskar/YSKAR/node/knoten
PrivateTmp=true
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable --now yskar
sudo systemctl status yskar
```

> Note (today): a start command without `--no-upstream` is right only for the main node, which
> writes to the mirror. Any other node adds both seeds and `--no-upstream`. The unit in use today is
> `deploy/yskar-node.service`; see [../../deploy/README.md](../../deploy/README.md).

`--bind 127.0.0.1` is intentional: the node itself is not meant to be reachable from the network.
A front server with TLS goes before it.

## Step 4: HTTPS in front

**It does not work without this.** Telegram loads Mini Apps only over HTTPS, and a call to `http`
fails in the browser.

```bash
sudo apt install caddy
sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
node.example.org {
    reverse_proxy 127.0.0.1:8645

    # The Mini App runs on a different address than the node.
    header Access-Control-Allow-Origin "*"
    header Access-Control-Allow-Methods "GET, POST, OPTIONS"
    header Access-Control-Allow-Headers "content-type"

    @options method OPTIONS
    respond @options 204
}
EOF
sudo systemctl reload caddy
```

The name has to point to the machine by DNS beforehand.

```bash
curl https://node.example.org/api/v2/summary
```

If the same state root comes back as in step 2, the node is up.

## Step 5: open P2P

```bash
sudo ufw allow 8646/tcp
```

For a node at home, also forward the port in the router. A second node then connects with:

```bash
node dist/yskar-node.cjs mine --data ./knoten --seed node.example.org:8646
```

> Note (today): do not start a second node this way. Without `--no-upstream` it writes its blocks
> into the mirror. The current command is
> `node dist/yskar-node.cjs mine --data ./knoten --seed yskar-main.dynv6.net:8646 --seed yskar-seed2.dynv6.net:8646 --no-upstream`.

## Step 6: let it run alongside and compare

**Do not switch anything off yet.** The node keeps fetching from Vercel and hands the blocks it
finds over to it. Both sides run in parallel.

Leave it like this for a few days and look now and then:

```bash
node dist/yskar-node.cjs status --data ./knoten
curl -s https://yskar.vercel.app/api/v2/summary
```

**If height and state root match over days, the node is ready for step 7.** Not before.

---

## Step 7: switch over

One environment variable in Vercel:

```text
NEXT_PUBLIC_MINING_BASE = https://node.example.org
```

**Settings → Environment Variables**, then trigger a new build.

What happens: `/session`, `/job`, `/share` and `POST /tx` go to your node from now on. Everything
else stays with Supabase unchanged.

**Going back works the same way:** delete the variable, rebuild. The chain takes no harm from
this; it exists completely on both sides.

> Note (today): going back is no longer possible. Since step 8 the mining routes of the server
> answer HTTP 410, so an app built without this variable can neither mine solo nor send.

## Step 8: retire the old authority

**Only now, and only when step 7 demonstrably works.**

Two authorities must never issue jobs at the same time. Otherwise two branches arise that are both
"valid", and the chain splits.

As long as nobody mines against Vercel any more, nothing happens; the routes just lie idle. It is
still safer to close them: in `src/app/api/v2/session/route.ts`, `job` and `share`, at the start
of the function

```ts
return NextResponse.json(
  { error: 'moved', detail: 'Mining läuft jetzt über die Full Nodes.' },
  { status: 410, headers: CORS });
```

Before that, check that really nobody mines there any more:

```sql
select count(*) from chain2.sessions
where status = 'active' and last_share_at > now() - interval '1 hour';
```

## Step 9: observe

| Question | Where to look |
|---|---|
| Are blocks still coming? | explorer or `status` |
| Do the miners see their shares? | the Network tab shows "Measured, live" |
| Is the node running? | `systemctl status yskar`, `journalctl -u yskar -f` |
| Does the mirror keep up? | height in Supabase against `status` |

In case of problems: remove the variable, rebuild, back to Supabase.

> Note (today): this way back no longer exists; see the note under step 7.

---

## How the mirror is filled

Your node sends **every accepted block** to Vercel: the one it found itself as well as the one
that came in over P2P. Vercel recomputes it and commits it.

That Supabase keeps checking every block is not a contradiction but useful: a mirror that checks
what it mirrors cannot take in nonsense.

```text
Full node  =  the truth
   ├── P2P to other nodes
   ├── mining + transactions    ← phones directly
   └── every block              → Supabase = mirror
                                       ↑
                               explorer, balances, history
```

**If the mirror fails, the chain keeps running.** Errors while handing blocks on are reported, not
handled; the mirror must never hold up the chain. It also does not catch up on its own; for that
there is the synchronization from the other side.

## What you give up

Honestly, so that you know it beforehand.

**The node becomes a single point of failure.** If it fails, all miners stand still. Today nothing
fails when your machine fails, because Supabase keeps running.

That only gets better when **several nodes** run and the app can switch to another one when one
fails. That would need a list of several addresses in the app, which is not built yet.

**You take over operations.** Updates, certificate, disk, power. A Raspberry Pi with a tired SD
card is a worse foundation than a VPS.

**Vercel is still needed**, for the Mini App itself. The only thing that changes is where it gets
its mining jobs from.

## What you gain

**Consensus lives on a machine you control**, with code that is public, and not in a database at a
provider.

**Anyone can set up a second node** and recompute the same thing.

**Blocks spread directly** between nodes. That is the difference between a chain you have to
believe and one you can recompute.

---

## Short version

```text
1. Set up the node         npm install && npm run build
2. Fetch the chain         sync --once, compare the state root
3. Start as a service      systemd, --bind 127.0.0.1
4. HTTPS in front          Caddy; without TLS no Telegram
5. Open P2P                port 8646
6. Compare for days        height and root
────────────────────────── up to here nothing changes
7. Switch over             set NEXT_PUBLIC_MINING_BASE
8. Close the old routes    only when 7 works
9. Observe
```
