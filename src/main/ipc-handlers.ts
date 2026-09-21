import { app, dialog, ipcMain, BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FolderItem } from '../shared/ipc';
import { IPC } from '../shared/ipc';
import { loadItems, saveItems } from './store';
import { inferKind, inferLabel } from './item-kind';
import { launchTarget } from './launch';
import { scanSystemApplications } from './scanners';
import { getFileIconDataUrl } from './icon-service';

let dialogOpen = false;

function storeRoot(): string {
  return app.getPath('userData');
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.ITEMS_LIST, async (): Promise<FolderItem[]> => {
    return loadItems(storeRoot());
  });

  ipcMain.handle(
    IPC.ITEMS_ADD_PATHS,
    async (_evt, rawPaths: unknown): Promise<FolderItem[]> => {
      if (!Array.isArray(rawPaths) || !rawPaths.every((x) => typeof x === 'string')) {
        return loadItems(storeRoot());
      }
      const paths = rawPaths as string[];
      const items = await loadItems(storeRoot());
      const existing = new Set(items.map((i) => i.path));

      for (const filePath of paths) {
        const normalized = path.normalize(filePath);
        if (!(await pathExists(normalized))) continue;
        if (existing.has(normalized)) continue;
        existing.add(normalized);
        items.push({
          id: randomUUID(),
          label: inferLabel(normalized),
          kind: inferKind(normalized),
          path: normalized,
          addedAt: Date.now(),
        });
      }

      await saveItems(storeRoot(), items);
      return items;
    },
  );

  ipcMain.handle(
    IPC.ITEMS_REMOVE,
    async (_evt, id: unknown): Promise<FolderItem[]> => {
      if (typeof id !== 'string') return loadItems(storeRoot());
      const items = (await loadItems(storeRoot())).filter((i) => i.id !== id);
      await saveItems(storeRoot(), items);
      return items;
    },
  );

  ipcMain.handle(IPC.LAUNCH, async (_evt, targetPath: unknown): Promise<void> => {
    if (typeof targetPath !== 'string') return;
    const err = await launchTarget(targetPath);
    if (err && typeof err === 'string') {
      console.error('Launch failed:', err);
    }
  });

  ipcMain.handle(
    IPC.ICON_GET,
    async (_evt, targetPath: unknown): Promise<string | null> => {
      if (typeof targetPath !== 'string') return null;
      return getFileIconDataUrl(targetPath);
    },
  );

  ipcMain.handle(IPC.DIALOG_PICK_FILES, async (): Promise<string[]> => {
    const win = getWindow();
    dialogOpen = true;
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog(win ?? undefined, {
        properties: ['openFile', 'multiSelections'],
      });
      if (canceled) return [];
      return filePaths;
    } finally {
      dialogOpen = false;
    }
  });

  ipcMain.handle(IPC.SCAN_LIST, async (): Promise<ReturnType<typeof scanSystemApplications>> => {
    return scanSystemApplications();
  });

  ipcMain.handle(IPC.WINDOW_TOGGLE, async (): Promise<void> => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });

  ipcMain.handle(IPC.WINDOW_HIDE, async (): Promise<void> => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return;
    win.hide();
  });
}

export function shouldDeferBlurHide(): boolean {
  return dialogOpen;
}
