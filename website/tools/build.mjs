#!/usr/bin/env node
/*
 * Baut die Website aus den Quellen in src/.
 *
 *   node website/tools/build.mjs            schreibt die Seiten und die gemeinsamen Dateien
 *   node website/tools/build.mjs --check    schreibt nichts; meldet, wenn der Ordner nicht zum Stand der Quellen passt
 *   node website/tools/build.mjs --strict   wie oben, bricht aber ab, wenn einer Sprache Texte fehlen oder Übersetzungen veraltet sind
 *
 * Quellen
 *   src/site.json        die Seiten (Kennung, Dateiname, Adresse, Beschreibung, alte Anker), die Sprachen und die Versionen der Downloads
 *   src/shell.html       Gerüst jeder Seite (Kopf, Kopfleiste, Menü, Fuß)
 *   src/head.js          kleines Skript im Kopf jeder Seite (Sprache, alte Anker, erste Abfrage der Kette)
 *   src/pages/*.html     der Inhalt je Seite; <!--@include name--> holt src/parts/name.html
 *   src/texts/*.txt      Texte: Schlüssel, darunter "  en: ..." und "  de: ..." (in diesen beiden Sprachen wird die Seite geschrieben)
 *   src/texts/lang/*.txt die übrigen Sprachen, eine Datei je Sprache: Schlüssel, darunter der englische Text, aus dem die
 *                        Übersetzung entstand ("  en: ..."), und die Übersetzung ("  es: ..."). Fehlt ein Text, zeigt die Seite
 *                        dort den englischen; hat sich der englische seither geändert, meldet der Bau die Übersetzung als veraltet.
 *   src/css/*.css        Stile, in der Reihenfolge der Dateinamen zusammengefügt
 *   src/vendor/*.js      GSAP und ScrollTrigger, unverändert
 *   src/js/*.js          das Programm, in der Reihenfolge der Dateinamen zusammengefügt
 *
 * Ergebnis (liegt im Repository; Vercel liefert die Dateien aus, wie sie sind)
 *   *.html               eine Datei je Seite, englischer Text schon eingesetzt
 *   assets/site.css      alle Stile
 *   assets/site.js       Bibliotheken und Programm
 *   assets/i18n/*.js     die Texte je Sprache
 *
 * Nicht vom Bau erzeugt:
 *   assets/data/kette.js der Stand der Kette (tools/kette.mjs)
 *   assets/media/        Bilder der Seiten (der Bau verweist mit Prüfsumme darauf)
 *   assets/fonts/        Schriften
 *   assets/img/          Dateien mit fester Adresse: Zeichen, App-Symbole, Teilen-Bild
 *
 * Verweise zwischen den Seiten stehen in den Quellen als "#seite" oder "#seite-anker" (zum Beispiel
 * "#mine" oder "#chain-accounts"). Der Bau macht daraus die Adresse der Seite ("/mining",
 * "/chain#accounts") und prüft, dass es jedes Ziel gibt.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SRC = join(ROOT, 'src');
const CHECK = process.argv.includes('--check');
const STRICT = process.argv.includes('--strict');
const VENDOR = ['gsap.min.js', 'ScrollTrigger.min.js'];
const SKIP_ID = 'main';                                    // "Zum Inhalt springen" zeigt auf <main>, nicht auf eine Seite

/** Zeilenenden und ein führendes BOM angleichen: Das Ergebnis ist auf jedem System dasselbe, Byte für Byte. */
const clean = s => s.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const raw = (...p) => clean(readFileSync(join(SRC, ...p), 'utf8'));
/** Quelltext lesen; {{NODE_CORE}}, {{APP}} und {{WALLET}} werden durch die Versionen aus site.json ersetzt (Download-Links, Dateinamen). */
const read = (...p) => raw(...p).replace(/\{\{(NODE_CORE|APP|WALLET)\}\}/g, (m, k) => VERSIONS[k]);
const list = (dir, ext) => readdirSync(join(SRC, dir)).filter(f => f.endsWith(ext)).sort();
const hash = data => createHash('sha1').update(data).digest('hex').slice(0, 8);
const escAttr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const noTags = s => s.replace(/<[^>]+>/g, '');
function stop(msg) { console.error('Fehler: ' + msg); process.exit(1); }

