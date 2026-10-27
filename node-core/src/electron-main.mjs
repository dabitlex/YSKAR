/*
 * Die Desktop-Huelle des YSKAR Node Core, fuer Windows und Linux.
 *
 * Sie zeigt die Oberflaeche in einem eigenen Fenster und stellt dem Programm
 * bereit, was nur das Betriebssystem kann: Ordnerauswahl, Dateimanager,
 * Browser, den Start beim Anmelden und das Symbol im Infobereich neben der Uhr.
 *
 * Das Fenster selbst bleibt eine abgeschottete Seite ohne Zugriff auf das
 * System. Alles, was die Oberflaeche vom Betriebssystem braucht, erbittet sie
 * beim lokalen Server des Programms; der ruft die Funktionen hier unten.
 */
import { app, BrowserWindow, dialog, shell, Tray, Menu, powerMonitor, nativeImage } from 'electron';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { autostartPfad, autostartAn, setzeAutostartLinux, startProgramm } from './autostartLinux.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { NodeCoreApp } = require('../dist/node-core.cjs');

const SEITE = 'http://127.0.0.1:8650';
/** Dieselbe Kennung wie im Installer (appId) -- unter ihr fuehrt Windows das Programm. */
const KENNUNG = 'app.yskar.nodecore';
const LINUX = process.platform === 'linux';
/**
 * Das Programmsymbol. Zuerst neben der Anwendung (resources), dann im
 * Programmarchiv -- je nachdem, was das System an dieser Stelle laden kann.
 * Unter Linux ein PNG: Ein .ico laedt Electron nur unter Windows.
 */
const SYMBOLDATEI = LINUX ? 'icon.png' : 'icon.ico';
const SYMBOLE = [
  ...(process.resourcesPath ? [join(process.resourcesPath, SYMBOLDATEI)] : []),
  join(here, '..', 'build', SYMBOLDATEI),
];
/** So startet das System das Programm beim Anmelden -- dann ohne Fenster. */
const AUTOSTART_ARG = '--versteckt';
const VERSTECKT_GESTARTET = process.argv.includes(AUTOSTART_ARG);

let core = null;
let mainWindow = null;
let tray = null;
let quitting = false;

function log(message) {
  console.log(`[Electron] ${message}`);
}

function zeigeFenster() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function beende() {
  if (quitting) return;
  quitting = true;
  void shutdownCore().finally(() => app.quit());
}

/*
 * Das Symbol im Infobereich. Scheitert es -- kein Bild, kein Infobereich --,
 * laeuft das Programm ohne: Dann schliesst das Fenster wie bisher das
 * Programm, statt unsichtbar weiterzulaufen.
 */
function ladeSymbol() {
  for (const pfad of SYMBOLE) {
    try {
      const bild = nativeImage.createFromPath(pfad);
      if (!bild.isEmpty()) return bild;
    } catch { /* naechster Ort */ }
  }
  return null;
}

function baueTray(bild) {
  try {
    if (!bild) { log('Kein Symbol für den Infobereich gefunden.'); return; }
    const en = core?.sprache?.() === 'en';
    tray = new Tray(bild);
    tray.setToolTip('YSKAR Node Core');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: en ? 'Open' : 'Öffnen', click: zeigeFenster },
      { type: 'separator' },
      { label: en ? 'Quit' : 'Beenden', click: beende },
    ]));
    tray.on('click', zeigeFenster);
  } catch (error) {
    log(`Infobereich nicht verfügbar: ${error?.message || error}`);
    tray = null;
  }
}

