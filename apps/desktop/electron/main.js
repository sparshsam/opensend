const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;
const WEB_DIR = path.join(__dirname, '..', '..', 'out');
const INDEX_HTML = path.join(WEB_DIR, 'index.html');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 400,
    minHeight: 600,
    title: 'OpenSend',
    icon: path.join(__dirname, '..', 'resources', 'icon.ico'),
    backgroundColor: '#1a0422',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Load the web app
  if (isDev) {
    // Dev mode: load from local dev server or static export
    const devUrl = process.env.OPENDEV_URL || `file://${INDEX_HTML}`;
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(INDEX_HTML);
  }

  // Show window when ready to avoid white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Build application menu
  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Send Files...',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow.webContents.send('open-file-picker'),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About OpenSend',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About OpenSend',
              message: 'OpenSend',
              detail: `Version ${app.getVersion()}\n\nFree, ad-free, open-source file sharing.\nDirect device-to-device transfers. No account required.\n\n© 2026 Sparsh Sam`,
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
}

// ── IPC Handlers ──

// Open file dialog
ipcMain.handle('dialog:openFiles', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled) return [];
  return result.filePaths;
});

// Get app version
ipcMain.handle('app:getVersion', () => app.getVersion());

// Write downloaded files to disk
ipcMain.handle('file:saveToDisk', async (_event, { fileName, buffer }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: fileName,
    filters: [{ name: 'All Files', extensions: ['*'] }],
  });
  if (result.canceled) return null;
  fs.writeFileSync(result.filePath, Buffer.from(buffer));
  return result.filePath;
});

// Open file in system explorer
ipcMain.handle('file:showInFolder', async (_event, filePath) => {
  shell.showItemInFolder(filePath);
});

// ── App lifecycle ──

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
