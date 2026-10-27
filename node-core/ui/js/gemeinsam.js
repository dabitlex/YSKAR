/*
 * Gemeinsame Konten in der Wallet (Mehrfachsignatur, ab Konsensfassung 6).
 *
 * Ein Konto gehoert mehreren Schluesseln; ausgegeben wird nur mit genug
 * Unterschriften (k von n). Der Weg einer Ausgabe:
 *   1. Einer schlaegt sie vor -- Node Core legt die Mitzeichnungsdatei an
 *      und unterschreibt gleich mit dem eigenen Schluessel.
 *   2. Die Datei geht an die anderen (kopieren, als Datei speichern, in
 *      einer Nachricht). Jeder oeffnet sie in seiner Wallet und zeichnet mit.
 *   3. Sobald k Unterschriften drin sind, reicht irgendwer sie ein.
 * Node Core prueft jede Datei vor dem Anzeigen: Eine veraenderte faellt auf.
 */
import { hole, sende, el, fuelle, text, zeile, chip, knopf, melde, zahl, ysr, ysrGross, kurzAdresse, uhrzeit, zeichen, kopiere, vierer, tagSchluessel, tagName, dialog } from './kern.js';
import { t } from './i18n.js';

/** Datei herunterladen -- im Programm fragt das System, wohin. */
function speichereDatei(name, inhalt) {
  const url = URL.createObjectURL(new Blob([inhalt], { type: 'application/json' }));
  const a = el('a', { href: url, download: name, hidden: true });
  document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 2000);
}

/** Text aus einer gewählten Datei lesen. */
function waehleDatei() {
  return new Promise((auf, ab) => {
    const f = el('input', { type: 'file', accept: '.json,.txt,application/json,text/plain', hidden: true });
    f.addEventListener('change', async () => {
      const d = f.files?.[0]; f.remove();
      if (!d) return auf(null);
      if (d.size > 64 * 1024) return ab(new Error(t('gem.dateiGross')));
      auf(await d.text());
    });
    document.body.appendChild(f); f.click();
  });
}

const dateiName = s => 'mitzeichnung-' + (s.kontoName ?? 'konto').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-' + s.nonce + '.json';

// ---------------------------------------------------------------- Konten

/** Die Einträge in der Konto-Spalte -- nach der Aktivierung. */
export function kontenEintraege(gem, gewaehlt, waehle, anlegen) {
  return [
    ...gem.konten.map(k => el('button.wl-konto' + (gewaehlt === k.adresse ? '.an' : ''), { type: 'button', onclick: () => waehle(k.adresse) },
      el('span.wl-ic', zeichen('leute', 15)),
      el('span.mitte', el('b', k.name), el('span', t('gem.kVonN', k.k, k.n))),
      el('span.wert', ysr(k.guthaben)))),
    el('button.wl-konto', { type: 'button', style: 'border-style:dashed;color:var(--mut)', onclick: anlegen },
      el('span.wl-ic', { style: 'color:var(--mut)' }, zeichen('plus', 15)),
      el('span.mitte', el('b', t('gem.neu')), el('span', t('gem.neuUnter')))),
  ];
}

// ----------------------------------------------------------- Ansicht

