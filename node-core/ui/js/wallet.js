/*
 * Wallet: Guthaben, Verlauf, Kontakte, Sicherung -- Senden und Empfangen als Fenster.
 *
 * Aufbau (Redesign 1.0.0): links die Konten, rechts ohne eigene Karte das
 * Guthaben gross und mittig, darunter Adresse und die beiden Knoepfe, dann
 * die Einnahmen in einer schmalen Leiste und die Karte mit Verlauf,
 * Kontakten und Sicherung.
 *
 * Alte Adressen bleiben gueltig: #/wallet/senden?an=... oeffnet das Fenster
 * "Senden", #/wallet/empfangen das Fenster "Empfangen".
 */
import { hole, sende, el, fuelle, haenge, text, zeile, chip, knopf, kopf, melde, zahl, ysr, ysrGross, kurzAdresse, uhrzeit, zeichen, kopiere, segment, vierer, tagSchluessel, tagName, dialog } from './kern.js';
import { t } from './i18n.js';
import { baueEinrichten, passwortFelder } from './walletEinrichten.js';
import { kontenEintraege, baueKonto, anlegenDialog } from './gemeinsam.js';

/** Wer ist gemeint: Kontaktname oder die Adresse in Kurzform. */
const wer = (name, adresse) => name || kurzAdresse(adresse);
const BLOECKE_JE_TAG = 144;

export function baue(ctx) {
  const w = ctx.stand().wallet;
  const bild = JSON.stringify([w.vorhanden, w.gesperrt]);
  const wechsel = s => { if (JSON.stringify([s.wallet.vorhanden, s.wallet.gesperrt]) !== bild) ctx.zeigeNeu(); };

  if (!w.vorhanden) {
    const e = baueEinrichten({ fertig: async () => { await ctx.neuLaden(); ctx.zeigeNeu(); } });
    return {
      wurzel: el('div.stapel', kopf(t('wal.titel'), t('wal.sub')),
        el('section.karte', { style: 'max-width:760px;gap:16px', 'aria-label': t('wal.einrichten') },
          el('div.stapel', { style: 'gap:6px' }, el('h2', t('wal.einrichten')), el('p.p', t('wal.einrichtenText'))),
          e.wurzel)),
      aktualisiere: wechsel,
    };
  }
  if (w.gesperrt) return { ...baueGesperrt(ctx), aktualisiere: wechsel };

  const [teil, such] = (ctx.ort()[1] ?? '').split('?');
  const offen = el('span');
  const haupt = baueHaupt(ctx, teil === 'kontakte' || teil === 'sicherung' ? teil : 'verlauf');

  const wurzel = el('div.stapel',
    kopf(t('wal.titel'), t('wal.sub'), offen,
      knopf([zeichen('schloss'), t('wal.sperren')], async () => { try { await sende('/api/wallet/sperren'); await ctx.neuLaden(); ctx.zeigeNeu(); } catch (e) { melde(e.message, true); } })),
    haupt.wurzel);

  // Alte Adressen: Fenster gleich öffnen und die Adresszeile zurücksetzen.
  if (teil === 'senden' || teil === 'empfangen') {
    history.replaceState(null, '', '#/wallet');
    setTimeout(() => (teil === 'senden' ? sendeDialog(ctx, new URLSearchParams(such ?? '').get('an') ?? '', haupt.lade) : empfangenDialog(ctx)), 0);
  }

  function aktualisiere(s) {
    wechsel(s);
    const rest = s.wallet.sperrtIn;
    fuelle(offen, chip('gruen hoch', [zeichen('offen', 13), rest === null ? t('wal.entsperrt') : t('wal.entsperrtRest', Math.max(1, Math.ceil(rest / 60)))]));
    haupt.aktualisiere(s);
  }
  return { wurzel, aktualisiere, verlasse: haupt.verlasse };
}

// ------------------------------------------------------------------ Gesperrt

function baueGesperrt(ctx) {
  const w = ctx.stand().wallet;
  const karte = el('section.karte', { style: 'width:100%;max-width:460px;padding:30px 30px 26px;gap:16px', 'aria-label': t('wal.gesperrtTitel') });

  function entsperrenAnsicht() {
    const pw = el('input.feld', { id: 'w-pw', type: 'password', autocomplete: 'current-password' });
    const fehler = el('p.hinweis.schlecht', { hidden: true, role: 'alert' });
    const los = async e => {
      e?.preventDefault(); fehler.hidden = true;
      try { await sende('/api/wallet/entsperren', { passwort: pw.value }); pw.value = ''; await ctx.neuLaden(); ctx.zeigeNeu(); }
      catch (err) { fehler.textContent = err.message; fehler.hidden = false; pw.select(); }
    };
    fuelle(karte,
      el('span', { style: 'align-self:center;width:60px;height:60px;border-radius:18px;background:#182642;color:#9DB8FF;display:inline-flex;align-items:center;justify-content:center' }, zeichen('schloss', 28)),
      el('div.stapel', { style: 'gap:6px;text-align:center' }, el('h2', { style: 'font-size:21px' }, t('wal.gesperrtTitel')), el('p.p', t('wal.gesperrtText'))),
      el('div.box', { style: 'display:flex;justify-content:space-between;gap:12px;font-size:13.5px' }, el('span.dim', t('kette.adresse')), el('span.mono', kurzAdresse(w.adresse))),
      el('form.stapel', { style: 'gap:16px', onsubmit: los },
        el('div.feldgruppe', el('label', { for: 'w-pw' }, t('wal.passwort')), pw, fehler),
        el('button.knopf.haupt', { type: 'submit' }, zeichen('offen'), t('wal.entsperren'))),
      el('button', { type: 'button', style: 'background:none;border:0;color:var(--blau-hell);font-size:13px;font-weight:700;cursor:pointer;padding:6px 0', onclick: vergessenAnsicht }, t('wal.vergessen')));
    setTimeout(() => pw.focus(), 0);
  }

  function vergessenAnsicht() {
    const feld = el('textarea.feld.mono', { id: 'w-woerter', rows: 3, spellcheck: 'false', autocomplete: 'off', placeholder: t('wal.woerterPlatz'), style: 'height:auto;padding:12px;line-height:1.6;resize:vertical' });
    const pw = passwortFelder('w-neu', t('wal.pwNeu'));
    const fehler = el('div.fehler', { hidden: true, role: 'alert' });
    fuelle(karte,
      el('div.stapel', { style: 'gap:6px' }, el('h2', { style: 'font-size:21px' }, t('wal.vergessenTitel')), el('p.p', t('wal.vergessenText'))),
      el('div.feldgruppe', el('label', { for: 'w-woerter' }, t('wal.die12')), feld),
      pw.wurzel, fehler,
      el('div.reihe', { style: 'justify-content:space-between' }, knopf(t('allg.zurueck'), entsperrenAnsicht),
        knopf(t('wal.pwSetzen'), async () => {
          fehler.hidden = true;
          try { await sende('/api/wallet/zuruecksetzen', { woerter: feld.value, passwort: pw.wert() }); feld.value = ''; await ctx.neuLaden(); ctx.zeigeNeu(); }
          catch (e) { fehler.textContent = e.message; fehler.hidden = false; }
        }, 'haupt')));
  }

  entsperrenAnsicht();
  return {
    wurzel: el('div.stapel', { style: 'flex:1 1 auto' },
      kopf(t('wal.titel'), t('wal.sub'), chip('gelb hoch', [zeichen('schloss', 14), t('wal.gesperrt')])),
      el('div', { style: 'flex:1 1 auto;display:flex;align-items:center;justify-content:center;padding:20px 0 40px' }, karte),
      el('div.notiz', zeichen('info', 18), el('span', t('wal.gesperrtHinweis')))),
  };
}


