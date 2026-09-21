import { nativeImage } from 'electron';
import koffi from 'koffi';
import type { TypeObject } from 'koffi';

const SHGFI_ICON = 0x00000100;
const SHGFI_LARGEICON = 0x00000000;
const SHGFI_SYSICONINDEX = 0x00004000;
const SHIL_EXTRALARGE = 2;
const SHIL_JUMBO = 4;
const ILD_TRANSPARENT = 0x00000001;
const DIB_RGB_COLORS = 0;
const BI_RGB = 0;

type Handle = unknown;
// koffi bindings are untyped at the call boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NativeFn = (...args: any[]) => any;

interface WinApis {
  sizeofShfi: number;
  sizeofBitmap: number;
  sizeofBmih: number;
  SHFILEINFOW: TypeObject;
  BITMAP: TypeObject;
  ICONINFO: TypeObject;
  BITMAPINFOHEADER: TypeObject;
  SHGetFileInfoW: NativeFn;
  SHGetImageList: NativeFn;
  ImageList_GetIcon: NativeFn;
  DestroyIcon: NativeFn;
  GetIconInfo: NativeFn;
  GetObjectW: NativeFn;
  GetDC: NativeFn;
  ReleaseDC: NativeFn;
  GetDIBits: NativeFn;
  DeleteObject: NativeFn;
  iidIImageList: { Data1: number; Data2: number; Data3: number; Data4: number[] };
}

let apis: WinApis | null | undefined;

function loadApis(): WinApis | null {
  if (apis !== undefined) return apis;
  if (process.platform !== 'win32') {
    apis = null;
    return null;
  }

  try {
    const shell32 = koffi.load('shell32.dll');
    const user32 = koffi.load('user32.dll');
    const gdi32 = koffi.load('gdi32.dll');
    const comctl32 = koffi.load('comctl32.dll');

    const SHFILEINFOW = koffi.struct('SHFILEINFOW', {
      hIcon: 'void *',
      iIcon: 'int',
      dwAttributes: 'uint32',
      szDisplayName: koffi.array('uint16', 260),
      szTypeName: koffi.array('uint16', 80),
    });
    const BITMAP = koffi.struct('BITMAP', {
      bmType: 'int32',
      bmWidth: 'int32',
      bmHeight: 'int32',
      bmWidthBytes: 'int32',
      bmPlanes: 'int16',
      bmBitsPixel: 'int16',
      bmBits: 'void *',
    });
    const ICONINFO = koffi.struct('ICONINFO', {
      fIcon: 'int32',
      xHotspot: 'uint32',
      yHotspot: 'uint32',
      hbmMask: 'void *',
      hbmColor: 'void *',
    });
    const BITMAPINFOHEADER = koffi.struct('BITMAPINFOHEADER', {
      biSize: 'uint32',
      biWidth: 'int32',
      biHeight: 'int32',
      biPlanes: 'int16',
      biBitCount: 'int16',
      biCompression: 'uint32',
      biSizeImage: 'uint32',
      biXPelsPerMeter: 'int32',
      biYPelsPerMeter: 'int32',
      biClrUsed: 'uint32',
      biClrImportant: 'uint32',
    });
    koffi.struct('GUID', {
      Data1: 'uint32',
      Data2: 'uint16',
      Data3: 'uint16',
      Data4: koffi.array('uint8', 8),
    });

    apis = {
      sizeofShfi: koffi.sizeof(SHFILEINFOW),
      sizeofBitmap: koffi.sizeof(BITMAP),
      sizeofBmih: koffi.sizeof(BITMAPINFOHEADER),
      SHFILEINFOW,
      BITMAP,
      ICONINFO,
      BITMAPINFOHEADER,
      SHGetFileInfoW: shell32.func(
        'uintptr __stdcall SHGetFileInfoW(str16 pszPath, uint32 attr, _Inout_ SHFILEINFOW *psfi, uint32 cb, uint32 flags)',
      ),
      SHGetImageList: shell32.func(
        'int32 __stdcall SHGetImageList(int iImageList, GUID *riid, _Out_ void **ppv)',
      ),
      ImageList_GetIcon: comctl32.func(
        'void * __stdcall ImageList_GetIcon(void *himl, int i, uint32 flags)',
      ),
      DestroyIcon: user32.func('int32 __stdcall DestroyIcon(void *hIcon)'),
      GetIconInfo: user32.func('int32 __stdcall GetIconInfo(void *hIcon, _Out_ ICONINFO *piconinfo)'),
      GetObjectW: gdi32.func('int32 __stdcall GetObjectW(void *h, int32 c, void *pv)'),
      GetDC: user32.func('void * __stdcall GetDC(void *hwnd)'),
      ReleaseDC: user32.func('int32 __stdcall ReleaseDC(void *hwnd, void *hdc)'),
      GetDIBits: gdi32.func(
        'int32 __stdcall GetDIBits(void *hdc, void *hbm, uint32 start, uint32 lines, void *bits, void *bmi, uint32 usage)',
      ),
      DeleteObject: gdi32.func('int32 __stdcall DeleteObject(void *ho)'),
      iidIImageList: {
        Data1: 0x46eb5926,
        Data2: 0x582e,
        Data3: 0x4017,
        Data4: [0x9f, 0xdf, 0xe8, 0x99, 0x8d, 0xaa, 0x09, 0x50],
      },
    };
    return apis;
  } catch {
    apis = null;
    return null;
  }
}

