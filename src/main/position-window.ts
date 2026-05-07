import { BrowserWindow, screen } from 'electron';

/** Place folder panel centered horizontally on the work area bottom edge (near taskbar / dock). */
export function positionFolderWindow(win: BrowserWindow): void {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { width, height, x, y } = display.workArea;
  const [winWidth, winHeight] = win.getSize();
  const margin = 10;
  const px = x + Math.max(0, Math.round((width - winWidth) / 2));
  const py = y + Math.max(0, height - winHeight - margin);
  win.setPosition(px, py);
}
