const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('opensendDesktop', {
  // File dialog
  openFileDialog: () => ipcRenderer.invoke('dialog:openFiles'),

  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion'),

  // File saving
  saveToDisk: (fileName, buffer) =>
    ipcRenderer.invoke('file:saveToDisk', { fileName, buffer }),

  showInFolder: (filePath) =>
    ipcRenderer.invoke('file:showInFolder', filePath),

  // Listen for menu-triggered file picker
  onOpenFilePicker: (callback) => {
    ipcRenderer.on('open-file-picker', () => callback());
    return () => ipcRenderer.removeAllListeners('open-file-picker');
  },
});
