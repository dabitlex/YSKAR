/*
 * Nachricht signieren und prüfen -- und Anmelden per Link (yskar:login?...).
 *
 * Node Core zeigt vor dem Unterschreiben IMMER die ganze Nachricht. Eine
 * Anmeldung wird erkannt und groß dargestellt: Website, Adresse, Ablauf. Was
 * gilt (nur yskar.app, nur die eigene Adresse, höchstens 15 Minuten), prüft
 * der Kern (src/lib/core/signedMessage.ts) -- die Oberfläche zeigt nur an.
 */
import { hole, sende, el, fuelle, knopf, zeile, zeichen, dialog, segment, kopiere, kurzAdresse } from './kern.js';
import { t, sprache } from './i18n.js';

const uhrzeit = iso => new Date(iso).toLocaleTimeString(sprache() === 'en' ? 'en-GB' : 'de-DE', { hour: '2-digit', minute: '2-digit' });
const minutenBis = iso => Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60000));
const nachrichtBox = text => el('div.box.mono.umbruch', { style: 'font-size:12px;line-height:1.7;white-space:pre-wrap;color:var(--lese)' }, text);
const haken = () => el('span', { style: 'width:40px;height:40px;border-radius:12px;background:rgba(59,229,154,.12);color:var(--ok);display:inline-flex;align-items:center;justify-content:center' }, zeichen('haken', 20));

/** Die Karte einer Anmeldung: Website, Adresse, Ablauf. */
function anmeldeKarte(a, titel, eigene) {
  return el('div', { style: 'display:flex;flex-direction:column;gap:12px;border:1px solid rgba(99,216,255,.35);background:rgba(47,123,255,.07);border-radius:12px;padding:16px' },
    el('div.reihe',
      el('span', { style: 'width:36px;height:36px;border-radius:10px;background:rgba(47,123,255,.18);color:var(--acc2);display:inline-flex;align-items:center;justify-content:center;flex:none' }, zeichen('welt', 18)),
      el('div', el('div', { style: 'font-size:15px;font-weight:600;color:var(--fg)' }, titel), el('div.hinweis', t('sig.karteText')))),
    el('div.zeilen',
      zeile(t('sig.website'), el('b', { style: 'color:var(--fg)' }, a.domain)),
      zeile(t('sig.adresse'), el('span', { title: a.address }, el('span.mono', kurzAdresse(a.address)), ' ',
        a.address === eigene ? el('span', { style: 'color:var(--ok)' }, t('sig.deine')) : null)),
      zeile(t('sig.gueltigBis'), t('sig.uhrNoch', uhrzeit(a.expires), minutenBis(a.expires)))));
}

const fehlerFeld = () => el('div.fehler', { hidden: true, role: 'alert' });
const zeigeFehler = (f, e) => { f.textContent = e.message; f.hidden = false; };

