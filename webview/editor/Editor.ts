/**
 * 编辑器主控
 *
 * 职责：
 *  - 维护 DocumentModel 与 DOM 之间的双向映射
 *  - 协调键盘 / 剪贴板 / 历史 / 插入菜单等子模块
 *  - 通过 onSync 回调把 markdown 变化抛给宿主 (Extension)
 */
import { Block } from '../../shared';
import { DocumentModel } from '../model/DocumentModel';
import { renderBlock } from '../ui/BlockView';
import {
  renderInsertMenu,
  DEFAULT_INSERT_MENU,
  InsertMenuItem,
} from '../ui/InsertMenu';
import { openPromptDialog } from '../ui/PromptDialog';
import {
  getCaretOffset,
  setCaretOffset,
  setCaretToEnd,
  isCaretAtStart,
} from './Selection';
import { History, HistorySnapshot } from './History';
import { attachKeyHandler } from './KeyHandler';
import { Keybindings, KeybindingOverrides } from './Keybindings';
import { attachClipboard } from './Clipboard';
import { renderMermaid } from '../render/MermaidRenderer';
import { renderLatexBlock } from '../render/LatexRenderer';

export interface EditorCallbacks {
  /** 文档（markdown）发生变化，需要同步到宿主 */
  onSync(markdown: string): void;
  /** 日志通道 */
  log?(message: string, data?: any): void;
}

export class Editor {
  private activeBlockId: string | null = null;
  /** 当前正在“源码编辑”的 fenced 块（latex / mermaid）。null 表示无。 */
  private editingBlockId: string | null = null;
  private blockEls = new Map<string, HTMLElement>();
  private contentEls = new Map<string, HTMLElement>();
  private previewEls = new Map<string, HTMLElement>();
  /** mermaid 块内容缓存：避免相同源码重复渲染 */
  private mermaidRendered = new Map<string, string>();
  private openPopup: HTMLElement | null = null;
  private suppressSync = false;
  private history = new History(100);
  private snapshotTimer: number | null = null;
  /** 最近一次 sync 给宿主的内容；用于识别回环 DOC_SYNC */
  private lastSentMarkdown: string | null = null;
  /** 快捷键表；可通过 setKeybindings() 运行时更新 */
  private keybindings = new Keybindings();

  constructor(
    private readonly host: HTMLElement,
    private readonly model: DocumentModel,
    private readonly cb: EditorCallbacks
  ) {
    // 全局点击关闭弹出菜单
    document.addEventListener('mousedown', (e) => {
      if (this.openPopup && !this.openPopup.contains(e.target as Node)) {
        this.closePopup();
      }
    });
  }

  /** 由外部用初始内容启动 */
  bootstrap(markdown: string): void {
    this.suppressSync = true;
    this.model.fromMarkdown(markdown);
    this.suppressSync = false;
    this.render();
    this.history.reset(this.captureSnapshot());
  }

  /** 注入用户自定义快捷键覆盖。下次 keydown 即生效，无需重渲染。 */
  setKeybindings(overrides: KeybindingOverrides): void {
    this.keybindings = new Keybindings(undefined, overrides);
  }

  /** 外部强制设置内容（如外部修改了文件） */
  setMarkdown(markdown: string): void {
    // 归一化行尾后再做 echo 判断；宿主写盘会把 \n 转 CRLF，回灌内容不能直接 ===
    const normalized = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const isEcho =
      this.lastSentMarkdown !== null && normalized === this.lastSentMarkdown;
    this.cb.log?.('[Editor.setMarkdown]', {
      isEcho,
      length: markdown.length,
      preview: markdown.slice(0, 120),
    });
    if (isEcho) return;
    this.suppressSync = true;
    this.model.fromMarkdown(normalized);
    this.suppressSync = false;
    this.render();
  }

  // ============ 渲染 ============
  private render(): void {
    this.host.innerHTML = '';
    this.blockEls.clear();
    this.contentEls.clear();
    this.previewEls.clear();

    const blocks = this.model.getAllBlocks();
    for (const b of blocks) {
      const { root, content, preview } = renderBlock(b, {
        onFocus: (id) => this.setActive(id),
        onInput: (id, text) => this.handleInput(id, text),
        onHandleClick: (id, anchor) => this.openInsertMenu(id, anchor),
        onEnterEditing: (id) => this.enterEditing(id),
        attachContentListeners: (id, el) => this.attachBlockListeners(id, el),
      });
      this.blockEls.set(b.id, root);
      this.contentEls.set(b.id, content);
      if (preview) this.previewEls.set(b.id, preview);
      this.host.appendChild(root);
    }

    if (!this.activeBlockId && blocks.length > 0) {
      this.activeBlockId = blocks[0].id;
    }
    this.applyActiveClass();
    this.refreshAllPreviews();
  }

