/**
 * ContextMenu —— 编辑器右键菜单
 *
 * 一级菜单：
 *   - 选区非空：剪切 Markdown / 复制纯文本 / 复制 Markdown
 *   - 始终显示：插入… ▶
 * 二级菜单（点击"插入…"切换）：
 *   - 块级（在下一行插入；若下一行有内容则推下并插在中间）：引用 / 代码块 / 分割线 / LaTeX / Mermaid
 *   - 行内（不换行）：链接（弹双字段对话框输入 URL + 显示文本）
 */
import type { Editor } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { MarkdownSerializer } from 'prosemirror-markdown';
import { t } from '../../i18n';
import { serializeRange } from '../utils/serializeRange';
import { openPromptDialog } from '../../ui/PromptDialog';
import { openLinkDialog } from '../../ui/LinkDialog';

export interface ContextMenuController {
  extension: Extension;
  bind(editor: Editor): void;
  destroy(): void;
}

export interface ContextMenuOptions {
  /** 延迟获取序列化器（在 Tiptap schema 创建后才能构造 serializer） */
  getSerializer: () => MarkdownSerializer;
}

type View = 'main' | 'insert';

interface MenuItem {
  label: string;
  hint?: string;
  handler: () => void | Promise<void>;
  keepOpen?: boolean;
}

