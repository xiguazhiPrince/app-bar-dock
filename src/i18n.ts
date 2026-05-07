export type Locale = 'en' | 'zh-CN';

const STORAGE_KEY = 'app.locale';
const DEFAULT_LOCALE: Locale = 'en';

type Dict = Record<string, string>;

const dictionaries: Record<Locale, Dict> = {
  en: {
    'app.title': 'App folder',
    'title.main': 'App Folder',
    'action.add': 'Add',
    'action.scan': 'Scan',
    'action.close': 'Close',
    'action.hide': 'Hide',
    'action.addApps': 'Add apps',
    'action.scanApps': 'Browse system apps',
    'drop.hintPrefix': 'Drag shortcuts or apps here, or use',
    'empty.title': 'No apps yet',
    'empty.desc': 'Add from file picker, scan system apps, or drag files into this panel.',
    'hint.footer': 'Click to launch · Right-click to remove · Click outside to hide',
    'scan.title': 'System Applications',
    'scan.subtitle': 'Select items you want to add',
    'scan.filterPlaceholder': 'Filter by name...',
    'scan.addSelected': 'Add selected',
    'meta.appCount': '{count} app',
    'meta.appCountPlural': '{count} apps',
  },
  'zh-CN': {
    'app.title': '应用文件夹',
    'title.main': '应用文件夹',
    'action.add': '添加',
    'action.scan': '扫描',
    'action.close': '关闭',
    'action.hide': '隐藏',
    'action.addApps': '添加应用',
    'action.scanApps': '浏览系统应用',
    'drop.hintPrefix': '将快捷方式或应用拖到这里，或使用',
    'empty.title': '还没有应用',
    'empty.desc': '可通过文件选择器添加、扫描系统应用，或直接拖拽文件到此面板。',
    'hint.footer': '单击启动 · 右键移除 · 点击外部隐藏',
    'scan.title': '系统应用',
    'scan.subtitle': '选择想要添加的条目',
    'scan.filterPlaceholder': '按名称筛选...',
    'scan.addSelected': '添加所选',
    'meta.appCount': '{count} 个应用',
    'meta.appCountPlural': '{count} 个应用',
  },
};

function normalizeLocale(input: string | null | undefined): Locale {
  if (!input) return DEFAULT_LOCALE;
  const lower = input.toLowerCase();
  if (lower.startsWith('zh')) return 'zh-CN';
  return 'en';
}

export function getInitialLocale(): Locale {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved) return normalizeLocale(saved);
  return normalizeLocale(navigator.language);
}

export function setLocale(locale: Locale): void {
  window.localStorage.setItem(STORAGE_KEY, locale);
}

export function t(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const dict = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
  const fallback = dictionaries[DEFAULT_LOCALE];
  let result = dict[key] ?? fallback[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      result = result.replaceAll(`{${name}}`, String(value));
    }
  }
  return result;
}

export function applyTranslations(locale: Locale): void {
  document.documentElement.lang = locale;

  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (!key) return;
    el.textContent = t(locale, key);
  });

  document.querySelectorAll<HTMLElement>('[data-i18n-attr-title]').forEach((el) => {
    const key = el.dataset.i18nAttrTitle;
    if (!key) return;
    el.setAttribute('title', t(locale, key));
  });

  document.querySelectorAll<HTMLElement>('[data-i18n-attr-placeholder]').forEach((el) => {
    const key = el.dataset.i18nAttrPlaceholder;
    if (!key) return;
    el.setAttribute('placeholder', t(locale, key));
  });
}