// ------------------------------------------------------------------- Haupt

function baueHaupt(ctx, startReiter) {
  const st = ctx.stand();
  const adr = st.wallet.adresse;
  const guthaben = el('span', '—');
  const kontoWert = el('span.wert', '—');
  const miniQr = el('span.miniqr');
  const kz = { heute: el('b', '—'), sieben: el('b', '—'), dreissig: el('b', '—'), gesamt: el('b', '—'), gesamtName: el('span.cap', t('wal.kzGesamt')) };
  const reiterLeiste = el('div.reiter', { role: 'tablist' });
  const werkzeug = el('div.reihe', { style: 'gap:8px' });
  const inhalt = el('div.stapel', { style: 'gap:12px' });
  const gemeinsam = el('div');
  let reiter = startReiter, daten = null, takt = null, hoehe = -2;
  let gem = null, gewaehlt = null;   // gemeinsame Konten; gewaehlt = Adresse oder null (eigene Wallet)
  const eigenHaupt = el('div.stapel', { style: 'gap:16px' });
  const gemHaupt = el('div', { hidden: true });
  const meinKonto = el('button.wl-konto.an', { type: 'button', onclick: () => waehle(null) },
    el('span.wl-ic', zeichen('wallet', 15)),
    el('span.mitte', el('b', t('wal.meine')), el('span.mono', kurzAdresse(adr))),
    kontoWert);
  let filter = 'alle', grenze = 60;
  const aufgeklappt = new Set();
  const suche = el('input.feld', { type: 'search', placeholder: t('wal.suchfeld'), 'aria-label': t('wal.suchfeld'), style: 'width:200px;height:30px' });
  suche.addEventListener('input', () => { grenze = 60; zeigeInhalt(); });

  const wurzel = el('div.wl',
    el('aside.wl-konten', { 'aria-label': t('wal.konten') },
      el('span.cap', { style: 'padding:0 4px 4px' }, t('wal.konten')),
      meinKonto,
      gemeinsam),
    el('div.wl-haupt', eigenHaupt, gemHaupt));
  haenge(eigenHaupt, [
      el('section.wl-guthaben', { 'aria-label': t('wal.guthaben') },
        el('span.cap', t('wal.meineGuthaben')),
        el('div.riesig', guthaben, el('small', ' YSR')),
        el('div.wl-adr',
          el('button.qrknopf', { type: 'button', 'aria-label': t('wal.qrGross'), onclick: () => empfangenDialog(ctx) }, miniQr),
          el('span.umbruch', vierer(adr)),
          el('button.x', { type: 'button', 'aria-label': t('wal.adresseKopieren'), title: t('wal.adresseKopieren'), onclick: () => kopiere(adr) }, zeichen('kopieren', 14))),
        el('div.wl-knoepfe',
          knopf([zeichen('aufwaerts', 15), t('wal.rSenden')], () => sendeDialog(ctx, '', lade), 'haupt'),
          knopf([zeichen('abwaerts', 15), t('wal.empfangen')], () => empfangenDialog(ctx)))),
      el('section.kz4', { 'aria-label': t('wal.einnahmen'), title: t('wal.einnahmenTitel') },
        el('div', el('span.cap', t('wal.kzHeute')), kz.heute),
        el('div', el('span.cap', t('wal.kz7')), kz.sieben),
        el('div', el('span.cap', t('wal.kz30')), kz.dreissig),
        el('div', kz.gesamtName, kz.gesamt)),
      el('section.karte', { style: 'gap:12px' },
        el('div.karte-kopf', reiterLeiste, werkzeug),
        inhalt)]);

  // ---------------------------------------------------------- Konten-Spalte
  function zeigeGemeinsam(s) {
    const next = s.nextActivationHeight, h = s.height ?? -1;
    if (gem?.aktiv) {
      fuelle(gemeinsam, kontenEintraege(gem, gewaehlt, waehle, () => anlegenDialog(ctx, gem, ladeGem)));
    } else if (next && h < next) {
      fuelle(gemeinsam, el('div.wl-konto.gesperrt',
        el('span.wl-ic', { style: 'color:var(--mut)' }, zeichen('schloss', 15)),
        el('span.mitte', el('b', t('wal.gemeinsame')), el('span', t('wal.gemeinsameAb', zahl(next), zahl(next - Math.max(0, h)))))));
    } else fuelle(gemeinsam);
  }

  /** Eigene Wallet (null) oder ein gemeinsames Konto zeigen. */
  function waehle(adresse) {
    gewaehlt = adresse;
    meinKonto.classList.toggle('an', adresse === null);
    zeigeGewaehlt();
    zeigeGemeinsam(ctx.stand());
  }

  function zeigeGewaehlt() {
    const k = gewaehlt && gem ? gem.konten.find(x => x.adresse === gewaehlt) : null;
    if (gewaehlt && !k) gewaehlt = null;
    eigenHaupt.hidden = !!k; gemHaupt.hidden = !k;
    if (k) fuelle(gemHaupt, baueKonto(ctx, gem, k, ladeGem));
  }

  /** Gemeinsame Konten neu holen; `neu` = Adresse, die danach gezeigt werden soll (null: eigene). */
  async function ladeGem(neu) {
    try { gem = await hole('/api/gemeinsam'); } catch { gem = null; }
    if (neu !== undefined) gewaehlt = neu;
    meinKonto.classList.toggle('an', !gewaehlt);
    // Während ein Fenster offen ist, nichts unter ihm umbauen.
    if (!document.querySelector('.overlay')) zeigeGewaehlt();
    zeigeGemeinsam(ctx.stand());
  }

  // ------------------------------------------------------------------ Reiter
  function zeigeReiter() {
    const R = [['verlauf', t('kette.verlauf')], ['kontakte', t('wal.kontakte')], ['sicherung', t('wal.rSicherung')]];
    fuelle(reiterLeiste, R.map(([id, name]) => el('a', {
      href: '#/wallet' + (id === 'verlauf' ? '' : '/' + id), role: 'tab', 'aria-current': id === reiter ? 'page' : null,
      onclick: e => { e.preventDefault(); reiter = id; history.replaceState(null, '', '#/wallet' + (id === 'verlauf' ? '' : '/' + id)); zeigeReiter(); zeigeInhalt(); },
    }, name)));
    fuelle(werkzeug, reiter === 'verlauf'
      ? [segment(t('wal.filter'), [['alle', t('wal.fAlle')], ['ein', t('wal.fEin')], ['aus', t('wal.fAus')], ['mining', 'Mining']], filter, f => { filter = f; grenze = 60; zeigeInhalt(); }, true), suche]
      : reiter === 'kontakte' ? [knopf([zeichen('plus', 14), t('wal.kHinzu')], () => kontaktDialog(null), 'klein')] : []);
  }

  function zeigeInhalt() {
    if (reiter === 'kontakte') return zeigeKontakte();
    if (reiter === 'sicherung') return zeigeSicherung();
    zeigeVerlauf();
  }

  // ------------------------------------------------------------------ Verlauf
  function eintraege() {
    const heute = tagSchluessel(Date.now() / 1000);
    const alle = [];
    for (const w of daten.wartend) alle.push({ tag: heute, zeit: Infinity, ...w, wartend: true });
    for (const u of daten.ueberweisungen) alle.push({ tag: tagSchluessel(u.zeit), ...u });
    for (const m of daten.mining) alle.push({ ...m, zeit: m.letzteZeit, art: 'mining' });
    const q = suche.value.trim().toLowerCase();
    return alle.filter(e => {
      if (filter !== 'alle' && e.art !== filter) return false;
      if (!q) return true;
      if (e.art === 'mining') return 'mining pool solo'.includes(q);
      return [e.name, e.gegen, e.notiz].some(x => x && x.toLowerCase().includes(q));
    }).sort((a, b) => (a.tag === b.tag ? b.zeit - a.zeit : (a.tag < b.tag ? 1 : -1)));
  }

  const art = (name, z, farbe) => el('span.art', el('i', { style: 'color:' + farbe }, zeichen(z, 12)), name);

  function zeigeVerlauf() {
    if (!daten) return;
    const alle = eintraege();
    if (!alle.length) {
      const leer = !suche.value.trim() && filter === 'alle';
      fuelle(inhalt, leer
        ? el('div.leer-wl', leerBild(), el('h3', t('wal.leerTitel')), el('p', t('wal.leerText')),
          el('div.wl-knoepfe', knopf([zeichen('abwaerts', 15), t('wal.empfangen')], () => empfangenDialog(ctx), 'haupt'), el('a.knopf', { href: '#/mining' }, zeichen('blitz', 15), t('wal.miningStarten'))))
        : el('p.leer', t('wal.nichtsPassend')));
      return;
    }
    const zeilen = [];
    let tag = null;
    for (const e of alle.slice(0, grenze)) {
      if (e.tag !== tag) { tag = e.tag; zeilen.push(el('tr.gruppe', el('td', { colspan: 5 }, el('span.cap', tagName(tag))))); }
      if (e.art === 'mining') {
        const offen = aufgeklappt.has(e.tag);
        const teile = [];
        if (e.solo) teile.push(t('wal.mSolo', e.solo));
        if (e.pool) teile.push(t('wal.mPool', e.pool));
        const einzeln = e.einzeln ?? [];
        const von = einzeln.length ? uhrzeit(einzeln[einzeln.length - 1].zeit) : null;
        zeilen.push(el('tr.zeile-v.mining-sum' + (offen ? '.offen' : ''), {
          onclick: () => { if (offen) aufgeklappt.delete(e.tag); else aufgeklappt.add(e.tag); zeigeVerlauf(); },
          title: offen ? t('wal.zuklappen') : t('wal.aufklappen'),
        },
          el('td.blass', von && von !== uhrzeit(e.letzteZeit) ? von + '–' + uhrzeit(e.letzteZeit) : uhrzeit(e.letzteZeit)),
          el('td', art(['Mining', el('span.pfeil', zeichen('pfeil', 13))], 'blitz', 'var(--acc2)')),
          el('td', teile.join(' · '), el('span.anz', offen ? t('wal.zuklappen') : t('wal.aufklappen'))),
          el('td.r.mono.gut', '+ ' + ysr(e.summe)),
          el('td', chip('gruen', t('wal.bestaetigt')))));
        if (offen) {
          for (const m of einzeln) {
            zeilen.push(el('tr.zeile-v.unter', { onclick: () => ctx.gehe('blockchain/' + m.hoehe) },
              el('td.blass', uhrzeit(m.zeit)),
              el('td', art(m.art === 'solo' ? t('wal.blockGefunden') : t('wal.poolAnteil'), 'blitz', 'var(--acc2)')),
              el('td', t('kette.block', zahl(m.hoehe)), m.art === 'solo' ? el('span.blass', ' · solo') : m.name ? el('span.blass', ' · ' + m.name) : null),
              el('td.r.mono.gut', '+ ' + ysr(m.betrag)),
              el('td', chip('gruen', t('wal.bestaetigt')))));
          }
          if ((e.solo + e.pool) > einzeln.length) zeilen.push(el('tr.unter', el('td', { colspan: 5 }, el('span.hinweis', t('wal.mWeitere', e.solo + e.pool - einzeln.length)))));
        }
      } else if (e.wartend) {
        const wann = e.block == null ? t('wal.wartetBlock') : e.block === 1 ? t('wal.wartetNaechster') : t('wal.wartetVoraus', e.block, e.minuten);
        const erhoehbar = e.art === 'aus' && !e.sammel && e.imPool !== false;
        zeilen.push(el('tr.zeile-v', { title: wann },
          el('td.blass', t('wal.jetzt')),
          el('td', e.art === 'aus' ? art(t('wal.gesendet'), 'aufwaerts', 'var(--warn)') : art(t('wal.empfangen'), 'abwaerts', 'var(--ok)')),
          el('td', wer(e.name, e.gegen), e.notiz ? el('span.blass', ' · „' + e.notiz + '“') : null),
          el('td.r.mono' + (e.art === 'aus' ? '' : '.gut'), (e.art === 'aus' ? '− ' : '+ ') + ysr(e.betrag)),
          el('td', el('span.reihe', { style: 'gap:8px' }, chip('gelb', t('wal.wartet')),
            erhoehbar ? el('a', { href: '#', onclick: ev => { ev.preventDefault(); ev.stopPropagation(); erhoehenDialog(e.txid, lade); } }, t('wal.erhoehen')) : null))));
      } else {
        const aus = e.art === 'aus';
        zeilen.push(el('tr.zeile-v', { onclick: () => ctx.gehe('blockchain/' + e.hoehe), title: t('kette.block', zahl(e.hoehe)) + (aus ? ' · ' + t('wal.gebuehrZeile', ysr(e.gebuehr, 0)) : '') },
          el('td.blass', uhrzeit(e.zeit)),
          el('td', aus ? art(t('wal.gesendet'), 'aufwaerts', 'var(--warn)') : art(t('wal.empfangen'), 'abwaerts', 'var(--ok)')),
          el('td', wer(e.name, e.gegen), e.notiz ? el('span.blass', ' · „' + e.notiz + '“') : null),
          el('td.r.mono' + (aus ? '' : '.gut'), (aus ? '− ' : '+ ') + ysr(e.betrag)),
          el('td', chip('gruen', t('wal.bestaetigt')))));
      }
    }
    const mehr = alle.length > grenze ? knopf(t('wal.mehr'), () => { grenze += 60; zeigeVerlauf(); }, 'klein') : null;
    fuelle(inhalt,
      el('div.tab-huelle', el('table.tab.vt',
        el('thead', el('tr', el('th', t('kette.zeit')), el('th', t('wal.artSpalte')), el('th', t('wal.gegenueber')), el('th.r', t('wal.betragYsr')), el('th', t('wal.status')))),
        el('tbody', zeilen))),
      el('div.karte-kopf', el('span.hinweis', daten.knotenLaeuft ? t('wal.verlaufHinweis') : t('fehler.knotenAus')), mehr));
  }

  // ----------------------------------------------------------------- Kontakte
  function letzteZahlung(adresse) {
    const u = daten.ueberweisungen.find(x => x.gegen === adresse);
    const w = daten.wartend.find(x => x.gegen === adresse);
    if (w) return t('wal.kWartet', (w.art === 'aus' ? '− ' : '+ ') + ysr(w.betrag));
    if (!u) return t('wal.kNochKeine');
    return tagName(tagSchluessel(u.zeit)) + ' · ' + (u.art === 'aus' ? '− ' : '+ ') + ysr(u.betrag);
  }

  function zeigeKontakte() {
    if (!daten) return;
    const k = daten.kontakte;
    if (!k.length) { fuelle(inhalt, el('p.leer', t('wal.kKeine'))); return; }
    fuelle(inhalt,
      el('div.tab-huelle', el('table.tab',
        el('thead', el('tr', el('th', t('wal.kName')), el('th', t('kette.adresse')), el('th', t('wal.kLetzte')), el('th.r', el('span.nur-leser', t('wal.kAktion'))))),
        el('tbody', k.map(x => el('tr',
          el('td', el('span.kt-name', el('span.kt-av', [...x.name][0].toUpperCase()), x.name)),
          el('td.mono.blass', { title: x.adresse }, kurzAdresse(x.adresse)),
          el('td.blass', letzteZahlung(x.adresse)),
          el('td.r', el('span.reihe', { style: 'gap:6px;justify-content:flex-end' },
            knopf([zeichen('aufwaerts', 13), t('wal.rSenden')], () => sendeDialog(ctx, x.adresse, lade), 'klein'),
            knopf(t('wal.kBearbeiten'), () => kontaktDialog(x), 'klein ruhig'),
            el('button.x', { type: 'button', 'aria-label': t('wal.kEntfernen', x.name), title: t('wal.kEntfernen', x.name), onclick: async () => {
              try { await sende('/api/wallet/kontakt/entfernen', { adresse: x.adresse }); await lade(); } catch (e) { melde(e.message, true); }
            } }, zeichen('kreuz', 13))))))))),
      el('span.hinweis', t('wal.kHinweis')));
  }

  function kontaktDialog(k) {
    const name = el('input.feld', { type: 'text', maxlength: 24, autocomplete: 'off', placeholder: t('wal.kNamePlatz'), value: k?.name ?? '' });
    const adresse = el('input.feld.mono', { type: 'text', spellcheck: 'false', autocomplete: 'off', placeholder: 'ysr1…', value: k?.adresse ?? '' });
    const d = dialog({ titel: k ? t('wal.kBearbeiten') : t('wal.kHinzu'), zeichenName: 'leute', breite: 480 });
    fuelle(d.inhalt,
      el('div.feldgruppe', el('label', t('wal.kName')), name),
      el('div.feldgruppe', el('label', t('kette.adresse')), adresse),
      el('p.hinweis', t('wal.kHinweis')));
    d.fuss.zeige(knopf(t('allg.abbrechen'), d.schliesse), knopf(t('allg.speichern'), async () => {
      try {
        if (k && k.adresse !== adresse.value.trim()) await sende('/api/wallet/kontakt/entfernen', { adresse: k.adresse });
        await sende('/api/wallet/kontakt', { name: name.value, adresse: adresse.value });
        melde(t('wal.kGespeichertMeldung')); d.schliesse(); await lade();
      } catch (e) { melde(e.message, true); }
    }, 'haupt'));
    setTimeout(() => name.focus(), 0);
  }

  // ---------------------------------------------------------------- Sicherung
  function zeigeSicherung() {
    const e0 = ctx.stand().einstellungen ?? {};
    const sperre = e0.sperreMinuten ?? 10;
    const kachel = (name, wert, unter, gut) => el('div', el('span.cap', name), el('b', wert),
      el('span', { style: 'font-size:12px;display:inline-flex;align-items:center;gap:6px;color:' + (gut ? 'var(--ok)' : 'var(--warn)') }, zeichen(gut ? 'haken' : 'warnung', 12), unter));
    const gitter = el('ol.woerter', { 'aria-label': t('wal.verdeckt') });
    const pwZeigen = el('input.feld', { type: 'password', autocomplete: 'current-password', placeholder: t('wal.passwort'), 'aria-label': t('wal.passwort') });
    const zeigeKnopf = el('button.knopf', { type: 'submit' }, zeichen('auge', 15), t('wal.woerterZeigen'));
    let verdecken = null;
    const zeigeGitter = woerter => {
      fuelle(gitter, Array.from({ length: 12 }, (_, i) => el('li.wort', el('em', String(i + 1)), woerter ? el('span', woerter[i]) : el('span.blass', { 'aria-hidden': 'true' }, '••••••'))));
      gitter.setAttribute('aria-label', woerter ? t('wal.deine12') : t('wal.verdeckt'));
    };
    zeigeGitter(null);
    const zeige = async ev => {
      ev.preventDefault();
      if (verdecken) { clearTimeout(verdecken); verdecken = null; zeigeGitter(null); fuelle(zeigeKnopf, zeichen('auge', 15), t('wal.woerterZeigen')); return; }
      try {
        const r = await sende('/api/wallet/woerter', { passwort: pwZeigen.value });
        pwZeigen.value = '';
        zeigeGitter(r.woerter.split(' '));
        fuelle(zeigeKnopf, zeichen('auge', 15), t('wal.woerterVerdecken'));
        verdecken = setTimeout(() => { verdecken = null; zeigeGitter(null); fuelle(zeigeKnopf, zeichen('auge', 15), t('wal.woerterZeigen')); }, 60000);
      } catch (err) { melde(err.message, true); pwZeigen.select(); }
    };
    const sperreWahl = el('select.feld.schmal', { onchange: async ev => {
      try { await sende('/api/einstellungen', { sperreMinuten: Number(ev.target.value) }); await ctx.neuLaden(); zeigeSicherung(); } catch (err) { melde(err.message, true); }
    } }, [[5, t('wal.minuten', 5)], [10, t('wal.minuten', 10)], [30, t('wal.minuten', 30)], [0, t('wal.nie')]]
      .map(([w, n]) => el('option', { value: w, selected: sperre === w }, n)));
    fuelle(inhalt,
      el('div.sich-stand',
        kachel(t('wal.die12'), t('wal.sWoerter'), t('wal.sWoerterUnter'), true),
        kachel(t('wal.passwort'), t('wal.sGesetzt'), t('wal.sPwUnter'), true),
        kachel(t('wal.sperre'), sperre ? t('wal.sNach', sperre) : t('wal.nie'), sperre ? t('wal.sOhneBedienung') : t('wal.sNieWarn'), !!sperre),
        kachel(t('wal.sVorSenden'), t('wal.passwort'), t('wal.immerAn'), true)),
      el('div.raster.r2', { style: 'gap:24px;align-items:start' },
        el('div.stapel', { style: 'gap:12px' },
          el('h2', t('wal.die12')),
          el('p.p', t('wal.die12Text')),
          gitter,
          el('form.reihe', { onsubmit: zeige }, pwZeigen, zeigeKnopf),
          el('div.warnung', zeichen('warnung', 16), el('span', t('wal.woerterGeheim'))),
          el('p.hinweis', t('wal.inAppText'))),
        el('div',
          el('div.schaltzeile', el('span', t('wal.sperreNach'), el('span.hinweis', t('wal.sOhneBedienung'))), sperreWahl),
          el('div.schaltzeile', el('span', t('wal.pwVorSenden'), el('span.hinweis', t('wal.pwVorSendenHinweis'))), chip('', t('wal.immerAn'))),
          el('div.schaltzeile', el('span', t('wal.pwAendern'), el('span.hinweis', t('wal.pwAendernHinweis'))), knopf(t('allg.aendern'), passwortDialog, 'klein')),
          el('div.schaltzeile', el('span', t('wal.datei'), el('span.hinweis.mono.umbruch', daten?.datei ?? '—'), el('span.hinweis', t('wal.dateiHinweis')))),
          el('div.schaltzeile', el('span', t('wal.entfernen'), el('span.hinweis', t('wal.entfernenKurz'))), knopf(t('wal.entfernenKnopf'), () => entfernenDialog(ctx), 'klein gefahr')))));
  }

  // ------------------------------------------------------------------- Laden
  async function lade() {
    try {
      daten = await hole('/api/wallet/uebersicht');
      fuelle(guthaben, ysrGross(daten.guthaben));
      text(kontoWert, ysr(daten.guthaben));
      // Einnahmen aus Mining: heute, 7 und 30 Tage, und was der Verlauf überblickt.
      const jetzt = Date.now() / 1000;
      const summe = tage => daten.mining.filter(m => m.tag >= tagSchluessel(jetzt - (tage - 1) * 86400)).reduce((s, m) => s + BigInt(m.summe), 0n);
      const gesamt = daten.mining.reduce((s, m) => s + BigInt(m.summe), 0n);
      const plus = v => (v > 0n ? '+ ' : '') + ysr(v);
      text(kz.heute, plus(summe(1)));
      text(kz.sieben, plus(summe(7)));
      text(kz.dreissig, plus(summe(30)));
      text(kz.gesamt, ysr(gesamt));
      const ganz = !daten.durchsucht || (ctx.stand().height ?? 0) + 1 <= daten.durchsucht;
      text(kz.gesamtName, ganz ? t('wal.kzGesamt') : t('wal.kzTage', Math.round((daten.durchsucht ?? 0) / BLOECKE_JE_TAG)));
      for (const b of [kz.heute, kz.sieben, kz.dreissig]) b.className = b.textContent.startsWith('+') ? 'gut' : '';
      zeigeInhalt();
    } catch (e) { if (e.code !== 'gesperrt') fuelle(inhalt, el('p.leer', e.message)); }
    ladeGem();
  }

  hole('/api/wallet/qr?betrag=').then(r => fuelle(miniQr, qrBild(r.zeilen, 26, false))).catch(() => {});
  zeigeReiter();
  lade();
  takt = setInterval(lade, 5000);
  return {
    wurzel, lade,
    aktualisiere: s => { zeigeGemeinsam(s); if (s.height !== hoehe) { hoehe = s.height; lade(); } },
    verlasse: () => clearInterval(takt),
  };
}