  private setActive(id: string): void {
    if (this.activeBlockId === id) {
      this.applyActiveClass();
      return;
    }
    const prev = this.activeBlockId;
    // 切换激活块 → 退出其他块的编辑状态
    if (this.editingBlockId && this.editingBlockId !== id) {
      this.editingBlockId = null;
    }
    this.activeBlockId = id;
    this.applyActiveClass();
    // 离开预览块 → 重新渲染
    if (prev && this.previewEls.has(prev)) {
      this.refreshPreview(prev);
    }
  }

  private applyActiveClass(): void {
    this.blockEls.forEach((el, id) => {
      el.classList.toggle('is-active', id === this.activeBlockId);
      el.classList.toggle('is-editing', id === this.editingBlockId);
    });
  }

  /** 进入 fenced 块的源码编辑模式 */
  private enterEditing(id: string): void {
    const block = this.model.getBlock(id);
    if (!block) return;
    if (block.type !== 'latex' && block.type !== 'mermaid') return;
    this.activeBlockId = id;
    this.editingBlockId = id;
    this.applyActiveClass();
    // 渲染后才能聚焦刚可见的 contenteditable
    requestAnimationFrame(() => {
      const el = this.contentEls.get(id);
      if (el) {
        el.focus();
        setCaretToEnd(el);
      }
    });
  }

  /** 退出当前 fenced 块的编辑模式，重新渲染预览 */
  private exitEditing(): void {
    if (!this.editingBlockId) return;
    const id = this.editingBlockId;
    this.editingBlockId = null;
    // 先 blur 避免 contenteditable 被隐藏后还保持焦点
    const el = this.contentEls.get(id);
    el?.blur?.();
    this.applyActiveClass();
    this.refreshPreview(id);
  }

  private focusBlock(id: string, caretOffset?: number): void {
    const el = this.contentEls.get(id);
    if (!el) return;
    if (caretOffset === undefined) {
      setCaretToEnd(el);
    } else {
      setCaretOffset(el, caretOffset);
    }
    this.setActive(id);
  }

  // ============ 监听器注入 ============
  private attachBlockListeners(id: string, content: HTMLElement): void {
    attachKeyHandler(
      content,
      id,
      () => isCaretAtStart(content),
      () => (content.textContent || '').length === 0,
      {
        keybindings: this.keybindings,
        handlers: {
          'editor.enter': (blockId: string) => this.enterAfter(blockId),
          'editor.softLineBreak': (blockId: string) => this.softLineBreak(blockId),
          'editor.backspaceAtStart': (blockId: string) => this.backspaceAtStart(blockId),
          'editor.indent': (blockId: string) => this.insertTab(blockId),
          'editor.outdent': (blockId: string) => this.outdent(blockId),
          'editor.undo': () => this.undo(),
          'editor.redo': () => this.redo(),
        },
      }
    );

    attachClipboard(content, {
      onContentChanged: () => {
        // 直接读 DOM，避免依赖事件顺序
        this.handleInput(id, content.textContent || '');
      },
    });
  }

  // ============ 输入 / 同步 ============
  private handleInput(id: string, text: string): void {
    // 直接写入 model，但**不**触发整页 rerender（DOM 已是最新）
    this.silentUpdate(id, { content: text });
    this.scheduleSnapshot();
    this.scheduleSync();
  }

  private silentUpdate(id: string, patch: Partial<Block>): void {
    const block = this.model.getBlock(id);
    if (!block) return;
    Object.assign(block, patch);
  }

  private syncTimer: number | null = null;
  private scheduleSync(): void {
    if (this.suppressSync) return;
    if (this.syncTimer !== null) return;
    this.syncTimer = window.setTimeout(() => {
      this.syncTimer = null;
      const md = this.model.toMarkdown();
      this.lastSentMarkdown = md;
      this.cb.log?.('[Editor.sync->host]', {
        length: md.length,
        preview: md.slice(0, 120),
      });
      this.cb.onSync(md);
    }, 80);
  }

  // ============ 历史 ============
  private captureSnapshot(): HistorySnapshot {
    const activeId = this.activeBlockId;
    const el = activeId ? this.contentEls.get(activeId) : null;
    return {
      markdown: this.model.toMarkdown(),
      activeBlockId: activeId,
      caretOffset: el ? getCaretOffset(el) : 0,
    };
  }

