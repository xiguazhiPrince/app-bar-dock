import { shell } from 'electron';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

/** Try to read Exec= from a .desktop file (Linux). */
async function readDesktopExec(desktopPath: string): Promise<string | null> {
  try {
    const text = await fs.readFile(desktopPath, 'utf-8');
    const execLine = text.split(/\r?\n/).find((l) => /^Exec=/.test(l));
    if (!execLine) return null;
    let cmd = execLine.slice(5).trim();
    cmd = cmd.replace(/%"?[fFuU]"?/g, '').trim();
    cmd = cmd.replace(/\s+%.*$/, '').trim();
    return cmd || null;
  } catch {
    return null;
  }
}

export async function launchTarget(targetPath: string): Promise<string | void> {
  const ext = path.extname(targetPath).toLowerCase();

  if (process.platform === 'linux' && ext === '.desktop') {
    const err = await shell.openPath(targetPath);
    if (!err) return;
    const exec = await readDesktopExec(targetPath);
    if (exec) {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(exec, {
          detached: true,
          stdio: 'ignore',
          shell: true,
        });
        child.unref();
        child.on('error', reject);
        child.on('spawn', () => resolve());
      });
      return;
    }
    return err;
  }

  const err = await shell.openPath(targetPath);
  if (!err) return;

  if (process.platform === 'win32') {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.env.ComSpec || 'cmd.exe',
        ['/d', '/c', 'start', '', targetPath],
        {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        },
      );
      child.unref();
      child.on('error', reject);
      child.on('close', () => resolve());
    });
    return;
  }

  if (process.platform === 'darwin') {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('open', [targetPath], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      child.on('error', reject);
      child.on('close', () => resolve());
    });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn('xdg-open', [targetPath], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    child.on('error', reject);
    child.on('close', () => resolve());
  });
}
