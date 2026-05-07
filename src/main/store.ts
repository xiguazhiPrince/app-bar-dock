import fs from 'node:fs/promises';
import path from 'node:path';
import type { FolderItem } from '../shared/ipc';

const STORE_FILENAME = 'app-folder-items.json';

export async function getStorePath(root: string): Promise<string> {
  return path.join(root, STORE_FILENAME);
}

export async function loadItems(storeRoot: string): Promise<FolderItem[]> {
  const p = await getStorePath(storeRoot);
  try {
    const raw = await fs.readFile(p, 'utf-8');
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter(isFolderItem);
  } catch {
    return [];
  }
}

export async function saveItems(
  storeRoot: string,
  items: FolderItem[],
): Promise<void> {
  const p = await getStorePath(storeRoot);
  await fs.mkdir(storeRoot, { recursive: true });
  await fs.writeFile(p, JSON.stringify(items, null, 2), 'utf-8');
}

function isFolderItem(x: unknown): x is FolderItem {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.label === 'string' &&
    typeof o.kind === 'string' &&
    typeof o.path === 'string' &&
    typeof o.addedAt === 'number'
  );
}
