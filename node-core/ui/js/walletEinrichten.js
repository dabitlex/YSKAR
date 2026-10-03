/*
 * Wallet anlegen oder wiederherstellen.
 *
 * Wird an zwei Stellen gebraucht: im Assistenten beim ersten Start und in der
 * Wallet-Ansicht, solange es noch keine Wallet gibt.
 */
import { sende, el, fuelle, knopf, zeichen } from './kern.js';
import { t } from './i18n.js';

export const PASSWORT_MIN = 8;

/** Ehrliche Auskunft zur Länge -- mehr lässt sich über ein Passwort nicht sagen. */
export function passwortHinweis(pw) {
  const n = [...pw].length;
  if (n === 0) return { ok: false, text: t('wal.pwRegel', PASSWORT_MIN), klasse: '' };
  if (n < PASSWORT_MIN) return { ok: false, text: t('wal.pwKurz', n, PASSWORT_MIN), klasse: 'schlecht' };
  if (n < 12) return { ok: true, text: t('wal.pwGeht', n), klasse: '' };
  return { ok: true, text: t('wal.pwGut', n), klasse: 'gut' };
}

/** Zwei Passwortfelder mit Rückmeldung. `wert()` liefert das Passwort oder wirft. */
export function passwortFelder(kennung, beschriftung) {
  const a = el('input.feld', { id: kennung, type: 'password', autocomplete: 'new-password' });
  const b = el('input.feld', { id: kennung + '2', type: 'password', autocomplete: 'new-password' });
  const hinweis = el('p.hinweis');
  const zeige = () => { const h = passwortHinweis(a.value); hinweis.className = 'hinweis ' + h.klasse; hinweis.textContent = h.text; };
  a.addEventListener('input', zeige); zeige();
  const wurzel = el('div.reihe.umbrechen', { style: 'align-items:flex-start;gap:14px' },
    el('div.feldgruppe', { style: 'flex:1 1 220px' }, el('label', { for: kennung }, beschriftung), a, hinweis),
    el('div.feldgruppe', { style: 'flex:1 1 220px' }, el('label', { for: kennung + '2' }, t('wal.pwWiederholen')), b));
  return {
    wurzel,
    wert() {
      if (!passwortHinweis(a.value).ok) throw new Error(t('wal.pwKurz', [...a.value].length, PASSWORT_MIN));
      if (a.value !== b.value) throw new Error(t('wal.pwUngleich'));
      return a.value;
    },
    leeren() { a.value = ''; b.value = ''; zeige(); },
  };
}

/**
 * @param fertig   wird gerufen, wenn die Wallet angelegt ist
 * @param spaeter  wenn gesetzt: dritte Wahl "Später", ruft diese Funktion
 * @param zurueck  wenn gesetzt: Knopf "Zurück"
 */
