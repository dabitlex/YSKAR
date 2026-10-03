/* Wallet: Guthaben, Senden, Empfangen, Kontakte, Sicherung. */
import { hole, sende, el, fuelle, text, zeile, chip, knopf, kopf, melde, zahl, ysr, kurzAdresse, uhrzeit, vor, zeichen, kopiere, segment, schalter, vierer, tagSchluessel, tagName, wochentag } from './kern.js';
import { t } from './i18n.js';
import { baueEinrichten, passwortFelder } from './walletEinrichten.js';

const REITER = [['', 'wal.rUebersicht'], ['senden', 'wal.rSenden'], ['empfangen', 'wal.rEmpfangen'], ['sicherung', 'wal.rSicherung']];

/** Wer ist gemeint: Kontaktname oder die Adresse in Kurzform. */
const wer = (name, adresse) => name || kurzAdresse(adresse);

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
  const innen = teil === 'senden' ? baueSenden(ctx, new URLSearchParams(such ?? ''))
    : teil === 'empfangen' ? baueEmpfangen(ctx)
    : teil === 'sicherung' ? baueSicherung(ctx) : baueUebersicht(ctx);
  const aktiv = ['senden', 'empfangen', 'sicherung'].includes(teil) ? teil : '';
  const offen = el('span');

  const wurzel = el('div.stapel',
    kopf(t('wal.titel'), t('wal.sub'), offen,
      knopf([zeichen('schloss'), t('wal.sperren')], async () => { try { await sende('/api/wallet/sperren'); await ctx.neuLaden(); ctx.zeigeNeu(); } catch (e) { melde(e.message, true); } })),
    el('nav.reiter', { 'aria-label': t('wal.bereiche') },
      REITER.map(([ziel, name]) => el('a', { href: '#/wallet' + (ziel ? '/' + ziel : ''), 'aria-current': ziel === aktiv ? 'page' : null }, t(name)))),
    innen.wurzel);

  function aktualisiere(s) {
    wechsel(s);
    const rest = s.wallet.sperrtIn;
    fuelle(offen, chip('gruen hoch', [zeichen('offen', 14), rest === null ? t('wal.entsperrt') : t('wal.entsperrtRest', Math.max(1, Math.ceil(rest / 60)))]));
    innen.aktualisiere?.(s);
  }
  return { wurzel, aktualisiere, verlasse: () => innen.verlasse?.() };
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

// ----------------------------------------------------------------- Übersicht