/** Die Ansicht eines gemeinsamen Kontos -- an der Stelle der eigenen Wallet. */
export function baueKonto(ctx, gem, k, neuLaden) {
  const eigen = gem.eigenerSchluessel;
  const andere = k.schluessel.filter(s => s !== eigen).length;
  const zeilen = [];
  let tag = null;
  const alle = [
    ...k.wartend.map(w => ({ ...w, tag: tagSchluessel(Date.now() / 1000), zeit: Infinity, wartend: true })),
    ...k.verlauf.map(u => ({ ...u, tag: tagSchluessel(u.zeit) })),
  ];
  const art = (name, z, farbe) => el('span.art', el('i', { style: 'color:' + farbe }, zeichen(z, 12)), name);
  for (const e of alle) {
    if (e.tag !== tag) { tag = e.tag; zeilen.push(el('tr.gruppe', el('td', { colspan: 5 }, el('span.cap', tagName(tag))))); }
    const aus = e.art === 'aus';
    zeilen.push(el('tr.zeile-v', e.wartend ? null : { onclick: () => ctx.gehe('blockchain/' + e.hoehe) },
      el('td.blass', e.wartend ? t('wal.jetzt') : uhrzeit(e.zeit)),
      el('td', aus ? art(t('wal.gesendet'), 'aufwaerts', 'var(--warn)') : art(t('wal.empfangen'), 'abwaerts', 'var(--ok)')),
      el('td', e.name || kurzAdresse(e.gegen), e.notiz ? el('span.blass', ' · „' + e.notiz + '“') : null),
      el('td.r.mono' + (aus ? '' : '.gut'), (aus ? '− ' : '+ ') + ysr(e.betrag)),
      el('td', e.wartend ? chip('gelb', t('wal.wartet')) : chip('gruen', t('wal.bestaetigt')))));
  }
  return el('div.stapel', { style: 'gap:16px' },
    el('section.wl-guthaben', { 'aria-label': t('wal.guthaben') },
      el('span.cap', t('gem.kopf', k.name, k.k, k.n)),
      el('div.riesig', ysrGross(k.guthaben), el('small', ' YSR')),
      el('div.reihe', { style: 'gap:6px;flex-wrap:wrap;justify-content:center' },
        chip('blau', t('gem.du')), andere ? chip('', t('gem.weitere', andere)) : null,
        el('span.hinweis', { style: 'margin-left:4px' }, t('gem.regel', k.k, k.n))),
      el('div.wl-adr',
        el('span.umbruch', vierer(k.adresse)),
        el('button.x', { type: 'button', 'aria-label': t('wal.adresseKopieren'), title: t('wal.adresseKopieren'), onclick: () => kopiere(k.adresse) }, zeichen('kopieren', 14))),
      el('div.wl-knoepfe',
        knopf([zeichen('aufwaerts', 15), t('gem.vorschlagen')], () => vorschlagenDialog(ctx, gem, k, neuLaden), 'haupt'),
        knopf([zeichen('abwaerts', 15), t('wal.empfangen')], () => empfangenDialog(k)))),
    el('section.notiz', zeichen('info', 16),
      el('span', { style: 'flex:1' }, t('gem.mitzeichnenHinweis', k.k)),
      knopf([zeichen('ordner', 14), t('gem.dateiOeffnen')], () => mitzeichnenDialog(ctx, null, neuLaden), 'klein')),
    el('section.karte', { style: 'gap:12px' },
      el('div.karte-kopf', el('h2', t('kette.verlauf')), el('span.hinweis', t('gem.verlaufHinweis', k.k))),
      zeilen.length
        ? el('div.tab-huelle', el('table.tab.vt',
          el('thead', el('tr', el('th', t('kette.zeit')), el('th', t('wal.artSpalte')), el('th', t('wal.gegenueber')), el('th.r', t('wal.betragYsr')), el('th', t('wal.status')))),
          el('tbody', zeilen)))
        : el('p.leer', t('gem.leer'))),
    el('section.karte',
      el('h2', t('gem.schluesselTitel')),
      el('div.zeilen', k.schluessel.map((s, i) => zeile(s === eigen ? t('gem.deinSchluessel') : t('gem.schluesselNr', i + 1), el('span.mono', { style: 'font-size:11.5px' }, s)))),
      el('div.karte-kopf', el('span.hinweis', t('gem.entfernenHinweis')),
        knopf(t('gem.entfernen'), async () => {
          try { await sende('/api/gemeinsam/entfernen', { adresse: k.adresse }); melde(t('gem.entfernt')); neuLaden(null); }
          catch (e) { melde(e.message, true); }
        }, 'klein gefahr'))));
}

// ------------------------------------------------------------ Dialoge

/** Der eigene öffentliche Schlüssel -- einmal mit dem Passwort, dann gemerkt. */
function schluesselFeld(gem, wennDa) {
  const huelle = el('div.stapel', { style: 'gap:8px' });
  const zeige = hex => fuelle(huelle,
    el('div.box.mono.umbruch', { style: 'font-size:12px;line-height:1.6' }, hex),
    el('div.reihe', knopf([zeichen('kopieren', 14), t('gem.schluesselKopieren')], () => kopiere(hex), 'klein'), el('span.hinweis', t('gem.schluesselHinweis'))));
  if (gem.eigenerSchluessel) { zeige(gem.eigenerSchluessel); return huelle; }
  const pw = el('input.feld', { type: 'password', autocomplete: 'current-password', placeholder: t('wal.passwort'), 'aria-label': t('wal.passwort') });
  fuelle(huelle, el('p.hinweis', t('gem.schluesselErst')), el('div.reihe', pw, knopf(t('gem.schluesselZeigen'), async () => {
    try { const r = await sende('/api/gemeinsam/schluessel', { passwort: pw.value }); gem.eigenerSchluessel = r.schluessel; zeige(r.schluessel); wennDa?.(r.schluessel); }
    catch (e) { melde(e.message, true); }
  })));
  return huelle;
}

