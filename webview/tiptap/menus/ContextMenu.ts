/**
 * ContextMenu —— 编辑器右键菜单
 *
 * 提供两个复制项：
 *   1) 复制纯文本（仅可见文字，无格式）
 *   2) 复制 Markdown（包含语法 / 公式 / 流程图源码）
 *
 * 实现：监听 view.dom 的 contextmenu，阻止默认菜单，弹出自定义浮窗。
 */
import type { Editor } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { MarkdownSerializer } from 'prosemirror-markdown';
import { t } from '../../i18n';
import { serializeRange } from '../utils/serializeRange';

export interface ContextMenuController {
  extension: Extension;
  bind(editor: Editor): void;
  destroy(): void;
}

export interface ContextMenuOptions {
  /** 延迟获取序列化器（在 Tiptap schema 创建后才能构造 serializer） */
  getSerializer: () => MarkdownSerializer;
}

export function createContextMenu(opts: ContextMenuOptions): ContextMenuController {
  const menu = document.createElement('div');
  menu.className = 'mg-context-menu';
  menu.style.display = 'none';
  document.body.appendChild(menu);

  let editorRef: Editor | null = null;
  let menuOpen = false;

  function hide() {
    menu.style.display = 'none';
    menuOpen = false;
  }

  function buildMenu() {
    menu.innerHTML = '';
    addItem(t('context.copyPlain'), t('context.copyPlainHint'), copyPlain);
    addItem(t('context.copyMarkdown'), t('context.copyMarkdownHint'), copyMarkdown);
  }

  function addItem(label: string, hint: string, handler: () => void) {
    const el = document.createElement('div');
    el.className = 'mg-context-item';
    el.innerHTML =
      `<span class="mg-context-label">${escapeHTML(label)}</span>` +
      `<span class="mg-context-hint">${escapeHTML(hint)}</span>`;
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        handler();
      } finally {
        hide();
      }
    });
    menu.appendChild(el);
  }

  /** 取当前选区；若空则取整个文档 */
  function getRange(): { from: number; to: number; empty: boolean } | null {
    if (!editorRef) return null;
    const { from, to, empty } = editorRef.state.selection;
    if (empty) {
      return { from: 0, to: editorRef.state.doc.content.size, empty: true };
    }
    return { from, to, empty: false };
  }

  function copyPlain() {
    const range = getRange();
    if (!editorRef || !range) return;
    // textBetween: blockSeparator 用 \n\n，atom 节点（latex/mermaid）用空字符串
    // 对 atom 节点用其 src 属性的可读形式（或空）
    const text = editorRef.state.doc.textBetween(range.from, range.to, '\n\n', (leaf) => {
      // atom 节点：返回源码作为可读文本（用户期望复制公式时也有内容）
      const src = (leaf.attrs as { src?: string }).src;
      if (typeof src === 'string') return src;
      if (leaf.type.name === 'horizontalRule') return '';
      return '';
    });
    writeClipboard(text);
  }

  function copyMarkdown() {
    if (!editorRef) return;
    const range = getRange();
    if (!range) return;
    let md: string;
    const serializer = opts.getSerializer();
    if (range.empty) {
      // 全文
      md = serializer.serialize(editorRef.state.doc);
    } else {
      md = serializeRange(editorRef.state, range.from, range.to, serializer);
    }
    if (!md.endsWith('\n')) md += '\n';
    writeClipboard(md);
  }

  function writeClipboard(text: string) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[contextMenu] clipboard write failed', err);
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text: string) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[contextMenu] execCommand copy failed', err);
    }
    document.body.removeChild(ta);
  }

  function show(x: number, y: number) {
    // 每次重建，以使语言切换后立即生效
    buildMenu();
    menu.style.display = '';
    menu.style.position = 'fixed';
    menu.style.left = `${Math.round(x)}px`;
    menu.style.top = `${Math.round(y)}px`;
    menuOpen = true;
    requestAnimationFrame(() => {
      const r = menu.getBoundingClientRect();
      if (r.right > window.innerWidth - 8) {
        menu.style.left = `${Math.round(window.innerWidth - r.width - 8)}px`;
      }
      if (r.bottom > window.innerHeight - 8) {
        menu.style.top = `${Math.round(window.innerHeight - r.height - 8)}px`;
      }
    });
  }

  // 点击外部关闭
  document.addEventListener('mousedown', (e) => {
    if (!menuOpen) return;
    if (menu.contains(e.target as Node)) return;
    hide();
  });
  // Esc / 滚动 / 调整窗口关闭
  document.addEventListener('keydown', (e) => {
    if (menuOpen && e.key === 'Escape') hide();
  });
  window.addEventListener('resize', hide);

  // ----- ProseMirror Plugin -----
  const plugin = new Plugin({
    key: new PluginKey('mg-context-menu'),
    props: {
      handleDOMEvents: {
        contextmenu(_view, ev) {
          const e = ev as MouseEvent;
          e.preventDefault();
          show(e.clientX, e.clientY);
          return true;
        },
      },
    },
  });

  const extension = Extension.create({
    name: 'mgContextMenu',
    addProseMirrorPlugins() {
      return [plugin];
    },
  });

  return {
    extension,
    bind(editor: Editor) {
      editorRef = editor;
    },
    destroy() {
      hide();
      menu.remove();
    },
  };
}

function escapeHTML(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}
