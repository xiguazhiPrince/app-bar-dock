export type ItemKind = 'executable' | 'shortcut' | 'desktop' | 'app_bundle';

export interface FolderItem {
  id: string;
  label: string;
  kind: ItemKind;
  path: string;
  addedAt: number;
  /** How many times this item has been launched; drives the dock ordering. */
  launchCount: number;
}

export interface ScanEntry {
  path: string;
  name: string;
}

export const IPC = {
  ITEMS_LIST: 'folder:items:list',
  ITEMS_ADD_PATHS: 'folder:items:add-paths',
  ITEMS_REMOVE: 'folder:items:remove',
  LAUNCH: 'folder:launch',
  ICON_GET: 'folder:icon:get',
  DIALOG_PICK_FILES: 'folder:dialog:pick-files',
  SCAN_LIST: 'folder:scan:list',
  WINDOW_TOGGLE: 'folder:window:toggle',
  WINDOW_HIDE: 'folder:window:hide',
} as const;