/** Konto anlegen oder beitreten -- beides dasselbe: gleiche Schlüssel, gleiches k, gleiche Adresse. */
export function anlegenDialog(ctx, gem, nachher) {
  const name = el('input.feld', { type: 'text', maxlength: 24, autocomplete: 'off', placeholder: t('gem.namePlatz') });
  const liste = el('textarea.feld.mono', { rows: 5, spellcheck: 'false', autocomplete: 'off', placeholder: t('gem.schluesselPlatz'), style: 'padding:10px 12px;line-height:1.6;resize:vertical;font-size:12px' });
  const k = el('select.feld.schmal');
  const zahlText = el('span.hinweis');
  const fehler = el('div.fehler', { hidden: true, role: 'alert' });
  const schluessel = () => [...new Set(liste.value.split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean))];
  const fuelleK = () => {
    const n = Math.max(2, schluessel().length);
    const alt = Number(k.value) || 2;
    fuelle(k, Array.from({ length: n }, (_, i) => el('option', { value: i + 1, selected: i + 1 === Math.min(alt, n) }, t('gem.kVon', i + 1, n))));
    text(zahlText, t('gem.nSchluessel', schluessel().length));
  };
  const setzeEigen = hex => { if (!schluessel().includes(hex)) liste.value = (hex + '\n' + liste.value).trim() + '\n'; fuelleK(); };
  liste.addEventListener('input', fuelleK);
  if (gem.eigenerSchluessel) setzeEigen(gem.eigenerSchluessel); else fuelleK();
  const d = dialog({ titel: t('gem.anlegenTitel'), unter: t('gem.anlegenUnter'), zeichenName: 'leute', breite: 640 });
  fuelle(d.inhalt,
    el('div.feldgruppe', el('span.feldname', t('gem.deinSchluessel')), schluesselFeld(gem, setzeEigen)),
    el('div.feldgruppe', el('label', t('wal.kName')), name),
    el('div.feldgruppe', el('div.karte-kopf', el('label', t('gem.alleSchluessel')), zahlText), liste, el('p.hinweis', t('gem.alleSchluesselHinweis'))),
    el('div.schaltzeile', el('span', t('gem.noetig'), el('span.hinweis', t('gem.noetigHinweis'))), k),
    fehler);
  d.fuss.zeige(el('span.hinweis', t('gem.ab6')), el('div.reihe', knopf(t('allg.abbrechen'), d.schliesse), knopf(t('gem.anlegen'), async () => {
    fehler.hidden = true;
    try {
      const r = await sende('/api/gemeinsam/anlegen', { name: name.value, k: Number(k.value), schluessel: schluessel() });
      const neu = r.konten.find(x => x.name === name.value.trim()) ?? r.konten[r.konten.length - 1];
      d.schliesse(); melde(t('gem.angelegt', kurzAdresse(neu.adresse))); nachher(neu.adresse);
    } catch (e) { fehler.textContent = e.message; fehler.hidden = false; }
  }, 'haupt')));
  setTimeout(() => name.focus(), 0);
}

