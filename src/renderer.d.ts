import type { FolderItem, ScanEntry } from './shared/ipc';

export {};

declare global {
  interface Window {
    appFolder: {
      listItems: () => Promise<FolderItem[]>;
      addPaths: (paths: string[]) => Promise<FolderItem[]>;
      removeItem: (id: string) => Promise<FolderItem[]>;
      launch: (targetPath: string) => Promise<void>;
      getFileIconDataUrl: (targetPath: string) => Promise<string | null>;
      pickFiles: () => Promise<string[]>;
      scanApplications: () => Promise<ScanEntry[]>;
      toggleWindow: () => Promise<void>;
      hideWindow: () => Promise<void>;
      getPathForFile: (file: File) => string;
    };
  }
}
