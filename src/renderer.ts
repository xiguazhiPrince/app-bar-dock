import './index.css';

import type { FolderItem, ScanEntry } from './shared/ipc';

const api = window.appFolder;

const gridEl = document.querySelector<HTMLDivElement>('#grid');
const dropZone = document.querySelector<HTMLElement>('#drop-zone');
const btnAdd = document.querySelector<HTMLButtonElement>('#btn-add');
const btnScan = document.querySelector<HTMLButtonElement>('#btn-scan');
const btnClose = document.querySelector<HTMLButtonElement>('#btn-close');
const modal = document.querySelector<HTMLElement>('#modal-overlay');
const modalClose = document.querySelector<HTMLButtonElement>('#modal-close');
const scanList = document.querySelector<HTMLUListElement>('#scan-list');
const scanFilter = document.querySelector<HTMLInputElement>('#scan-filter');
const scanAddSelected = document.querySelector<HTMLButtonElement>(
  '#scan-add-selected',
);

const iconCache = new Map<string, string>();

async function loadIcon(pathStr: string): Promise<string | null> {
  const hit = iconCache.get(pathStr);
  if (hit) return hit;
  const url = await api.getFileIconDataUrl(pathStr);
  if (url) iconCache.set(pathStr, url);
  return url;
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
    if (url) img.src = url;
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
    void api.removeItem(item.id).then(renderItems);
  });

  return btn;
}

async function renderItems(items?: FolderItem[]): Promise<void> {
  if (!gridEl) return;
  const list = items ?? (await api.listItems());
  gridEl.replaceChildren();
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

void renderItems();
