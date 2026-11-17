/*
 * Sammelzahlung: eine Überweisung an viele Empfänger (Fassung 6).
 *
 * Fenster in drei Schritten -- Liste, Prüfen, Gesendet. Die Liste wird
 * eingefügt, aus einer CSV-Datei geladen oder aus den Kontakten gewählt;
 * gelesen und geprüft wird sie vom Knoten (Sammelzahlung.ts), nicht hier.
 *
 * Eine Sammelzahlung gilt ganz oder gar nicht. Darum repariert das Fenster
 * nichts von selbst: Jede Zeile nennt ihren Stand, und solange eine Zeile
 * offen ist, bleibt „Prüfen“ gesperrt. Eine Angabe wie „1.500“ wird gefragt,
 * nie angenommen.
 */
import { hole, sende, el, fuelle, text, zeile, chip, knopf, melde, zahl, ysr, zeichen, kopiere, segment, vierer, kurzAdresse, dialog } from './kern.js';
import { t, sprache } from './i18n.js';

const NOTIZ_MAX = 32;
const DATEI_MAX = 512 * 1024;
const bytes = s => new TextEncoder().encode(s).length;
const EINHEIT = 100000000n;

/** Datei zum Speichern anbieten. */
function speichereDatei(name, inhalt) {
  const url = URL.createObjectURL(new Blob(['﻿' + inhalt], { type: 'text/csv;charset=utf-8' }));
  const a = el('a', { href: url, download: name, hidden: true });
  document.body.appendChild(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 2000);
}

/** Text aus einer gewählten Datei lesen. */
function waehleDatei() {
  return new Promise((auf, ab) => {
    const f = el('input', { type: 'file', accept: '.csv,.txt,.tsv,text/csv,text/plain', hidden: true });
    f.addEventListener('change', async () => {
      const d = f.files?.[0]; f.remove();
      if (!d) return auf(null);
      if (d.size > DATEI_MAX) return ab(new Error(t('sam.dateiGross')));
      auf(await d.text());
    });
    document.body.appendChild(f); f.click();
  });
}

/** Betrag für den Beleg: ohne Tausenderzeichen, immer acht Stellen -- eindeutig beim Wiedereinlesen. */
function belegBetrag(einheiten, komma) {
  const v = BigInt(einheiten);
  return (v / EINHEIT).toString() + komma + (v % EINHEIT).toString().padStart(8, '0');
}

/**
 * Beleg als CSV: Kopf mit ID, Zeit und Summen, darunter jede Adresse mit
 * ihrem Betrag. Namen der Kontakte stehen nicht darin -- der Beleg lässt sich
 * so an Empfänger weitergeben.
 */