/** Bild für eine leere Wallet: eine Geldbörse, ohne Schein. */
function leerBild() {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', '120'); s.setAttribute('height', '96'); s.setAttribute('viewBox', '0 0 120 96'); s.setAttribute('fill', 'none'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<rect x="14" y="22" width="86" height="60" rx="10" stroke="#2F7BFF" stroke-width="1.6" fill="#0A1122"/><path d="M14 34h86" stroke="rgba(140,170,255,.25)" stroke-width="1.2"/><rect x="72" y="46" width="34" height="20" rx="6" stroke="#63D8FF" stroke-width="1.6" fill="#0E1730"/><circle cx="82" cy="56" r="3" fill="#63D8FF"/><path d="M28 22 70 10a4 4 0 0 1 5 3l2 9" stroke="rgba(140,170,255,.35)" stroke-width="1.4"/><path d="M30 50h26M30 60h18" stroke="rgba(140,170,255,.25)" stroke-width="1.4" stroke-linecap="round"/>';
  return s;
}

// -------------------------------------------------------------------- Senden

/**
 * Senden als Fenster in drei Schritten: Empfänger, Betrag, Prüfen.
 * Gesendet wird erst mit dem Passwort; die angezeigte Gebühr geht mit --
 * ist die nötige inzwischen höher, sendet der Knoten nicht und nennt die neue.
 */
