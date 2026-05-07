import path from 'node:path';
import type { ItemKind } from '../shared/ipc';

export function inferKind(filePath: string): ItemKind {
  const ext = path.extname(filePath).toLowerCase();
  if (process.platform === 'darwin' && ext === '.app') return 'app_bundle';
  if (ext === '.desktop') return 'desktop';
  if (ext === '.lnk') return 'shortcut';
  return 'executable';
}

export function inferLabel(filePath: string): string {
  const base = path.basename(filePath);
  if (process.platform === 'darwin' && base.endsWith('.app')) {
    return base.slice(0, -4);
  }
  if (base.endsWith('.lnk') || base.endsWith('.desktop')) {
    return base.replace(/\.(lnk|desktop)$/i, '');
  }
  return base.replace(/\.exe$/i, '');
}