  private scheduleSnapshot(): void {
    if (this.snapshotTimer !== null) {
      window.clearTimeout(this.snapshotTimer);
    }
    this.snapshotTimer = window.setTimeout(() => {
      this.snapshotTimer = null;
      this.history.push(this.captureSnapshot());
    }, 400);
  }

  private flushPendingSnapshot(): void {
    if (this.snapshotTimer !== null) {
      window.clearTimeout(this.snapshotTimer);
      this.snapshotTimer = null;
    }
    this.history.push(this.captureSnapshot());
  }

  private undo(): void {
    this.flushPendingSnapshot();
    const target = this.history.undo(this.captureSnapshot());
    if (!target) return;
    this.applySnapshot(target);
  }

  private redo(): void {
    const target = this.history.redo(this.captureSnapshot());
    if (!target) return;
    this.applySnapshot(target);
  }

  private applySnapshot(snap: HistorySnapshot): void {
    this.suppressSync = true;
    this.model.fromMarkdown(snap.markdown);
    this.suppressSync = false;
    this.activeBlockId = snap.activeBlockId;
    this.render();
    if (snap.activeBlockId) {
      this.focusBlock(snap.activeBlockId, snap.caretOffset);
    }
    this.scheduleSync();
  }

  // ============ 结构性编辑 ============
  private enterAfter(blockId: string): void {
    // fenced 块编辑中 Enter → 提交并退出编辑模式
    const block = this.model.getBlock(blockId);
    if (block && (block.type === 'latex' || block.type === 'mermaid')) {
      this.exitEditing();
      return;
    }
    this.flushPendingSnapshot();
    const newBlock: Block = { id: '', type: 'paragraph', content: '' };
    this.model.insertBlock(blockId, newBlock);
    this.cb.log?.('[Editor.enterAfter] insertedAfter', {
      after: blockId,
      newId: newBlock.id,
      blocks: this.model.getAllBlocks().map((b) => ({ id: b.id, type: b.type, content: b.content })),
    });
    this.render();
    this.focusBlock(newBlock.id, 0);
    this.history.push(this.captureSnapshot());
    this.scheduleSync();
  }

  private softLineBreak(blockId: string): void {
    const el = this.contentEls.get(blockId);
    if (!el) return;
    const offset = getCaretOffset(el);
    const text = el.textContent || '';
    const next = text.slice(0, offset) + '\n' + text.slice(offset);
    el.textContent = next;
    setCaretOffset(el, offset + 1);
    this.silentUpdate(blockId, { content: next });
    this.scheduleSnapshot();
    this.scheduleSync();
  }

  /** Tab 键：在光标处插入 2 个空格（与 Markdown 缩进约定一致） */
  private insertTab(blockId: string): void {
    const el = this.contentEls.get(blockId);
    if (!el) return;
    const TAB = '  ';
    const offset = getCaretOffset(el);
    const text = el.textContent || '';
    const next = text.slice(0, offset) + TAB + text.slice(offset);
    el.textContent = next;
    setCaretOffset(el, offset + TAB.length);
    this.silentUpdate(blockId, { content: next });
    this.scheduleSnapshot();
    this.scheduleSync();
  }

  /**
   * Shift+Tab 反向缩进：删除当前光标所在行行首的 1~2 个空格或 1 个 Tab。
   * 设计与主流编辑器一致：不要求选区，始终作用于“光标所在软行”。
   */
  private outdent(blockId: string): void {
    const el = this.contentEls.get(blockId);
    if (!el) return;
    const TAB_WIDTH = 2;
    const offset = getCaretOffset(el);
    const text = el.textContent || '';

    // 定位当前软行的起始偏移（上一个 \n 之后）
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;

    // 计算要删几个空白字符：优先吃掉 1 个 Tab，其次最多 TAB_WIDTH 个空格
    let removeLen = 0;
    if (text[lineStart] === '\t') {
      removeLen = 1;
    } else {
      while (
        removeLen < TAB_WIDTH &&
        text[lineStart + removeLen] === ' '
      ) {
        removeLen++;
      }
    }
    if (removeLen === 0) return;

    const next = text.slice(0, lineStart) + text.slice(lineStart + removeLen);
    el.textContent = next;
    // 保持光标相对位置：如果光标原本在被删区间中，裁到行首
    const newOffset =
      offset <= lineStart + removeLen
        ? Math.max(lineStart, offset - (offset - lineStart))
        : offset - removeLen;
    setCaretOffset(el, newOffset);
    this.silentUpdate(blockId, { content: next });
    this.scheduleSnapshot();
    this.scheduleSync();
  }

