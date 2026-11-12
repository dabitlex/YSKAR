/*
 * Steht in jeder Seite im Kopf und läuft vor allem anderen:
 *   - merkt, dass Skripte laufen und ob Bewegung erwünscht ist
 *   - leitet alte Anker der früheren Seiten an ihren neuen Ort weiter
 *   - wählt die Sprache (?lang=, gemerkte Wahl, Sprache des Browsers, sonst Englisch) und lädt ihre Texte
 *   - fragt den Stand der Kette schon an, während Stile und Programm noch laden
 * __LANGS__, __TEXTS__ und __LEGACY__ setzt tools/build.mjs ein.
 */
(function (d, w) {
  var c = d.documentElement.classList, LANGS = __LANGS__, TEXTS = __TEXTS__, OLD = __LEGACY__, lang = null, list, i, s;
  // Überblenden zwischen Seiten: Bricht der Browser es ab (etwa bei einer Weiterleitung), ist das kein Fehler
  function calm(e) { var v = e.viewTransition; if (v) { v.ready.catch(function () {}); v.finished.catch(function () {}); } }
  w.addEventListener('pagereveal', calm); w.addEventListener('pageswap', calm);

  var to = OLD && OLD[(location.hash || '').slice(1)];
  if (to) { location.replace(to); return; }

  c.add('js');
  c.add(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'no-anim' : 'anim');
  // Kommt das Programm nicht oder zu spät, bleibt die Seite lesbar: Nach vier Sekunden gilt sie als fertig, ohne Bewegung
  setTimeout(function () { c.add('ready'); c.remove('lang-wait'); if (!w.__booted) { c.remove('anim'); c.add('no-anim'); } }, 4000);

  function known(x) { x = String(x || '').slice(0, 2).toLowerCase(); return LANGS.indexOf(x) >= 0 ? x : null; }
  try { lang = known(new URLSearchParams(location.search).get('lang')); } catch (e) { /* alter Browser */ }
  if (!lang) try { lang = known(w.localStorage.getItem('yskar.sprache')); } catch (e) { /* Speicher gesperrt */ }
  if (!lang) {
    list = [].concat(navigator.languages || [], navigator.language || []);
    for (i = 0; i < list.length && !lang; i++) lang = known(list[i]);
  }
  lang = lang || 'en';
  w.YSKAR_LANG = lang;
  d.documentElement.lang = lang;
  if (lang !== 'en') c.add('lang-wait');          // die Seite trägt englischen Text; bis die gewählte Sprache steht, bleibt er verborgen
  s = d.createElement('script'); s.async = true; s.setAttribute('data-texts', lang); s.src = '/assets/i18n/' + lang + '.js?v=' + TEXTS[lang];
  s.onerror = function () { (w.YSKAR_AUS = w.YSKAR_AUS || {})[lang] = true; if (w.YSKAR_TEXTE_AUS) w.YSKAR_TEXTE_AUS(lang); };
  d.head.appendChild(s);

  if (w.fetch && /^https?:$/.test(location.protocol)) {
    var get = function (p) { return fetch('/api/v2' + p, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); };
    w.YSKAR_EARLY = Promise.all([get('/summary'), get('/blocks?limit=50')]).then(function (r) { return { at: Date.now(), summary: r[0], blocks: r[1] }; }, function () { return null; });
  }
})(document, window);
