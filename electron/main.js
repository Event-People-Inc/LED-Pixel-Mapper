const { app, BrowserWindow, shell, session, ipcMain, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const licenseManager = require('./licenseManager');

// ── Security: disable remote module & enforce single instance ─────────────────
app.disableHardwareAcceleration(); // remove if GPU features needed

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// Track the main window so IPC handlers (registered once) can always find it
let mainWin = null;

// ── Security: block insecure content loading before any window opens ──────────
app.on('ready', () => {
  // Content Security Policy — only allow resources from app origin
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self';" +
          " script-src 'self';" +
          " style-src 'self' 'unsafe-inline';" +
          " img-src 'self' data: blob:;" +
          " font-src 'self' data:;" +
          " connect-src 'none';" +
          " object-src 'none';" +
          " frame-src 'none';"
        ],
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY'],
        'Referrer-Policy': ['no-referrer'],
      },
    });
  });

  // ── Register ALL IPC handlers once here — never inside createWindow ──────────
  ipcMain.handle('license:get-status', () => licenseManager.getStatus());
  ipcMain.handle('license:activate',   (_, key) => licenseManager.activate(key));
  ipcMain.handle('license:check',      () => licenseManager.periodicCheck());

  ipcMain.handle('file:show-save-dialog', async (_, suggestedName) => {
    const win = mainWin;
    if (!win || win.isDestroyed()) return null;
    const { filePath } = await dialog.showSaveDialog(win, {
      title: 'Save Project',
      defaultPath: suggestedName,
      filters: [{ name: 'LED Pixel Mapper Project', extensions: ['lpmap.json'] }],
    });
    return filePath ?? null;
  });

  ipcMain.handle('file:save-to-path', async (_, filePath, json) => {
    try {
      await fs.promises.writeFile(filePath, json, 'utf8');
      return { success: true };
    } catch (err) {
      return { success: false, message: String(err) };
    }
  });

  ipcMain.on('confirm-close', () => {
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.destroy();
    }
  });

  // Kick off background re-verify (sets status from cache synchronously first)
  licenseManager.periodicCheck().catch(() => {});

  createWindow();
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'LED Pixel Mapper',
    backgroundColor: '#0e1420',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      // Core isolation — never relax these
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),

      // Disable features not needed
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      navigateOnDragDrop: false,

      // No spellcheck / autofill leaking user data
      spellcheck: false,
    },
  });

  mainWin = win;

  win.loadFile(path.join(__dirname, '../dist/index.html'));

  // ── Open external links in the system browser, not inside the app ──────────
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // ── Block renderer from navigating away from the app ──────────────────────
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
    }
  });

  win.webContents.on('will-redirect', (event) => {
    event.preventDefault();
  });

  // ── Disable DevTools in production builds ─────────────────────────────────
  if (app.isPackaged) {
    win.webContents.on('devtools-opened', () => {
      win.webContents.closeDevTools();
    });
    // Block keyboard shortcut too
    win.webContents.on('before-input-event', (event, input) => {
      if (
        (input.key === 'F12') ||
        (input.control && input.shift && input.key === 'I') ||
        (input.control && input.shift && input.key === 'J')
      ) {
        event.preventDefault();
      }
    });
  }

  // Remove the default menu bar
  win.setMenuBarVisibility(false);

  // ── Intercept close — ask renderer if it's OK to close ───────────────────
  win.on('close', (e) => {
    if (win.isDestroyed()) return;
    e.preventDefault();
    win.webContents.send('will-close');
  });

  win.on('closed', () => {
    if (mainWin === win) mainWin = null;
  });
}

// ── Focus existing window if second instance is launched ──────────────────────
app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
