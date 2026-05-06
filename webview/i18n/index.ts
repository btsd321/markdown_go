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
  'mode.preview': '只读',
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
  'block.h4': '标题 4',
  'block.h5': '标题 5',
  'block.h6': '标题 6',
  'block.headingMore': '更多标题…',
  'menu.back': '← 返回',
  'block.ul': '无序列表',
  'block.ol': '有序列表',
  'block.quote': '引用',
  'block.codeBlock': '代码块',
  'block.hr': '分割线',
  'block.latex': 'LaTeX 公式',
  'block.mermaid': 'Mermaid 图表',
  'block.image': '图片',
  'dialog.image.title': '插入图片',
  'dialog.image.tabUrl': '网络图片',
  'dialog.image.tabLocal': '本地图片',
  'dialog.image.urlLabel': '图片 URL：',
  'dialog.image.urlPlaceholder': 'https://example.com/photo.png',
  'dialog.image.altLabel': '替代文本（可选）：',
  'dialog.image.altPlaceholder': '描述这张图片',
  'dialog.image.choose': '选择文件…',
  'dialog.image.noFile': '未选择文件',
  'block.video': '视频',
  'dialog.video.title': '插入视频',
  'dialog.video.tabUrl': '网络视频',
  'dialog.video.tabLocal': '本地视频',
  'dialog.video.urlLabel': '视频 URL：',
  'dialog.video.urlPlaceholder': 'https://example.com/video.mp4 或嵌入页 URL',
  'dialog.video.kindLabel': '播放方式：',
  'dialog.video.kindAuto': '自动',
  'dialog.video.kindVideo': '直接播放 (video)',
  'dialog.video.kindIframe': '嵌入页 (iframe)',
  'dialog.video.titleLabel': '标题（可选）：',
  'dialog.video.titlePlaceholder': '描述这段视频',
  'dialog.video.choose': '选择视频…',
  'dialog.video.noFile': '未选择视频',
  'block.mergeUL': '合并为无序列表（单项）',
  'block.mergeOL': '合并为有序列表（单项）',
  'block.mergeCode': '合并为代码块',
  'bubble.colorTitle': '文本颜色',
  'bubble.colorClear': '默认颜色',
  'bubble.colorCustom': '自定义：',
  'bubble.alignTitle': '对齐',
  'bubble.alignLeft': '左对齐',
  'bubble.alignCenter': '居中对齐',
  'bubble.alignRight': '右对齐',

  // BubbleMenu 内联按钮 title
  'inline.bold': '加粗',
  'inline.italic': '斜体',
  'inline.strike': '删除线',
  'inline.code': '行内代码',
  'bubble.typeBtnTitle': '块类型',

  // BlockHandle
  'blockHandle.title': '点击插入新块',

  // ContextMenu
  'context.cut': '剪切 Markdown',
  'context.cutHint': '含格式',
  'context.copyPlain': '复制纯文本',
  'context.copyPlainHint': '仅可见文字',
  'context.copyMarkdown': '复制 Markdown',
  'context.copyMarkdownHint': '含格式、公式、图表源码',
  'context.insert': '插入…',
  'context.insertHint': '块 / 链接',
  'context.back': '← 返回',
  'context.insertLink': '链接',
  'context.insertLinkHint': '[文本](url) 不换行',

  // PromptDialog
  'dialog.confirm': '插入',
  'dialog.cancel': '取消',
  'dialog.hint': 'Enter 确认 ·  Shift+Enter 换行 · Esc 取消',
  'dialog.latex.title': '插入 LaTeX 公式',
  'dialog.latex.placeholder': 'E = mc^2',
  'dialog.mermaid.title': '插入 Mermaid 图表',
  'dialog.mermaid.placeholder': 'graph LR\n  A --> B',
  'dialog.link.title': '插入链接',
  'dialog.link.urlLabel': '链接地址',
  'dialog.link.urlPlaceholder': 'https://example.com',
  'dialog.link.textLabel': '显示文本',
  'dialog.link.textPlaceholder': '可选，默认为 URL',
};

