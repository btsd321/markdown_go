/**
 * 顶部菜单栏
 *
 * 渲染模式 / 语言两个下拉框，并在变更时回调上层。所有文本走 i18n。
 */
import { DisplayMode, LanguageCode } from '../../shared';
import { t } from '../i18n';

export interface MenubarOptions {
  mode: DisplayMode;
  language: LanguageCode;
  onModeChange(mode: DisplayMode): void;
  onLanguageChange(lang: LanguageCode): void;
}

export function renderMenubar(opts: MenubarOptions): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'menubar';

  const modeLabels: Record<DisplayMode, string> = {
    edit: t('mode.edit'),
    preview: t('mode.preview'),
    plain: t('mode.plain'),
  };
  const langLabels: Record<LanguageCode, string> = {
    'zh-cn': t('lang.zh-cn'),
    en: t('lang.en'),
  };

  bar.appendChild(
    buildSelect(t('menubar.mode'), ['edit', 'preview', 'plain'], opts.mode, modeLabels, (v) =>
      opts.onModeChange(v as DisplayMode)
    )
  );
  bar.appendChild(
    buildSelect(t('menubar.language'), ['zh-cn', 'en'], opts.language, langLabels, (v) =>
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
