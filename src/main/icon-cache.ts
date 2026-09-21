import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { app } from 'electron';

export type IconSource = 'thumbnail' | 'shell' | 'fileicon';

export interface FileIdentity {
  mtimeMs: number;
  size: number;
}

interface CacheEntry {
  file: string;
  targetPath: string;
  mtimeMs: number;
  size: number;
  source: IconSource;
}

type CacheIndex = Record<string, CacheEntry>;

function cacheDir(): string {
  return path.join(app.getPath('userData'), 'icon-cache');
}

function indexPath(): string {
  return path.join(cacheDir(), 'index.json');
}

function fileNameFor(itemPath: string): string {
  return `${createHash('sha1').update(itemPath).digest('hex')}.png`;
}

let index: CacheIndex | null = null;
let indexLoad: Promise<CacheIndex> | null = null;

async function loadIndex(): Promise<CacheIndex> {
  if (index) return index;
  if (indexLoad) return indexLoad;
  indexLoad = (async () => {
    try {
      const raw = await fs.readFile(indexPath(), 'utf-8');
      const data = JSON.parse(raw) as unknown;
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        index = {};
        return index;
      }
      index = data as CacheIndex;
      return index;
    } catch {
      index = {};
      return index;
    }
  })();
  return indexLoad;
}

async function saveIndex(): Promise<void> {
  await fs.mkdir(cacheDir(), { recursive: true });
  await fs.writeFile(indexPath(), JSON.stringify(index ?? {}, null, 2), 'utf-8');
}

export async function readCachedIcon(
  itemPath: string,
  targetPath: string,
  identity: FileIdentity,
): Promise<Buffer | null> {
  const idx = await loadIndex();
  const entry = idx[itemPath];
  if (!entry) return null;
  if (entry.targetPath !== targetPath) return null;
  if (entry.mtimeMs !== identity.mtimeMs || entry.size !== identity.size) return null;
  try {
    return await fs.readFile(path.join(cacheDir(), entry.file));
  } catch {
    return null;
  }
}

export async function writeCachedIcon(
  itemPath: string,
  targetPath: string,
  identity: FileIdentity,
  png: Buffer,
  source: IconSource,
): Promise<void> {
  const dir = cacheDir();
  await fs.mkdir(dir, { recursive: true });
  const file = fileNameFor(itemPath);
  await fs.writeFile(path.join(dir, file), png);
  const idx = await loadIndex();
  idx[itemPath] = {
    file,
    targetPath,
    mtimeMs: identity.mtimeMs,
    size: identity.size,
    source,
  };
  await saveIndex();
}
