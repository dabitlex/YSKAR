/* Pool betreiben: andere über den eigenen Knoten gemeinsam minen lassen. */
import { sende, el, fuelle, text, chip, knopf, kopf, melde, schalter, zeichen, zahl, ysr, leistung, kurzAdresse, vor, knotenText } from './kern.js';
import { t, sprache } from './i18n.js';

/** Dieselbe Regel wie im Knoten: druckbares ASCII, 3 bis 32 Zeichen, mindestens ein Buchstabe oder eine Ziffer. */
function nameGrund(v) {
  if (v === '') return t('betr.nameFehlt');
  const z = [...v].map(c => c.codePointAt(0));
  if (z.some(c => c < 0x20 || c > 0x7e)) return t('min.nameZeichen');
  if (z.length > 32) return t('min.nameLang', z.length);
  if (z.length < 3) return t('min.nameKurz');
  if (!/[a-zA-Z0-9]/.test(v)) return t('min.nameBuchstabe');
  return null;
}

const prozent = bps => (bps / 100).toLocaleString(sprache() === 'en' ? 'en-GB' : 'de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' %';
const anteilText = a => (a * 100).toLocaleString(sprache() === 'en' ? 'en-GB' : 'de-DE', { maximumFractionDigits: a < 0.1 ? 1 : 0 }) + ' %';

const ANLEITUNG = 'https://github.com/dabitlex/YSKAR/blob/main/docs/POOL_BETRIEB.md';

export function baue(ctx) {
  const zustand = el('span');
  const an = schalter(t('betr.aktiv'), false, schalte);

  // Kennzahlen
  const k = {
    miner: el('b', '—'), minerSub: el('span', ''),
    leistung: el('b', '—'), leistungSub: el('span', ''),
    bloecke: el('b', '—'), bloeckeSub: el('span', ''),
    gebuehr: el('b', '—'), gebuehrSub: el('span', ''),
  };

  // Einstellungen
  const name = el('input.feld', { id: 'b-name', type: 'text', maxlength: 32, spellcheck: 'false', autocomplete: 'off' });
  const nameHinweis = el('p.hinweis');
  const gebuehr = el('input', { id: 'b-gebuehr', type: 'range', min: 0, max: 500, step: 25, value: 0 });
  const gebuehrText = el('span.mono', { style: 'font-size:13px' });
  const gebuehrBald = el('div.notiz', { hidden: true });
  const gehtAn = el('div.box.karte-kopf', { style: 'font-size:13.5px' });
  const plaetze = el('input', { id: 'b-plaetze', type: 'range', min: 1, max: 64, step: 1, value: 64 });
  const plaetzeText = el('span.mono', { style: 'font-size:13px' });
  const fehler = el('div.fehler', { hidden: true, role: 'alert' });
  const neustart = el('div.warnung', { hidden: true }, zeichen('info', 18),
    el('span', { style: 'flex:1 1 auto' }, t('betr.neustartNoetig')),
    knopf(t('betr.neuStarten'), starteNeu, 'klein'));
  const speichern = knopf(t('allg.speichern'), speichere, 'haupt');

  // Wer kann mitmachen
  const hierChip = el('span');
  const hierText = el('span.hinweis');
  const heim = schalter(t('betr.heimnetz'), false, async neu => { zeigeAntwort(await sende('/api/pool/betrieb', { heimnetz: neu })); await ctx.neuLaden(); });
  const heimText = el('span.hinweis');
  const heimAdressen = el('span.stapel', { style: 'gap:2px' });

  const miner = el('tbody');
  const minerMehr = el('p.hinweis', { hidden: true });

  let gefuellt = false;
  let beschaeftigt = false;

  const formular = () => ({ name: name.value.trim(), feeBps: Number(gebuehr.value), plaetze: Number(plaetze.value) });

  /** Mit Gebühr gehört ein Platz dem Betreiber: höchstens 63 statt 64. */
  function zeigeRegler() {
    const grenze = Number(gebuehr.value) > 0 ? 63 : 64;
    plaetze.max = grenze;
    if (Number(plaetze.value) > grenze) plaetze.value = grenze;
    text(gebuehrText, prozent(Number(gebuehr.value)));
    text(plaetzeText, plaetze.value);
  }
  function zeigeName() {
    const grund = name.value.trim() === '' ? null : nameGrund(name.value.trim());
    nameHinweis.className = 'hinweis' + (grund ? ' schlecht' : '');
    text(nameHinweis, grund ?? t('betr.nameHinweis'));
  }
  name.addEventListener('input', zeigeName);
  gebuehr.addEventListener('input', zeigeRegler);
  plaetze.addEventListener('input', zeigeRegler);

  /** Fehlertext in der Sprache der Oberfläche, wenn der Knoten ein Kürzel mitschickt. */
  function fehlerText(e) {
    const schluessel = 'betr.fehler.' + (e.code || '');
    const eigen = e.code ? t(schluessel) : schluessel;
    return eigen !== schluessel ? eigen : e.message;
  }
  function zeigeFehler(e) { text(fehler, fehlerText(e)); fehler.hidden = false; }

  /** Die Antwort des Knotens gilt sofort -- nicht erst beim nächsten Takt. */
  function zeigeAntwort(betrieb) {
    const s = ctx.stand();
    if (s) { s.betrieb = betrieb; aktualisiere(s); }
  }

  async function schalte(neu) {
    fehler.hidden = true;
    try {
      if (neu) {
        const grund = nameGrund(name.value.trim());
        if (grund) throw new Error(grund);
        zeigeAntwort(await sende('/api/pool/betrieb', { ...formular(), aktiv: true }));
      } else {
        zeigeAntwort(await sende('/api/pool/betrieb', { aktiv: false }));
      }
      await ctx.neuLaden();
    } catch (e) { throw new Error(fehlerText(e)); }   // der Schalter springt zurück und meldet es
  }

  async function speichere() {
    fehler.hidden = true;
    beschaeftigt = true; speichern.disabled = true;
    try {
      const grund = name.value.trim() === '' && !ctx.stand()?.betrieb?.config.aktiv ? null : nameGrund(name.value.trim());
      if (grund) throw new Error(grund);
      zeigeAntwort(await sende('/api/pool/betrieb', formular()));
      melde(t('einst.gespeichert'));
    } catch (e) { zeigeFehler(e); }
    beschaeftigt = false; speichern.disabled = false;
  }

  /** Name und Plätze gelten erst für einen neu gestarteten Pool. */
  async function starteNeu() {
    fehler.hidden = true;
    try {
      await sende('/api/pool/betrieb', { aktiv: false });
      zeigeAntwort(await sende('/api/pool/betrieb', { aktiv: true }));
      melde(t('betr.neuGestartet'));
    } catch (e) { zeigeFehler(e); }
    await ctx.neuLaden();
  }

  const reihe = (bild, farbe, titel, inhalt, rechts) => el('div.mitmachen',
    el('span.mitmachen-bild' + (farbe ? '.' + farbe : ''), zeichen(bild, 18)),
    el('span.mitmachen-text', el('b', titel), inhalt),
    rechts);

  const wurzel = el('div.stapel',
    kopf(t('betr.titel'), t('betr.sub'), zustand, an),
    el('section.kennzahlen', { 'aria-label': t('betr.kennzahlen') },
      el('div.stat', el('span.cap', t('pool.miner')), k.miner, k.minerSub),
      el('div.stat', el('span.cap', t('betr.leistung')), k.leistung, k.leistungSub),
      el('div.stat', el('span.cap', t('betr.bloecke')), k.bloecke, k.bloeckeSub),
      el('div.stat', el('span.cap', t('betr.gebuehr')), k.gebuehr, k.gebuehrSub)),
    el('div.spalten',
      el('section.karte', { style: 'flex:1 1 400px;gap:16px', 'aria-label': t('min.einstellungen') },
        el('h2', t('min.einstellungen')),
        el('div.feldgruppe', el('label', { for: 'b-name' }, t('betr.name')), name, nameHinweis),
        el('div.feldgruppe',
          el('div.karte-kopf', el('label', { for: 'b-gebuehr' }, t('pool.gebuehr')), gebuehrText),
          gebuehr,
          el('div.skala', { 'aria-hidden': 'true' }, el('span', '0 %'), el('span', '5 %')),
          el('p.hinweis', t('betr.gebuehrHinweis')),
          gebuehrBald),
        el('div.feldgruppe', el('span.feldname', t('betr.gehtAn')), gehtAn),
        el('div.feldgruppe',
          el('div.karte-kopf', el('label', { for: 'b-plaetze' }, t('betr.plaetze')), plaetzeText),
          plaetze,
          el('p.hinweis', t('betr.plaetzeHinweis'))),
        neustart, fehler,
        el('div.karte-kopf', el('span.hinweis', { style: 'flex:1 1 200px' }, t('betr.geltenNach')), speichern)),
      el('div.stapel', { style: 'flex:1 1 400px;min-width:0' },
        el('section.karte', { style: 'gap:0', 'aria-label': t('betr.wer') },
          el('h2', { style: 'margin-bottom:6px' }, t('betr.wer')),
          reihe('pc', 'gruen', t('betr.hier'), hierText, hierChip),
          reihe('haus', 'gruen', t('betr.heimnetz'), [heimText, heimAdressen], heim),
          reihe('welt', 'gelb', t('betr.internet'),
            [el('span.hinweis', t('betr.internetText')), el('a', { href: ANLEITUNG, target: '_blank', rel: 'noreferrer', style: 'font-size:13px' }, t('betr.anleitung'))],
            chip('gelb', t('betr.selbst'))),
          reihe('leute', '', t('betr.liste'), el('span.hinweis', t('betr.listeText')),
            el('button.knopf.klein', { type: 'button', disabled: true, title: t('betr.listeText') }, t('betr.listeAnfragen')))),
        el('section.karte', { 'aria-label': t('betr.minerTitel') },
          el('div.karte-kopf', el('h2', t('betr.minerTitel')), el('span.hinweis', t('betr.fenster'))),
          el('div.tab-huelle', el('table.tab',
            el('thead', el('tr', el('th', t('kette.adresse')), el('th.r', t('min.leistung')), el('th.r', t('betr.anteil')), el('th.r', t('betr.letzterShare')))),
            miner)),
          minerMehr,
          el('p.hinweis', t('betr.fensterBleibt'))))));

  function aktualisiere(s) {
    const b = s.betrieb;
    if (!b) return;
    const c = b.config;
    if (!gefuellt) {
      name.value = c.name; gebuehr.value = c.feeBps; plaetze.value = c.plaetze;
      zeigeRegler(); zeigeName();
      gefuellt = true;
    }
    an.setAttribute('aria-checked', c.aktiv ? 'true' : 'false');
    heim.setAttribute('aria-checked', c.heimnetz ? 'true' : 'false');
    speichern.disabled = beschaeftigt;

    fuelle(zustand, b.laeuft ? chip('gruen hoch', t('betr.laeuft'), true)
      : c.aktiv && !s.running ? chip('hoch', t('betr.wartetAufKnoten'))
      : c.aktiv ? chip('gelb hoch', t('betr.nichtGestartet'), true)
      : chip('hoch', t('betr.aus')));
    if (!b.laeuft && c.aktiv && b.fehler && fehler.hidden) { text(fehler, knotenText(b.fehlerCode, [], b.fehler)); fehler.hidden = false; }
    neustart.hidden = !b.neustartNoetig;

    // Kennzahlen
    const a = b.auskunft;
    text(k.miner, a ? zahl(a.belegt) + ' / ' + zahl(a.plaetze) : '—');
    text(k.minerSub, a ? t('betr.frei', a.frei) : t('betr.poolAus'));
    // Die Leistung misst der Pool an den Shares -- das braucht ein paar davon.
    text(k.leistung, a && a.hashrate > 0 ? leistung(a.hashrate) : '—');
    text(k.leistungSub, a && a.hashrate > 0 && s.netzHashrate > 0
      ? t('betr.vomNetz', Math.max(1, Math.round(Math.min(1, a.hashrate / s.netzHashrate) * 100)))
      : a && a.miner > 0 && !(a.hashrate > 0) ? t('betr.wirdGemessen') : t('betr.gemessen'));
    text(k.bloecke, b.laeuft && b.bloecke !== null ? zahl(b.bloecke) : '—');
    text(k.bloeckeSub, b.laeuft && b.letzterBlock !== null ? t('betr.zuletzt', zahl(b.letzterBlock)) : b.laeuft && b.bloecke === null ? t('betr.zaehlt') : t('betr.nochKeiner'));
    const gilt = b.angewandt ? b.angewandt.feeBps : c.feeBps;
    text(k.gebuehr, prozent(gilt));
    text(k.gebuehrSub, gilt > 0 ? t('betr.jeBlock', ysr((BigInt(s.naechsteBelohnung ?? '0') * BigInt(gilt)) / 10000n)) : t('betr.keineGebuehr'));

    // Eine geänderte Gebühr wirkt erst ab dem nächsten Block.
    const bald = b.angewandt?.feeBpsNaechster;
    gebuehrBald.hidden = bald === null || bald === undefined || bald === b.angewandt.feeBps;
    if (!gebuehrBald.hidden) fuelle(gebuehrBald, zeichen('info', 18), el('span', t('betr.gebuehrBald', prozent(bald), prozent(b.angewandt.feeBps))));

    fuelle(gehtAn, b.auszahlung
      ? [el('span', { style: 'font-weight:700' }, t('min.meineWallet')), el('span.mono.dim', kurzAdresse(b.auszahlung))]
      : [el('span', t('betr.keineWallet')), el('a', { href: '#/wallet' }, t('betr.walletAnlegen'))]);

    // Wer kann mitmachen
    fuelle(hierChip, b.eigenerMiner ? chip('gruen', [zeichen('haken', 14), t('betr.hierAktiv')])
      : b.laeuft ? el('a.knopf.klein', { href: '#/mining' }, t('betr.zumMining')) : null);
    text(hierText, b.eigenerMiner ? t('betr.hierLaeuft') : t('betr.hierText'));
    const offen = b.heimnetz.offen;
    text(heimText, offen ? t('betr.heimnetzOffen') : c.heimnetz && !b.laeuft ? t('betr.heimnetzWartet') : t('betr.heimnetzText'));
    fuelle(heimAdressen, offen
      ? (b.heimnetz.adressen.length ? b.heimnetz.adressen.map(x => el('span.mono.umbruch', { style: 'font-size:12.5px;color:var(--label)' }, x))
        : el('span.hinweis', t('betr.heimnetzKeine')))
      : null);

    // Miner im Pool
    fuelle(miner, b.miner.length ? b.miner.map(m => el('tr',
      el('td.mono', kurzAdresse(m.adresse), m.du ? el('span.gut', { style: 'font-family:Manrope,sans-serif;font-weight:700' }, ' · ' + t('kette.du')) : null),
      m.verbunden && m.hashrate === null ? el('td.r.dim', t('betr.wirdGemessen')) : el('td.r.mono', m.verbunden ? leistung(m.hashrate) : '—'),
      el('td.r.mono', anteilText(m.anteil)),
      el('td.r.dim', m.letzterShare ? vor(m.letzterShare) : m.verbunden ? t('betr.nochKeinShare') : t('pool.getrennt'))))
      : el('tr', el('td.leer', { colspan: 4 }, b.laeuft ? t('betr.niemand') : t('betr.poolAus'))));
    minerMehr.hidden = !(b.weitere > 0);
    if (b.weitere > 0) text(minerMehr, t('betr.weitere', b.weitere));
  }

  return { wurzel, aktualisiere };
}