function releaseCom(ptr: Handle): void {
  if (!ptr) return;
  try {
    const vtblPtr = koffi.decode(ptr, 'void *') as Handle;
    const slots = koffi.decode(vtblPtr, koffi.array('void *', 3)) as Handle[];
    const Release = koffi.proto('uint32 __stdcall Release(void *This)');
    koffi.call(slots[2], Release, ptr);
  } catch {
    // Best-effort; leaking a system image-list ref is harmless.
  }
}

function getJumboIcon(api: WinApis, iIcon: number, list: number): Handle | null {
  const holder = [null] as Array<Handle | null>;
  const hr = api.SHGetImageList(list, api.iidIImageList, holder) as number;
  if (hr < 0 || !holder[0]) return null;
  const himl = holder[0];
  try {
    const hIcon = api.ImageList_GetIcon(himl, iIcon, ILD_TRANSPARENT) as Handle;
    return hIcon || null;
  } finally {
    releaseCom(himl);
  }
}

function readBitmap32(
  api: WinApis,
  hdc: Handle,
  hbm: Handle,
  width: number,
  height: number,
): Buffer | null {
  const bmi = Buffer.alloc(api.sizeofBmih);
  koffi.encode(bmi, api.BITMAPINFOHEADER, {
    biSize: api.sizeofBmih,
    biWidth: width,
    biHeight: -height,
    biPlanes: 1,
    biBitCount: 32,
    biCompression: BI_RGB,
    biSizeImage: 0,
    biXPelsPerMeter: 0,
    biYPelsPerMeter: 0,
    biClrUsed: 0,
    biClrImportant: 0,
  });
  const bits = Buffer.alloc(width * height * 4);
  const copied = api.GetDIBits(hdc, hbm, 0, height, bits, bmi, DIB_RGB_COLORS) as number;
  if (copied === 0) return null;
  return bits;
}

function cropTransparent(bgra: Buffer, width: number, height: number): {
  data: Buffer;
  width: number;
  height: number;
} {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = bgra[(y * width + x) * 4 + 3];
      if (a > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { data: bgra, width, height };
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  if (cw >= width * 0.9 && ch >= height * 0.9) {
    return { data: bgra, width, height };
  }
  const out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const src = ((minY + y) * width + minX) * 4;
    bgra.copy(out, y * cw * 4, src, src + cw * 4);
  }
  return { data: out, width: cw, height: ch };
}

