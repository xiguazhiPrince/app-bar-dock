import { BrowserWindow, screen } from 'electron';

const DESIGN_WIDTH = 440;
const DESIGN_HEIGHT = 520;
const TARGET_ASPECT_RATIO = DESIGN_WIDTH / DESIGN_HEIGHT;

/** Place folder panel centered horizontally on the work area bottom edge (near taskbar / dock). */
export function positionFolderWindow(win: BrowserWindow): void {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { width: areaWidth, height: areaHeight, x, y } = display.workArea;
  const [rawWidth, rawHeight] = win.getSize();

  // 根据当前显示器的可用高度，估算一个目标尺寸（大屏接近设计尺寸，小屏自动缩小）
  const maxHeightByArea = Math.round(areaHeight * 0.75);
  const targetHeight = Math.min(DESIGN_HEIGHT, maxHeightByArea);
  let winHeight = targetHeight;
  let winWidth = Math.min(DESIGN_WIDTH, Math.round(winHeight * TARGET_ASPECT_RATIO));

  // 不要比可用宽度还宽
  if (winWidth > areaWidth) {
    winWidth = areaWidth;
    winHeight = Math.round(winWidth / TARGET_ASPECT_RATIO);
  }

  // 如果当前窗口尺寸已经比较合理，就尊重用户的大小（只纠正比例和越界）
  const sizeTooSmall = rawWidth < winWidth * 0.7 || rawHeight < winHeight * 0.7;
  const sizeTooBig = rawWidth > areaWidth || rawHeight > areaHeight;
  if (!sizeTooSmall && !sizeTooBig) {
    winWidth = rawWidth;
    winHeight = rawHeight;
    const currentRatio = rawWidth / Math.max(1, rawHeight);
    if (Math.abs(currentRatio - TARGET_ASPECT_RATIO) > 0.05) {
      // 轻微地往设计长宽比纠正，但保持宽度不变
      winHeight = Math.round(winWidth / TARGET_ASPECT_RATIO);
      if (winHeight > areaHeight) {
        winHeight = areaHeight;
        winWidth = Math.round(winHeight * TARGET_ASPECT_RATIO);
      }
    }
  }

  const margin = 10;
  const px = x + Math.max(0, Math.round((areaWidth - winWidth) / 2));
  const py = y + Math.max(0, areaHeight - winHeight - margin);
  win.setBounds({ x: px, y: py, width: winWidth, height: winHeight });
}