function belegText(r, empfaenger) {
  const en = sprache() === 'en';
  const tr = en ? ',' : ';', komma = en ? '.' : ',';
  // In Anführungszeichen nur, was das Trennzeichen, ein Anführungszeichen oder einen Umbruch enthält.
  const f = s => (String(s).includes(tr) || /["\r\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));
  const z = (...felder) => felder.map(f).join(tr);
  return [
    z(t('sam.belegTitel')),
    z('ID', r.txid),
    z(t('sam.belegZeit'), new Date(r.zeit * 1000).toISOString()),
    z(t('sam.belegVon'), r.von),
    z(t('sam.kzEmpfaenger'), r.anzahl),
    z(t('sam.belegSumme'), belegBetrag(r.summe, komma)),
    z(t('sam.belegGebuehr'), belegBetrag(r.gebuehr, komma)),
    z(t('wal.notiz'), r.notiz ?? ''),
    '',
    z(t('sam.sNr'), t('kette.adresse'), t('wal.betragYsr')),
    ...empfaenger.map((e, i) => z(i + 1, e.adresse, belegBetrag(e.betrag, komma))),
    '',
  ].join('\r\n');
}

/**
 * Das Fenster. `danach` läuft nach dem Senden (Wallet neu laden).
 */
export function sammelDialog(ctx, danach = null) {
  /** Die Liste, wie sie der Nutzer sieht: { adresse, betrag (Text), einheiten? (sobald eindeutig) }. */
  let zeilen = [];
  let stand = null;            // letzte Antwort von /sammel/liste
  let art = 'einzeln';         // einzeln | gleich
  let gleichEinheiten = null;  // gewählte Lesart, wenn der gemeinsame Betrag uneindeutig war
  let bearbeite = null;        // { i, feld: 'adresse' | 'betrag' }
  let schritt = 1, lauf = 0, stufe = 'normal', pruefung = null, kontakte = [], unter = null;

  const d = dialog({ titel: t('sam.titel'), zeichenName: 'leute', breite: 960 }, () => {
    document.removeEventListener('paste', einfuegen);
    document.removeEventListener('keydown', haltEsc, true);
    document.removeEventListener('mouseup', nachMaus, true);
  });

  // Während die Maustaste unten ist, wird die Liste nicht neu gebaut: Sonst
  // verschwände der Knopf, auf den gerade geklickt wird, unter dem Zeiger.
  let mausUnten = false, zeigeWartet = false;
  d.box.addEventListener('mousedown', () => { mausUnten = true; }, true);
  function nachMaus() {
    mausUnten = false;
    if (zeigeWartet) { zeigeWartet = false; setTimeout(zeige, 0); }
  }
  document.addEventListener('mouseup', nachMaus, true);
  const schritte = el('div', { style: 'display:flex;gap:8px;align-items:center;font-size:12px;color:var(--mut);margin-top:3px' });
  d.box.querySelector('.titel>div').appendChild(schritte);

  // Bleibende Teile von Schritt 1 -- sie werden nie neu gebaut, damit beim Tippen nichts springt.
  const artWahl = segment(t('sam.artWahl'), [['einzeln', t('sam.einzeln')], ['gleich', t('sam.gleich')]], art, a => {
    art = a; gleichEinheiten = null; bearbeite = null; pruefeListe();
  });
  const kopfRechts = el('div.reihe');
  const gleichFeld = el('input.feld.mono', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0,0000', 'aria-label': t('sam.gleichBetrag') });
  const gleichHinweis = el('p.hinweis');
  const gleichGruppe = el('div.feldgruppe', { hidden: true },
    el('label', t('sam.gleichBetrag')), el('div.mit-einheit', { style: 'max-width:280px' }, gleichFeld, el('span', 'YSR')), gleichHinweis);
  const meldungen = el('div.stapel', { hidden: true });
  const mitte = el('div.stapel');
  const kz = el('div.m-kz', { hidden: true });
  const notiz = el('input.feld', { type: 'text', autocomplete: 'off', id: 'sz-notiz' });
  const notizZahl = el('p.hinweis');
  const notizGruppe = el('div.feldgruppe', { hidden: true },
    el('label', { for: 'sz-notiz' }, t('wal.notiz'), ' ', el('small', '· ' + t('allg.freiwillig'))), notiz, notizZahl);
  const fehler = el('div.fehler', { hidden: true, role: 'alert' });
  const fussLinks = el('span.sz-fuss-links');
  const weiter = knopf(t('wal.pruefen'), () => pruefe(), 'haupt');

  const zeigeFehler = e => { fehler.textContent = e.message; fehler.hidden = false; };
  const notizZuLang = () => bytes(notiz.value.trim()) > NOTIZ_MAX;
  const zeigeNotiz = () => {
    const n = bytes(notiz.value.trim());
    notizZahl.className = 'hinweis' + (n > NOTIZ_MAX ? ' schlecht' : '');
    text(notizZahl, t('sam.notizHinweis', n));
  };
  notiz.addEventListener('input', () => { zeigeNotiz(); zeigeFuss(); });
  zeigeNotiz();

  let gleichTakt = null;
  gleichFeld.addEventListener('input', () => {
    gleichEinheiten = null;
    clearTimeout(gleichTakt); gleichTakt = setTimeout(pruefeListe, 250);
  });

  function zeigeSchritte() {
    if (schritt === 3) { fuelle(schritte, el('span', { style: 'color:var(--ok)' }, t('wal.sGesendet'))); return; }
    const teil = (nr, name) => el('span', { style: nr === schritt ? 'color:var(--fg);font-weight:500' : nr < schritt ? 'color:var(--ok)' : '' }, nr + ' ' + name);
    fuelle(schritte, teil(1, t('sam.sEmpfaenger')), el('span', { style: 'color:var(--faint)' }, '›'), teil(2, t('wal.sPruefen')));
  }

  // ------------------------------------------------------------ Liste halten

  /** Was an den Knoten geht: Zeilen mit dem Betrag, der gilt. */
  const rumpf = () => ({
    zeilen: zeilen.map(z => (art === 'gleich' ? { adresse: z.adresse }
      : z.einheiten ? { adresse: z.adresse, einheiten: z.einheiten } : { adresse: z.adresse, betrag: z.betrag ?? '' })),
    ...(art === 'gleich' ? { gleich: gleichEinheiten ? { einheiten: gleichEinheiten } : { betrag: gleichFeld.value.trim() } } : {}),
  });

  /** Die Liste vom Knoten prüfen lassen; `neuerText` wird dabei eingelesen und angehängt. */
  async function pruefeListe(neuerText = null) {
    const nr = ++lauf;
    fehler.hidden = true;
    try {
      const r = await sende('/api/wallet/sammel/liste', { ...rumpf(), ...(neuerText ? { text: neuerText } : {}) });
      if (nr !== lauf) return;
      const vorher = zeilen.length;
      for (const z of r.zeilen.slice(vorher)) zeilen.push({ adresse: z.adresse, betrag: z.betrag });
      // Ein Betrag, den der Knoten eindeutig lesen konnte, gilt ab jetzt in Einheiten.
      if (art === 'einzeln') r.zeilen.forEach((z, i) => { if (z.einheiten && !zeilen[i].einheiten) zeilen[i].einheiten = z.einheiten; });
      stand = r;
      if (neuerText) {
        const dazu = r.zeilen.length - vorher;
        if (r.abgeschnitten) melde(t('sam.abgeschnitten', zahl(r.zeilen.length)), true);
        else if (dazu === 0) melde(t('sam.nichtsGelesen'), true);
        else melde(t('sam.eingelesen', dazu));
      }
      if (schritt === 1) zeige();
    } catch (e) { if (nr === lauf) zeigeFehler(e); }
  }

  function leere() {
    zeilen = []; stand = null; bearbeite = null; gleichEinheiten = null; gleichFeld.value = ''; notiz.value = ''; zeigeNotiz();
    art = 'einzeln'; artWahl.setze(art);
    zeige(); pruefeListe();
  }

  // --------------------------------------------------------------- Einlesen

  const einlesen = textNeu => {
    if (!textNeu || !textNeu.trim()) { melde(t('sam.nichtsGelesen'), true); return; }
    if (textNeu.length > DATEI_MAX) { melde(t('sam.dateiGross'), true); return; }
    pruefeListe(textNeu);
  };

  /** Strg V irgendwo im Fenster -- nur nicht, während in einem Feld getippt wird. */
  function einfuegen(e) {
    if (schritt !== 1 || unter || !document.body.contains(d.wurzel)) return;
    const ziel = e.target;
    if (ziel instanceof HTMLInputElement || ziel instanceof HTMLTextAreaElement) return;
    const inhalt = e.clipboardData?.getData('text/plain') ?? '';
    if (!inhalt.trim()) return;
    e.preventDefault(); einlesen(inhalt);
  }
  document.addEventListener('paste', einfuegen);

  async function ausZwischenablage() {
    let inhalt = '';
    try { inhalt = await navigator.clipboard.readText(); }
    catch { melde(t('sam.zwischenablageNein'), true); return; }
    einlesen(inhalt);
  }

  async function ausDatei() {
    try { const inhalt = await waehleDatei(); if (inhalt !== null) einlesen(inhalt); }
    catch (e) { melde(e.message, true); }
  }

  d.inhalt.addEventListener('dragover', e => { if (schritt === 1) e.preventDefault(); });
  d.inhalt.addEventListener('drop', async e => {
    if (schritt !== 1) return;
    e.preventDefault();
    const datei = e.dataTransfer?.files?.[0];
    if (!datei) { einlesen(e.dataTransfer?.getData('text/plain') ?? ''); return; }
    if (datei.size > DATEI_MAX) { melde(t('sam.dateiGross'), true); return; }
    einlesen(await datei.text());
  });

  function ausKontakten() {
    if (!kontakte.length) { melde(t('wal.keineKontakte'), true); return; }
    const schon = new Set(zeilen.map(z => z.adresse));
    const haken = kontakte.map(k => el('input', { type: 'checkbox', value: k.adresse, disabled: schon.has(k.adresse), checked: schon.has(k.adresse) }));
    const u = dialog({ titel: t('sam.kontakteTitel'), unter: t('sam.kontakteUnter'), zeichenName: 'leute', breite: 460, oben: true }, () => { unter = null; });
    unter = u;
    fuelle(u.inhalt, el('div.sz-wahl', kontakte.map((k, i) => el('label', haken[i],
      el('span.mitte', el('b', k.name), el('span.mono', kurzAdresse(k.adresse))),
      schon.has(k.adresse) ? chip('', t('sam.inListe')) : null))));
    u.fuss.zeige(knopf(t('allg.abbrechen'), u.schliesse), knopf(t('sam.kontakteHinzu'), () => {
      const neu = haken.filter(h => h.checked && !h.disabled).map(h => h.value);
      u.schliesse();
      if (!neu.length) return;
      for (const adresse of neu) zeilen.push({ adresse, betrag: '' });
      pruefeListe();
    }, 'haupt'));
  }

  /**
   * Mit einer Liste im Fenster schließen Esc und ein Klick daneben nicht:
   * Sonst wäre die Arbeit mit einem Tastendruck weg. Das X und „Abbrechen“ bleiben.
   */
  const haelt = () => schritt < 3 && zeilen.length > 0;
  function haltEsc(e) {
    if (e.key !== 'Escape' || !document.body.contains(d.wurzel)) return;
    if (unter) { e.stopImmediatePropagation(); unter.schliesse(); return; }
    if (haelt()) e.stopImmediatePropagation();
  }
  document.addEventListener('keydown', haltEsc, true);
  d.wurzel.addEventListener('mousedown', e => { if (e.target === d.wurzel && haelt()) e.stopImmediatePropagation(); }, true);

  // ------------------------------------------------------- Schritt 1: Liste

  /** Feld, das eine Zelle der Tabelle bearbeitet. */
  function zellenFeld(i, feld) {
    const z = zeilen[i];
    const start = feld === 'adresse' ? z.adresse : (z.einheiten ? ysr(z.einheiten, 0) : (z.betrag ?? ''));
    const f = el('input.feld' + (feld === 'adresse' ? '.mono.sz-adr' : '.mono.sz-betrag'), {
      type: 'text', spellcheck: 'false', autocomplete: 'off', value: start,
      'aria-label': feld === 'adresse' ? t('sam.adresseZeile', i + 1) : t('sam.betragZeile', i + 1),
      ...(feld === 'betrag' ? { inputmode: 'decimal' } : { placeholder: 'ysr1…' }),
    });
    let fertig = false;
    const nimm = uebernehmen => {
      if (fertig) return; fertig = true;
      bearbeite = null;
      const wert = f.value.trim();
      if (!uebernehmen || wert === start) { zeige(); return; }
      if (feld === 'adresse') z.adresse = wert.toLowerCase();
      else { z.betrag = wert; delete z.einheiten; }
      pruefeListe();
    };
    f.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); nimm(true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); nimm(false); }
    });
    f.addEventListener('blur', () => nimm(true));
    setTimeout(() => { f.focus(); f.select(); }, 0);
    return f;
  }

  const tu = (name, klick) => el('a', { href: '#', onclick: e => { e.preventDefault(); klick(); } }, name);
  const aendere = (i, feld) => { bearbeite = { i, feld }; zeige(); };
  const entferne = i => { zeilen.splice(i, 1); bearbeite = null; pruefeListe(); };

  /** Chip und Handgriffe zum Stand einer Zeile. */
  function standZelle(z, i) {
    const tun = (...k) => el('span.tun', k);
    // Gleicher Betrag für alle: Was am Betrag fehlt, wird oben am Feld geklärt, nicht je Zeile.
    if (art === 'gleich' && z.stand.startsWith('betrag_')) return [chip('', t('sam.wartetBetrag'))];
    switch (z.stand) {
      case 'bereit': return [chip('gruen', t('sam.bereit'))];
      case 'adresse_falsch': {
        const sieht = /^ysr1[0-9a-z]{30,}$/.test(z.adresse);
        return [chip('rot', z.adresse === '' ? t('sam.adresseFehlt') : sieht ? t('sam.pruefsumme') : t('sam.keineAdresse')),
          tun(tu(t('sam.adresseBearbeiten'), () => aendere(i, 'adresse')))];
      }
      case 'eigene': return [chip('rot', t('sam.eigene')), tun(tu(t('sam.entfernen'), () => entferne(i)))];
      case 'betrag_fehlt': return [chip('gelb', t('sam.betragFehlt')), tun(tu(t('sam.betragEintragen'), () => aendere(i, 'betrag')))];
      case 'betrag_falsch': return [chip('rot', t('sam.betragFalsch')), tun(tu(t('sam.betragBearbeiten'), () => aendere(i, 'betrag')))];
      case 'betrag_staub': return [chip('rot', t('sam.betragStaub')), tun(tu(t('sam.betragBearbeiten'), () => aendere(i, 'betrag')))];
      case 'betrag_unklar': return [chip('gelb', t('sam.betragUnklar')), tun(
        ...(z.deutungen ?? []).map(e => tu(ysr(e) + ' YSR', () => { zeilen[i].einheiten = e; pruefeListe(); })))];
      case 'doppelt': {
        const j = (z.doppeltVon ?? 0) - 1;
        const zusammen = art === 'einzeln' && zeilen[j]?.einheiten && zeilen[i]?.einheiten;
        return [chip('gelb', t('sam.doppelt', z.doppeltVon)), tun(
          zusammen ? tu(t('sam.zusammen'), () => {
            if (!zeilen[j]?.einheiten || !zeilen[i]?.einheiten) return;
            zeilen[j].einheiten = (BigInt(zeilen[j].einheiten) + BigInt(zeilen[i].einheiten)).toString();
            entferne(i);
          }) : null,
          tu(t('sam.entfernen'), () => entferne(i)))];
      }
      default: return [chip('', z.stand)];
    }
  }

  function tabellenZeile(z) {
    const i = z.nr - 1, eigen = zeilen[i];
    const klasse = z.stand === 'bereit' || (art === 'gleich' && z.stand.startsWith('betrag_')) ? '' : (z.stand === 'adresse_falsch' || z.stand === 'eigene' || z.stand === 'betrag_falsch' || z.stand === 'betrag_staub') ? '.schlecht' : '.fraglich';
    const fremd = z.stand !== 'adresse_falsch' && z.stand !== 'eigene';
    const betragText = art === 'gleich'
      ? (z.einheiten ? ysr(z.einheiten) : '—')
      : (eigen.einheiten ? ysr(eigen.einheiten) : (eigen.betrag || '—'));
    return el('tr' + klasse,
      el('td.blass.mono', String(z.nr)),
      el('td', !fremd ? el('span.blass', '—') : z.name ? z.name : el('span.blass', z.neu ? t('sam.neueAdresse') : t('sam.bekannt'))),
      bearbeite?.i === i && bearbeite.feld === 'adresse'
        ? el('td', zellenFeld(i, 'adresse'))
        : el('td.adr.klick', { title: t('sam.adresseBearbeiten'), onclick: () => aendere(i, 'adresse') }, z.adresse ? vierer(z.adresse) : '—'),
      art === 'einzeln' && bearbeite?.i === i && bearbeite.feld === 'betrag'
        ? el('td.r', zellenFeld(i, 'betrag'))
        : el('td.r.mono' + (art === 'einzeln' ? '.klick' : ''), art === 'einzeln' ? { title: t('sam.betragBearbeiten'), onclick: () => aendere(i, 'betrag') } : {}, betragText),
      el('td', standZelle(z, i)),
      el('td.r', el('button.x', { type: 'button', 'aria-label': t('sam.zeileEntfernen', z.nr), title: t('sam.zeileEntfernen', z.nr), onclick: () => entferne(i) }, zeichen('kreuz', 13))));
  }

  function zeigeFuss() {
    const r = stand, n = zeilen.length;
    const gleichOffen = art === 'gleich' && r?.gleichStand;
    const zuWenig = !!r && BigInt(r.summe) > BigInt(r.verfuegbar);
    if (!n) fuelle(fussLinks, r ? t('wal.verfuegbarZeile', ysr(r.verfuegbar)) : '');
    else if (r?.zuViele) fuelle(fussLinks, el('span', { style: 'color:var(--risk);display:inline-flex' }, zeichen('warnung', 14)), t('sam.fussZuViele', zahl(r.hoechstens)));
    else if (gleichOffen) fuelle(fussLinks, el('span', { style: 'color:var(--warn);display:inline-flex' }, zeichen('warnung', 14)), t('sam.fussGleich'));
    else if (r && r.offen > 0) fuelle(fussLinks, el('span', { style: 'color:var(--warn);display:inline-flex' }, zeichen('warnung', 14)), t('sam.fussOffen', r.offen));
    else if (zuWenig) fuelle(fussLinks, el('span', { style: 'color:var(--risk);display:inline-flex' }, zeichen('warnung', 14)), t('sam.reichtNichtTitel'));
    else if (notizZuLang()) fuelle(fussLinks, el('span', { style: 'color:var(--risk);display:inline-flex' }, zeichen('warnung', 14)), t('sam.fussNotiz'));
    else fuelle(fussLinks, r ? t('sam.fussBereit', r.bereit) : '');
    weiter.disabled = !(r && n > 0 && r.offen === 0 && !r.zuViele && !gleichOffen && !zuWenig && !notizZuLang() && r.zeilen.length === n);
  }

  function zeige() {
    if (schritt !== 1) return;
    if (mausUnten) { zeigeWartet = true; return; }
    const r = stand, n = zeilen.length;
    gleichGruppe.hidden = !(n && art === 'gleich');
    kz.hidden = notizGruppe.hidden = !n;

    if (!n) {
      fuelle(kopfRechts, el('span.hinweis', t('sam.hoechstens', zahl(r?.hoechstens ?? 1000))));
      meldungen.hidden = true;
      fuelle(mitte,
        el('div.sz-zone',
          el('span.rund', zeichen('liste', 24)), el('h3', t('sam.zoneTitel')), el('p', t('sam.zoneText')),
          el('div.reihe.umbrechen', { style: 'justify-content:center;margin-top:4px' },
            knopf([zeichen('kopieren', 15), t('sam.zwischenablage')], ausZwischenablage, 'haupt'),
            knopf([zeichen('ordner', 15), t('sam.csvLaden')], ausDatei),
            knopf([zeichen('leute', 15), t('sam.ausKontakten')], ausKontakten))),
        el('div.feldgruppe', el('span.feldname', t('sam.beispielTitel')),
          el('pre.protokoll', 'ysr1…, 1500\nysr1…; 1200,5\nysr1…\t800'),
          el('p.hinweis', t('sam.beispielText'))));
      zeigeFuss();
      return;
    }

    fuelle(kopfRechts,
      knopf([zeichen('plus', 14), t('sam.zeile')], () => { zeilen.push({ adresse: '', betrag: '' }); bearbeite = { i: zeilen.length - 1, feld: 'adresse' }; pruefeListe(); }, 'klein'),
      knopf([zeichen('leute', 14), t('sam.kontakteKurz')], ausKontakten, 'klein'),
      knopf(t('sam.leeren'), leere, 'klein ruhig'));

    // Gemeinsamer Betrag: was mit ihm nicht stimmt, steht am Feld.
    if (art === 'gleich') {
      const g = r?.gleichStand;
      gleichHinweis.className = 'hinweis' + (g && g !== 'betrag_fehlt' ? ' schlecht' : '');
      if (g === 'betrag_unklar' && r.gleichDeutungen) {
        fuelle(gleichHinweis, t('sam.gleichUnklar'), ' ',
          ...r.gleichDeutungen.flatMap((e, k) => [k ? ' · ' : '', tu(ysr(e) + ' YSR', () => { gleichEinheiten = e; gleichFeld.value = ysr(e, 0); pruefeListe(); })]));
      } else {
        text(gleichHinweis, g === 'betrag_falsch' ? t('sam.betragFalsch') : g === 'betrag_staub' ? t('sam.betragStaub') : t('sam.gleichHinweis'));
      }
    }

    const hinweise = [];
    if (r?.zuViele) hinweise.push(el('div.fehler', { role: 'alert' }, el('strong', t('sam.zuVieleTitel', zahl(n))), ' ', t('sam.zuVieleText', zahl(r.hoechstens))));
    // Offen sind hier nur Zeilen, die selbst eine Korrektur brauchen -- nicht die, denen bloß der gemeinsame Betrag fehlt.
    const zuKorrigieren = !r ? 0 : art === 'gleich' ? r.zeilen.filter(z => z.stand !== 'bereit' && !z.stand.startsWith('betrag_')).length : r.offen;
    if (zuKorrigieren > 0) hinweise.push(el('div.warnung', zeichen('warnung', 16), el('span', el('strong', t('sam.offenTitel', zuKorrigieren)), ' ', t('sam.offenText', zuKorrigieren))));
    if (r && BigInt(r.summe) > BigInt(r.verfuegbar)) hinweise.push(el('div.warnung', zeichen('warnung', 16), el('span', el('strong', t('sam.reichtNichtTitel')), ' ', t('sam.reichtNichtText'))));
    meldungen.hidden = !hinweise.length;
    fuelle(meldungen, hinweise);

    // Offene Zeilen zuerst, sonst die Reihenfolge der Liste.
    const gepr = r?.zeilen.length === n ? r.zeilen : [];
    const braucht = z => z.stand !== 'bereit' && !(art === 'gleich' && z.stand.startsWith('betrag_'));
    const sortiert = [...gepr.filter(braucht), ...gepr.filter(z => !braucht(z))];
    fuelle(mitte,
      el('div.karte-kopf', el('span.feldname', t('sam.listeTitel')), el('span.hinweis', t('sam.zeilenZahl', n))),
      el('div.sz-liste', el('table.tab',
        el('thead', el('tr', el('th', t('sam.sNr')), el('th', t('sam.sEmpfaenger')), el('th', t('kette.adresse')), el('th.r', t('wal.betragYsr')), el('th', t('sam.sStand')),
          el('th.r', el('span.nur-leser', t('sam.entfernen'))))),
        el('tbody', sortiert.map(tabellenZeile)))));

    if (r) {
      const zuWenig = BigInt(r.summe) > BigInt(r.verfuegbar);
      fuelle(kz,
        el('div', el('span', t('sam.kzEmpfaenger')), el('b', zahl(n), ' ', el('small', t('sam.kzZeilen', n))), el('span', t('sam.kzBereitOffen', r.bereit, r.offen))),
        el('div', el('span', r.offen ? t('sam.kzSummeBereit') : t('sam.kzSumme')), el('b', ysr(r.summe), ' ', el('small', 'YSR')), el('span', r.offen ? t('sam.kzOhneOffene', r.offen) : t('sam.kzAlle'))),
        el('div', el('span', t('sam.kzVerfuegbar')), el('b', ysr(r.verfuegbar), ' ', el('small', 'YSR')), el('span', zuWenig ? { style: 'color:var(--risk)' } : {}, zuWenig ? t('sam.kzReichtNicht') : t('sam.kzMeine'))));
    }
    zeigeFuss();
  }

  function s1() {
    schritt = 1; zeigeSchritte(); fehler.hidden = true;
    fuelle(d.inhalt, el('div.karte-kopf', artWahl, kopfRechts), gleichGruppe, meldungen, mitte, kz, notizGruppe, fehler);
    d.fuss.zeige(fussLinks, el('div.reihe', knopf(t('allg.abbrechen'), d.schliesse), weiter));
    zeige();
  }

  // ------------------------------------------------------ Schritt 2: Prüfen

  const sendeRumpf = () => ({ ...rumpf(), notiz: notiz.value.trim(), stufe });

  async function pruefe() {
    fehler.hidden = true; weiter.disabled = true;
    try { pruefung = await sende('/api/wallet/sammel/pruefen', sendeRumpf()); s2(); }
    catch (e) { zeigeFehler(e); zeigeFuss(); }
  }

  function s2() {
    const v = pruefung;
    schritt = 2; zeigeSchritte(); fehler.hidden = true;
    const pw = el('input.feld', { type: 'password', autocomplete: 'current-password', id: 'sz-pw' });
    const los = knopf([zeichen('aufwaerts', 15), t('sam.senden', ysr(v.summe, 0), v.anzahl)], () => senden(), 'haupt');
    const stufenWahl = segment(t('wal.tempo'), [['langsam', t('wal.langsam')], ['normal', t('wal.normal')], ['schnell', t('wal.schnell')]], stufe, async s => {
      stufe = s;
      try { pruefung = await sende('/api/wallet/sammel/pruefen', sendeRumpf()); s2(); } catch (e) { zeigeFehler(e); }
    }, true);
    const senden = async () => {
      fehler.hidden = true; los.disabled = true;
      try {
        const r = await sende('/api/wallet/sammel/senden', { ...sendeRumpf(), summe: v.summe, anzahl: v.anzahl, gebuehr: v.gebuehr, passwort: pw.value });
        pw.value = '';
        gesendet(r, v);
      } catch (err) {
        los.disabled = false;
        if (err.code === 'gebuehr_gestiegen') {
          pw.value = ''; melde(err.message, true);
          try { pruefung = await sende('/api/wallet/sammel/pruefen', sendeRumpf()); s2(); } catch (e) { zeigeFehler(e); }
          return;
        }
        zeigeFehler(err); pw.select();
      }
    };
    pw.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); senden(); } });
    const artChip = e => (e.name ? chip('', t('sam.kontakt')) : e.neu ? chip('blau', t('sam.neu')) : chip('', t('sam.bekanntKurz')));
    fuelle(d.inhalt,
      el('div.m-kz',
        el('div', el('span', t('sam.kzEmpfaenger')), el('b', zahl(v.anzahl)), el('span', t('sam.kzKontakteNeue', v.kontakte, v.neue))),
        el('div', el('span', t('sam.kzSumme')), el('b', ysr(v.summe), ' ', el('small', 'YSR')), el('span', t('sam.kzAlleBetraege'))),
        el('div', el('span', t('wal.netzgebuehr')), el('b', ysr(v.gebuehr), ' ', el('small', 'YSR')),
          el('span', t('sam.einmal') + ' · ' + (v.zielBlock <= 1 ? t('wal.naechsterBlock') : t('wal.inBloecken', v.zielBlock))))),
      v.neue > 0 ? el('div.warnung', zeichen('warnung', 16), el('span', el('strong', t('sam.neueTitel', v.neue)), ' ', t('sam.neueText'))) : null,
      el('div.karte-kopf', el('span.feldname', t('sam.sEmpfaenger')), el('span.hinweis', t('sam.empfaengerZahl', v.anzahl))),
      el('div.sz-liste.kurz', el('table.tab',
        el('thead', el('tr', el('th', t('sam.sNr')), el('th', t('sam.sEmpfaenger')), el('th', t('kette.adresse')), el('th.r', t('wal.betragYsr')), el('th', t('sam.sArt')))),
        el('tbody', v.empfaenger.map((e, i) => el('tr',
          el('td.blass.mono', String(i + 1)),
          el('td', e.name ? e.name : el('span.blass', e.neu ? t('sam.neueAdresse') : t('sam.bekannt'))),
          el('td.adr', vierer(e.adresse)),
          el('td.r.mono', ysr(e.betrag)),
          el('td', artChip(e))))))),
      v.andrang ? el('div.feldgruppe', el('span.feldname', t('wal.tempo')), stufenWahl, el('p.hinweis', t('wal.tempoHinweis'))) : null,
      el('div.zeilen',
        v.notiz ? zeile(t('wal.notiz'), el('span', '„' + v.notiz + '“ ', el('span.blass', '· ' + t('sam.notizOeffentlich')))) : null,
        el('div.zeile', { style: 'font-weight:600' }, el('span', { style: 'color:var(--fg)' }, t('wal.gesamt')), el('span.mono', ysr(v.gesamt) + ' YSR')),
        zeile(t('wal.danach'), ysr(v.danach) + ' YSR', true)),
      el('div.feldgruppe', el('label', { for: 'sz-pw' }, t('wal.passwort')), pw),
      fehler,
      el('p.hinweis', t('sam.endgueltig')));
    d.fuss.zeige(knopf(t('allg.zurueck'), s1), los);
    setTimeout(() => pw.focus(), 0);
  }

  // --------------------------------------------------------------- Gesendet

  function gesendet(r, v) {
    schritt = 3; zeigeSchritte();
    d.box.style.width = '600px';
    fuelle(d.inhalt,
      el('div.reihe', el('span', { style: 'width:40px;height:40px;border-radius:12px;background:rgba(59,229,154,.12);color:var(--ok);display:inline-flex;align-items:center;justify-content:center' }, zeichen('haken', 20)),
        el('h2', t('wal.gesendetTitel'))),
      el('p.p', t('sam.gesendetText', r.peers, r.anzahl)),
      el('div.zeilen',
        zeile(t('sam.kzEmpfaenger'), zahl(r.anzahl)),
        zeile(t('sam.kzSumme'), ysr(r.summe) + ' YSR', true),
        zeile(t('wal.netzgebuehr'), ysr(r.gebuehr) + ' YSR', true),
        r.notiz ? zeile(t('wal.notiz'), '„' + r.notiz + '“') : null,
        zeile('ID', el('button', { type: 'button', class: 'mono', style: 'background:none;border:0;color:var(--acc2);cursor:pointer;padding:0;font-size:12.5px', onclick: () => kopiere(r.txid) }, r.txid.slice(0, 16) + '…'))),
      el('div.notiz', zeichen('info', 18), el('span', t('sam.belegHinweis'))));
    d.fuss.zeige(
      knopf([zeichen('laden', 15), t('sam.belegSpeichern')], () => speichereDatei('yskar-sammelzahlung-' + r.txid.slice(0, 12) + '.csv', belegText(r, v.empfaenger))),
      el('div.reihe',
        knopf(t('sam.weitere'), () => { d.box.style.width = '960px'; leere(); s1(); }),
        knopf(t('allg.schliessen'), d.schliesse, 'haupt')));
    ctx.neuLaden(); danach?.();
  }

  hole('/api/wallet/uebersicht').then(x => { kontakte = x.kontakte ?? []; }).catch(() => {});
  s1();
  pruefeListe();
}