  private backspaceAtStart(blockId: string): void {
    const blocks = this.model.getAllBlocks();
    const idx = blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) return;

    const current = blocks[idx];
    this.flushPendingSnapshot();

    // 第一个块：什么也不做（避免误删）
    if (idx === 0) {
      // 若内容为空且不是唯一块，可考虑删除；这里保守处理
      return;
    }

    const prev = blocks[idx - 1];
    const prevLen = prev.content.length;

    // 合并：把当前内容拼到上一块尾部，再删除当前块
    this.silentUpdate(prev.id, { content: prev.content + current.content });
    this.model.deleteBlock(blockId);

    this.activeBlockId = prev.id;
    this.render();
    this.focusBlock(prev.id, prevLen);
    this.history.push(this.captureSnapshot());
    this.scheduleSync();
  }

  // ============ 插入菜单 ============
  private openInsertMenu(blockId: string, anchor: HTMLElement): void {
    this.closePopup();
    this.openPopup = renderInsertMenu(anchor, DEFAULT_INSERT_MENU, (item) => {
      this.insertBlockAfter(blockId, item);
      this.closePopup();
    });
  }

  private closePopup(): void {
    if (this.openPopup) {
      this.openPopup.remove();
      this.openPopup = null;
    }
  }

  private insertBlockAfter(blockId: string, item: InsertMenuItem): void {
    // LaTeX / Mermaid：先弹出输入对话框，让用户粘贴源码
    if (item.type === 'latex' || item.type === 'mermaid') {
      const title = item.type === 'latex' ? '插入 LaTeX 公式' : '插入 Mermaid 图';
      const placeholder =
        item.type === 'latex'
          ? '在此输入或粘贴 LaTeX 源码，例如：E = mc^2'
          : '在此输入或粘贴 Mermaid 源码，例如：graph LR\\n  A --> B';
      openPromptDialog({
        title,
        placeholder,
        initial: item.initial ?? '',
      }).then((value) => {
        if (value === null) return; // 用户取消
        this.commitInsert(blockId, { ...item, initial: value });
      });
      return;
    }
    this.commitInsert(blockId, item);
  }

  /** 真正执行块的插入或替换（当前块为空时直接转换类型） */
  private commitInsert(blockId: string, item: InsertMenuItem): void {
    this.flushPendingSnapshot();
    const isFenced = item.type === 'latex' || item.type === 'mermaid';

    const current = this.model.getBlock(blockId);
    if (current && current.content.length === 0) {
      this.silentUpdate(blockId, {
        type: item.type,
        content: item.initial ?? '',
      });
      this.render();
      // fenced 块直接显示预览，无需进入编辑
      if (isFenced) this.setActive(blockId);
      else this.focusBlock(blockId);
      this.history.push(this.captureSnapshot());
      this.scheduleSync();
      return;
    }

    const newBlock: Block = {
      id: '',
      type: item.type,
      content: item.initial ?? '',
    };
    this.model.insertBlock(blockId, newBlock);
    this.render();
    if (isFenced) this.setActive(newBlock.id);
    else this.focusBlock(newBlock.id);
    this.history.push(this.captureSnapshot());
    this.scheduleSync();
  }

  // ============ 预览（mermaid 等） ============
  private refreshAllPreviews(): void {
    this.previewEls.forEach((_el, id) => this.refreshPreview(id));
  }

  private refreshPreview(blockId: string): void {
    const previewEl = this.previewEls.get(blockId);
    const block = this.model.getBlock(blockId);
    if (!previewEl || !block) return;

    if (block.type === 'latex') {
      // KaTeX 是同步渲染，直接写入
      const res = renderLatexBlock(block.content);
      previewEl.classList.toggle('is-error', !res.ok);
      previewEl.innerHTML = res.html;
      return;
    }

    if (block.type !== 'mermaid') return;

    const source = block.content;
    if (this.mermaidRendered.get(blockId) === source && previewEl.innerHTML) {
      return; // 内容未变 & 已渲染过
    }

    previewEl.classList.remove('is-error');
    previewEl.textContent = '渲染中…';

    renderMermaid(source).then((res) => {
      // 异步回来时块可能已被删除/改类型
      const cur = this.model.getBlock(blockId);
      if (!cur || cur.type !== 'mermaid' || cur.content !== source) return;
      if (res.ok) {
        previewEl.innerHTML = res.svg;
        this.mermaidRendered.set(blockId, source);
      } else {
        previewEl.classList.add('is-error');
        previewEl.textContent = `Mermaid 渲染失败：${res.message}`;
      }
    });
  }
}