export function baueEinrichten({ fertig, spaeter, zurueck }) {
  let art = 'neu';
  let woerter = null;       // frisch erzeugte Wörter, noch nicht gespeichert
  const inhalt = el('div.stapel', { style: 'gap:16px' });
  const fehler = el('div.fehler', { hidden: true, role: 'alert' });
  const wahl = el('fieldset', { style: 'border:0;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:10px' });

  const karte = (wert, titel, text) => {
    const r = el('input', { type: 'radio', name: 'wal-art', value: wert, checked: wert === art });
    r.addEventListener('change', () => { art = wert; zeige(); });
    return el('label.box.wahl' + (wert === art ? '.gewaehlt' : ''), { style: 'flex:1 1 200px;align-items:flex-start', 'data-art': wert },
      r, el('span.stapel', { style: 'gap:3px' }, el('span', { style: 'font-size:14px;font-weight:700' }, titel), el('span.hinweis', text)));
  };

  function zeigeFehler(e) { fehler.textContent = e.message; fehler.hidden = false; fehler.scrollIntoView({ block: 'nearest' }); }

  async function zeige() {
    fehler.hidden = true;
    // Nur die Markierung umsetzen -- die Auswahl selbst bleibt stehen, damit
    // sie beim Bedienen mit der Tastatur den Fokus behält.
    for (const l of wahl.querySelectorAll('label')) l.classList.toggle('gewaehlt', l.dataset.art === art);

    if (art === 'spaeter') {
      fuelle(inhalt, el('p.p', t('wal.spaeterLang')),
        el('div.reihe', { style: 'justify-content:space-between' }, zurueck ? knopf(t('allg.zurueck'), zurueck) : el('span'), knopf(t('allg.weiter'), spaeter, 'haupt')));
      return;
    }

    const pw = passwortFelder('wal-pw', t('wal.pwFuerPc'));

    if (art === 'neu') {
      if (!woerter) {
        try { woerter = (await sende('/api/wallet/neu')).woerter; }
        catch (e) { fuelle(inhalt); zeigeFehler(e); return; }
        if (art !== 'neu') return;
      }
      const notiert = el('input', { id: 'wal-notiert', type: 'checkbox' });
      const los = knopf(t('wal.anlegen'), async () => {
        fehler.hidden = true;
        try {
          const passwort = pw.wert();
          if (!notiert.checked) throw new Error(t('wal.erstNotieren'));
          los.disabled = true;
          await sende('/api/wallet/anlegen', { woerter, passwort });
          woerter = null;
          await fertig();
        } catch (e) { los.disabled = false; zeigeFehler(e); }
      }, 'haupt');
      fuelle(inhalt,
        el('div.feldgruppe', el('span.feldname', t('wal.deine12')),
          el('ol', { style: 'list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px', 'aria-label': t('wal.deine12') },
            woerter.split(' ').map((w, i) => el('li.box', { style: 'flex:1 1 140px;padding:9px 12px;display:flex;gap:10px;font-size:14px' },
              el('span.mono.blass', i + 1), el('span', { style: 'font-weight:700' }, w))))),
        el('div.warnung', zeichen('warnung', 18), el('span', t('wal.woerterWarnung'))),
        pw.wurzel,
        el('label', { style: 'display:flex;align-items:center;gap:10px;font-size:13.5px;font-weight:600;cursor:pointer;min-height:44px' }, notiert, t('wal.notiert')),
        el('div.reihe', { style: 'justify-content:space-between' }, zurueck ? knopf(t('allg.zurueck'), zurueck) : el('span'), los));
      return;
    }

    // Vorhandene Wallet
    const feld = el('textarea.feld.mono', { id: 'wal-woerter', rows: 3, spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off',
      placeholder: t('wal.woerterPlatz'), style: 'height:auto;padding:12px;line-height:1.6;resize:vertical' });
    const zaehler = el('p.hinweis');
    const zaehle = () => { const n = feld.value.trim().split(/\s+/).filter(Boolean).length; zaehler.textContent = t('wal.woerterZahl', n); zaehler.className = 'hinweis' + (n === 12 ? ' gut' : ''); };
    feld.addEventListener('input', zaehle); zaehle();
    const los = knopf(t('wal.wiederherstellen'), async () => {
      fehler.hidden = true;
      try {
        const passwort = pw.wert();
        los.disabled = true;
        await sende('/api/wallet/anlegen', { woerter: feld.value, passwort });
        feld.value = '';
        await fertig();
      } catch (e) { los.disabled = false; zeigeFehler(e); }
    }, 'haupt');
    fuelle(inhalt,
      el('div.feldgruppe', el('label', { for: 'wal-woerter' }, t('wal.die12')), feld, zaehler),
      pw.wurzel,
      el('div.reihe', { style: 'justify-content:space-between' }, zurueck ? knopf(t('allg.zurueck'), zurueck) : el('span'), los));
  }

  fuelle(wahl, el('legend.nur-leser', t('wal.art')),
    karte('neu', t('wal.neu'), t('wal.neuText')),
    karte('alt', t('wal.alt'), t('wal.altText')),
    spaeter ? karte('spaeter', t('wal.spaeter'), t('wal.spaeterText')) : null);
  const wurzel = el('div.stapel', { style: 'gap:16px' }, wahl, inhalt, fehler);
  zeige();
  return { wurzel };
}