function sendeDialog(ctx, vorgabe = '', danach = null) {
  const an = el('input.feld.mono', { type: 'text', spellcheck: 'false', autocomplete: 'off', placeholder: 'ysr1…', value: vorgabe, 'aria-label': t('wal.empfaenger') });
  const kontaktWahl = el('select.feld', { 'aria-label': t('wal.kontaktWaehlen'), style: 'flex:0 1 190px' });
  const betrag = el('input.feld.mono', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0,0000', 'aria-label': t('kette.betrag') });
  const notiz = el('input.feld', { type: 'text', autocomplete: 'off', 'aria-label': t('wal.notiz') });
  const notizZahl = el('p.hinweis');
  const verfuegbar = el('p.hinweis');
  const fehler = el('div.fehler', { hidden: true, role: 'alert' });
  const schritte = el('div', { style: 'display:flex;gap:8px;align-items:center;font-size:12px;color:var(--mut);margin-top:3px' });
  let schritt = 1, stufe = 'normal', alles = false, pruefung = null;
  const stufenWahl = segment(t('wal.tempo'), [['langsam', t('wal.langsam')], ['normal', t('wal.normal')], ['schnell', t('wal.schnell')]], stufe, s => { stufe = s; }, true);
  const stufenBox = el('div.feldgruppe', { hidden: true }, el('span.feldname', t('wal.tempo')), stufenWahl, el('p.hinweis', t('wal.tempoHinweis')));
  const bytes = s => new TextEncoder().encode(s).length;
  const eingaben = () => ({ an: an.value.trim(), betrag: betrag.value.trim(), notiz: notiz.value.trim(), stufe, ...(alles ? { alles: true } : {}) });

  const d = dialog({ titel: t('wal.ueberweisung'), zeichenName: 'aufwaerts', breite: 560 });
  d.box.querySelector('.titel>div').appendChild(schritte);

  function zeigeSchritte() {
    const namen = ['wal.sEmpfaenger', 'wal.sBetrag', 'wal.sPruefen'];
    const teile = [];
    namen.forEach((n, i) => {
      if (i) teile.push(el('span', { style: 'color:var(--faint)' }, '›'));
      const nr = i + 1;
      teile.push(el('span', { style: nr === schritt ? 'color:var(--fg);font-weight:500' : nr < schritt ? 'color:var(--ok)' : '' }, nr + ' ' + t(n)));
    });
    fuelle(schritte, teile);
  }
  const zeigeFehler = e => { fehler.textContent = e.message; fehler.hidden = false; };
  const zeigeNotiz = () => { const n = bytes(notiz.value.trim()); notizZahl.className = 'hinweis' + (n > 32 ? ' schlecht' : ''); text(notizZahl, t('wal.notizHinweis', n)); };
  notiz.addEventListener('input', zeigeNotiz); zeigeNotiz();
  kontaktWahl.addEventListener('change', () => { if (kontaktWahl.value) an.value = kontaktWahl.value; });
  betrag.addEventListener('input', () => { alles = false; });

  function s1() {
    schritt = 1; zeigeSchritte(); fehler.hidden = true;
    fuelle(d.inhalt,
      el('div.feldgruppe', el('label', t('wal.empfaenger')), el('div.reihe', an, kontaktWahl), el('p.hinweis', t('wal.anHinweis'))),
      fehler);
    d.fuss.zeige(knopf(t('allg.abbrechen'), d.schliesse), knopf(t('allg.weiter'), () => {
      const a = an.value.trim().toLowerCase();
      if (!/^ysr1[a-z0-9]{20,}$/.test(a)) { zeigeFehler(new Error(t('wal.adresseFalsch'))); return; }
      s2();
    }, 'haupt'));
    setTimeout(() => an.focus(), 0);
  }

  function s2() {
    schritt = 2; zeigeSchritte(); fehler.hidden = true;
    fuelle(d.inhalt,
      el('div.feldgruppe', el('label', t('kette.betrag')),
        el('div.reihe', el('div.mit-einheit', betrag, el('span', 'YSR')), knopf(t('wal.alles'), () => { alles = true; pruefe(); })), verfuegbar),
      el('div.feldgruppe', el('label', t('wal.notiz'), ' ', el('small', '· ' + t('allg.freiwillig'))), notiz, notizZahl),
      stufenBox, fehler);
    d.fuss.zeige(knopf(t('allg.zurueck'), s1), knopf(t('wal.pruefen'), () => pruefe(), 'haupt'));
    setTimeout(() => betrag.focus(), 0);
  }

  async function pruefe() {
    fehler.hidden = true;
    try {
      const v = await sende('/api/wallet/pruefen', eingaben());
      if (alles) betrag.value = ysr(v.betrag, 0);
      stufenBox.hidden = !v.andrang;
      pruefung = v; s3();
    } catch (e) { zeigeFehler(e); }
  }

  function s3() {
    const v = pruefung;
    schritt = 3; zeigeSchritte(); fehler.hidden = true;
    const pw = el('input.feld', { type: 'password', autocomplete: 'current-password', 'aria-label': t('wal.passwort') });
    const los = knopf([zeichen('aufwaerts', 15), t('wal.jetztSenden')], () => senden(), 'haupt');
    const senden = async () => {
      fehler.hidden = true; los.disabled = true;
      try {
        const r = await sende('/api/wallet/senden', { ...eingaben(), passwort: pw.value, gebuehr: v.gebuehr });
        pw.value = '';
        gesendet(r);
      } catch (err) {
        los.disabled = false;
        if (err.code === 'gebuehr_gestiegen') { pw.value = ''; melde(err.message, true); await pruefe(); return; }
        zeigeFehler(err); pw.select();
      }
    };
    pw.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); senden(); } });
    fuelle(d.inhalt,
      el('div.feldgruppe', el('span.cap', v.name ? t('wal.anName', v.name) : t('wal.anAdresse')),
        el('div.box.mono.umbruch', { style: 'font-size:15px;line-height:1.7;letter-spacing:.02em' }, vierer(v.an))),
      v.neu ? el('div.warnung', zeichen('warnung', 16), el('span', el('strong', t('wal.neueAdresse')), ' ', t('wal.neueAdresseText'))) : null,
      el('div.zeilen',
        zeile(t('kette.betrag'), ysr(v.betrag) + ' YSR', true),
        zeile(t('wal.netzgebuehr'), ysr(v.gebuehr) + ' YSR · ' + (v.zielBlock <= 1 ? t('wal.naechsterBlock') : t('wal.inBloecken', v.zielBlock)), true),
        v.notiz ? zeile(t('wal.notiz'), v.notiz) : null,
        el('div.zeile', { style: 'font-weight:600' }, el('span', { style: 'color:var(--fg)' }, t('wal.gesamt')), el('span.mono', ysr(v.gesamt) + ' YSR')),
        zeile(t('wal.danach'), ysr(v.danach) + ' YSR', true)),
      el('div.feldgruppe', el('label', t('wal.passwort')), pw),
      fehler,
      el('p.hinweis', t('wal.endgueltig')));
    d.fuss.zeige(knopf(t('allg.zurueck'), s2), los);
    setTimeout(() => pw.focus(), 0);
  }

  function gesendet(r) {
    fuelle(schritte, el('span', { style: 'color:var(--ok)' }, t('wal.sGesendet')));
    fuelle(d.inhalt,
      el('div.reihe', el('span', { style: 'width:40px;height:40px;border-radius:12px;background:rgba(59,229,154,.12);color:var(--ok);display:inline-flex;align-items:center;justify-content:center' }, zeichen('haken', 20)),
        el('h2', t('wal.gesendetTitel'))),
      el('p.p', t('wal.gesendetText', r.peers)),
      el('div.zeilen',
        zeile(t('kette.an'), wer(r.name, r.an), !r.name),
        zeile(t('kette.betrag'), ysr(r.betrag) + ' YSR', true),
        zeile(t('wal.netzgebuehr'), ysr(r.gebuehr) + ' YSR', true),
        zeile('ID', el('button', { type: 'button', class: 'mono', style: 'background:none;border:0;color:var(--acc2);cursor:pointer;padding:0;font-size:12.5px', onclick: () => kopiere(r.txid) }, r.txid.slice(0, 16) + '…'))));
    d.fuss.zeige(knopf(t('wal.weitere'), () => { an.value = ''; betrag.value = ''; notiz.value = ''; alles = false; s1(); }), knopf(t('allg.schliessen'), d.schliesse, 'haupt'));
    ctx.neuLaden(); danach?.();
  }

  hole('/api/wallet/uebersicht').then(x => {
    text(verfuegbar, t('wal.verfuegbarZeile', ysr(x.verfuegbar)));
    fuelle(kontaktWahl, el('option', { value: '' }, x.kontakte.length ? t('wal.kontaktWaehlen') : t('wal.keineKontakte')),
      x.kontakte.map(k => el('option', { value: k.adresse, selected: k.adresse === an.value.trim() }, k.name)));
    kontaktWahl.disabled = !x.kontakte.length;
  }).catch(() => {});
  s1();
  if (vorgabe) setTimeout(() => betrag.focus(), 0);
}

