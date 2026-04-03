const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** Registers a callback that fires when the window is about to close. */
  onWillClose: (callback) => ipcRenderer.on('will-close', () => callback()),
  /** Tells the main process to go ahead and close the window. */
  confirmClose: () => ipcRenderer.send('confirm-close'),
  /** License management (main-process verified, not bypassable via DevTools) */
  license: {
    getStatus: ()    => ipcRenderer.invoke('license:get-status'),
    activate:  (key) => ipcRenderer.invoke('license:activate', key),
    check:     ()    => ipcRenderer.invoke('license:check'),
  },
  /** Native file save (bypasses browser sandbox restrictions) */
  file: {
    showSaveDialog: (suggestedName) => ipcRenderer.invoke('file:show-save-dialog', suggestedName),
    saveToPath:     (filePath, json) => ipcRenderer.invoke('file:save-to-path', filePath, json),
  },
});