/** Was das Programm vom Betriebssystem braucht. */
const huelle = {
  async waehleOrdner(start) {
    const wahl = { title: 'YSKAR Node Core', defaultPath: start, properties: ['openDirectory', 'createDirectory'] };
    const r = mainWindow && !mainWindow.isDestroyed()
      ? await dialog.showOpenDialog(mainWindow, wahl)
      : await dialog.showOpenDialog(wahl);
    return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
  },
  async oeffneOrdner(pfad) {
    const fehler = await shell.openPath(pfad);
    if (fehler) throw new Error(fehler);
  },
  async oeffneLink(url) {
    await shell.openExternal(url);
  },
  autostart() {
    // Aus dem Quellbaum gestartet gibt es keinen Eintrag, der dieses Programm meint.
    if (!app.isPackaged) return false;
    if (LINUX) return autostartAn(autostartPfad());
    return app.getLoginItemSettings({ args: [AUTOSTART_ARG] }).openAtLogin === true;
  },
  setzeAutostart(an) {
    if (!app.isPackaged) throw new Error('Den Start beim Anmelden gibt es nur im installierten Programm.');
    // Linux: eine .desktop-Datei in ~/.config/autostart (Electron kann das dort nicht).
    if (LINUX) return setzeAutostartLinux(autostartPfad(), an, startProgramm(), AUTOSTART_ARG);
    app.setLoginItemSettings({ openAtLogin: an, args: [AUTOSTART_ARG] });
  },
  infobereich() {
    return tray !== null;
  },
  beenden() {
    beende();
  },
};

