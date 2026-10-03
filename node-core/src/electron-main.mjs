/*
 * Die Windows-Huelle des YSKAR Node Core.
 *
 * Sie zeigt die Oberflaeche in einem eigenen Fenster und stellt dem Programm
 * bereit, was nur das Betriebssystem kann: Ordnerauswahl, Explorer, Browser,
 * den Start mit Windows und das Symbol im Infobereich neben der Uhr.
 *
 * Das Fenster selbst bleibt eine abgeschottete Seite ohne Zugriff auf das
 * System. Alles, was die Oberflaeche von Windows braucht, erbittet sie beim
 * lokalen Server des Programms; der ruft die Funktionen hier unten.
 */
import { app, BrowserWindow, dialog, shell, Tray, Menu, powerMonitor, nativeImage } from 'electron';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { NodeCoreApp } = require('../dist/node-core.cjs');

const SEITE = 'http://127.0.0.1:8650';
const SYMBOL = join(here, '..', 'build', 'icon.ico');
/** So startet Windows das Programm beim Anmelden -- dann ohne Fenster. */
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
  try {
    const bild = nativeImage.createFromPath(SYMBOL);
    return bild.isEmpty() ? null : bild;
  } catch {
    return null;
  }
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

/** Was das Programm von Windows braucht. */
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
    return app.getLoginItemSettings({ args: [AUTOSTART_ARG] }).openAtLogin === true;
  },
  setzeAutostart(an) {
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
  // Mit Windows gestartet: ohne Fenster -- aber nur, wenn es im Infobereich
  // ein Symbol gibt, ueber das man es wieder oeffnen kann.
  const ohneFenster = VERSTECKT_GESTARTET && tray !== null;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    title: 'YSKAR Node Core',
    ...(symbol ? { icon: symbol } : {}),
    backgroundColor: '#0b0f14',
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
    if (erlaubt) void shell.openExternal(erlaubt);
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

  mainWindow.on('closed', () => {
    mainWindow = null;

    if (!quitting) {
      quitting = true;
      void shutdownCore().finally(() => app.quit());
    }
  });

  try {
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

async function shutdownCore() {
  if (tray) {
    try { tray.destroy(); } catch { /* schon weg */ }
    tray = null;
  }

  if (!core) {
    return;
  }

  const current = core;
  core = null;

  try {
    await current.shutdown();
  } catch (error) {
    console.error('[Electron] Fehler beim Beenden:', error);
  }
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
  app.on('second-instance', zeigeFenster);

  app.whenReady()
    .then(async () => {
      await createMainWindow();

      // Windows gesperrt oder im Ruhezustand: Die Wallet sperrt sich mit.
      try {
        powerMonitor.on('lock-screen', () => core?.sperreWallet());
        powerMonitor.on('suspend', () => core?.sperreWallet());
      } catch (error) {
        log(`Sperren mit Windows nicht verfügbar: ${error?.message || error}`);
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