/** „Signieren“ im Wallet: Reiter Signieren und Prüfen. */
export function signierenDialog(ctx, reiter = 's') {
  const d = dialog({ titel: t('sig.titel'), unter: t('sig.unterSignieren'), zeichenName: 'etikett', breite: 600 });
  const eigene = ctx.stand()?.wallet?.adresse ?? null;
  const eingabe = el('textarea.feld.mono', { rows: 7, spellcheck: 'false', placeholder: t('sig.platzhalter'), 'aria-label': t('sig.nachricht'), style: 'font-size:12.5px;resize:vertical' });
  const pruefFeld = el('textarea.feld.mono', { rows: 5, spellcheck: 'false', placeholder: '{"address":"ysr1…","publicKey":"…","signature":"…","message":"…"}', 'aria-label': t('sig.ergebnisWallet'), style: 'font-size:12px;resize:vertical' });
  const wahl = segment(t('sig.art'), [['s', t('sig.reiterSignieren')], ['p', t('sig.reiterPruefen')]], reiter, w => (w === 's' ? schritt1() : pruefen()));
  const fehler = fehlerFeld();
  let vorschau = null;

  function schritt1() {
    wahl.setze('s'); d.box.setzeTitel(t('sig.titel'), t('sig.unterSignieren')); fehler.hidden = true;
    fuelle(d.inhalt, wahl,
      el('div.feldgruppe', el('label', t('sig.nachricht')), eingabe),
      el('p.hinweis', t('sig.nurText')), fehler);
    d.fuss.zeige(knopf(t('allg.abbrechen'), d.schliesse), knopf(t('allg.weiter'), weiter, 'haupt'));
    setTimeout(() => eingabe.focus(), 0);
  }

  async function weiter() {
    fehler.hidden = true;
    try { vorschau = await sende('/api/wallet/nachricht/vorschau', { text: eingabe.value }); schritt2(); }
    catch (e) { zeigeFehler(fehler, e); }
  }

  function schritt2() {
    const pw = el('input.feld', { type: 'password', autocomplete: 'current-password', 'aria-label': t('wal.passwort') });
    const los = knopf([zeichen('etikett', 15), t('sig.signieren')], () => signieren(), 'haupt');
    const signieren = async () => {
      fehler.hidden = true; los.disabled = true;
      try {
        const r = await sende('/api/wallet/nachricht/signieren', { text: vorschau.nachricht, passwort: pw.value });
        pw.value = ''; ergebnis(r);
      } catch (e) { los.disabled = false; zeigeFehler(fehler, e); pw.select(); }
    };
    pw.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); signieren(); } });
    fuelle(d.inhalt, wahl,
      vorschau.anmeldung ? anmeldeKarte(vorschau.anmeldung, t('sig.anmeldenBei', vorschau.anmeldung.domain), eigene) : null,
      el('div.feldgruppe', el('span.cap', t('sig.wirdSigniert')), nachrichtBox(vorschau.nachricht)),
      el('div.feldgruppe', el('label', t('wal.passwort')), pw), fehler);
    d.fuss.zeige(knopf(t('allg.zurueck'), schritt1), los);
    setTimeout(() => pw.focus(), 0);
  }

  function ergebnis(r) {
    const json = JSON.stringify(r);
    d.box.setzeTitel(t('sig.titel'), t('sig.unterFertig'));
    fuelle(d.inhalt,
      el('div.reihe', haken(), el('h2', t('sig.signiert'))),
      el('p.p', vorschau.anmeldung ? t('sig.einfuegenBei', vorschau.anmeldung.domain) : t('sig.einfuegen')),
      el('div.feldgruppe', el('span.cap', t('sig.ergebnis')), nachrichtBox(json)),
      el('div.zeilen',
        zeile(t('sig.adresse'), kurzAdresse(r.address), true),
        zeile(t('sig.schluessel'), r.publicKey.slice(0, 6) + '…' + r.publicKey.slice(-4), true),
        zeile(t('sig.signatur'), r.signature.slice(0, 6) + '…' + r.signature.slice(-4), true)));
    d.fuss.zeige(knopf(t('sig.nurSignatur'), () => kopiere(r.signature)), knopf([zeichen('kopieren', 15), t('sig.ergebnisKopieren')], () => kopiere(json), 'haupt'));
  }

  function pruefen() {
    wahl.setze('p'); d.box.setzeTitel(t('sig.titel'), t('sig.unterPruefen')); fehler.hidden = true;
    const aus = el('div');
    const los = async () => {
      fehler.hidden = true; fuelle(aus);
      try {
        const r = await sende('/api/wallet/nachricht/pruefen', { ergebnis: pruefFeld.value });
        if (!r.gueltig) {
          fuelle(aus, el('div.fehler', { role: 'alert' }, el('strong', t('sig.ungueltig') + ' '), t('sig.grund.' + r.grund)));
          return;
        }
        fuelle(aus,
          el('div', { style: 'display:flex;gap:12px;align-items:flex-start;border-radius:10px;padding:12px 14px;border:1px solid rgba(59,229,154,.4);background:rgba(59,229,154,.06)' },
            el('span', { style: 'color:var(--ok)' }, zeichen('haken', 16)),
            el('div', el('strong', { style: 'color:var(--fg)' }, t('sig.gueltig') + ' '), el('span', { style: 'color:var(--lese);font-size:12.5px' }, t('sig.signiertVon', kurzAdresse(r.address))))),
          r.anmeldung
            ? el('div.zeilen', zeile(t('sig.website'), r.anmeldung.domain), zeile(t('sig.gueltigBis'), new Date(r.anmeldung.expires).toLocaleString(sprache() === 'en' ? 'en-GB' : 'de-DE')))
            : el('div.feldgruppe', el('span.cap', t('sig.signierterText')), nachrichtBox(r.text)));
      } catch (e) { zeigeFehler(fehler, e); }
    };
    fuelle(d.inhalt, wahl,
      el('div.feldgruppe', el('label', t('sig.ergebnisWallet')), pruefFeld),
      el('p.hinweis', t('sig.pruefenHinweis')), fehler, aus);
    d.fuss.zeige(knopf(t('allg.schliessen'), d.schliesse), knopf(t('sig.pruefen'), los, 'haupt'));
    setTimeout(() => pruefFeld.focus(), 0);
  }

  reiter === 'p' ? pruefen() : schritt1();
}

