# yskar.app website

Maintainer notes for the website at `www.yskar.app`. They are for anyone who edits the pages,
changes texts, updates the download links after a release or refreshes the chain data.

The site is static: HTML, CSS and JavaScript without a framework. The pages are generated from
the sources in `src/` by one script without dependencies, and the result is committed. Vercel
does not build anything; it serves the files as they are in this folder.

```text
src/                 the sources (not deployed)
  site.json          the pages: id, file name, address, description, old anchors; download versions
  shell.html         frame of every page: head, header, menu, footer
  head.js            small script in the head of every page: language, old anchors, first chain request
  pages/*.html       content of each page; <!--@include name--> pulls in src/parts/name.html
  parts/*.html       sections shared between pages or kept apart for size
  texts/*.txt        all texts, English and German
  css/*.css          styles, joined in file name order
  js/*.js            the program, joined in file name order
  vendor/*.js        GSAP and ScrollTrigger, unchanged
tools/               the scripts (not deployed)
  build.mjs          writes the pages and assets/site.css, assets/site.js, assets/i18n/*.js
  kette.mjs          writes assets/data/kette.js from the public API
  server.mjs         serves this folder locally the way Vercel does

*.html               generated: one file per page, English text already in place
404.html             generated: shown for unknown addresses
assets/site.css      generated
assets/site.js       generated
assets/i18n/*.js     generated: the texts per language
assets/data/kette.js state of the chain and the history of all blocks (tools/kette.mjs)
assets/media/        images used by the pages; the build refers to them with a checksum
assets/fonts/        Hanken Grotesk and Geist Mono, self-hosted, with their license files
assets/img/          files with a fixed public address: logo, app icons, share image
vercel.json          clean URLs, headers, rewrites, build only when this folder changed
.vercelignore        keeps README.md, src/ and tools/ out of the deployment
```

`assets/fonts/geist-variable.woff2`, `geist-mono-variable.woff2` and `LICENSE-Geist.txt` are also
used by Node Core: its build copies them from this folder. Do not remove them.

## Change something

Edit the sources, then build and check the result into the repository together with the sources:

```bash
node website/tools/build.mjs           # write the pages
node website/tools/build.mjs --check   # write nothing; fail if the folder does not match the sources
```

Never edit the generated files by hand; the next build overwrites them. The build stops with a
message when a text is missing in one language, a link points to a page or anchor that does not
exist, or an image is missing. `--unused` lists texts that nothing refers to.

Node.js 18 or newer is all the scripts need.

## View locally

```bash
node website/tools/server.mjs            # http://127.0.0.1:8080
node website/tools/server.mjs --no-api   # the same, with the API not answering
```

The server maps `/mining` to `mining.html`, answers unknown addresses with `404.html` and passes
`/api/v2/…` on to the public API (GET only), like `vercel.json` does on Vercel.

## Pages and addresses

| Page | Source | Address |
|---|---|---|
| Start page | `pages/home.html` | `/` |
| Where to begin | `pages/start.html` | `/start` |
| Mining | `pages/mine.html` | `/mining` |
| Wallet | `pages/wallet.html` | `/wallet` |
| Run a node | `pages/node.html` | `/node` |
| YSR, the coin | `pages/ysr.html` | `/ysr` |
| The chain | `pages/chain.html` | `/chain` |
| Network, live | `pages/network.html` | `/network` |
| Explorer | `pages/explorer.html` | `/explorer` |
| Build on YSKAR | `pages/build.html` | `/build` |
| Community | `pages/community.html` | `/community` |
| Story and next steps | `pages/story.html` | `/story` |
| Guides | `pages/guides.html` | `/anleitungen` |
| Protocol | `pages/protocol.html` | `/protokoll` |
| Whitepaper | `pages/paper.html` | `/whitepaper` |
| Legal notice | `pages/imprint.html` | `/impressum` |
| Privacy | `pages/privacy.html` | `/datenschutz` |

The addresses of the older pages (`/mining`, `/explorer`, `/anleitungen`, `/protokoll`,
`/whitepaper`, `/impressum`, `/datenschutz`) are unchanged, and so are the anchors inside the
guides and the whitepaper. The apps, the miners and Node Core link to them.

Anchors of the former start and mining page that moved are listed under `legacy` in
`src/site.json`; `src/head.js` forwards them, for example `/#v6` to `/chain#v6`.

### Links between pages

In the sources a link to another page is written as `#page` or `#page-anchor`, with the id from
`site.json`: `href="#mine"`, `href="#chain-accounts"`. The build turns it into the address
(`/mining`, `/chain#accounts`) and checks that the target exists. A link whose first part is not
a page id stays an anchor on the same page. Scripts use `Router.href('#explorer-block-12')` for
the same purpose.

### Explorer links

`/explorer#block-<height>`, `/explorer#tx-<64 hex digits>` and `/explorer#adr-<ysr1…>` open a
block, a transaction or an address. The wallet, the app, the miners and Node Core build exactly
these links, so the three forms must keep working. `/explorer#neu` opens the block that is being
mined right now, with the queue of pending transactions.