const EN: Dict = {
  'menubar.mode': 'Mode',
  'menubar.language': 'Language',
  'mode.edit': 'Edit',
  'mode.preview': 'ReadOnly',
  'mode.plain': 'Plain',
  'lang.zh-cn': '中文',
  'lang.en': 'English',

  'plain.placeholder': 'Preview mode coming soon…',

  'block.paragraph': 'Paragraph',
  'block.h1': 'Heading 1',
  'block.h2': 'Heading 2',
  'block.h3': 'Heading 3',
  'block.h4': 'Heading 4',
  'block.h5': 'Heading 5',
  'block.h6': 'Heading 6',
  'block.headingMore': 'More headings…',
  'menu.back': '← Back',
  'block.ul': 'Bullet List',
  'block.ol': 'Ordered List',
  'block.quote': 'Quote',
  'block.codeBlock': 'Code Block',
  'block.hr': 'Divider',
  'block.latex': 'LaTeX Formula',
  'block.mermaid': 'Mermaid Diagram',
  'block.image': 'Image',
  'dialog.image.title': 'Insert Image',
  'dialog.image.tabUrl': 'From URL',
  'dialog.image.tabLocal': 'From File',
  'dialog.image.urlLabel': 'Image URL:',
  'dialog.image.urlPlaceholder': 'https://example.com/photo.png',
  'dialog.image.altLabel': 'Alt text (optional):',
  'dialog.image.altPlaceholder': 'Describe this image',
  'dialog.image.choose': 'Choose file…',
  'dialog.image.noFile': 'No file chosen',
  'block.video': 'Video',
  'dialog.video.title': 'Insert Video',
  'dialog.video.tabUrl': 'From URL',
  'dialog.video.tabLocal': 'From File',
  'dialog.video.urlLabel': 'Video URL:',
  'dialog.video.urlPlaceholder': 'https://example.com/video.mp4 or embed page URL',
  'dialog.video.kindLabel': 'Playback:',
  'dialog.video.kindAuto': 'Auto',
  'dialog.video.kindVideo': 'Direct (video)',
  'dialog.video.kindIframe': 'Embed (iframe)',
  'dialog.video.titleLabel': 'Title (optional):',
  'dialog.video.titlePlaceholder': 'Describe this video',
  'dialog.video.choose': 'Choose video…',
  'dialog.video.noFile': 'No video chosen',
  'block.mergeUL': 'Merge into Bullet List (single item)',
  'block.mergeOL': 'Merge into Ordered List (single item)',
  'block.mergeCode': 'Merge into Code Block',
  'bubble.colorTitle': 'Text Color',
  'bubble.colorClear': 'Default Color',
  'bubble.colorCustom': 'Custom:',
  'bubble.alignTitle': 'Align',
  'bubble.alignLeft': 'Left',
  'bubble.alignCenter': 'Center',
  'bubble.alignRight': 'Right',

  'inline.bold': 'Bold',
  'inline.italic': 'Italic',
  'inline.strike': 'Strike',
  'inline.code': 'Inline Code',
  'bubble.typeBtnTitle': 'Block Type',

  'blockHandle.title': 'Click to insert block',

  'context.cut': 'Cut Markdown',
  'context.cutHint': 'Includes formatting',
  'context.copyPlain': 'Copy Plain Text',
  'context.copyPlainHint': 'Visible text only',
  'context.copyMarkdown': 'Copy Markdown',
  'context.copyMarkdownHint': 'Incl. format, formulas, diagrams',
  'context.insert': 'Insert…',
  'context.insertHint': 'Block / Link',
  'context.back': '← Back',
  'context.insertLink': 'Link',
  'context.insertLinkHint': '[text](url) inline',

  'dialog.confirm': 'Insert',
  'dialog.cancel': 'Cancel',
  'dialog.hint': 'Enter to confirm · Shift+Enter for newline · Esc to cancel',
  'dialog.latex.title': 'Insert LaTeX Formula',
  'dialog.latex.placeholder': 'E = mc^2',
  'dialog.mermaid.title': 'Insert Mermaid Diagram',
  'dialog.mermaid.placeholder': 'graph LR\n  A --> B',
  'dialog.link.title': 'Insert Link',
  'dialog.link.urlLabel': 'URL',
  'dialog.link.urlPlaceholder': 'https://example.com',
  'dialog.link.textLabel': 'Display Text',
  'dialog.link.textPlaceholder': 'Optional, defaults to URL',
};

const DICTS: Record<LanguageCode, Dict> = { 'zh-cn': ZH, en: EN };

let locale: LanguageCode = 'en';
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
