# yskar.app website

Maintainer notes for the static website at `www.yskar.app`. They are for anyone who edits the
pages, adds texts or languages, or updates the download links after a release.

The site is plain HTML, CSS and JavaScript. There is no framework and no build step: Vercel
serves the files as they are in this folder.

```text
index.html          start page: the currency, how it works, check it yourself, supply, V6 with roadmap, using YSR
protokoll.html      protocol: datasheet, block header, transfer, block 0, issuance by era
explorer.html       the explorer in the website style; served by the website itself (no longer passed through from yskar.vercel.app)
mining.html         mining: ways to mine, Node Core downloads, calculator, active pools
anleitungen.html    guides: Mini App, Android app, Node Core, PC miner, wallet, full node, pool
whitepaper.html     whitepaper, in English and German
impressum.html      legal notice (German)
datenschutz.html    privacy policy (German)
assets/style.css    all styles
assets/site.js      language, menu, live values
assets/motion.js    start and mining page: warp and V6 canvas, scroll effects, tile light (decoration; the page works without it)
assets/nutzen.js    start page: live fee and average block time
assets/i18n/*.js    texts per language (English is the default and the fallback)
assets/fonts/       Geist and Geist Mono (Latin), Manrope and IBM Plex Mono (Cyrillic), self-hosted, with their license files
assets/img/         zeichen.svg (logo), share image, app icons, wallet screenshots; favicon.svg/.png in the root
vercel.json         clean URLs, headers, rewrites, build only when this folder changed
.vercelignore       keeps this README out of the deployment
```

## Languages

The site exists in ten languages: English, German, Spanish, Portuguese, French, Italian, Polish,
Russian, Turkish and Chinese. `assets/site.js` picks the language in this order: the `?lang=`
parameter in the address, the choice the visitor made earlier, the language of the browser,
otherwise English. The visitor can switch with the selector in the page header. The choice is
remembered in the browser (`localStorage`, key `yskar.sprache`).

The HTML contains the English text. `site.js` replaces it with the chosen language:

| Attribute | Effect |
|---|---|
| `data-t="key"` | Sets the text of the element |
| `data-th="key"` | Sets the content of the element as HTML |
| `data-ta="attribute:key"` | Sets an attribute, for example `aria-label` or `alt`. Several pairs are separated by `;`. |
| `data-n="number"` | Shows the number in the format of the chosen language |

A new text needs three things: an element with one of these attributes in the HTML, the English
text in `assets/i18n/en.js`, and the translation in the other language files. Where a
translation is missing, the English text appears.

The browser must not keep the language files, `site.js` and `style.css` in its cache without
checking (`vercel.json` sets `max-age=0, must-revalidate` for them). Otherwise it would show a
new page with old texts after a change, and new sections would appear in English. In addition,
the HTML loads these files with a `?v=…` suffix, which `site.js` passes on to the language files.
Raise that number only when visitors should see a change at once although their browser still
holds an older version with a longer lifetime.

The whitepaper exists in English and German. Visitors with German as their language see the
German version, all others the English one; a note tells visitors with any other language that
only these two exist. Two buttons on the page switch between the versions. The legal notice and
the privacy policy are in German.

## Live values

The start page fetches block height, network hashrate, circulating supply, active miners and nodes from
`https://yskar.vercel.app/api/v2/summary` once a minute and computes the height of the next
halving from them. Every element with `data-live="name"` shows that value (`hoehe`, `rate`, `umlauf`,
`umlaufMio`, `halbierung`, `tage`, `miner`, `knoten`, `anteil`); a value may appear several times on a page. As long as no answer has arrived, the values stay at "—", and if the request
fails in that state, a note says that live data is unavailable. After a later failure the last
values stay on the page. The page itself keeps working in every case.

## Explorer at /explorer

The explorer belongs to the app (`public/explorer.html` in the repository root). This website only
passes it through with the `rewrites` in `vercel.json`: `/explorer`, its data requests
`/api/v2/…`, the logo under `/marke/…` and the fonts under `/schrift/…` are all fetched from
`https://yskar.vercel.app`. The address bar shows `www.yskar.app/explorer`, but there is still
only one explorer.

## View locally

```bash
cd website
python3 -m http.server 8080
```

Then open `http://localhost:8080/index.html`. Clean URLs such as `/anleitungen` and the explorer
work only on Vercel.

## After each Node Core release

The website links the installer of one specific Node Core version directly on GitHub. It does
not ask GitHub which version is the newest, because that would be a request to a third party
from every visitor's browser. After each new Node Core release, update by hand:

- in `mining.html`, the Node Core tile (`id="nodecore"`): the download link, the link to the release notes
  and checksum, the version number and the file size;
- in `anleitungen.html`: the same download link, release link, version number and file size, and
  the installer file name in the `Get-FileHash` command;
- in the "Download" section of the [README](../README.md) in the repository root: the installer
  link and the release link.