const SITE = JSON.parse(raw('site.json')), VERSIONS = SITE.versions;
const PAGES = SITE.pages;
const PATHS = Object.fromEntries(PAGES.filter(p => p.path).map(p => [p.id, p.path]));
const LANGS = SITE.languages.map(l => l.id);
const WRITTEN = SITE.written;                               // in diesen Sprachen stehen die Texte in src/texts/*.txt
const OTHER = LANGS.filter(l => !WRITTEN.includes(l));      // die übrigen: src/texts/lang/<sprache>.txt
if (LANGS[0] !== 'en' || !WRITTEN.includes('en')) stop('site.json: Englisch muss die erste Sprache sein und zu "written" gehören.');

/* ---------- Texte ---------- */
const KEY = /^[A-Za-z0-9_.\-]+$/;
/** Liest Dateien im Format "Schlüssel / eingerückt sprache: text" und ruft für jeden Schlüssel `open`, für jede Zeile `line`. */
function textFile(dir, f, open, line) {
  let key = null;
  read(dir, f).split('\n').forEach((raw, i) => {
    if (!raw.trim() || raw.trimStart().startsWith('#')) return;
    const m = /^\s+([a-z]{2}):\s?(.*)$/.exec(raw), at = `${dir}/${f}:${i + 1}`;
    if (m) {
      if (key === null) stop(`${at}: Text ohne Schlüssel`);
      line(key, m[1], m[2].trim(), at);
    } else if (KEY.test(raw.trim()) && !raw.startsWith(' ')) { key = raw.trim(); open(key, at); }
    else stop(`${at}: nicht lesbar: ${raw}`);
  });
}
/**
 * Zählformen neben "schluessel": "schluessel.1" (Einzahl), "schluessel.few" und "schluessel.frac" (Russisch, Polnisch).
 * Eine Sprache darf eine Zählform führen, die es englisch nicht gibt: Russisch braucht "21 год", wo englisch "21 years"
 * steht. Ihr englischer Text ist dann der der Grundform.
 */
const FORM = /\.(1|few|frac)$/;
function parseTexts() {
  const T = Object.fromEntries(LANGS.map(l => [l, {}])), en = T.en;
  const baseOf = key => (key in en ? key : key.replace(FORM, ''));
  for (const f of list('texts', '.txt')) {
    textFile('texts', f, (key, at) => {
      if (key in en) stop(`${at}: Schlüssel doppelt: ${key}`);
      en[key] = undefined;
    }, (key, lang, text, at) => {
      if (!WRITTEN.includes(lang)) stop(`${at}: ${lang} gehört nicht hierher (Sprachen dieser Datei: ${WRITTEN.join(', ')}; die übrigen stehen in texts/lang/)`);
      T[lang][key] = text;
    });
  }
  const keys = Object.keys(en);
  for (const l of WRITTEN) {
    const miss = keys.filter(k => T[l][k] === undefined);
    if (miss.length) stop(`Texte: ${l} fehlt bei: ${miss.slice(0, 20).join(', ')}`);
  }
  // Die übrigen Sprachen: je Schlüssel der englische Text, aus dem übersetzt wurde, und die Übersetzung
  const state = {};
  for (const l of OTHER) {
    const from = {}, to = {}, f = l + '.txt';
    state[l] = { missing: [], stale: [] };
    if (existsSync(join(SRC, 'texts', 'lang', f))) {
      textFile(join('texts', 'lang'), f, (key, at) => {
        if (key in to) stop(`${at}: Schlüssel doppelt: ${key}`);
        if (!(baseOf(key) in en)) stop(`${at}: Schlüssel ${key} gibt es in src/texts nicht (mehr). Eintrag entfernen.`);
        to[key] = undefined;
      }, (key, lang, text, at) => {
        if (lang === 'en') from[key] = text;
        else if (lang === l) to[key] = text;
        else stop(`${at}: in dieser Datei stehen nur en und ${l}`);
      });
    }
    for (const k of Object.keys(to)) {
      if (to[k] === undefined || to[k] === '') stop(`texts/lang/${f}: ${k} hat keine Übersetzung`);
      if (from[k] === undefined) stop(`texts/lang/${f}: ${k} nennt den englischen Text nicht, aus dem übersetzt wurde`);
      // Platzhalter: Was der englische Text nennt, muss auch die Übersetzung nennen. Eine Zählform (x.1, x.few, x.frac) darf
      // zusätzlich nennen, was die Grundform x nennt: "1 transfer" wird zu "{n} перевод", weil dort auch 21 die Einzahl trägt.
      const marks = s => new Set((s || '').match(/\{[a-zA-Z0-9_]+\}/g) || []);
      const need = marks(en[baseOf(k)]), may = new Set([...need, ...marks(en[k.replace(FORM, '')])]), got = marks(to[k]);
      const lost = [...need].filter(x => !got.has(x)), extra = [...got].filter(x => !may.has(x));
      if (lost.length || extra.length) stop(`texts/lang/${f}: ${k}: Platzhalter stimmen nicht` + (lost.length ? `, es fehlt ${lost.join(' ')}` : '') + (extra.length ? `, unbekannt ${extra.join(' ')}` : ''));
      if (from[k] !== en[baseOf(k)]) state[l].stale.push(k);
      T[l][k] = to[k];
    }
    for (const k of keys) if (T[l][k] === undefined) { T[l][k] = en[k]; state[l].missing.push(k); }
  }
  return { T, state };
}