/** Gebühr einer wartenden eigenen Überweisung erhöhen (Stufe „schnell“). */
function erhoehenDialog(id, danach) {
  let gebuehr = null;
  const betrag = el('p.p', t('wal.erhoehenRechnet'));
  const pw = el('input.feld', { type: 'password', autocomplete: 'current-password', 'aria-label': t('wal.passwort') });
  const d = dialog({ titel: t('wal.erhoehen'), zeichenName: 'hoch', breite: 480 });
  const los = knopf(t('wal.erhoehen'), async () => {
    if (gebuehr === null) return;
    try {
      const r = await sende('/api/wallet/erhoehen', { txid: id, passwort: pw.value, gebuehr });
      melde(t('wal.erhoeht', ysr(r.gebuehr, 0))); d.schliesse(); danach?.();
    } catch (err) {
      if (err.code === 'gebuehr_gestiegen' && err.werte && err.werte[0]) zeige(String(err.werte[0]));
      melde(err.message, true);
    }
  }, 'haupt');
  los.disabled = true;
  const zeige = (g, bisher) => { gebuehr = g; text(betrag, t('wal.erhoehenBetrag', ysr(g, 0), bisher === undefined ? '' : ysr(bisher, 0))); los.disabled = false; };
  fuelle(d.inhalt, el('p.hinweis', t('wal.erhoehenText')), betrag, el('div.feldgruppe', el('label', t('wal.passwort')), pw));
  d.fuss.zeige(knopf(t('allg.abbrechen'), d.schliesse), los);
  sende('/api/wallet/erhoehen/vorschau', { txid: id }).then(v => zeige(v.gebuehr, v.bisher)).catch(err => { melde(err.message, true); d.schliesse(); });
  setTimeout(() => pw.focus(), 0);
}

