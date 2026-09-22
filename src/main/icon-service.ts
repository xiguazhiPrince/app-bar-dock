import { app, nativeImage, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { extractShellPlaceholderIconPng, extractWinShellIconPng } from './icon-native';
import {
  readCachedIcon,
  writeCachedIcon,
  type FileIdentity,
  type IconSource,
} from './icon-cache';

function expandEnvVars(p: string): string {
  return p.replace(/%([^%]+)%/g, (_, name: string) => {
    const value =
      process.env[name] ?? process.env[name.toUpperCase()] ?? process.env[name.toLowerCase()];
    return value ?? `%${name}%`;
  });
}

/** Shortcut targets routinely embed %SystemRoot% and friends. */
function normalizePath(p: string): string {
  return path.normalize(expandEnvVars(p));
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveIconPath(targetPath: string): Promise<string> {
  if (process.platform !== 'win32') return targetPath;
  if (path.extname(targetPath).toLowerCase() !== '.lnk') return targetPath;

  try {
    const info = shell.readShortcutLink(targetPath);
    const resolved = info.target ? normalizePath(info.target) : '';
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

function pngHash(png: Buffer): string {
  return createHash('sha256').update(png).digest('hex');
}

function nativeImageToPng(img: Electron.NativeImage | null | undefined): Buffer | null {
  if (!img || img.isEmpty()) return null;
  const png = img.toPNG();
  return png.length ? png : null;
}

// --- placeholder ("no icon of its own") detection ---------------------------

/**
 * Everything in this dock is a launchable app (`inferKind` only ever produces
 * app/shortcut/executable kinds), so a generic type icon can only mean the app
 * failed to provide one - never that this is simply what the file looks like.
 * Rather than draw that placeholder as if it were the app's icon, the icon is
 * reported as missing and the renderer shows its letter tile instead.
 *
 * Each step is fingerprinted against a placeholder produced by that same step,
 * because the comparison is byte-for-byte and therefore size-sensitive: a 32px
 * shell placeholder can never match a 256px jumbo extraction.
 */
const placeholderHashes = new Map<string, string | null>();

function placeholderPath(ext: string): string {
  return path.join(app.getPath('temp'), `appbardock-icon-probe${ext || '.exe'}`);
}

async function placeholderHash(source: IconSource, filePath: string): Promise<string | null> {
  const ext = path.extname(filePath).toLowerCase();
  const key = `${source}:${ext}`;
  const cached = placeholderHashes.get(key);
  if (cached !== undefined) return cached;

  let png: Buffer | null = null;
  try {
    const probe = placeholderPath(ext);
    if (source === 'shell') png = await extractShellPlaceholderIconPng(probe);
    else if (source === 'fileicon') png = await tryFileIconRaw(probe);
    else png = await tryThumbnailRaw(probe);
  } catch {
    png = null;
  }

  // When the placeholder cannot be produced the check is skipped, which keeps
  // the previous "show whatever came back" behaviour rather than guessing.
  const hash = png?.length ? pngHash(png) : null;
  placeholderHashes.set(key, hash);
  return hash;
}

type StepOutcome =
  /** A real icon. */
  | { status: 'icon'; png: Buffer }
  /** Extraction worked, but what came back is the extension's placeholder. */
  | { status: 'placeholder' }
  /** Extraction produced nothing usable. */
  | { status: 'none' };

async function classify(
  source: IconSource,
  filePath: string,
  png: Buffer | null,
): Promise<StepOutcome> {
  if (!png) return { status: 'none' };
  const placeholder = await placeholderHash(source, filePath);
  if (placeholder && pngHash(png) === placeholder) return { status: 'placeholder' };
  return { status: 'icon', png };
}

// --- extraction steps -------------------------------------------------------

async function tryThumbnailRaw(filePath: string): Promise<Buffer | null> {
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

async function tryFileIconRaw(filePath: string): Promise<Buffer | null> {
  try {
    const img = await app.getFileIcon(filePath, { size: 'large' });
    return nativeImageToPng(img);
  } catch {
    return null;
  }
}

async function tryThumbnail(filePath: string): Promise<StepOutcome> {
  return classify('thumbnail', filePath, await tryThumbnailRaw(filePath));
}

async function tryFileIcon(filePath: string): Promise<StepOutcome> {
  return classify('fileicon', filePath, await tryFileIconRaw(filePath));
}

/**
 * The shell resolves a shortcut's own IconLocation (including its icon index),
 * which is what Explorer draws. Prefer the .lnk over its target, because common
 * launcher targets - Squirrel's Update.exe, for instance - resolve to a
 * perfectly valid icon that belongs to the wrong program.
 */
function candidatePaths(itemPath: string, resolved: string): string[] {
  if (process.platform === 'win32' && path.extname(itemPath).toLowerCase() === '.lnk') {
    return resolved === itemPath ? [itemPath] : [itemPath, resolved];
  }
  return resolved === itemPath ? [resolved] : [resolved, itemPath];
}

async function tryShell(itemPath: string, resolved: string): Promise<StepOutcome> {
  let sawPlaceholder = false;
  for (const candidate of candidatePaths(itemPath, resolved)) {
    if (!(await pathExists(candidate))) continue;
    const outcome = await classify('shell', candidate, await extractWinShellIconPng(candidate));
    if (outcome.status === 'icon') return outcome;
    if (outcome.status === 'placeholder') sawPlaceholder = true;
  }
  return sawPlaceholder ? { status: 'placeholder' } : { status: 'none' };
}

// --- public API -------------------------------------------------------------

const inflight = new Map<string, Promise<string | null>>();

export function getFileIconDataUrl(itemPath: string): Promise<string | null> {
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

  // The shell runs first: it is what Explorer itself draws, it honours .lnk icon
  // locations, and it is the only step that can hand back a 256px icon.
  const steps: Array<{ source: IconSource; run: () => Promise<StepOutcome> }> = [
    { source: 'shell', run: () => tryShell(itemPath, resolved) },
    { source: 'thumbnail', run: () => tryThumbnail(resolved) },
    { source: 'fileicon', run: () => tryFileIcon(resolved) },
  ];

  for (const step of steps) {
    const outcome = await step.run();
    if (outcome.status === 'none') continue;
    if (outcome.status === 'placeholder') {
      // The shell is the authority here. Once it hands back the type
      // placeholder the app has no icon of its own, and the remaining steps can
      // only produce a smaller copy of that same placeholder - which their own
      // fingerprints would not catch.
      return null;
    }
    if (identity) {
      try {
        await writeCachedIcon(itemPath, resolved, identity, outcome.png, step.source);
      } catch {
        // Cache write is best-effort.
      }
    }
    return toDataUrl(outcome.png);
  }
  return null;
}