export function createContextMenu(opts: ContextMenuOptions): ContextMenuController {
  const menu = document.createElement('div');
  menu.className = 'mg-context-menu';
  menu.style.display = 'none';
  document.body.appendChild(menu);

  let editorRef: Editor | null = null;
  let menuOpen = false;
  let view: View = 'main';

  function hide() {
    menu.style.display = 'none';
    menuOpen = false;
    view = 'main';
  }

  function buildMenu() {
    menu.innerHTML = '';
    const items: MenuItem[] = view === 'insert' ? buildInsertItems() : buildMainItems();
    for (const it of items) renderItem(it);
  }

  function buildMainItems(): MenuItem[] {
    const list: MenuItem[] = [];
    const hasSelection = !!editorRef && !editorRef.state.selection.empty;
    if (hasSelection) {
      list.push({ label: t('context.cut'), hint: t('context.cutHint'), handler: cutMarkdown });
      list.push({ label: t('context.copyPlain'), hint: t('context.copyPlainHint'), handler: copyPlain });
      list.push({ label: t('context.copyMarkdown'), hint: t('context.copyMarkdownHint'), handler: copyMarkdown });
    }
    list.push({
      label: t('context.insert'),
      hint: t('context.insertHint'),
      handler: () => {
        view = 'insert';
        buildMenu();
      },
      keepOpen: true,
    });
    return list;
  }

  function buildInsertItems(): MenuItem[] {
    return [
      { label: t('context.back'), handler: () => { view = 'main'; buildMenu(); }, keepOpen: true },
      { label: t('block.quote'), hint: '> ', handler: () => insertNextBlock({ type: 'blockquote', content: [{ type: 'paragraph' }] }) },
      { label: t('block.codeBlock'), hint: '{ }', handler: () => insertNextBlock({ type: 'codeBlock' }) },
      { label: t('block.hr'), hint: '---', handler: () => insertNextBlock({ type: 'horizontalRule' }) },
      { label: t('block.latex'), hint: '$$', handler: insertLatex },
      { label: t('block.mermaid'), hint: '◇', handler: insertMermaid },
      { label: t('context.insertLink'), hint: t('context.insertLinkHint'), handler: insertLink },
    ];
  }

  function renderItem(item: MenuItem) {
    const el = document.createElement('div');
    el.className = 'mg-context-item';
    el.innerHTML =
      `<span class="mg-context-label">${escapeHTML(item.label)}</span>` +
      (item.hint ? `<span class="mg-context-hint">${escapeHTML(item.hint)}</span>` : '');
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const keep = item.keepOpen;
      Promise.resolve()
        .then(() => item.handler())
        .finally(() => { if (!keep) hide(); });
    });
    menu.appendChild(el);
  }

  /** 取当前选区；若空则取整个文档（仅复制场景使用） */
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
    const text = editorRef.state.doc.textBetween(range.from, range.to, '\n\n', (leaf) => {
      const src = (leaf.attrs as { src?: string }).src;
      if (typeof src === 'string') return src;
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
      md = serializer.serialize(editorRef.state.doc);
    } else {
      md = serializeRange(editorRef.state, range.from, range.to, serializer);
    }
    if (!md.endsWith('\n')) md += '\n';
    writeClipboard(md);
  }

  function cutMarkdown() {
    if (!editorRef) return;
    const { from, to, empty } = editorRef.state.selection;
    if (empty) return;
    let md = serializeRange(editorRef.state, from, to, opts.getSerializer());
    if (md.endsWith('\n')) md = md.slice(0, -1);
    writeClipboard(md);
    editorRef.chain().focus().deleteSelection().run();
  }

  // ---- 插入逻辑 ----

  /** 在当前块之后插入一个块；若下一位置已有内容则自然推下 */
  function insertNextBlock(content: any) {
    if (!editorRef) return;
    const sel = editorRef.state.selection;
    const $from = sel.$from;
    if ($from.depth < 1) return;
    const pos = $from.after(1);
    editorRef.chain().focus().insertContentAt(pos, content).run();
  }

  async function insertLatex() {
    if (!editorRef) return;
    const src = await openPromptDialog({
      title: t('dialog.latex.title'),
      placeholder: t('dialog.latex.placeholder'),
      confirmLabel: t('dialog.confirm'),
    });
    if (!src || !src.trim()) return;
    insertNextBlock({ type: 'latexBlock', attrs: { src: src.trim() } });
  }

  async function insertMermaid() {
    if (!editorRef) return;
    const src = await openPromptDialog({
      title: t('dialog.mermaid.title'),
      placeholder: t('dialog.mermaid.placeholder'),
      confirmLabel: t('dialog.confirm'),
    });
    if (!src || !src.trim()) return;
    insertNextBlock({ type: 'mermaidBlock', attrs: { src: src.trim() } });
  }

  async function insertLink() {
    if (!editorRef) return;
    const sel = editorRef.state.selection;
    const initialText = sel.empty ? '' : editorRef.state.doc.textBetween(sel.from, sel.to, ' ');
    const result = await openLinkDialog({ initialText });
    if (!result) return;
    const { href, text } = result;
    editorRef
      .chain()
      .focus()
      .insertContent([
        { type: 'text', text, marks: [{ type: 'link', attrs: { href } }] },
      ])
      .run();
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
    view = 'main';
    buildMenu();
    menu.style.display = '';
    menu.style.position = 'fixed';
    // 先放 0,0 以获取真实尺寸，避免初次错位
    menu.style.left = '0px';
    menu.style.top = '0px';
    menuOpen = true;
    requestAnimationFrame(() => {
      const r = menu.getBoundingClientRect();
      const margin = 8;
      let nx = Math.round(x);
      let ny = Math.round(y);
      // 右边溢出 → 靠左侧弹（x 左移一个菜单宽）
      if (nx + r.width > window.innerWidth - margin) {
        nx = Math.max(margin, x - r.width);
      }
      if (nx + r.width > window.innerWidth - margin) {
        nx = Math.max(margin, window.innerWidth - r.width - margin);
      }
      // 下边溢出 → 上移
      if (ny + r.height > window.innerHeight - margin) {
        ny = Math.max(margin, y - r.height);
      }
      if (ny + r.height > window.innerHeight - margin) {
        ny = Math.max(margin, window.innerHeight - r.height - margin);
      }
      if (nx < margin) nx = margin;
      if (ny < margin) ny = margin;
      menu.style.left = `${nx}px`;
      menu.style.top = `${ny}px`;
    });
  }

  document.addEventListener('mousedown', (e) => {
    if (!menuOpen) return;
    if (menu.contains(e.target as Node)) return;
    hide();
  });
  document.addEventListener('keydown', (e) => {
    if (menuOpen && e.key === 'Escape') hide();
  });
  window.addEventListener('resize', hide);

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