function empfangenDialog(k) {
  const bild = el('div', { style: 'width:236px;height:236px;padding:8px;background:#F2F6FF;border-radius:12px' });
  const d = dialog({ titel: t('gem.empfangenTitel', k.name), zeichenName: 'abwaerts', breite: 480 });
  d.inhalt.style.alignItems = 'center'; d.inhalt.style.textAlign = 'center';
  fuelle(d.inhalt, bild,
    el('div.mono', { style: 'font-size:13px;word-spacing:4px;line-height:1.6;max-width:380px' }, vierer(k.adresse)),
    el('p.hinweis', { style: 'max-width:380px' }, t('gem.empfangenHinweis')));
  d.fuss.zeige(el('span.hinweis', t('wal.nurYsr')), knopf([zeichen('kopieren', 14), t('wal.adresseKopieren')], () => kopiere(k.adresse), 'haupt'));
  hole('/api/wallet/qr?konto=' + encodeURIComponent(k.adresse)).then(r => {
    const n = r.zeilen.length;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${n} ${n}`); svg.setAttribute('width', 220); svg.setAttribute('height', 220); svg.setAttribute('shape-rendering', 'crispEdges');
    let p = '';
    r.zeilen.forEach((z, y) => { for (let x = 0; x < n; x++) if (z[x] === '1') p += `M${x} ${y}h1v1h-1z`; });
    svg.innerHTML = `<rect width="${n}" height="${n}" fill="#F2F6FF"/><path d="${p}" fill="#03060F"/>`;
    fuelle(bild, svg);
  }).catch(e => melde(e.message, true));
}

/** Zusammenfassung einer Mitzeichnung. */
function stand(s) {
  return el('div.stapel', { style: 'gap:12px' },
    el('div.feldgruppe', el('span.cap', s.anName ? t('wal.anName', s.anName) : t('wal.anAdresse')),
      el('div.box.mono.umbruch', { style: 'font-size:14px;line-height:1.7' }, vierer(s.an))),
    el('div.zeilen',
      zeile(t('gem.vonKonto'), s.kontoName ? s.kontoName + ' · ' + kurzAdresse(s.konto) : kurzAdresse(s.konto)),
      zeile(t('kette.betrag'), ysr(s.betrag) + ' YSR', true),
      zeile(t('wal.netzgebuehr'), ysr(s.gebuehr) + ' YSR', true),
      s.notiz ? zeile(t('wal.notiz'), s.notiz) : null,
      zeile(t('gem.unterschriften'), el('span', t('gem.stand', s.unterschrieben, s.k), ' ', s.fehlen ? chip('gelb', t('gem.fehlen', s.fehlen)) : chip('gruen', t('gem.vollstaendig'))))),
    s.binBeteiligt === false ? el('div.warnung', zeichen('warnung', 16), el('span', t('gem.nichtBeteiligt'))) : null);
}

/** Die Datei weitergeben: kopieren oder speichern. */
function weitergeben(s) {
  return el('div.reihe.umbrechen', { style: 'gap:8px' },
    knopf([zeichen('kopieren', 14), t('gem.textKopieren')], () => kopiere(s.text, t('gem.textKopiert')), 'klein'),
    knopf([zeichen('laden', 14), t('gem.alsDatei')], () => speichereDatei(dateiName(s), s.text), 'klein'));
}

function vorschlagenDialog(ctx, gem, k, neuLaden) {
  const an = el('input.feld.mono', { type: 'text', spellcheck: 'false', autocomplete: 'off', placeholder: 'ysr1…' });
  const betrag = el('input.feld.mono', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0,0000' });
  const notiz = el('input.feld', { type: 'text', autocomplete: 'off' });
  const pw = el('input.feld', { type: 'password', autocomplete: 'current-password' });
  const fehler = el('div.fehler', { hidden: true, role: 'alert' });
  const d = dialog({ titel: t('gem.vorschlagenTitel'), unter: t('gem.kopf', k.name, k.k, k.n), zeichenName: 'aufwaerts', breite: 560 });
  fuelle(d.inhalt,
    el('div.feldgruppe', el('label', t('wal.empfaenger')), an),
    el('div.feldgruppe', el('label', t('kette.betrag')), el('div.mit-einheit', betrag, el('span', 'YSR')), el('p.hinweis', t('wal.verfuegbarZeile', ysr(k.verfuegbar)))),
    el('div.feldgruppe', el('label', t('wal.notiz'), ' ', el('small', '· ' + t('allg.freiwillig'))), notiz),
    el('div.feldgruppe', el('label', t('wal.passwort')), pw, el('p.hinweis', t('gem.vorschlagenPw'))),
    fehler);
  d.fuss.zeige(knopf(t('allg.abbrechen'), d.schliesse), knopf(t('gem.vorschlagenKnopf'), async () => {
    fehler.hidden = true;
    try {
      const s = await sende('/api/gemeinsam/vorschlagen', { konto: k.adresse, an: an.value, betrag: betrag.value, notiz: notiz.value, passwort: pw.value });
      pw.value = '';
      zeigeErgebnis(ctx, d, s, neuLaden);
    } catch (e) { fehler.textContent = e.message; fehler.hidden = false; }
  }, 'haupt'));
  setTimeout(() => an.focus(), 0);
}

/** Nach dem Vorschlagen oder Mitzeichnen: weitergeben oder, wenn vollständig, einreichen. */
function zeigeErgebnis(ctx, d, s, neuLaden) {
  fuelle(d.inhalt,
    el('div.reihe', el('span', { style: 'width:36px;height:36px;border-radius:10px;background:rgba(59,229,154,.12);color:var(--ok);display:inline-flex;align-items:center;justify-content:center' }, zeichen('haken', 18)),
      el('h2', s.fehlen ? t('gem.unterschriebenWeiter', s.fehlen) : t('gem.bereitEinreichen'))),
    stand(s),
    s.fehlen ? el('p.p', t('gem.weitergebenText')) : null,
    weitergeben(s));
  if (s.fehlen) d.fuss.zeige(el('span.hinweis', t('gem.weitergebenKurz')), knopf(t('allg.schliessen'), () => { d.schliesse(); neuLaden?.(s.konto); }, 'haupt'));
  else d.fuss.zeige(knopf(t('allg.schliessen'), d.schliesse), knopf([zeichen('aufwaerts', 15), t('gem.einreichen')], () => einreichen(ctx, d, s, neuLaden), 'haupt'));
}

async function einreichen(ctx, d, s, neuLaden) {
  try {
    const r = await sende('/api/gemeinsam/einreichen', { text: s.text });
    fuelle(d.inhalt,
      el('div.reihe', el('span', { style: 'width:36px;height:36px;border-radius:10px;background:rgba(59,229,154,.12);color:var(--ok);display:inline-flex;align-items:center;justify-content:center' }, zeichen('haken', 18)), el('h2', t('wal.gesendetTitel'))),
      el('p.p', t('wal.gesendetText', r.peers)),
      el('div.zeilen', zeile(t('kette.betrag'), ysr(r.betrag) + ' YSR', true), zeile('ID', el('span.mono', r.txid.slice(0, 16) + '…'))));
    d.fuss.zeige(el('span'), knopf(t('allg.schliessen'), () => { d.schliesse(); neuLaden?.(s.konto); }, 'haupt'));
    ctx.neuLaden();
  } catch (e) { melde(e.message, true); }
}

/** Eine Mitzeichnungsdatei öffnen (einfügen oder wählen), prüfen, unterschreiben, einreichen. */
export function mitzeichnenDialog(ctx, vorgabe, neuLaden) {
  const feld = el('textarea.feld.mono', { rows: 6, spellcheck: 'false', autocomplete: 'off', placeholder: t('gem.einfuegenPlatz'), style: 'padding:10px 12px;font-size:11.5px;line-height:1.5;resize:vertical' }, vorgabe ?? '');
  const fehler = el('div.fehler', { hidden: true, role: 'alert' });
  const d = dialog({ titel: t('gem.mitzeichnenTitel'), unter: t('gem.mitzeichnenUnter'), zeichenName: 'schild', breite: 600 });
  const pruefe = async () => {
    fehler.hidden = true;
    try { zeigeGelesen(await sende('/api/gemeinsam/lesen', { text: feld.value })); }
    catch (e) { fehler.textContent = e.message; fehler.hidden = false; }
  };
  function zeigeGelesen(s) {
    const pw = el('input.feld', { type: 'password', autocomplete: 'current-password', 'aria-label': t('wal.passwort') });
    const kannUnterschreiben = s.fehlen > 0 && !s.vonMir && s.binBeteiligt !== false;
    fuelle(d.inhalt, stand(s),
      s.vonMir ? el('p.hinweis.gut', t('gem.schonUnterschrieben')) : null,
      kannUnterschreiben ? el('div.feldgruppe', el('label', t('wal.passwort')), pw, el('p.hinweis', t('gem.unterschreibenHinweis'))) : null,
      fehler);
    if (kannUnterschreiben) {
      d.fuss.zeige(knopf(t('allg.zurueck'), start), knopf(t('gem.unterschreiben'), async () => {
        fehler.hidden = true;
        try { const neu = await sende('/api/gemeinsam/mitzeichnen', { text: s.text, passwort: pw.value }); zeigeErgebnis(ctx, d, neu, neuLaden); }
        catch (e) { fehler.textContent = e.message; fehler.hidden = false; }
      }, 'haupt'));
      setTimeout(() => pw.focus(), 0);
    } else if (s.fehlen === 0) {
      d.fuss.zeige(knopf(t('allg.zurueck'), start), knopf([zeichen('aufwaerts', 15), t('gem.einreichen')], () => einreichen(ctx, d, s, neuLaden), 'haupt'));
    } else {
      d.fuss.zeige(weitergeben(s), knopf(t('allg.schliessen'), d.schliesse, 'haupt'));
    }
  }
  function start() {
    fehler.hidden = true;
    fuelle(d.inhalt, el('p.p', t('gem.einfuegenText')), feld,
      el('div.reihe', knopf([zeichen('ordner', 14), t('gem.dateiWaehlen')], async () => {
        try { const txt = await waehleDatei(); if (txt !== null) { feld.value = txt; pruefe(); } } catch (e) { melde(e.message, true); }
      }, 'klein')), fehler);
    d.fuss.zeige(knopf(t('allg.abbrechen'), d.schliesse), knopf(t('gem.pruefen'), pruefe, 'haupt'));
  }
  start();
  if (vorgabe) pruefe();
}
