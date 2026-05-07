import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { FolderItem, ScanEntry } from './shared/ipc';
import { IPC } from './shared/ipc';

contextBridge.exposeInMainWorld('appFolder', {
  listItems: (): Promise<FolderItem[]> =>
    ipcRenderer.invoke(IPC.ITEMS_LIST),

  addPaths: (paths: string[]): Promise<FolderItem[]> =>
    ipcRenderer.invoke(IPC.ITEMS_ADD_PATHS, paths),

  removeItem: (id: string): Promise<FolderItem[]> =>
    ipcRenderer.invoke(IPC.ITEMS_REMOVE, id),

  launch: (targetPath: string): Promise<void> =>
    ipcRenderer.invoke(IPC.LAUNCH, targetPath),

  getFileIconDataUrl: (targetPath: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC.ICON_GET, targetPath),

  pickFiles: (): Promise<string[]> =>
    ipcRenderer.invoke(IPC.DIALOG_PICK_FILES),

  scanApplications: (): Promise<ScanEntry[]> =>
    ipcRenderer.invoke(IPC.SCAN_LIST),

  toggleWindow: (): Promise<void> =>
    ipcRenderer.invoke(IPC.WINDOW_TOGGLE),

  hideWindow: (): Promise<void> =>
    ipcRenderer.invoke(IPC.WINDOW_HIDE),

  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
});
