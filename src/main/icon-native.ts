import { app, nativeImage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { extractWinShellIconBitmap, type IconBitmap } from './win-shell-icon';

// Requests queue up in the worker (one icon at a time, ~15-125ms each), so the
// timeout has to clear the whole backlog rather than a single extraction.
const REQUEST_TIMEOUT_MS = 8000;

interface PendingRequest {
  resolve: (bitmap: IconBitmap | null) => void;
  timer: NodeJS.Timeout;
}

interface IconWorkerResponse {
  id: number;
  width: number;
  height: number;
  data: Uint8Array | null;
}

let worker: Worker | null = null;
/** Set once we know no worker can be started, so we stop retrying on every icon. */
let workerDisabled = false;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();

/**
 * The worker is a separate Vite build entry, emitted next to the main bundle.
 * It is loaded straight from app.asar - verified to work, since Electron routes
 * the worker's own module loading through the asar shim - so no unpacking is
 * needed for it (only koffi's .node binary is unpacked).
 */
function resolveWorkerPath(): string | null {
  const candidate = path.join(__dirname, 'icon-worker.js');
  try {
    return fs.existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

function settleAll(): void {
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.resolve(null);
  }
  pending.clear();
}

function disposeWorker(): void {
  const current = worker;
  worker = null;
  if (current) {
    current.removeAllListeners();
    void current.terminate().catch(() => undefined);
  }
  settleAll();
}

function onWorkerMessage(response: IconWorkerResponse): void {
  const request = pending.get(response.id);
  if (!request) return; // Timed out earlier; the id-keyed map makes a late reply harmless.
  pending.delete(response.id);
  clearTimeout(request.timer);
  if (!response.data || response.width <= 0 || response.height <= 0) {
    request.resolve(null);
    return;
  }
  request.resolve({
    data: Buffer.from(response.data.buffer, response.data.byteOffset, response.data.byteLength),
    width: response.width,
    height: response.height,
  });
}

function ensureWorker(): Worker | null {
  if (worker) return worker;
  if (workerDisabled) return null;

  const workerPath = resolveWorkerPath();
  if (!workerPath) {
    console.warn('[icons] icon worker bundle not found; falling back to main-thread extraction');
    workerDisabled = true;
    return null;
  }

  try {
    const started = new Worker(workerPath);
    started.on('message', onWorkerMessage);
    started.on('error', (error) => {
      console.warn('[icons] icon worker failed, falling back to main-thread extraction:', error);
      workerDisabled = true;
      disposeWorker();
    });
    started.on('exit', (code) => {
      if (worker !== started) return; // Already disposed by the error path.
      // Exited on its own; the next request gets a fresh worker.
      worker = null;
      settleAll();
      if (code !== 0) console.warn(`[icons] icon worker exited with code ${code}`);
    });
    worker = started;
    return started;
  } catch (error) {
    console.warn('[icons] could not start icon worker, falling back to main-thread extraction:', error);
    workerDisabled = true;
    return null;
  }
}

function requestBitmap(filePath: string, probe = false): Promise<IconBitmap | null> {
  const target = ensureWorker();
  if (!target) return Promise.resolve(extractWinShellIconBitmap(filePath, { useFileAttributes: probe }));

  return new Promise((resolve) => {
    const id = nextRequestId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(null);
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    try {
      target.postMessage({ id, path: filePath, probe });
    } catch {
      pending.delete(id);
      clearTimeout(timer);
      resolve(null);
    }
  });
}

async function toPng(bitmap: IconBitmap | null): Promise<Buffer | null> {
  if (!bitmap || !bitmap.data.length) return null;
  try {
    const image = nativeImage.createFromBitmap(bitmap.data, {
      width: bitmap.width,
      height: bitmap.height,
    });
    if (image.isEmpty()) return null;
    const png = image.toPNG();
    return png.length ? png : null;
  } catch {
    return null;
  }
}

/** Windows shell icon as a PNG buffer, preferring the 256px jumbo variant. */
export async function extractWinShellIconPng(filePath: string): Promise<Buffer | null> {
  if (process.platform !== 'win32') return null;
  return toPng(await requestBitmap(filePath));
}

/**
 * The icon a given extension falls back to when a file has none of its own, at
 * the same resolution and through the same pipeline as `extractWinShellIconPng`.
 * Callers fingerprint this to tell "this app has no icon" apart from "here is
 * the app's icon".
 */
export async function extractShellPlaceholderIconPng(placeholderPath: string): Promise<Buffer | null> {
  if (process.platform !== 'win32') return null;
  return toPng(await requestBitmap(placeholderPath, true));
}

app.on('before-quit', () => {
  disposeWorker();
});