// ----------------------------------------------------------------- Empfangen

function qrBild(zeilen, groesse = 220, rand = true) {
  const n = zeilen.length, r = rand ? 2 : 0, g = n + r * 2;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${g} ${g}`); svg.setAttribute('width', groesse); svg.setAttribute('height', groesse);
  svg.setAttribute('shape-rendering', 'crispEdges'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', t('wal.qrAlt'));
  let pfad = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (zeilen[y][x] !== '1') continue;
      let ende = x; while (ende + 1 < n && zeilen[y][ende + 1] === '1') ende++;
      pfad += `M${x + r} ${y + r}h${ende - x + 1}v1h-${ende - x + 1}z`;
      x = ende;
    }
  }
  const hinter = document.createElementNS(svg.namespaceURI, 'rect');
  hinter.setAttribute('width', g); hinter.setAttribute('height', g); hinter.setAttribute('fill', '#F2F6FF');
  const p = document.createElementNS(svg.namespaceURI, 'path');
  p.setAttribute('d', pfad); p.setAttribute('fill', '#03060F');
  svg.append(hinter, p);
  svg.style.cssText = 'display:block;border-radius:' + (rand ? 12 : 4) + 'px';
  return svg;
}

function empfangenDialog(ctx) {
  const adr = ctx.stand().wallet.adresse;
  const bild = el('div', { style: 'width:236px;height:236px;padding:8px;background:#F2F6FF;border-radius:12px' });
  const code = el('p.hinweis.umbruch.mono', { hidden: true });
  const betrag = el('input.feld.mono', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0,0000', 'aria-label': t('wal.anfordern') });
  let warte = null;
  const ladeQr = async () => {
    try {
      const r = await hole('/api/wallet/qr?betrag=' + encodeURIComponent(betrag.value.trim()));
      fuelle(bild, qrBild(r.zeilen, 220, false));
      code.hidden = r.code === adr; text(code, r.code);
    } catch (e) { melde(e.message, true); }
  };
  betrag.addEventListener('input', () => { clearTimeout(warte); warte = setTimeout(ladeQr, 250); });
  const d = dialog({ titel: t('wal.empfangenTitel'), zeichenName: 'abwaerts', breite: 480 }, () => clearTimeout(warte));
  d.inhalt.style.alignItems = 'center';
  d.inhalt.style.textAlign = 'center';
  fuelle(d.inhalt,
    bild,
    el('div.mono', { style: 'font-size:14px;word-spacing:4px;line-height:1.6;max-width:340px' }, vierer(adr)),
    el('p.hinweis', { style: 'max-width:380px' }, t('wal.adresseHinweis')),
    el('div.feldgruppe', { style: 'width:100%;text-align:left;border-top:1px solid var(--line);padding-top:14px' },
      el('label', t('wal.anfordern'), ' ', el('small', '· ' + t('allg.freiwillig'))),
      el('div.mit-einheit', betrag, el('span', 'YSR')),
      el('p.hinweis', t('wal.anfordernHinweis')), code));
  d.fuss.zeige(el('span.hinweis', t('wal.nurYsr')), knopf([zeichen('kopieren', 14), t('wal.adresseKopieren')], () => kopiere(adr), 'haupt'));
  ladeQr();
}

// ----------------------------------------------------------------- Sicherung

function passwortDialog() {
  const alt = el('input.feld', { type: 'password', autocomplete: 'current-password' });
  const neu = passwortFelder('c-neu', t('wal.pwNeu'));
  const d = dialog({ titel: t('wal.pwAendern'), zeichenName: 'schloss', breite: 560 });
  fuelle(d.inhalt, el('div.feldgruppe', el('label', t('wal.pwAktuell')), alt), neu.wurzel, el('p.hinweis', t('wal.pwAendernHinweis')));
  d.fuss.zeige(knopf(t('allg.abbrechen'), d.schliesse), knopf(t('allg.aendern'), async () => {
    try { await sende('/api/wallet/passwort', { alt: alt.value, neu: neu.wert() }); melde(t('wal.pwGeaendert')); d.schliesse(); }
    catch (err) { melde(err.message, true); }
  }, 'haupt'));
  setTimeout(() => alt.focus(), 0);
}

function entfernenDialog(ctx) {
  const pw = el('input.feld', { type: 'password', autocomplete: 'current-password' });
  const sicher = el('input', { type: 'checkbox' });
  const d = dialog({ titel: t('wal.entfernen'), zeichenName: 'warnung', breite: 500 });
  fuelle(d.inhalt,
    el('p.p', t('wal.entfernenText')),
    el('label', { style: 'display:flex;align-items:center;gap:10px;font-size:13px;font-weight:500;cursor:pointer' }, sicher, t('wal.notiert')),
    el('div.feldgruppe', el('label', t('wal.passwort')), pw));
  d.fuss.zeige(knopf(t('allg.abbrechen'), d.schliesse), knopf(t('wal.entfernen'), async () => {
    if (!sicher.checked) { melde(t('wal.erstNotieren'), true); return; }
    try { await sende('/api/wallet/entfernen', { passwort: pw.value }); d.schliesse(); await ctx.neuLaden(); ctx.zeigeNeu(); }
    catch (err) { melde(err.message, true); }
  }, 'gefahr'));
}