Every block the explorer shows is re-verified in the browser, as four separate statements: the
header rebuilt from its fields matches the stored header, the recomputed hash is the reported
one, the hash is below the target, and the link to the previous block holds. The list of the
latest blocks also compares the server's mirror with the full node (`tipHash` in `/summary`).

## Texts and languages

The site exists in English and German. English is the default; the generated pages contain the
English text, so they are complete without scripts. `src/head.js` picks the language in this
order: the `?lang=` parameter in the address, the choice the visitor made earlier, the language
of the browser, otherwise English. The visitor switches in the menu or in the footer; the choice
is remembered in the browser (`localStorage`, key `yskar.sprache`). Nothing else is stored in
the browser.

A text has a key and one line per language:

```text
start.h1
  en: Pick your way in.
  de: Such dir deinen Weg hinein.
```

| Attribute | Effect |
|---|---|
| `data-t="key"` | Sets the content of the element (HTML is allowed in the text) |
| `data-ta="attribute:key"` | Sets an attribute, for example `aria-label` or `alt`. Several pairs are separated by `;`. |
| `data-live="name"` | Shows a value read from the chain; the names are the fields of `values()` in `src/js/11-live.js` |
| `data-say="key"` | A sentence with values from the chain inserted. If `key.snap` exists, it is used while the API is not answering. |

Scripts read texts with `t('key', { n: 3 })`; `{n}` in the text is replaced.

A further language needs its code in `languages` in `src/site.json`, one more line per key in
`src/texts/`, a button in `src/shell.html` and, for scripts other than Latin, a font that covers
it. The build refuses to run while a key lacks a language.

The whitepaper exists in English and German. The legal notice and the privacy policy are in
German.

## Chain data

Every page reads the state of the chain from the public API under `/api/v2` (same host; see
`rewrites` in `vercel.json`): `summary` and the latest 50 blocks at the start and every 45
seconds, plus `pools`, `supply` and `fees`. The request is sent from the head of the page, so the
answer is usually there when the program starts.

`assets/data/kette.js` holds what the pages cannot get in one request:

- the state at the time the file was written. A page shows it only while the API is not
  answering, and then names its date instead of presenting it as current;
- the time, finder and transfer flag of every block since block 0, in compact form. The ribbon
  on the start page, the logbook, the timelines and the daily figures on the network page are
  drawn from it.

Blocks found after the file was written are added from the API. The latest 50 always come with
the regular request. If more are missing, a page that shows the history loads them, 50 per
request and at most 12 requests per page view. So the older the file, the more every visitor
has to load, and beyond 600 missing blocks (about four days) the history on the page stays
incomplete and says up to which block it reaches. Refresh the file regularly:

```bash
node website/tools/kette.mjs            # add the blocks found since the file was written
node website/tools/kette.mjs --full     # read the whole chain again (about 180 requests)
```

The pages refer to this file without a checksum, so refreshing it does not require a new build;
commit the file alone.

## After a release

The versions of the downloads are in `versions` in `src/site.json`:

| Key | Used for |
|---|---|
| `NODE_CORE` | Node Core downloads and file names on `/node`, `/mining` and `/anleitungen`, the HiveOS package |
| `APP` | The Android app with mining (`releases/tag/app-v…`) |
| `WALLET` | The version shown for YSKAR Wallet |

Change the number, run the build and commit. Still by hand: the file sizes next to the Node Core
downloads in `src/parts/doc-guides.html`, and the "Download" section of the
[README](../README.md) in the repository root.

The site links one specific version on GitHub. It does not ask GitHub which version is the
newest, because that would be a request to a third party from every visitor's browser.

- **Android app with mining:** the button links the release of one version (`releases/tag/app-v…`),
  not `releases/latest`, because the newest release in the repository can also be a Node Core
  release.
- **YSKAR Wallet** (own repository): the links go to
  `https://github.com/dabitlex/YSKAR--WALLET/releases/latest`. That repository only holds wallet
  releases, so `latest` is always right there.

## Images

A page image is written as `<img data-img="name">`. The file comes from `assets/media/`:
`name.webp`, or the variants `name-p` / `name-w` (portrait and landscape, with `data-orient`) and
`name-en` / `name-de` (language). The build fails if no file fits a name.

`assets/img/` holds the files other sites and services refer to by address. Keep their names:
`yskar-cmc-200.png`, `og-yskar.jpg` (share image), `og-yskar.png` (former share image),
`zeichen.svg`, `apple-touch-icon.png`, `icon-256.png`.

## Caching

`vercel.json` lets browsers keep `assets/site.css`, `assets/site.js`, `assets/i18n/`,
`assets/media/` and `assets/fonts/` for a year. That is safe because every page refers to these
files with a checksum in the address (`?v=…`), which the build sets: a changed file has a new
address. The pages themselves and `assets/data/kette.js` are checked with the server on every
visit.
