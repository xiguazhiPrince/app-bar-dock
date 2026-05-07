import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { app } from 'electron';
import type { ScanEntry } from '../shared/ipc';

async function safeReadDir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir, { withFileTypes: true }).then((ents) =>
      ents.map((e) => path.join(dir, e.name)),
    );
  } catch {
    return [];
  }
}

function nameFromPath(p: string): string {
  const base = path.basename(p);
  if (base.endsWith('.app')) return base.slice(0, -4);
  if (base.endsWith('.lnk')) return base.slice(0, -4);
  if (base.endsWith('.desktop')) return base.slice(0, -8);
  return base;
}

/** Shallow scan of known application shortcut folders per platform. */
export async function scanSystemApplications(): Promise<ScanEntry[]> {
  const out: ScanEntry[] = [];
  const seen = new Set<string>();

  const push = (fullPath: string) => {
    const st = fullPath;
    if (seen.has(st)) return;
    seen.add(st);
    out.push({ path: fullPath, name: nameFromPath(fullPath) });
  };

  if (process.platform === 'win32') {
    const dirs = [
      path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      path.join(
        process.env.ProgramData || 'C:\\ProgramData',
        'Microsoft',
        'Windows',
        'Start Menu',
        'Programs',
      ),
    ];
    for (const dir of dirs) {
      const entries = await safeReadDir(dir);
      for (const file of entries) {
        const ext = path.extname(file).toLowerCase();
        if (ext === '.lnk') push(file);
      }
      // one level of subfolders (common for vendor folders)
      for (const file of entries) {
        try {
          const stat = await fs.stat(file);
          if (stat.isDirectory()) {
            const sub = await safeReadDir(file);
            for (const f of sub) {
              if (path.extname(f).toLowerCase() === '.lnk') push(f);
            }
          }
        } catch {
          /* skip */
        }
      }
    }
  } else if (process.platform === 'darwin') {
    const dirs = ['/Applications', path.join(os.homedir(), 'Applications')];
    for (const dir of dirs) {
      const entries = await safeReadDir(dir);
      for (const file of entries) {
        try {
          const stat = await fs.stat(file);
          if (
            stat.isDirectory() &&
            path.extname(file).toLowerCase() === '.app'
          ) {
            push(file);
          }
        } catch {
          /* skip */
        }
      }
    }
  } else {
    const dirs = [
      path.join(os.homedir(), '.local', 'share', 'applications'),
      '/usr/share/applications',
    ];
    for (const dir of dirs) {
      const entries = await safeReadDir(dir);
      for (const file of entries) {
        if (path.extname(file).toLowerCase() === '.desktop') push(file);
      }
    }
  }

  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return out;
}