function baueUebersicht(ctx) {
  const guthaben = el('span.riesig', '—');
  const chips = el('div.reihe.umbrechen', { style: 'gap:8px' });
  const adresse = el('span.mono.umbruch', { style: 'font-size:13px;flex:1 1 240px' });
  const summe7 = el('span.mono', { style: 'font-size:26px;font-weight:500' }, '—');
  const bloecke7 = el('span', { style: 'font-size:13px;font-weight:700;color:var(--dim)' });
  const saeulen = el('div', { role: 'img', style: 'display:flex;align-items:flex-end;gap:8px;height:132px;border-bottom:1px solid var(--linie2);padding:0 2px' });
  const tageZeile = el('div', { 'aria-hidden': 'true', style: 'display:flex;gap:8px;padding:0 2px;font-size:12px;font-weight:600;color:var(--blass);text-align:center' });
  const liste = el('div.zeilen');
  const fuss = el('span.hinweis');
  const mehr = knopf(t('wal.mehr'), () => { grenze += 40; zeigeVerlauf(); });
  const suche = el('input.feld', { id: 'w-suche', type: 'search', placeholder: t('wal.suchfeld'), style: 'width:230px' });
  let filter = 'alle', grenze = 40, daten = null, takt = null, hoehe = -2;
  suche.addEventListener('input', () => { grenze = 40; zeigeVerlauf(); });

  const wurzel = el('div.stapel',
    el('div.spalten.gleich',
      el('section.karte', { style: 'flex:3 1 440px;gap:14px', 'aria-label': t('wal.guthaben') },
        el('span.cap', t('wal.guthaben')),
        el('div.betrag', guthaben, el('small', { style: 'font-size:18px' }, 'YSR')),
        chips,
        el('div.box.reihe.umbrechen', adresse, knopf([zeichen('kopieren'), t('wal.adresseKopieren')], () => kopiere(ctx.stand().wallet.adresse), 'klein')),
        el('div.reihe.umbrechen', { style: 'margin-top:auto' },
          el('a.knopf.haupt.voll', { href: '#/wallet/senden' }, zeichen('hoch'), t('wal.rSenden')),
          el('a.knopf.voll', { href: '#/wallet/empfangen' }, zeichen('runter'), t('wal.empfangen')),
          el('a.knopf.voll', { href: '#/wallet/empfangen' }, zeichen('leute'), t('wal.kontakte')))),
      el('section.karte', { style: 'flex:2 1 340px', 'aria-label': t('wal.einnahmen') },
        el('div.karte-kopf', el('h2', t('wal.einnahmen')), el('span.hinweis', t('wal.sieben'))),
        el('div.betrag', summe7, bloecke7),
        saeulen, tageZeile)),
    el('section.karte', { 'aria-label': t('kette.verlauf') },
      el('div.karte-kopf', el('h2', t('kette.verlauf')),
        el('div.reihe.umbrechen',
          segment(t('wal.filter'), [['alle', t('wal.fAlle')], ['ein', t('wal.fEin')], ['aus', t('wal.fAus')], ['mining', 'Mining']], filter, f => { filter = f; grenze = 40; zeigeVerlauf(); }, true),
          el('label.nur-leser', { for: 'w-suche' }, t('wal.suchfeld')), suche)),
      liste,
      el('div.karte-kopf', fuss, mehr)));

  function zeigeSaeulen() {
    const s = daten.sieben;
    const max = s.reduce((m, x) => (BigInt(x.summe) > m ? BigInt(x.summe) : m), 0n);
    const gesamt = s.reduce((m, x) => m + BigInt(x.summe), 0n);
    text(summe7, ysr(gesamt));
    text(bloecke7, t('wal.ausBloecken', s.reduce((m, x) => m + x.bloecke, 0)));
    saeulen.setAttribute('aria-label', t('wal.einnahmen') + ': ' + s.map(x => wochentag(x.tag) + ' ' + ysr(x.summe, 2)).join(', '));
    fuelle(saeulen, s.map((x, i) => {
      const hoch = max > 0n ? Math.round(Number(BigInt(x.summe) * 96n / max)) : 0;
      const letzter = i === s.length - 1;
      return el('div', { style: 'flex:1 1 0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:5px;height:100%', title: wochentag(x.tag) + ': ' + ysr(x.summe) + ' YSR' },
        letzter && BigInt(x.summe) > 0n ? el('span.mono', { style: 'font-size:12px' }, ysr(x.summe, 0).replace(/[,.]\d+$/, '')) : null,
        el('div', { style: `width:100%;max-width:30px;height:${Math.max(hoch, BigInt(x.summe) > 0n ? 3 : 0)}px;border-radius:4px 4px 0 0;background:#4D7DFF` }));
    }));
    fuelle(tageZeile, s.map((x, i) => el('span', { style: 'flex:1 1 0' + (i === s.length - 1 ? ';color:var(--text)' : '') }, i === s.length - 1 ? t('zeit.heuteKurz') : wochentag(x.tag))));
  }

  function eintraege() {
    const heute = tagSchluessel(Date.now() / 1000);
    const alle = [];
    for (const w of daten.wartend) alle.push({ tag: heute, zeit: Infinity, art: w.art, wartend: true, ...w });
    for (const u of daten.ueberweisungen) alle.push({ tag: tagSchluessel(u.zeit), ...u });
    for (const m of daten.mining) alle.push({ tag: m.tag, zeit: m.letzteZeit, art: 'mining', ...m });
    const q = suche.value.trim().toLowerCase();
    return alle.filter(e => {
      if (filter !== 'alle' && e.art !== filter) return false;
      if (!q) return true;
      if (e.art === 'mining') return 'mining pool solo'.includes(q);
      return [e.name, e.gegen, e.notiz].some(x => x && x.toLowerCase().includes(q));
    }).sort((a, b) => (a.tag === b.tag ? b.zeit - a.zeit : (a.tag < b.tag ? 1 : -1)));
  }

  const symbol = (name, farbe) => el('span', { style: `flex:none;width:36px;height:36px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;${farbe}` }, zeichen(name, 18));
  const posten = (sym, titel, unter, betrag, klasse = '') => el('div', { style: 'display:flex;align-items:center;gap:14px;padding:11px 0;border-top:1px solid var(--linie)' },
    sym, el('span', { style: 'flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px' }, el('span', { style: 'font-size:14px;font-weight:700' }, titel), el('span.hinweis.umbruch', unter)),
    el('span.mono' + klasse, { style: 'font-size:14px;white-space:nowrap' }, betrag));

  function zeigeVerlauf() {
    if (!daten) return;
    const alle = eintraege();
    const sicht = alle.slice(0, grenze);
    const kinder = [];
    let tag = null;
    for (const e of sicht) {
      if (e.tag !== tag) { tag = e.tag; kinder.push(el('span.cap', { style: 'padding:' + (kinder.length ? '14px' : '6px') + ' 0 6px' }, tagName(tag))); }
      if (e.art === 'mining') {
        const teile = [];
        if (e.pool) teile.push(t('wal.anteileAus', e.pool));
        if (e.solo) teile.push(t('wal.soloGefunden', e.solo));
        kinder.push(posten(symbol('blitz', 'background:rgba(77,125,255,.16);color:#9DB8FF'),
          e.pool && !e.solo ? t('wal.miningPool') : e.solo && !e.pool ? t('wal.miningSolo') : 'Mining',
          [teile.join(' · '), ' · ', el('a', { href: '#/blockchain/' + e.letzteHoehe }, t('wal.zuletztBlock', zahl(e.letzteHoehe)))],
          '+' + ysr(e.summe), '.gut'));
      } else if (e.wartend) {
        kinder.push(posten(symbol('uhr', 'background:rgba(240,185,90,.14);color:#F3C679'),
          t(e.art === 'aus' ? 'wal.gesendetAn' : 'wal.empfangenVon', wer(e.name, e.gegen)),
          [t('wal.wartetBlock'), e.notiz ? ' · ' + t('wal.notizZeile', e.notiz) : ''],
          (e.art === 'aus' ? '−' : '+') + ysr(e.betrag), e.art === 'aus' ? '' : '.dim'));
      } else if (e.art === 'aus') {
        kinder.push(posten(symbol('hoch', 'background:#1A2740;color:#C9D5E8'), t('wal.gesendetAn', wer(e.name, e.gegen)),
          [uhrzeit(e.zeit), ' · ', el('a', { href: '#/blockchain/' + e.hoehe }, t('kette.block', zahl(e.hoehe))), ' · ', t('wal.gebuehrZeile', ysr(e.gebuehr, 0)), e.notiz ? ' · ' + t('wal.notizZeile', e.notiz) : ''],
          '−' + ysr(e.betrag)));
      } else {
        kinder.push(posten(symbol('runter', 'background:rgba(60,203,149,.14);color:#6FE0B3'), t('wal.empfangenVon', wer(e.name, e.gegen)),
          [uhrzeit(e.zeit), ' · ', el('a', { href: '#/blockchain/' + e.hoehe }, t('kette.block', zahl(e.hoehe))), e.name ? ' · ' + kurzAdresse(e.gegen) : '', e.notiz ? ' · ' + t('wal.notizZeile', e.notiz) : ''],
          '+' + ysr(e.betrag), '.gut'));
      }
    }
    fuelle(liste, kinder.length ? kinder : el('p.leer', suche.value.trim() || filter !== 'alle' ? t('wal.nichtsPassend') : t('wal.nochNichts')));
    mehr.hidden = alle.length <= grenze;
    text(fuss, daten.knotenLaeuft ? t('wal.ausKnoten') : t('fehler.knotenAus'));
  }

  async function lade() {
    try {
      daten = await hole('/api/wallet/uebersicht');
      text(guthaben, ysr(daten.guthaben));
      fuelle(chips,
        BigInt(daten.heute) > 0n ? chip('gruen', '+' + ysr(daten.heute, 2) + ' ' + t('wal.heute')) : null,
        BigInt(daten.unterwegs) > 0n ? chip('gelb', ysr(daten.unterwegs, 2) + ' ' + t('wal.unterwegs')) : null,
        chip('', t('wal.verfuegbar') + ' ' + ysr(daten.verfuegbar)));
      text(adresse, daten.adresse);
      zeigeSaeulen(); zeigeVerlauf();
    } catch (e) { if (e.code !== 'gesperrt') text(fuss, e.message); }
  }

  lade();
  takt = setInterval(lade, 5000);
  return {
    wurzel,
    aktualisiere: s => { if (s.height !== hoehe) { hoehe = s.height; lade(); } },
    verlasse: () => clearInterval(takt),
  };
}

