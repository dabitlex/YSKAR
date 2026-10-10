/**
 * Was nur die Linux-Fassung betrifft: der Start beim Anmelden ueber eine
 * .desktop-Datei und die Texte, die unter Linux statt der Windows-Texte
 * erscheinen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// @ts-ignore -- reines JavaScript der Huelle
import { autostartPfad, autostartAn, setzeAutostartLinux, startProgramm, execArgument, desktopEintrag, DATEINAME } from '../src/autostartLinux.mjs';
// @ts-ignore -- reines JavaScript der Oberflaeche
import { t, setzePlattform } from '../ui/js/i18n.js';
// @ts-ignore
import { de } from '../ui/js/de.js';

test('Autostart: Pfad nach XDG, sonst ~/.config', () => {
  assert.equal(autostartPfad({}, '/home/anna'), `/home/anna/.config/autostart/${DATEINAME}`);
  assert.equal(autostartPfad({ XDG_CONFIG_HOME: '/srv/cfg' }, '/home/anna'), `/srv/cfg/autostart/${DATEINAME}`);
  // Ein relativer Wert ist nach der Spezifikation ungueltig und wird uebergangen.
  assert.equal(autostartPfad({ XDG_CONFIG_HOME: 'cfg' }, '/home/anna'), `/home/anna/.config/autostart/${DATEINAME}`);
});

test('Autostart: Ein AppImage startet ueber seinen eigenen Pfad', () => {
  assert.equal(startProgramm({ APPIMAGE: '/home/anna/Apps/YSKAR.AppImage' }, '/tmp/.mount_x/yskar'), '/home/anna/Apps/YSKAR.AppImage');
  assert.equal(startProgramm({}, '/opt/YSKAR Node Core/yskar-node-core-app'), '/opt/YSKAR Node Core/yskar-node-core-app');
});

test('Autostart: Exec= schuetzt Leerzeichen und Sonderzeichen', () => {
  assert.equal(execArgument('/opt/YSKAR Node Core/app'), '"/opt/YSKAR Node Core/app"');
  // " ` $ \ werden mit \ geschuetzt, danach jedes \ verdoppelt; % wird %%.
  assert.equal(execArgument('/a"b'), '"/a\\\\"b"');
  assert.equal(execArgument('/a$b`c'), '"/a\\\\$b\\\\`c"');
  assert.equal(execArgument('/a\\b'), '"/a\\\\\\\\b"');
  assert.equal(execArgument('/100%'), '"/100%%"');
  const e = desktopEintrag('/opt/YSKAR Node Core/yskar-node-core-app', '--versteckt');
  assert.match(e, /^\[Desktop Entry\]\n/);
  assert.match(e, /^Exec="\/opt\/YSKAR Node Core\/yskar-node-core-app" --versteckt$/m);
  assert.match(e, /^Type=Application$/m);
});

test('Autostart: einschalten, erkennen, ausschalten', () => {
  const heim = mkdtempSync(join(tmpdir(), 'yskar-autostart-'));
  const pfad = autostartPfad({}, heim);
  assert.equal(autostartAn(pfad), false);
  setzeAutostartLinux(pfad, true, '/opt/YSKAR Node Core/yskar-node-core-app', '--versteckt');
  assert.equal(autostartAn(pfad), true);
  assert.match(readFileSync(pfad, 'utf8'), /--versteckt/);
  setzeAutostartLinux(pfad, false, '', '');
  assert.equal(existsSync(pfad), false);
  assert.equal(autostartAn(pfad), false);
  // Ausschalten ohne Datei ist kein Fehler.
  setzeAutostartLinux(pfad, false, '', '');
});

test('Autostart: In den Einstellungen des Desktops abgeschaltet gilt als aus', () => {
  const heim = mkdtempSync(join(tmpdir(), 'yskar-autostart-'));
  const pfad = autostartPfad({}, heim);
  setzeAutostartLinux(pfad, true, '/usr/bin/x', '--versteckt');
  writeFileSync(pfad, readFileSync(pfad, 'utf8') + 'Hidden=true\n');
  assert.equal(autostartAn(pfad), false);
  setzeAutostartLinux(pfad, true, '/usr/bin/x', '--versteckt');
  writeFileSync(pfad, readFileSync(pfad, 'utf8').replace('X-GNOME-Autostart-enabled=true', 'X-GNOME-Autostart-enabled=false'));
  assert.equal(autostartAn(pfad), false);
});

test('Texte: Unter Linux gilt die Fassung .linux, unter Windows die Grundfassung', () => {
  try {
    setzePlattform('win32');
    assert.equal(t('einst.autostart'), 'Mit Windows starten');
    setzePlattform('linux');
    assert.equal(t('einst.autostart'), 'Beim Anmelden starten');
    assert.doesNotMatch(t('einr.firewall'), /Windows/);
    assert.doesNotMatch(t('betr.heimnetzOffen'), /Windows/);
    // Ohne eigene Linux-Fassung bleibt der gewoehnliche Text.
    assert.equal(t('nav.pool'), de['nav.pool']);
  } finally {
    setzePlattform('win32');
  }
});

test('Texte: Jede Linux-Fassung hat eine Grundfassung, und kein Linux-Text spricht von Windows', () => {
  for (const k of Object.keys(de).filter(k => k.endsWith('.linux'))) {
    assert.ok(k.slice(0, -'.linux'.length) in de, `${k}: keine Grundfassung`);
    assert.doesNotMatch(String(de[k]), /Windows/, k);
  }
});
