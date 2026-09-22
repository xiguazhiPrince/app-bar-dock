import type {} from './renderer.d.ts';
import './index.css';

import type { FolderItem, ScanEntry } from './shared/ipc';
import { applyTranslations, getInitialLocale, setLocale, t, type Locale } from './i18n';

const api = window.appFolder;

const gridEl = document.querySelector<HTMLDivElement>('#grid');
const dropZone = document.querySelector<HTMLElement>('#drop-zone');
const btnAdd = document.querySelector<HTMLButtonElement>('#btn-add');
const btnScan = document.querySelector<HTMLButtonElement>('#btn-scan');
const btnClose = document.querySelector<HTMLButtonElement>('#btn-close');
const langSelect = document.querySelector<HTMLSelectElement>('#lang-select');
const modal = document.querySelector<HTMLElement>('#modal-overlay');
const modalClose = document.querySelector<HTMLButtonElement>('#modal-close');
const scanList = document.querySelector<HTMLUListElement>('#scan-list');
const scanFilter = document.querySelector<HTMLInputElement>('#scan-filter');
const scanAddSelected = document.querySelector<HTMLButtonElement>('#scan-add-selected');
const itemCountEl = document.querySelector<HTMLElement>('#item-count');
const emptyStateEl = document.querySelector<HTMLElement>('#empty-state');

const iconCache = new Map<string, string | null>();
let currentLocale: Locale = getInitialLocale();

async function loadIcon(pathStr: string): Promise<string | null> {
  // Misses are cached too: re-rendering the grid must not re-run the whole
  // extraction chain for every app that has no icon to give.
  if (iconCache.has(pathStr)) return iconCache.get(pathStr) ?? null;
  const url = await api.getFileIconDataUrl(pathStr);
  iconCache.set(pathStr, url);
  return url;
}

function fallbackGlyph(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return '?';
  const first = [...trimmed][0] ?? '?';
  if (/^[a-zA-Z]$/.test(first)) return first.toUpperCase();
  return first;
}

function fallbackHue(label: string): number {
  return [...label].reduce((h, c) => (h * 31 + (c.codePointAt(0) ?? 0)) % 360, 7);
}

function createFallbackIcon(label: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = 'tile-icon tile-icon-fallback';
  el.textContent = fallbackGlyph(label);
  el.style.background = `hsl(${fallbackHue(label)} 55% 52%)`;
  return el;
}

function createTile(item: FolderItem): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tile';
  btn.dataset.id = item.id;
  btn.dataset.path = item.path;
  btn.title = `${item.label}\n${item.path}`;

  const img = document.createElement('img');
  img.alt = '';
  img.className = 'tile-icon';
  img.loading = 'lazy';
  void loadIcon(item.path).then((url) => {
    if (url) {
      img.src = url;
    } else {
      img.replaceWith(createFallbackIcon(item.label));
    }
  });

  const label = document.createElement('span');
  label.className = 'tile-label';
  label.textContent = item.label;

  btn.append(img, label);

  btn.addEventListener('click', () => {
    void api.launch(item.path);
  });

  btn.addEventListener('contextmenu', (ev) => {
    ev.preventDefault();
    const firstOk = window.confirm(t(currentLocale, 'confirm.remove.first', { label: item.label }));
    if (!firstOk) return;
    const secondOk = window.confirm(
      t(currentLocale, 'confirm.remove.second', { label: item.label }),
    );
    if (!secondOk) return;
    void api.removeItem(item.id).then(renderItems);
  });

  return btn;
}

function updateMeta(list: FolderItem[]): void {
  if (itemCountEl) {
    const key = list.length === 1 ? 'meta.appCount' : 'meta.appCountPlural';
    itemCountEl.textContent = t(currentLocale, key, { count: list.length });
  }
  emptyStateEl?.classList.toggle('hidden', list.length > 0);
}

async function renderItems(items?: FolderItem[]): Promise<void> {
  if (!gridEl) return;
  const list = items ?? (await api.listItems());
  gridEl.replaceChildren();
  updateMeta(list);
  for (const item of list) {
    gridEl.append(createTile(item));
  }
}

function openModal(): void {
  modal?.classList.remove('hidden');
  scanFilter?.focus();
}

function closeModal(): void {
  modal?.classList.add('hidden');
  if (scanList) scanList.replaceChildren();
  if (scanFilter) scanFilter.value = '';
}

let scanEntries: ScanEntry[] = [];

function renderScanList(filter: string): void {
  if (!scanList) return;
  scanList.replaceChildren();
  const q = filter.trim().toLowerCase();
  const rows = q
    ? scanEntries.filter((e) => e.name.toLowerCase().includes(q))
    : scanEntries;

  for (const entry of rows) {
    const li = document.createElement('li');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.path = entry.path;
    const lab = document.createElement('label');
    lab.append(cb, document.createTextNode(` ${entry.name}`));
    li.append(lab);
    scanList.append(li);
  }
}

btnAdd?.addEventListener('click', async () => {
  const picked = await api.pickFiles();
  if (picked.length) await renderItems(await api.addPaths(picked));
});

btnScan?.addEventListener('click', async () => {
  scanEntries = await api.scanApplications();
  openModal();
  renderScanList(scanFilter?.value ?? '');
});

scanFilter?.addEventListener('input', () => {
  renderScanList(scanFilter.value);
});

modalClose?.addEventListener('click', () => closeModal());

modal?.addEventListener('click', (e) => {
  if (e.target === modal) closeModal();
});

scanAddSelected?.addEventListener('click', async () => {
  if (!scanList) return;
  const paths = Array.from(
    scanList.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked'),
  ).map((cb) => cb.dataset.path ?? '');
  const ok = paths.filter(Boolean);
  if (ok.length) await renderItems(await api.addPaths(ok));
  closeModal();
});

langSelect?.addEventListener('change', () => {
  const locale = (langSelect.value === 'zh-CN' ? 'zh-CN' : 'en') as Locale;
  currentLocale = locale;
  setLocale(locale);
  applyTranslations(locale);
  void renderItems();
});

btnClose?.addEventListener('click', () => {
  void api.hideWindow();
});

dropZone?.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.add('drag');
});

dropZone?.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag');
});

dropZone?.addEventListener('drop', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('drag');
  const dt = e.dataTransfer;
  if (!dt?.files?.length) return;
  const paths: string[] = [];
  for (let i = 0; i < dt.files.length; i++) {
    const file = dt.files.item(i);
    if (!file) continue;
    try {
      paths.push(api.getPathForFile(file));
    } catch {
      /* older Electron without path */
    }
  }
  if (paths.length) await renderItems(await api.addPaths(paths));
});

// The dock window is hidden and re-shown rather than reloaded, and the main
// process pushes nothing to the renderer. So refresh the order every time the
// window comes back to the front: reordering then only happens while the dock
// is hidden, never under the cursor mid-click.
window.addEventListener('focus', () => {
  void renderItems();
});

applyTranslations(currentLocale);
if (langSelect) langSelect.value = currentLocale;
void renderItems();
