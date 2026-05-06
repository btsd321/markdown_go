/**
 * Webview i18n —— 简易本地化模块
 *
 * 设计：
 *   - 单例 locale + 字典查表 + 订阅广播
 *   - App 在 INIT / 用户切换时调用 setLocale，触发所有订阅者重新渲染
 *
 * 用法：
 *   import { t, onLocaleChange, setLocale } from './i18n';
 *   const text = t('menubar.mode');
 *   const off = onLocaleChange(() => repaint());
 */
import type { LanguageCode } from '../../shared';

type Dict = Record<string, string>;

const ZH: Dict = {
  // Menubar
  'menubar.mode': '模式',
  'menubar.language': '语言',
  'mode.edit': '编辑',
  'mode.preview': '预览',
  'mode.plain': '纯文本',
  'lang.zh-cn': '中文',
  'lang.en': 'English',

  // PlainView
  'plain.placeholder': '预览模式开发中…',

  // Block labels (BubbleMenu 下拉/SlashMenu/BlockHandle 共享)
  'block.paragraph': '段落',
  'block.h1': '标题 1',
  'block.h2': '标题 2',
  'block.h3': '标题 3',
  'block.ul': '无序列表',
  'block.ol': '有序列表',
  'block.quote': '引用',
  'block.codeBlock': '代码块',
  'block.hr': '分割线',
  'block.latex': 'LaTeX 公式',
  'block.mermaid': 'Mermaid 图表',

  // BubbleMenu 内联按钮 title
  'inline.bold': '加粗',
  'inline.italic': '斜体',
  'inline.strike': '删除线',
  'inline.code': '行内代码',
  'bubble.typeBtnTitle': '块类型',

  // BlockHandle
  'blockHandle.title': '点击插入新块',

  // ContextMenu
  'context.copyPlain': '复制纯文本',
  'context.copyPlainHint': '仅可见文字',
  'context.copyMarkdown': '复制 Markdown',
  'context.copyMarkdownHint': '含格式、公式、图表源码',

  // PromptDialog
  'dialog.confirm': '插入',
  'dialog.cancel': '取消',
  'dialog.hint': 'Enter 确认 ·  Shift+Enter 换行 · Esc 取消',
  'dialog.latex.title': '插入 LaTeX 公式',
  'dialog.latex.placeholder': 'E = mc^2',
  'dialog.mermaid.title': '插入 Mermaid 图表',
  'dialog.mermaid.placeholder': 'graph LR\n  A --> B',
};

const EN: Dict = {
  'menubar.mode': 'Mode',
  'menubar.language': 'Language',
  'mode.edit': 'Edit',
  'mode.preview': 'Preview',
  'mode.plain': 'Plain',
  'lang.zh-cn': '中文',
  'lang.en': 'English',

  'plain.placeholder': 'Preview mode coming soon…',

  'block.paragraph': 'Paragraph',
  'block.h1': 'Heading 1',
  'block.h2': 'Heading 2',
  'block.h3': 'Heading 3',
  'block.ul': 'Bullet List',
  'block.ol': 'Ordered List',
  'block.quote': 'Quote',
  'block.codeBlock': 'Code Block',
  'block.hr': 'Divider',
  'block.latex': 'LaTeX Formula',
  'block.mermaid': 'Mermaid Diagram',

  'inline.bold': 'Bold',
  'inline.italic': 'Italic',
  'inline.strike': 'Strike',
  'inline.code': 'Inline Code',
  'bubble.typeBtnTitle': 'Block Type',

  'blockHandle.title': 'Click to insert block',

  'context.copyPlain': 'Copy Plain Text',
  'context.copyPlainHint': 'Visible text only',
  'context.copyMarkdown': 'Copy Markdown',
  'context.copyMarkdownHint': 'Incl. format, formulas, diagrams',

  'dialog.confirm': 'Insert',
  'dialog.cancel': 'Cancel',
  'dialog.hint': 'Enter to confirm · Shift+Enter for newline · Esc to cancel',
  'dialog.latex.title': 'Insert LaTeX Formula',
  'dialog.latex.placeholder': 'E = mc^2',
  'dialog.mermaid.title': 'Insert Mermaid Diagram',
  'dialog.mermaid.placeholder': 'graph LR\n  A --> B',
};

const DICTS: Record<LanguageCode, Dict> = { 'zh-cn': ZH, en: EN };

let locale: LanguageCode = 'zh-cn';
const subscribers = new Set<() => void>();

export function setLocale(l: LanguageCode): void {
  if (l === locale) return;
  locale = l;
  for (const fn of subscribers) {
    try { fn(); } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[i18n] subscriber failed', e);
    }
  }
}

export function getLocale(): LanguageCode {
  return locale;
}

export function t(key: string): string {
  return DICTS[locale]?.[key] ?? EN[key] ?? key;
}

export function onLocaleChange(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}
