/*
 * Startbildschirm -- im Hauptfenster, kein eigenes Fenster.
 *
 * Er liegt über dem Fenster, solange das Programm lädt: mindestens drei,
 * höchstens fünf Sekunden. Dann blendet er aus und gibt die Übersicht frei
 * (beim ersten Start den Assistenten). Startet das Programm beim Anmelden
 * ohne Fenster, läuft er unsichtbar ab -- wer das Fenster später öffnet,
 * landet direkt in der Übersicht.
 */
import { el, kristall, text } from './kern.js';
import { t } from './i18n.js';

const MIN_MS = 3000;
const MAX_MS = 5000;

export function zeigeStart(mitTitel) {
  const beginn = Date.now();
  const status = el('span', t('start.laden'));
  const prozent = el('span.mono', '0 %');
  const spur = el('i');
  const wurzel = el('div.start' + (mitTitel ? '.mit-titel' : ''), { role: 'status', 'aria-live': 'polite' },
    el('div.start-kopf', el('span', t('start.slogan')), el('span', 'Node Core')),
    el('div.start-mitte', kristall(200), el('div.start-wort', el('b', 'YSKAR'), el('span', 'Node Core'))),
    el('div.start-unten',
      el('div.start-zeile', status, prozent),
      el('div.start-spur', spur)));
  document.body.appendChild(wurzel);

  let anteil = 0;
  const setze = a => {
    anteil = Math.max(anteil, Math.min(1, a));
    spur.style.width = (anteil * 100).toFixed(1) + '%';
    text(prozent, Math.round(anteil * 100) + ' %');
  };
  // Gleichmäßig weiter, auch wenn der Knoten schon fertig ist.
  const uhr = setInterval(() => setze(Math.min(0.92, (Date.now() - beginn) / MAX_MS)), 100);

  return {
    schritt(name, a) { text(status, name); setze(a); },
    /** Ausblenden -- frühestens nach MIN_MS, spätestens nach MAX_MS. `bereit()` darf früher beenden. */
    fertig(bereit = () => true) {
      return new Promise(fertigGeworden => {
        const pruefe = () => {
          const um = Date.now() - beginn;
          if (um >= MAX_MS || (um >= MIN_MS && bereit())) {
            clearInterval(uhr); clearInterval(warte);
            text(status, t('start.bereit')); setze(1);
            setTimeout(() => { wurzel.classList.add('weg'); setTimeout(() => wurzel.remove(), 500); fertigGeworden(); }, 250);
          }
        };
        const warte = setInterval(pruefe, 100);
        pruefe();
      });
    },
  };
}
