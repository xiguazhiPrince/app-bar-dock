import { app, nativeImage, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { extractWinShellIconPng } from './win-shell-icon';
import {
  readCachedIcon,
  writeCachedIcon,
  type FileIdentity,
  type IconSource,
} from './icon-cache';

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function resolveIconPath(targetPath: string): Promise<string> {
  if (process.platform !== 'win32') return targetPath;
  if (path.extname(targetPath).toLowerCase() !== '.lnk') return targetPath;

  try {
    const info = shell.readShortcutLink(targetPath);
    const resolved = info.target ? path.normalize(info.target) : '';
    if (resolved && (await pathExists(resolved))) {
      return resolved;
    }
  } catch {
    // Fall back to the original shortcut path when parsing fails.
  }
  return targetPath;
}

async function statIdentity(p: string): Promise<FileIdentity | null> {
  try {
    const st = await fs.stat(p);
    return { mtimeMs: st.mtimeMs, size: st.size };
  } catch {
    return null;
  }
}

function toDataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString('base64')}`;
}

function nativeImageToPng(img: Electron.NativeImage | null | undefined): Buffer | null {
  if (!img || img.isEmpty()) return null;
  const png = img.toPNG();
  return png.length ? png : null;
}

async function tryThumbnail(filePath: string): Promise<Buffer | null> {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return null;
  try {
    const img = await nativeImage.createThumbnailFromPath(filePath, {
      width: 256,
      height: 256,
    });
    return nativeImageToPng(img);
  } catch {
    return null;
  }
}

async function tryFileIcon(filePath: string): Promise<Buffer | null> {
  try {
    const img = await app.getFileIcon(filePath, { size: 'large' });
    return nativeImageToPng(img);
  } catch {
    return null;
  }
}

function tryShell(resolved: string, original: string): Buffer | null {
  return extractWinShellIconPng(resolved) ?? extractWinShellIconPng(original);
}

const inflight = new Map<string, Promise<string | null>>();

export async function getFileIconDataUrl(itemPath: string): Promise<string | null> {
  const hit = inflight.get(itemPath);
  if (hit) return hit;
  const pending = loadIcon(itemPath).finally(() => {
    inflight.delete(itemPath);
  });
  inflight.set(itemPath, pending);
  return pending;
}

async function loadIcon(itemPath: string): Promise<string | null> {
  if (!(await pathExists(itemPath))) return null;
  const resolved = await resolveIconPath(itemPath);
  const identity = (await statIdentity(resolved)) ?? (await statIdentity(itemPath));
  if (identity) {
    const cached = await readCachedIcon(itemPath, resolved, identity);
    if (cached) return toDataUrl(cached);
  }

  const steps: Array<{ source: IconSource; run: () => Promise<Buffer | null> }> = [
    { source: 'thumbnail', run: () => tryThumbnail(resolved) },
    { source: 'shell', run: async () => tryShell(resolved, itemPath) },
    { source: 'fileicon', run: () => tryFileIcon(resolved) },
  ];

  for (const step of steps) {
    const png = await step.run();
    if (!png) continue;
    if (identity) {
      try {
        await writeCachedIcon(itemPath, resolved, identity, png, step.source);
      } catch {
        // Cache write is best-effort.
      }
    }
    return toDataUrl(png);
  }
  return null;
}