async function createMainWindow() {
  log('Starte YSKAR Node Core...');

  core = new NodeCoreApp();
  core.setzeHuelle(huelle);
  await core.startGui();
  log('GUI-Server bereit.');

  const symbol = ladeSymbol();
  baueTray(symbol);
  // Beim Anmelden gestartet: ohne Fenster -- aber nur, wenn es im Infobereich
  // ein Symbol gibt, ueber das man es wieder oeffnen kann.
  const ohneFenster = VERSTECKT_GESTARTET && tray !== null;

  /*
   * Die eigene Titelleiste: Das Fenster hat keinen Rahmen, die Oberflaeche
   * zeichnet Zeichen, Namen und Suche. Minimieren, Maximieren und Schliessen
   * zeichnet weiter das System darueber (titleBarOverlay) -- so verhalten
   * sie sich genau wie bei jedem anderen Programm. Unter Linux laesst sich
   * das abschalten (Einstellungen, gilt nach dem Neustart).
   */
  const eigeneTitelleiste = !(LINUX && core.systemTitelleiste?.());

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'YSKAR Node Core',
    ...(symbol ? { icon: symbol } : {}),
    backgroundColor: '#000000',
    ...(eigeneTitelleiste ? {
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#000000', symbolColor: '#C3CCDF', height: 36 },
    } : {}),
    autoHideMenuBar: true,
    show: false,
    center: true,

    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: true,
    },
  });

  mainWindow.removeMenu();

  const zeigeBeimStart = () => {
    if (ohneFenster) return;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  };

  /*
   * Das Fenster zeigt nur die eigene Oberflaeche. Ein Link nach draussen
   * oeffnet sich im Browser des Nutzers -- und nur, wenn das Programm die
   * Adresse kennt. Im Fenster selbst wird nie eine fremde Seite geladen.
   */
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const erlaubt = core?.linkErlaubt(url);
    if (erlaubt) shell.openExternal(erlaubt).catch(() => { /* kein Browser -- dann eben nicht */ });
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${SEITE}/`)) event.preventDefault();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    log('YSKAR-Oberfläche geladen.');
    zeigeBeimStart();
  });

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL) => {
      log(
        `GUI-Ladefehler ${errorCode}: ${errorDescription} · ${validatedURL}`
      );
    }
  );

  mainWindow.once('ready-to-show', () => {
    log('Fenster ist bereit.');
    zeigeBeimStart();
  });

  /*
   * Fenster schliessen. Mit "Beim Schliessen weiterlaufen" verschwindet es
   * nur in den Infobereich -- vorausgesetzt, dort gibt es das Symbol.
   */
  mainWindow.on('close', event => {
    if (quitting) return;
    if (tray !== null && core?.imHintergrund()) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Das System faehrt herunter oder meldet ab: Dann kommt kein "before-quit".
  // Der Knoten soll trotzdem ordentlich schliessen, soweit die Zeit reicht.
  mainWindow.on('session-end', () => {
    quitting = true;
    void shutdownCore();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;

    if (!quitting) {
      quitting = true;
      void shutdownCore().finally(() => app.quit());
    }
  });

  try {
    /*
      Den Zugangsschluessel der Oberflaeche als Cookie in die Sitzung dieses
      Fensters legen -- bevor die Seite laedt. Er steht nicht mehr in der
      Seite selbst (Befund S8); so bekommt ihn nur dieses Fenster.
      HttpOnly: Das Skript der Seite braucht ihn nicht zu sehen. SameSite
      Strict: Eine fremde Seite kann ihn nicht mitschicken lassen. Ohne
      Ablaufdatum: Er gilt nur, solange das Programm laeuft.
    */
    await mainWindow.webContents.session.cookies.set({
      url: SEITE, name: 'yskar_zugang', value: core.zugangFuerFenster(),
      httpOnly: true, sameSite: 'strict',
    });
    await mainWindow.loadURL(`${SEITE}/`, {
      extraHeaders: 'Cache-Control: no-cache\n',
    });
  } catch (error) {
    log(`GUI konnte nicht geladen werden: ${error?.message || error}`);
    throw error;
  }

  if (
    !ohneFenster &&
    mainWindow &&
    !mainWindow.isDestroyed() &&
    !mainWindow.isVisible()
  ) {
    log('Fallback: Fenster nach loadURL anzeigen.');
    mainWindow.show();
    mainWindow.focus();
  }
}

/*
 * Das Programm herunterfahren -- EINMAL, auch wenn mehrere Wege gleichzeitig
 * hierher fuehren (Fenster zu, "Beenden" im Infobereich, Knopf in der
 * Oberflaeche). Jeder Aufrufer wartet auf dasselbe Ende.
 *
 * Mit Zeitgrenze: Haengt etwas, beendet sich das Programm trotzdem. Sonst
 * bliebe ein unsichtbarer Rest zurueck, der den naechsten Start blockiert.
 */
let shutdownLauf = null;

function shutdownCore() {
  if (shutdownLauf) return shutdownLauf;
  shutdownLauf = (async () => {
    if (tray) {
      try { tray.destroy(); } catch { /* schon weg */ }
      tray = null;
    }

    const current = core;
    core = null;
    if (!current) return;

    try {
      await Promise.race([
        current.shutdown(),
        new Promise(weiter => setTimeout(weiter, 10_000)),
      ]);
    } catch (error) {
      console.error('[Electron] Fehler beim Beenden:', error);
    }
  })();
  return shutdownLauf;
}

/*
 * Nur EIN Programm. Ein zweiter Start faende die Anschluesse belegt und
 * scheiterte -- stattdessen kommt das laufende Fenster nach vorn. Das ist vor
 * allem dann wichtig, wenn das Programm unsichtbar im Infobereich laeuft.
 */
const einzig = app.requestSingleInstanceLock();

if (!einzig) {
  app.quit();
} else {
  // Vor allem anderen: Unter dieser Kennung legt Windows auch den Start beim Anmelden ab (nur Windows).
  app.setAppUserModelId(KENNUNG);
  app.on('second-instance', () => zeigeFenster());

  app.whenReady()
    .then(async () => {
      await createMainWindow();

      // Bildschirm gesperrt oder Ruhezustand: Die Wallet sperrt sich mit.
      // (Die Sperre des Bildschirms meldet Electron nur unter Windows und macOS.)
      try {
        powerMonitor.on('lock-screen', () => core?.sperreWallet());
        powerMonitor.on('suspend', () => core?.sperreWallet());
      } catch (error) {
        log(`Sperren mit dem System nicht verfügbar: ${error?.message || error}`);
      }
    })
    .catch(async error => {
      console.error('[Electron] Startfehler:', error);

      try {
        await dialog.showMessageBox({
          type: 'error',
          title: 'YSKAR Node Core',
          message: 'YSKAR Node Core konnte nicht gestartet werden.',
          detail: error?.stack || String(error),
        });
      } finally {
        quitting = true;
        await shutdownCore();
        app.quit();
      }
    });

  app.on('activate', () => {
    if (!mainWindow) {
      void createMainWindow().catch(error => {
        console.error(
          '[Electron] Fehler beim erneuten Öffnen:',
          error
        );
      });
    } else {
      zeigeFenster();
    }
  });

  app.on('window-all-closed', async () => {
    if (process.platform !== 'darwin') {
      quitting = true;
      await shutdownCore();
      app.quit();
    }
  });

  app.on('before-quit', event => {
    if (quitting) {
      return;
    }

    event.preventDefault();
    quitting = true;

    void shutdownCore().finally(() => app.quit());
  });
}