function hIconToPng(api: WinApis, hIcon: Handle): Buffer | null {
  const info = {
    fIcon: 0,
    xHotspot: 0,
    yHotspot: 0,
    hbmMask: null as Handle | null,
    hbmColor: null as Handle | null,
  };
  if (!api.GetIconInfo(hIcon, info)) return null;

  const hdc = api.GetDC(null) as Handle;
  try {
    if (!info.hbmColor) return null;
    const bmBuf = Buffer.alloc(api.sizeofBitmap);
    if (api.GetObjectW(info.hbmColor, api.sizeofBitmap, bmBuf) === 0) return null;
    const bm = koffi.decode(bmBuf, api.BITMAP) as { bmWidth: number; bmHeight: number };
    const width = bm.bmWidth;
    const height = bm.bmHeight;
    if (width <= 0 || height <= 0) return null;

    const color = readBitmap32(api, hdc, info.hbmColor, width, height);
    if (!color) return null;

    let hasAlpha = false;
    for (let i = 3; i < color.length; i += 4) {
      if (color[i] !== 0) {
        hasAlpha = true;
        break;
      }
    }
    if (!hasAlpha && info.hbmMask) {
      const mask = readBitmap32(api, hdc, info.hbmMask, width, height);
      if (mask) {
        for (let i = 0; i < width * height; i++) {
          if (mask[i * 4] === 0 && mask[i * 4 + 1] === 0 && mask[i * 4 + 2] === 0) {
            color[i * 4 + 3] = 255;
          }
        }
      }
    }

    const cropped = cropTransparent(color, width, height);
    const img = nativeImage.createFromBitmap(cropped.data, {
      width: cropped.width,
      height: cropped.height,
    });
    if (img.isEmpty()) return null;
    const png = img.toPNG();
    return png.length ? png : null;
  } finally {
    if (hdc) api.ReleaseDC(null, hdc);
    if (info.hbmColor) api.DeleteObject(info.hbmColor);
    if (info.hbmMask) api.DeleteObject(info.hbmMask);
  }
}

function pickIcon(api: WinApis, iIcon: number, fallback: Handle | null): Handle | null {
  const jumbo = getJumboIcon(api, iIcon, SHIL_JUMBO);
  if (jumbo) return jumbo;
  const extra = getJumboIcon(api, iIcon, SHIL_EXTRALARGE);
  if (extra) return extra;
  return fallback;
}

/**
 * Extract the shell-associated icon for a file (including .lnk) via SHGetFileInfo.
 * Returns PNG bytes, or null when the Win32 path is unavailable.
 */
export function extractWinShellIconPng(filePath: string): Buffer | null {
  if (process.platform !== 'win32') return null;
  const api = loadApis();
  if (!api) return null;

  let chosen: Handle | null = null;
  let fallback: Handle | null = null;
  try {
    const sfiBuf = koffi.alloc(api.SHFILEINFOW, 1);
    const ok = api.SHGetFileInfoW(
      filePath,
      0,
      sfiBuf,
      api.sizeofShfi,
      SHGFI_ICON | SHGFI_LARGEICON | SHGFI_SYSICONINDEX,
    ) as number | bigint;
    if (!ok) return null;

    const sfi = koffi.decode(sfiBuf, api.SHFILEINFOW) as { hIcon: Handle; iIcon: number };
    fallback = sfi.hIcon;
    chosen = pickIcon(api, sfi.iIcon, fallback);
    if (!chosen) return null;
    if (fallback && chosen !== fallback) api.DestroyIcon(fallback);
    fallback = null;
    return hIconToPng(api, chosen);
  } catch {
    return null;
  } finally {
    if (chosen) api.DestroyIcon(chosen);
    else if (fallback) api.DestroyIcon(fallback);
  }
}
