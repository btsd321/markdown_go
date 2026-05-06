/**
 * 编辑器主控
 *
 * 职责：
 *  - 维护 DocumentModel 与 DOM 之间的双向映射
 *  - 协调键盘 / 剪贴板 / 历史 / 插入菜单等子模块
 *  - 通过 onSync 回调把 markdown 变化抛给宿主 (Extension)
 */
import { Block, BlockType } from '../../shared';
import { DocumentModel } from '../model/DocumentModel';
import { renderBlock } from '../ui/BlockView';
import {
  renderInsertMenu,
  DEFAULT_INSERT_MENU,
  InsertMenuItem,
} from '../ui/InsertMenu';
import {
  getCaretOffset,
  setCaretOffset,
  setCaretToEnd,
  isCaretAtStart,
} from './Selection';
import { History, HistorySnapshot } from './History';
import { attachKeyHandler } from './KeyHandler';
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
    this.activeBlockId = id;
    this.applyActiveClass();
    // 离开 mermaid 块 → 触发预览刷新
    if (prev && this.previewEls.has(prev)) {
      this.refreshPreview(prev);
    }
  }

  private applyActiveClass(): void {
    this.blockEls.forEach((el, id) => {
      el.classList.toggle('is-active', id === this.activeBlockId);
    });
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
        enterAfter: (blockId) => this.enterAfter(blockId),
        softLineBreak: (blockId) => this.softLineBreak(blockId),
        backspaceAtStart: (blockId) => this.backspaceAtStart(blockId),
        undo: () => this.undo(),
        redo: () => this.redo(),
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
    this.flushPendingSnapshot();

    const current = this.model.getBlock(blockId);
    // 当前块为空：直接转换类型，避免无谓地新增空行
    if (current && current.content.length === 0) {
      this.silentUpdate(blockId, {
        type: item.type,
        content: item.initial ?? '',
      });
      this.render();
      this.focusBlock(blockId);
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
    this.focusBlock(newBlock.id);
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
