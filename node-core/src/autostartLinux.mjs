/*
 * Start beim Anmelden unter Linux.
 *
 * Electron kann das nur unter Windows und macOS (setLoginItemSettings). Unter
 * Linux gilt der Standard von freedesktop.org: Eine .desktop-Datei im Ordner
 * ~/.config/autostart startet das Programm, wenn sich der Nutzer anmeldet.
 * GNOME, KDE, XFCE und Cinnamon halten sich daran.
 *
 * Die Datei gehoert diesem Programm allein; ausgeschaltet wird sie geloescht.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const DATEINAME = 'yskar-node-core.desktop';

/** Wo die Datei liegt: $XDG_CONFIG_HOME/autostart, sonst ~/.config/autostart. */
export function autostartPfad(env = process.env, heim = homedir()) {
  const basis = env.XDG_CONFIG_HOME && env.XDG_CONFIG_HOME.startsWith('/')
    ? env.XDG_CONFIG_HOME
    : join(heim, '.config');
  return join(basis, 'autostart', DATEINAME);
}

/*
 * Ein Argument fuer die Zeile Exec=. Nach der Desktop Entry Specification
 * steht es in doppelten Anfuehrungszeichen, darin werden " ` $ und \ mit \
 * geschuetzt. Ein % muss verdoppelt werden, sonst haelt der Starter es fuer
 * einen Platzhalter. Danach gilt fuer die ganze Datei: \ wird zu \\.
 */
export function execArgument(wert) {
  const innen = String(wert).replace(/[\\"`$]/g, z => '\\' + z).replace(/%/g, '%%');
  return ('"' + innen + '"').replace(/\\/g, '\\\\');
}

/**
 * Welches Programm gestartet wird. Ein AppImage nennt seinen eigenen Pfad in
 * APPIMAGE -- process.execPath zeigte nur in den Ordner, in den es sich beim
 * Start auspackt, und den gibt es nach dem Beenden nicht mehr.
 */
export function startProgramm(env = process.env, execPath = process.execPath) {
  return env.APPIMAGE && env.APPIMAGE.startsWith('/') ? env.APPIMAGE : execPath;
}

export function desktopEintrag(programm, argument) {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=YSKAR Node Core',
    'Comment=YSKAR Full Node',
    `Exec=${execArgument(programm)} ${argument}`,
    'Icon=yskar-node-core-app',
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
}

/** Ist der Start beim Anmelden eingeschaltet? */
export function autostartAn(pfad) {
  if (!existsSync(pfad)) return false;
  const text = readFileSync(pfad, 'utf8');
  // Ein Nutzer kann den Eintrag in den Einstellungen seines Desktops abschalten, ohne ihn zu loeschen.
  return !/^Hidden\s*=\s*true\s*$/mi.test(text) && !/^X-GNOME-Autostart-enabled\s*=\s*false\s*$/mi.test(text);
}

export function setzeAutostartLinux(pfad, an, programm, argument) {
  if (an) {
    mkdirSync(dirname(pfad), { recursive: true });
    writeFileSync(pfad, desktopEintrag(programm, argument), { mode: 0o644 });
  } else if (existsSync(pfad)) {
    unlinkSync(pfad);
  }
}