/* ---------- Verweise ---------- */
/** "#mine" -> "/mining", "#chain-accounts" -> "/chain#accounts"; alles andere bleibt ein Anker auf derselben Seite. */
function target(ref) {
  const h = ref.replace(/^#/, ''), i = h.indexOf('-'), page = i < 0 ? h : h.slice(0, i);
  if (!(page in PATHS)) return null;
  return { page, anchor: i < 0 ? '' : h.slice(i + 1) };
}
const wanted = [];                                          // { from, page, anchor } zur Prüfung am Ende
function links(markup, from, here) {
  return markup.replace(/(<a\b[^<>]*?\shref=)(["'])#([^"']*)\2([^<>]*>)/g, (all, pre, q, ref, post) => {
    if (ref === SKIP_ID || ref === '') return all;
    const t = target('#' + ref);
    if (!t) { if (here) wanted.push({ from, page: here, anchor: ref }); return all; }
    wanted.push({ from, page: t.page, anchor: t.anchor });
    if (here === t.page && t.anchor) return `${pre}${q}#${t.anchor}${q}${post}`;
    const url = PATHS[t.page] + (t.anchor ? '#' + t.anchor : '');
    const cur = here === t.page && !/aria-current=/.test(all) ? ' aria-current="page"' : '';
    return `${pre}${q}${url}${q}${cur}${post}`;
  });
}

/* ---------- Seitenbausteine ---------- */
/** Setzt den englischen Text in Elemente mit data-t und in Attribute aus data-ta: die Datei ist auch ohne Skript vollständig. */
function fill(markup, en, used, where) {
  markup = markup.replace(/(<[a-zA-Z][^<>]*\sdata-t="([^"]+)"[^<>]*>)(<\/)/g, (all, open, key, close) => {
    used.add(key);
    if (!(key in en)) stop(`${where}: Text fehlt: ${key}`);
    return open + en[key] + close;
  });
  return markup.replace(/<[a-zA-Z][^<>]*\sdata-ta="([^"]+)"[^<>]*>/g, (tag, pairs) => {
    for (const pair of pairs.split(';')) {
      const [attr, key] = pair.split(':');
      used.add(key);
      if (!(key in en)) stop(`${where}: Text fehlt: ${key}`);
      const val = escAttr(noTags(en[key]));
      const re = new RegExp(`(\\s${attr}=")[^"]*(")`);
      tag = re.test(tag) ? tag.replace(re, (m, a, b) => a + val + b) : tag.slice(0, -1) + ` ${attr}="${val}">`;
    }
    return tag;
  });
}
/** Befehlsblöcke (.term > pre): jede Zeile in ein eigenes Element, damit umbrochene Zeilen eingerückt weiterlaufen. */
function codeLines(markup) {
  return markup.replace(/(<div class="term[^"]*">\s*<pre[^>]*>)([\s\S]*?)(<\/pre>)/g, (all, a, body, z) => {
    const rows = body.split('\n');
    return a + rows.slice(0, -1).map(r => `<span class="ln">${r}\n</span>`).join('') + `<span class="ln">${rows[rows.length - 1]}</span>` + z;
  });
}
const include = raw => raw.replace(/<!--@include ([a-z0-9\-]+)-->/g, (m, name) => read('parts', name + '.html'));
/** Kommentare und Einrückung aus dem Kopfskript nehmen (es steht in jeder Seite). */
function compact(js) {
  return js.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .map(l => l.replace(/^\s*\/\/.*$/, '').replace(/;\s+\/\/ .*$/, ';').trim()).filter(Boolean).join('\n');
}

