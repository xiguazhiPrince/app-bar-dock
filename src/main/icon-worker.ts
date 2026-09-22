import { parentPort } from 'node:worker_threads';
import { extractWinShellIconBitmap } from './win-shell-icon';

/**
 * Worker entry: the Win32 icon extraction runs here instead of on the main
 * process, because koffi calls are synchronous and the GetDIBits/alpha/crop
 * passes would otherwise block the main event loop for the duration of every
 * icon in the grid.
 *
 * Deliberately free of Electron imports so it stays a plain Node thread - it is
 * also what lets the extraction be exercised outside Electron.
 */

interface IconWorkerRequest {
  id: number;
  path: string;
  /** Resolve from the extension alone, for placeholder-icon fingerprinting. */
  probe?: boolean;
}

interface IconWorkerResponse {
  id: number;
  width: number;
  height: number;
  data: Uint8Array | null;
}

const port = parentPort;
if (!port) throw new Error('icon-worker must be started as a worker thread');

port.on('message', (request: IconWorkerRequest) => {
  let response: IconWorkerResponse = { id: request.id, width: 0, height: 0, data: null };
  try {
    const bitmap = extractWinShellIconBitmap(request.path, {
      useFileAttributes: request.probe === true,
    });
    if (bitmap) {
      response = {
        id: request.id,
        width: bitmap.width,
        height: bitmap.height,
        data: bitmap.data,
      };
    }
  } catch {
    // A failed extraction is a missing icon, never a thrown error.
  }
  port.postMessage(response);
});
