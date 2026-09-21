import { app, BrowserWindow, dialog } from 'electron';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { NodeCoreApp } = require('../dist/node-core.cjs');

let core = null;
let mainWindow = null;
let quitting = false;

function log(message) {
  console.log(`[Electron] ${message}`);
}

async function createMainWindow() {
  log('Starte YSKAR Node Core...');

  core = new NodeCoreApp();
  await core.startGui();
  log('GUI-Server bereit.');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    title: 'YSKAR Node Core',
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

  mainWindow.webContents.on('did-finish-load', () => {
    log('YSKAR-Oberfläche geladen.');

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
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

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
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
    await mainWindow.loadURL('http://127.0.0.1:8650/', {
      extraHeaders: 'Cache-Control: no-cache\n',
    });
  } catch (error) {
    log(`GUI konnte nicht geladen werden: ${error?.message || error}`);
    throw error;
  }

  if (
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

app.whenReady()
  .then(async () => {
    await createMainWindow();
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
    mainWindow.show();
    mainWindow.focus();
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
