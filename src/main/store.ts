import fs from 'node:fs/promises';
import path from 'node:path';
import type { ItemKind, FolderItem } from '../shared/ipc';

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
    return data.map(normalizeItem).filter((x): x is FolderItem => x !== null);
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

/**
 * Most launched first; ties keep the order they were added in. Returns a new
 * array so a sorted list can never be written back to disk by accident: the
 * file stays an append-ordered ledger, ordering is presentation only.
 */
export function sortItems(items: FolderItem[]): FolderItem[] {
  return [...items].sort(
    (a, b) => b.launchCount - a.launchCount || a.addedAt - b.addedAt,
  );
}

/** Bump the launch counter of the item at `targetPath`, if the dock holds it. */
export async function recordLaunch(
  storeRoot: string,
  targetPath: string,
): Promise<void> {
  const normalized = path.normalize(targetPath);
  const items = await loadItems(storeRoot);
  const item = items.find((i) => i.path === normalized);
  if (!item) return;
  item.launchCount += 1;
  await saveItems(storeRoot, items);
}

function normalizeItem(x: unknown): FolderItem | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (
    typeof o.id !== 'string' ||
    typeof o.label !== 'string' ||
    typeof o.kind !== 'string' ||
    typeof o.path !== 'string' ||
    typeof o.addedAt !== 'number'
  ) {
    return null;
  }
  return {
    id: o.id,
    label: o.label,
    kind: o.kind as ItemKind,
    path: o.path,
    addedAt: o.addedAt,
    // Items stored before launch counting existed just start at zero.
    launchCount: toCount(o.launchCount),
  };
}

function toCount(x: unknown): number {
  return typeof x === 'number' && Number.isFinite(x) && x > 0
    ? Math.floor(x)
    : 0;
}
