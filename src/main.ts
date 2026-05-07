import { app, BrowserWindow, Menu, shell } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { registerIpcHandlers, shouldDeferBlurHide } from './main/ipc-handlers';
import { positionFolderWindow } from './main/position-window';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let blurHideTimer: NodeJS.Timeout | null = null;

function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function clearBlurHideTimer(): void {
  if (blurHideTimer) {
    clearTimeout(blurHideTimer);
    blurHideTimer = null;
  }
}

function scheduleBlurHide(): void {
  clearBlurHideTimer();
  blurHideTimer = setTimeout(() => {
    blurHideTimer = null;
    const win = mainWindow;
    if (!win || win.isDestroyed()) return;
    if (shouldDeferBlurHide()) return;
    win.hide();
  }, 180);
}

function buildMenu(): Menu {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              {
                label: 'Quit',
                accelerator: 'Command+Q',
                click: (): void => {
                  isQuitting = true;
                  app.quit();
                },
              },
            ],
          } as Electron.MenuItemConstructorOptions,
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? undefined : 'Ctrl+Q',
          click: (): void => {
            isQuitting = true;
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Learn more about AppBarDock',
          click: (): void => {
            void shell.openExternal('https://electronjs.org');
          },
        },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 440,
    height: 520,
    minWidth: 320,
    minHeight: 360,
    show: false,
    frame: false,
    transparent: true,
    ...(process.platform === 'darwin'
      ? {
          vibrancy: 'under-window' as const,
          visualEffectState: 'active' as const,
        }
      : {}),
    backgroundColor: '#00000000',
    skipTaskbar: false,
    resizable: true,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    positionFolderWindow(mainWindow);
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('blur', () => {
    scheduleBlurHide();
  });

  mainWindow.on('focus', () => {
    clearBlurHideTimer();
  });

  mainWindow.on('show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    positionFolderWindow(mainWindow);
  });
};

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    if (win.isVisible()) {
      win.hide();
    } else {
      positionFolderWindow(win);
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(buildMenu());

    registerIpcHandlers(getMainWindow);
    createWindow();
  });

  if (process.platform === 'darwin') {
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else {
        const win = getMainWindow();
        if (!win || win.isDestroyed()) return;
        if (win.isVisible()) {
          win.hide();
        } else {
          positionFolderWindow(win);
          win.show();
          win.focus();
        }
      }
    });
  }

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