let offenerLink = 0;

/**
 * Ein Link aus dem Browser wartet (Status: link.nr). Einmal je Link ein
 * Fenster: zustimmen mit Passwort, ablehnen verwirft den Link.
 */
export async function pruefeLink(ctx, stand) {
  const nr = stand?.link?.nr ?? 0;
  if (!nr || nr === offenerLink) return;
  offenerLink = nr;
  let l;
  try { l = (await hole('/api/wallet/link')).link; } catch { return; }
  if (!l || l.nr !== nr) return;

  const verwerfen = () => sende('/api/wallet/link/verwerfen').catch(() => {});
  const d = dialog({ titel: t('sig.linkTitel'), unter: t('sig.linkUnter'), zeichenName: 'welt', breite: 560 }, () => { if (!fertig) verwerfen(); });
  let fertig = false;

  if (l.fehler) {
    fertig = true; verwerfen();
    fuelle(d.inhalt,
      el('div.fehler', { role: 'alert' }, el('strong', t('sig.abgelehnt') + ' '), t('srv.' + l.code, ...(l.werte ?? []))),
      el('p.hinweis', t('sig.linkNichtSelbst')));
    d.fuss.zeige(knopf(t('allg.schliessen'), d.schliesse, 'haupt'));
    return;
  }
  if (!l.eigeneAdresse || !l.passt) {
    fertig = true; verwerfen();
    fuelle(d.inhalt,
      el('div.fehler', { role: 'alert' }, el('strong', t('sig.abgelehnt') + ' '),
        l.eigeneAdresse ? t('sig.andereAdresse', kurzAdresse(l.anmeldung.address)) : t('srv.keine_wallet')),
      el('p.hinweis', t('sig.andereAdresseHinweis')));
    d.fuss.zeige(knopf(t('allg.schliessen'), d.schliesse, 'haupt'));
    return;
  }

  const pw = el('input.feld', { type: 'password', autocomplete: 'current-password', 'aria-label': t('wal.passwort') });
  const fehler = fehlerFeld();
  const los = knopf([zeichen('haken', 15), t('sig.anmelden')], () => anmelden(), 'haupt');
  const anmelden = async () => {
    fehler.hidden = true; los.disabled = true;
    try {
      const r = await sende('/api/wallet/link/anmelden', { passwort: pw.value });
      pw.value = '';
      if (!r.ok) { los.disabled = false; zeigeFehler(fehler, new Error(t('sig.websiteSagt', r.domain, r.text))); return; }
      fertig = true;
      d.box.setzeTitel(t('sig.linkTitel'), r.domain);
      fuelle(d.inhalt, el('div.reihe', haken(), el('h2', t('sig.angemeldet'))), el('p.p', t('sig.angemeldetText', r.domain)));
      d.fuss.zeige(knopf(t('allg.schliessen'), d.schliesse, 'haupt'));
      ctx.neuLaden?.();
    } catch (e) { los.disabled = false; zeigeFehler(fehler, e); pw.select(); }
  };
  pw.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); anmelden(); } });
  fuelle(d.inhalt,
    anmeldeKarte(l.anmeldung, t('sig.anmeldenFrage', l.anmeldung.domain), l.eigeneAdresse),
    el('details', el('summary', { style: 'cursor:pointer;font-size:12.5px;color:var(--mut)' }, t('sig.ganzeNachricht')), el('div', { style: 'margin-top:8px' }, nachrichtBox(l.nachricht))),
    el('div.feldgruppe', el('label', t('wal.passwort')), pw),
    fehler,
    el('p.hinweis', t('sig.linkHinweis', l.anmeldung.domain)));
  d.fuss.zeige(knopf(t('sig.ablehnen'), d.schliesse), los);
  setTimeout(() => pw.focus(), 0);
}