/* ---------- Bau ---------- */
function build() {
  const { T, state } = parseTexts(), en = T.en, used = new Set(), out = {};

  // Texte tragen Verweise in derselben Schreibweise wie die Seiten
  for (const l of LANGS) for (const k of Object.keys(T[l])) if (T[l][k].includes('href=')) T[l][k] = links(T[l][k], `Text ${k} (${l})`, null);
  const texts = Object.fromEntries(LANGS.map(l => [l,
    `(window.YSKAR_TEXTE=window.YSKAR_TEXTE||{}).${l}=${JSON.stringify(T[l])};window.YSKAR_TEXTE_DA&&window.YSKAR_TEXTE_DA("${l}");\n`]));
  const textV = Object.fromEntries(LANGS.map(l => [l, hash(texts[l])]));
  for (const l of LANGS) out[`assets/i18n/${l}.js`] = texts[l];

  // Stile: Schriften und das winzige Vorschaubild des Startbilds
  const asset = name => {
    const dir = /\.woff2$/.test(name) ? 'fonts' : 'media', p = join(ROOT, 'assets', dir, name);
    if (!existsSync(p)) stop(`Datei fehlt: assets/${dir}/${name}`);
    return { url: `/assets/${dir}/${name}?v=${hash(readFileSync(p))}`, data: readFileSync(p) };
  };
  let css = list('css', '.css').map(f => read('css', f)).join('\n');
  css = css.replace(/\{\{ASSET:([A-Za-z0-9_.\-]+)\}\}/g, (m, n) => asset(n).url)
    .replace(/\{\{INLINE:([A-Za-z0-9_.\-]+)\}\}/g, (m, n) => 'data:image/webp;base64,' + asset(n).data.toString('base64'));
  out['assets/site.css'] = css;

  // Bilder: jedes <img data-img="name"> bekommt seine Datei aus diesem Verzeichnis (Varianten -p/-w und -en/-de)
  const imgDir = join(ROOT, 'assets', 'media');
  const names = new Set();
  const sources = [read('shell.html'), ...list('pages', '.html').map(f => include(read('pages', f))), ...list('js', '.js').map(f => read('js', f))].join('\n');
  for (const m of sources.matchAll(/data-img="([a-z0-9\-]+)"|Img\.url\('([a-z0-9\-]+)'\)/g)) names.add(m[1] || m[2]);
  const images = {};
  for (const f of readdirSync(imgDir).sort()) {
    const m = /^(.+)\.(webp|png)$/.exec(f);
    if (!m) continue;
    const stem = m[1], base = stem.replace(/-(p|w)$/, '').replace(/-(en|de)$/, '').replace(/-(p|w)$/, '');
    if (names.has(stem) || names.has(base)) images[stem] = `/assets/media/${f}?v=${hash(readFileSync(join(imgDir, f)))}`;
  }
  for (const n of names) if (!Object.keys(images).some(k => k === n || k.startsWith(n + '-'))) stop(`Bild fehlt: assets/media/${n}*.webp`);

  // Programm
  const jsFiles = list('js', '.js');
  const program = jsFiles.map(f => `/* ---- ${f} ---- */\n` + read('js', f)).join('\n');
  for (const m of program.matchAll(/\bt\(\s*['"]([A-Za-z0-9_.\-]+)['"]/g)) used.add(m[1]);
  for (const m of program.matchAll(/['"]((?:[a-z0-9]+\.)+[A-Za-z0-9_\-]+)['"]/g)) if (m[1] in en) used.add(m[1]);
  // zusammengesetzte Schlüssel: t('field.' + id) benutzt alles, was mit "field." beginnt; data-say="x" auch "x.snap"
  for (const m of program.matchAll(/\btn?\(\s*['"]([A-Za-z0-9_\-]+\.(?:[A-Za-z0-9_\-]+\.)*)['"]\s*\+/g)) for (const k of Object.keys(en)) if (k.startsWith(m[1])) used.add(k);
  // tn('x', n) wählt nach der Anzahl zwischen x und x.1
  for (const k of [...used]) if (k + '.1' in en && new RegExp(`\\btn\\(\\s*['"]${k.replace(/[.\-]/g, '\\$&')}['"]`).test(program)) used.add(k + '.1');
  for (const m of sources.matchAll(/data-say="([^"]+)"/g)) { used.add(m[1]); if (m[1] + '.snap' in en) used.add(m[1] + '.snap'); }
  const site = { pages: PATHS, langs: LANGS, locales: Object.fromEntries(SITE.languages.map(l => [l.id, l.locale])), texts: textV, img: images };
  out['assets/site.js'] = VENDOR.map(f => read('vendor', f)).join('\n') + '\nwindow.YSKAR_SITE=' + JSON.stringify(site) + ';\n' + program + '\n';

  const dataFile = join(ROOT, 'assets', 'data', 'kette.js');
  if (!existsSync(dataFile)) stop('assets/data/kette.js fehlt. Erst "node website/tools/kette.mjs" ausführen.');
  const ref = {
    css: '/assets/site.css?v=' + hash(out['assets/site.css']),
    js: '/assets/site.js?v=' + hash(out['assets/site.js']),
    data: '/assets/data/kette.js',                           // ohne Prüfsumme: Die Datei wird aufgefrischt, ohne dass die Seiten neu gebaut werden
  };
  const share = SITE.origin + SITE.shareImage + '?v=' + hash(readFileSync(join(ROOT, SITE.shareImage)));

  // Seiten
  const shell = read('shell.html'), headJs = compact(read('head.js')), ids = {};
  for (const p of PAGES) {
    const where = `pages/${p.id}.html`;
    let body = codeLines(fill(include(read('pages', p.id + '.html')), en, used, where));
    let page = fill(shell, en, used, 'shell.html').replace('<!--{{PAGES}}-->', () => body);
    page = links(page, where, p.id);
    ids[p.id] = new Set([...page.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));

    const title = p.id === 'home' ? `YSKAR – ${noTags(en['title.home'])}` : `${noTags(en['title.' + p.id])} – YSKAR`;
    const url = p.path ? SITE.origin + (p.path === '/' ? '/' : p.path) : null;
    const preload = [`<link rel="preload" as="font" type="font/woff2" href="${asset('hanken-grotesk-latin.woff2').url}" crossorigin>`];
    if (p.id === 'home') {
      preload.push(`<link rel="preload" as="image" href="${images['fjord-night-w']}" media="(min-aspect-ratio: 4/5)">`,
        `<link rel="preload" as="image" href="${images['fjord-night-p']}" media="(max-aspect-ratio: 4/5)">`);
    }
    const head = headJs.replace('__LANGS__', JSON.stringify(LANGS)).replace('__TEXTS__', JSON.stringify(textV))
      .replace('__LEGACY__', p.legacy ? JSON.stringify(p.legacy) : 'null');
    const vars = {
      PAGE: p.id, TITLE: escAttr(title), DESC: escAttr(p.desc), SHARE_TITLE: escAttr(p.id === 'home' ? 'YSKAR' : title),
      ROBOTS: p.path ? '' : '<meta name="robots" content="noindex">\n',
      URLS: url ? `<link rel="canonical" href="${url}">\n<meta property="og:url" content="${url}">\n` : '',
      SHARE_IMAGE: share, SHARE_ALT: escAttr(SITE.shareImageAlt), PRELOAD: preload.join('\n') + '\n',
      HEAD_JS: head, CSS: ref.css, DATA: ref.data, JS: ref.js,
      LANG_OPTIONS: SITE.languages.map(l => `<option value="${l.id}" lang="${l.id}"${l.id === 'en' ? ' selected' : ''}>${l.name}</option>`).join(''),
    };
    page = page.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in vars ? vars[k] : stop(`shell.html: unbekannter Platzhalter ${m}`)));
    out[p.file] = page;
  }

  // Jedes Ziel eines Verweises muss es geben: die Seite und, wenn genannt, der Anker auf ihr
  const free = { explorer: /^(block-\d+|tx-[0-9a-f]{64}|adr-ysr1[a-z0-9]+)$/ };      // Anker, die der Explorer selbst auswertet
  const bad = wanted.filter(w => w.anchor && !ids[w.page].has(w.anchor) && !(free[w.page] && free[w.page].test(w.anchor)));
  if (bad.length) stop('Verweise ohne Ziel:\n' + bad.map(b => `  ${b.from}: ${PATHS[b.page] || b.page}#${b.anchor}`).join('\n'));
  for (const p of PAGES) for (const [old, to] of Object.entries(p.legacy || {})) {
    const m = /^(\/[a-z]*)(?:#(.+))?$/.exec(to), page = m && PAGES.find(x => x.path === m[1]);
    if (!page || (m[2] && !ids[page.id].has(m[2]))) stop(`site.json: alter Anker ${p.path}#${old} zeigt auf ${to}, das es nicht gibt`);
  }

  const unused = Object.keys(en).filter(k => !used.has(k));
  return { out, unused, texts: Object.keys(en).length, scripts: jsFiles.length, state };
}

const { out, unused, texts, scripts, state } = build();
let changed = 0;
for (const [file, content] of Object.entries(out)) {
  const p = join(ROOT, file), old = existsSync(p) ? clean(readFileSync(p, 'utf8')) : null;
  if (old === content) continue;
  changed++;
  if (CHECK) { console.error('nicht aktuell: website/' + file); continue; }
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}
// Stand der Übersetzungen: fehlende Texte erscheinen englisch, veraltete in der alten Fassung
let open = 0;
for (const [l, st] of Object.entries(state)) {
  if (!st.missing.length && !st.stale.length) continue;
  open += st.missing.length + st.stale.length;
  const parts = [];
  if (st.missing.length) parts.push(`${st.missing.length} fehlen (dort steht der englische Text): ${st.missing.slice(0, 6).join(', ')}${st.missing.length > 6 ? ', …' : ''}`);
  if (st.stale.length) parts.push(`${st.stale.length} veraltet (der englische Text hat sich geändert): ${st.stale.slice(0, 6).join(', ')}${st.stale.length > 6 ? ', …' : ''}`);
  const msg = `Übersetzung ${l}: ${parts.join('; ')}`;
  console.log(process.env.GITHUB_ACTIONS ? `::warning title=Übersetzung ${l}::${msg}` : '  ' + msg);
}
if (STRICT && open) stop('Übersetzungen sind nicht vollständig (siehe oben).');
if (CHECK) {
  if (changed) stop(`${changed} Datei(en) passen nicht zu den Quellen. "node website/tools/build.mjs" ausführen und das Ergebnis mit einchecken.`);
  console.log(`ok: ${Object.keys(out).length} Dateien entsprechen den Quellen.`);
} else {
  const kb = f => (Buffer.byteLength(out[f]) / 1024).toFixed(0) + ' KB';
  console.log(`ok: ${Object.keys(out).length} Dateien (${changed} geändert), ${texts} Texte, ${scripts} Skripte; site.css ${kb('assets/site.css')}, site.js ${kb('assets/site.js')}`);
  if (unused.length && process.argv.includes('--unused')) console.log(`unbenutzte Texte (${unused.length}):\n  ` + unused.join('\n  '));
  else if (unused.length) console.log(`  ${unused.length} Texte werden nirgends benutzt (Liste mit --unused)`);
}
