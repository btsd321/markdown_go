/**
 * 顶部菜单栏
 *
 * 渲染模式 / 语言两个下拉框，并在变更时回调上层。
 */
import { DisplayMode, LanguageCode } from '../../shared';

export interface MenubarOptions {
  mode: DisplayMode;
  language: LanguageCode;
  onModeChange(mode: DisplayMode): void;
  onLanguageChange(lang: LanguageCode): void;
}

const MODE_LABELS: Record<DisplayMode, string> = {
  edit: '编辑',
  preview: '预览',
  plain: '纯文本',
};

const LANG_LABELS: Record<LanguageCode, string> = {
  'zh-cn': '中文',
  en: 'English',
};

export function renderMenubar(opts: MenubarOptions): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'menubar';

  bar.appendChild(
    buildSelect('模式', ['edit', 'preview', 'plain'], opts.mode, MODE_LABELS, (v) =>
      opts.onModeChange(v as DisplayMode)
    )
  );

  bar.appendChild(
    buildSelect('语言', ['zh-cn', 'en'], opts.language, LANG_LABELS, (v) =>
      opts.onLanguageChange(v as LanguageCode)
    )
  );

  return bar;
}

function buildSelect<K extends string>(
  labelText: string,
  values: K[],
  current: K,
  labels: Record<K, string>,
  onChange: (v: K) => void
): HTMLLabelElement {
  const label = document.createElement('label');
  label.textContent = labelText;

  const sel = document.createElement('select');
  for (const v of values) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = labels[v];
    if (v === current) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => onChange(sel.value as K));
  label.appendChild(sel);
  return label;
}