// -------------------------------------------------------------------- Senden

function baueSenden(ctx, such) {
  const an = el('input.feld.mono', { id: 's-an', type: 'text', spellcheck: 'false', autocomplete: 'off', placeholder: 'ysr1…', value: such.get('an') ?? '', style: 'font-size:13px' });
  const kontaktWahl = el('select.feld', { id: 's-kontakt', 'aria-label': t('wal.kontaktWaehlen'), style: 'flex:0 1 190px' });
  const betrag = el('input.feld.mono', { id: 's-betrag', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0,0000' });
  const notiz = el('input.feld', { id: 's-notiz', type: 'text', autocomplete: 'off' });
  const notizZahl = el('p.hinweis');
  const verfuegbar = el('p.hinweis');
  const formFehler = el('div.fehler', { hidden: true, role: 'alert' });
  const rechts = el('section.karte.blau', { style: 'flex:1 1 420px;gap:14px', 'aria-label': t('wal.pruefenTitel'), 'aria-live': 'polite' });
  const schritte = el('ol.schritte', { 'aria-label': t('einr.schritte') });
  let stufe = 'normal', andrang = false;
  const stufenWahl = segment(t('wal.tempo'), [['langsam', t('wal.langsam')], ['normal', t('wal.normal')], ['schnell', t('wal.schnell')]], stufe, s => { stufe = s; verwirf(); }, true);
  const stufenBox = el('div.feldgruppe', { hidden: true }, el('span.feldname', t('wal.tempo')), stufenWahl, el('p.hinweis', t('wal.tempoHinweis')));

  const bytes = s => new TextEncoder().encode(s).length;
  const eingaben = () => ({ an: an.value.trim(), betrag: betrag.value.trim(), notiz: notiz.value.trim(), stufe });

  function zeigeSchritte(nr) {
    const namen = ['wal.sEmpfaenger', 'wal.sBetrag', 'wal.sPruefen', 'wal.sGesendet'];
    fuelle(schritte, namen.map((n, i) => i < nr ? el('li.fertig', zeichen('haken', 14), t(n))
      : el('li', i === nr ? { 'aria-current': 'step' } : null, (i + 1) + ' · ' + t(n))));
  }
  function stand() { return an.value.trim() ? (betrag.value.trim() ? 2 : 1) : 0; }

  function verwirf() {
    formFehler.hidden = true;
    zeigeSchritte(Math.min(stand(), 2));
    fuelle(rechts, el('h2', t('wal.pruefenTitel')), el('p.p', t('wal.pruefenLeer')));
  }

  function zeigeNotiz() {
    const n = bytes(notiz.value.trim());
    notizZahl.className = 'hinweis' + (n > 32 ? ' schlecht' : '');
    text(notizZahl, t('wal.notizHinweis', n));
    verwirf();
  }

  async function pruefe(alles = false) {
    formFehler.hidden = true;
    try {
      const v = await sende('/api/wallet/pruefen', { ...eingaben(), ...(alles ? { alles: true } : {}) });
      if (alles) betrag.value = ysr(v.betrag, 0);
      andrang = v.andrang; stufenBox.hidden = !andrang;
      zeigePruefung(v, alles);
    } catch (e) { formFehler.textContent = e.message; formFehler.hidden = false; }
  }

  function zeigePruefung(v, alles) {
    zeigeSchritte(2);
    const pw = el('input.feld', { id: 's-pw', type: 'password', autocomplete: 'current-password' });
    const fehler = el('div.fehler', { hidden: true, role: 'alert' });
    const los = el('button.knopf.haupt', { type: 'submit', style: 'flex:2 1 200px' }, zeichen('hoch'), t('wal.jetztSenden'));
    const senden = async e => {
      e.preventDefault(); fehler.hidden = true; los.disabled = true;
      try {
        const r = await sende('/api/wallet/senden', { ...eingaben(), ...(alles ? { alles: true } : {}), passwort: pw.value });
        pw.value = '';
        zeigeGesendet(r);
      } catch (err) { fehler.textContent = err.message; fehler.hidden = false; los.disabled = false; pw.select(); }
    };
    fuelle(rechts,
      el('h2', t('wal.pruefenTitel')),
      el('div.feldgruppe', el('span.cap', v.name ? t('wal.anName', v.name) : t('wal.anAdresse')),
        el('div.box.mono.umbruch', { style: 'font-size:17px;line-height:1.75;letter-spacing:.02em' }, vierer(v.an))),
      v.neu ? el('div.warnung', zeichen('warnung', 18), el('span', el('strong', t('wal.neueAdresse')), ' ', t('wal.neueAdresseText'))) : null,
      el('div.zeilen',
        zeile(t('kette.betrag'), ysr(v.betrag) + ' YSR', true),
        zeile(t('wal.netzgebuehr'), ysr(v.gebuehr, 0) + ' YSR · ' + (v.zielBlock <= 1 ? t('wal.naechsterBlock') : t('wal.inBloecken', v.zielBlock)), true),
        v.notiz ? zeile(t('wal.notiz'), v.notiz) : null,
        el('div.zeile', { style: 'font-weight:700' }, el('span', { style: 'color:var(--text)' }, t('wal.gesamt')), el('span.mono', ysr(v.gesamt) + ' YSR')),
        zeile(t('wal.danach'), ysr(v.danach) + ' YSR', true)),
      el('form.stapel', { style: 'gap:14px', onsubmit: senden },
        el('div.feldgruppe', el('label', { for: 's-pw' }, t('wal.passwort')), pw),
        fehler,
        el('div.reihe.umbrechen', el('a.knopf', { href: '#/wallet', style: 'flex:1 1 120px' }, t('allg.abbrechen')), los)),
      el('p.hinweis', t('wal.endgueltig')));
    setTimeout(() => pw.focus(), 0);
  }

  function zeigeGesendet(r) {
    zeigeSchritte(4);
    for (const f of [an, betrag, notiz, kontaktWahl]) f.disabled = true;
    fuelle(rechts,
      el('div.reihe', el('span', { style: 'width:44px;height:44px;border-radius:14px;background:rgba(60,203,149,.14);color:#6FE0B3;display:inline-flex;align-items:center;justify-content:center' }, zeichen('haken', 22)),
        el('h2', t('wal.gesendetTitel'))),
      el('p.p', t('wal.gesendetText', r.peers)),
      el('div.zeilen',
        zeile(t('kette.an'), wer(r.name, r.an), !r.name),
        zeile(t('kette.betrag'), ysr(r.betrag) + ' YSR', true),
        zeile(t('wal.netzgebuehr'), ysr(r.gebuehr, 0) + ' YSR', true),
        zeile('ID', el('button', { type: 'button', class: 'mono', style: 'background:none;border:0;color:var(--blau-hell);cursor:pointer;padding:0;font-size:13px', onclick: () => kopiere(r.txid) }, r.txid.slice(0, 16) + '…'))),
      el('div.reihe.umbrechen', el('a.knopf.haupt', { href: '#/wallet', style: 'flex:1 1 160px' }, t('wal.zurUebersicht')),
        knopf(t('wal.weitere'), () => ctx.zeigeNeu(), 'voll')));
    ctx.neuLaden();
  }

  for (const f of [an, betrag]) f.addEventListener('input', verwirf);
  notiz.addEventListener('input', zeigeNotiz);
  kontaktWahl.addEventListener('change', () => { if (kontaktWahl.value) { an.value = kontaktWahl.value; verwirf(); } });

  const wurzel = el('div.stapel',
    schritte,
    el('div.spalten',
      el('section.karte', { style: 'flex:1 1 420px;gap:16px', 'aria-label': t('wal.ueberweisung') },
        el('h2', t('wal.ueberweisung')),
        el('div.feldgruppe', el('label', { for: 's-an' }, t('wal.empfaenger')), el('div.reihe', an, kontaktWahl)),
        el('div.feldgruppe', el('label', { for: 's-betrag' }, t('kette.betrag')),
          el('div.reihe', el('div.mit-einheit', betrag, el('span', 'YSR')), knopf(t('wal.alles'), () => pruefe(true))), verfuegbar),
        el('div.feldgruppe', el('label', { for: 's-notiz' }, t('wal.notiz'), ' ', el('small', '· ' + t('allg.freiwillig'))), notiz, notizZahl),
        stufenBox,
        formFehler,
        el('div.reihe', { style: 'justify-content:flex-end' }, knopf(t('wal.pruefen'), () => pruefe(false), 'haupt'))),
      rechts));

  hole('/api/wallet/uebersicht').then(d => {
    text(verfuegbar, t('wal.verfuegbarZeile', ysr(d.verfuegbar)));
    fuelle(kontaktWahl, el('option', { value: '' }, d.kontakte.length ? t('wal.kontaktWaehlen') : t('wal.keineKontakte')),
      d.kontakte.map(k => el('option', { value: k.adresse, selected: k.adresse === an.value.trim() }, k.name)));
    kontaktWahl.disabled = !d.kontakte.length;
  }).catch(() => {});

  zeigeNotiz();
  return { wurzel };
}

// ----------------------------------------------------- Empfangen und Kontakte

function qrBild(zeilen) {
  const n = zeilen.length, rand = 2, g = n + rand * 2;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${g} ${g}`); svg.setAttribute('width', '196'); svg.setAttribute('height', '196');
  svg.setAttribute('shape-rendering', 'crispEdges'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', t('wal.qrAlt'));
  let pfad = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (zeilen[y][x] !== '1') continue;
      let ende = x; while (ende + 1 < n && zeilen[y][ende + 1] === '1') ende++;
      pfad += `M${x + rand} ${y + rand}h${ende - x + 1}v1h-${ende - x + 1}z`;
      x = ende;
    }
  }
  const hinter = document.createElementNS(svg.namespaceURI, 'rect');
  hinter.setAttribute('width', g); hinter.setAttribute('height', g); hinter.setAttribute('fill', '#fff');
  const p = document.createElementNS(svg.namespaceURI, 'path');
  p.setAttribute('d', pfad); p.setAttribute('fill', '#0B1220');
  svg.append(hinter, p);
  svg.style.cssText = 'display:block;border-radius:12px';
  return svg;
}

function baueEmpfangen(ctx) {
  const adr = ctx.stand().wallet.adresse;
  const bild = el('div', { style: 'flex:none;width:196px;height:196px;border-radius:12px;background:#fff' });
  const code = el('p.hinweis.umbruch.mono', { hidden: true });
  const betrag = el('input.feld.mono', { id: 'r-betrag', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0,0000' });
  const liste = el('div.zeilen');
  const kopfText = el('span.hinweis');
  const kName = el('input.feld', { id: 'k-name', type: 'text', maxlength: 24, autocomplete: 'off', placeholder: t('wal.kNamePlatz') });
  const kAdr = el('input.feld.mono', { id: 'k-adr', type: 'text', spellcheck: 'false', autocomplete: 'off', placeholder: 'ysr1…', style: 'font-size:13px' });
  let warte = null;

  async function ladeQr() {
    try {
      const r = await hole('/api/wallet/qr?betrag=' + encodeURIComponent(betrag.value.trim()));
      fuelle(bild, qrBild(r.zeilen));
      code.hidden = r.code === adr; text(code, r.code);
    } catch (e) { melde(e.message, true); }
  }
  betrag.addEventListener('input', () => { clearTimeout(warte); warte = setTimeout(ladeQr, 250); });

  function zeigeKontakte(kontakte) {
    text(kopfText, t('wal.kGespeichert', kontakte.length));
    fuelle(liste, kontakte.length ? kontakte.map(k => el('div', { style: 'display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--linie)' },
      el('span', { style: 'flex:none;width:38px;height:38px;border-radius:50%;background:#1A2740;color:#C9D5E8;display:inline-flex;align-items:center;justify-content:center;font-size:14px;font-weight:800' }, [...k.name][0].toUpperCase()),
      el('span', { style: 'flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px' }, el('span', { style: 'font-size:14px;font-weight:700' }, k.name), el('span.mono.dim', { style: 'font-size:12.5px', title: k.adresse }, kurzAdresse(k.adresse))),
      el('a.knopf.klein', { href: '#/wallet/senden?an=' + k.adresse }, t('wal.rSenden')),
      knopf(t('wal.kBearbeiten'), () => { kName.value = k.name; kAdr.value = k.adresse; kName.focus(); }, 'klein'),
      el('button.knopf.klein.symbol', { type: 'button', style: 'width:36px', 'aria-label': t('wal.kEntfernen', k.name), onclick: async () => {
        try { zeigeKontakte((await sende('/api/wallet/kontakt/entfernen', { adresse: k.adresse })).kontakte); } catch (e) { melde(e.message, true); }
      } }, zeichen('kreuz'))))
      : el('p.hinweis', { style: 'padding:6px 0' }, t('wal.kKeine')));
  }

  async function speichere(e) {
    e.preventDefault();
    try {
      zeigeKontakte((await sende('/api/wallet/kontakt', { name: kName.value, adresse: kAdr.value })).kontakte);
      kName.value = ''; kAdr.value = ''; melde(t('wal.kGespeichertMeldung'));
    } catch (err) { melde(err.message, true); }
  }

  const wurzel = el('div.spalten',
    el('section.karte', { style: 'flex:1 1 400px;gap:16px', 'aria-label': t('wal.empfangen') },
      el('h2', t('wal.empfangen')),
      el('div.reihe.umbrechen', { style: 'align-items:flex-start;gap:18px' },
        bild,
        el('div.stapel', { style: 'flex:1 1 220px;gap:12px' },
          el('div.feldgruppe', el('span.cap', t('wal.deineAdresse')), el('div.box.mono.umbruch', { style: 'font-size:15px;line-height:1.75' }, vierer(adr))),
          knopf([zeichen('kopieren'), t('wal.adresseKopieren')], () => kopiere(adr), 'haupt'),
          el('p.hinweis', t('wal.adresseHinweis')))),
      el('div.feldgruppe', { style: 'border-top:1px solid var(--linie);padding-top:14px' },
        el('label', { for: 'r-betrag' }, t('wal.anfordern'), ' ', el('small', '· ' + t('allg.freiwillig'))),
        el('div.mit-einheit', betrag, el('span', 'YSR')),
        el('p.hinweis', t('wal.anfordernHinweis')), code)),
    el('section.karte', { style: 'flex:1 1 400px', 'aria-label': t('wal.kontakte') },
      el('div.karte-kopf', el('h2', t('wal.kontakte')), kopfText),
      liste,
      el('form.stapel', { style: 'gap:12px;margin-top:6px', onsubmit: speichere },
        el('h3', t('wal.kHinzu')),
        el('div.feldgruppe', el('label', { for: 'k-name' }, t('wal.kName')), kName),
        el('div.feldgruppe', el('label', { for: 'k-adr' }, t('kette.adresse')), kAdr),
        el('div.reihe', { style: 'justify-content:flex-end' }, el('button.knopf', { type: 'submit' }, zeichen('plus'), t('allg.speichern'))))));

  ladeQr();
  hole('/api/wallet/uebersicht').then(d => zeigeKontakte(d.kontakte)).catch(e => melde(e.message, true));
  return { wurzel, verlasse: () => clearTimeout(warte) };
}

// ----------------------------------------------------------------- Sicherung

function baueSicherung(ctx) {
  const gitter = el('ol', { style: 'list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px' });
  const pwZeigen = el('input.feld', { id: 'c-pw', type: 'password', autocomplete: 'current-password' });
  const zeigeKnopf = el('button.knopf', { type: 'submit' }, zeichen('auge'), t('wal.woerterZeigen'));
  const datei = el('div.box.mono.umbruch', { style: 'font-size:12.5px' }, '—');
  let verdecken = null;

  function zeigeGitter(woerter) {
    fuelle(gitter, Array.from({ length: 12 }, (_, i) => el('li.box', { style: 'flex:1 1 110px;padding:9px 12px;display:flex;gap:10px;font-size:13.5px' },
      el('span.mono.blass', i + 1),
      woerter ? el('span', { style: 'font-weight:700' }, woerter[i]) : el('span.blass', { 'aria-hidden': 'true', style: 'letter-spacing:.2em' }, '••••••'))));
    gitter.setAttribute('aria-label', woerter ? t('wal.deine12') : t('wal.verdeckt'));
  }
  zeigeGitter(null);

  async function zeige(e) {
    e.preventDefault();
    if (verdecken) { clearTimeout(verdecken); verdecken = null; zeigeGitter(null); fuelle(zeigeKnopf, zeichen('auge'), t('wal.woerterZeigen')); return; }
    try {
      const r = await sende('/api/wallet/woerter', { passwort: pwZeigen.value });
      pwZeigen.value = '';
      zeigeGitter(r.woerter.split(' '));
      fuelle(zeigeKnopf, zeichen('auge'), t('wal.woerterVerdecken'));
      verdecken = setTimeout(() => { verdecken = null; zeigeGitter(null); fuelle(zeigeKnopf, zeichen('auge'), t('wal.woerterZeigen')); }, 60000);
    } catch (err) { melde(err.message, true); pwZeigen.select(); }
  }

  const alt = el('input.feld', { id: 'c-alt', type: 'password', autocomplete: 'current-password' });
  const neu = passwortFelder('c-neu', t('wal.pwNeu'));
  async function aendere(e) {
    e.preventDefault();
    try { await sende('/api/wallet/passwort', { alt: alt.value, neu: neu.wert() }); alt.value = ''; neu.leeren(); melde(t('wal.pwGeaendert')); }
    catch (err) { melde(err.message, true); }
  }

  const e0 = ctx.stand().einstellungen ?? {};
  const sperre = el('select.feld.schmal', { id: 'c-sperre', onchange: async ev => {
    try { await sende('/api/einstellungen', { sperreMinuten: Number(ev.target.value) }); await ctx.neuLaden(); } catch (err) { melde(err.message, true); }
  } }, [[5, t('wal.minuten', 5)], [10, t('wal.minuten', 10)], [30, t('wal.minuten', 30)], [0, t('wal.nie')]]
    .map(([w, n]) => el('option', { value: w, selected: (e0.sperreMinuten ?? 10) === w }, n)));

  const pwWeg = el('input.feld', { id: 'c-weg', type: 'password', autocomplete: 'current-password', placeholder: t('wal.passwort') });
  const sicher = el('input', { id: 'c-sicher', type: 'checkbox' });
  async function entferne(e) {
    e.preventDefault();
    if (!sicher.checked) { melde(t('wal.erstNotieren'), true); return; }
    try { await sende('/api/wallet/entfernen', { passwort: pwWeg.value }); await ctx.neuLaden(); ctx.zeigeNeu(); }
    catch (err) { melde(err.message, true); }
  }

  const wurzel = el('div.spalten',
    el('div.stapel', { style: 'flex:1 1 420px' },
      el('section.karte', { style: 'gap:14px', 'aria-label': t('wal.die12') },
        el('h2', t('wal.die12')),
        el('p.p', t('wal.die12Text')),
        gitter,
        el('form.reihe.umbrechen', { style: 'align-items:flex-end', onsubmit: zeige },
          el('div.feldgruppe', { style: 'flex:1 1 200px' }, el('label', { for: 'c-pw' }, t('wal.passwort')), pwZeigen), zeigeKnopf),
        el('div.warnung', zeichen('warnung', 18), el('span', t('wal.woerterGeheim')))),
      el('section.karte', { 'aria-label': t('wal.inApp') }, el('h2', t('wal.inApp')), el('p.p', t('wal.inAppText')))),
    el('div.stapel', { style: 'flex:1 1 420px' },
      el('section.karte', { 'aria-label': t('wal.pwAendern') },
        el('h2', t('wal.pwAendern')),
        el('form.stapel', { style: 'gap:12px', onsubmit: aendere },
          el('div.feldgruppe', el('label', { for: 'c-alt' }, t('wal.pwAktuell')), alt),
          neu.wurzel,
          el('div.karte-kopf', el('span.hinweis', { style: 'flex:1 1 220px' }, t('wal.pwAendernHinweis')), el('button.knopf', { type: 'submit' }, t('allg.aendern'))))),
      el('section.karte', { style: 'gap:4px', 'aria-label': t('wal.sperre') },
        el('h2', { style: 'margin-bottom:6px' }, t('wal.sperre')),
        el('div.schaltzeile', el('label', { for: 'c-sperre' }, t('wal.sperreNach')), sperre),
        el('div.schaltzeile', el('span', t('wal.pwVorSenden'), el('span.hinweis', t('wal.pwVorSendenHinweis'))), chip('', t('wal.immerAn')))),
      el('section.karte', { 'aria-label': t('wal.datei') },
        el('h2', t('wal.datei')),
        datei,
        el('p.hinweis', t('wal.dateiHinweis')),
        el('form.stapel', { style: 'gap:10px;border-top:1px solid var(--linie);padding-top:12px', onsubmit: entferne },
          el('p.hinweis', t('wal.entfernenText')),
          el('label', { style: 'display:flex;align-items:center;gap:10px;font-size:13.5px;font-weight:600;cursor:pointer;min-height:44px' }, sicher, t('wal.notiert')),
          el('div.reihe.umbrechen', el('label.nur-leser', { for: 'c-weg' }, t('wal.passwort')), pwWeg, el('button.knopf.gefahr', { type: 'submit' }, t('wal.entfernen')))))));

  hole('/api/wallet/uebersicht').then(d => text(datei, d.datei)).catch(() => {});
  return { wurzel, verlasse: () => clearTimeout(verdecken) };
}
