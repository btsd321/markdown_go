/**
 * Tiptap 编辑器封装
 *
 * 职责：
 *   - 初始化 Editor + StarterKit + LatexBlock + MermaidBlock
 *   - Markdown ↔ Document 双向（基于 prosemirror-markdown）
 *   - 80ms 防抖回写；echo 抑制
 */
import { Editor as TiptapCore } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import TextAlign from '@tiptap/extension-text-align';
import { LatexBlock } from './nodes/LatexBlock';
import { MermaidBlock } from './nodes/MermaidBlock';
import { ImageWithBase } from './nodes/ImageWithBase';
import { VideoBlock } from './nodes/VideoBlock';
import { MgTable, MgTableRow, MgTableHeader, MgTableCell } from './nodes/Table';
import { AlignBackspace } from './extensions/AlignBackspace';
import { EscapeInlineCode } from './extensions/EscapeInlineCode';
import { buildMarkdownParser } from './markdown/parser';
import { buildMarkdownSerializer } from './markdown/serializer';
import { createBubbleMenu, BubbleMenuFactory } from './menus/BubbleMenu';
import { createSlashMenu, SlashMenuController } from './menus/SlashMenu';
import { createBlockHandle, BlockHandleController } from './menus/BlockHandle';
import { createContextMenu, ContextMenuController } from './menus/ContextMenu';
import { createClipboardCopy, ClipboardCopyController } from './menus/ClipboardCopy';
import { createSmartPaste, SmartPasteController } from './menus/SmartPaste';
import { createTableToolbar, TableToolbarController } from './menus/TableToolbar';
import type { CopyFormat } from '../../shared';

export interface TiptapEditorCallbacks {
  /** 文档变化（已序列化为 markdown） */
  onSync(markdown: string): void;
  /** 日志通道 */
  log?(message: string, data?: any): void;
}

export interface TiptapEditorOptions {
  /** Slash 菜单触发字符，默认 "/" */
  slashTrigger?: string;
  /** 默认复制格式，默认 'markdown' */
  defaultCopyFormat?: CopyFormat;
}

const SYNC_DEBOUNCE_MS = 80;

export class TiptapEditor {
  readonly editor: TiptapCore;
  private parser: ReturnType<typeof buildMarkdownParser>;
  private serializer: ReturnType<typeof buildMarkdownSerializer>;
  private bubbleMenu: BubbleMenuFactory;
  private slashMenu: SlashMenuController;
  private blockHandle: BlockHandleController;
  private contextMenu: ContextMenuController;
  private clipboardCopy: ClipboardCopyController;
  private smartPaste: SmartPasteController;
  private tableToolbar: TableToolbarController;

  /** 上次主动写出的 markdown，用于回灌时识别 echo */
  private lastSentMarkdown: string | null = null;
  private syncTimer: number | null = null;
  /** 由 setMarkdown 触发的内部更新，不应再回写宿主 */
  private suppressSync = false;
  /** bootstrap 完成前任何 onUpdate 都不可回写宿主，否则会把空 doc 当真实内容发出去覆盖文件 */
  private bootstrapped = false;

  constructor(
    host: HTMLElement,
    private cb: TiptapEditorCallbacks,
    options: TiptapEditorOptions = {},
  ) {
    this.bubbleMenu = createBubbleMenu();
    this.slashMenu = createSlashMenu({ trigger: options.slashTrigger || '/' });
    this.blockHandle = createBlockHandle();
    this.contextMenu = createContextMenu({
      getSerializer: () => this.serializer,
    });
    this.clipboardCopy = createClipboardCopy({
      initialFormat: options.defaultCopyFormat || 'markdown',
      getSerializer: () => this.serializer,
    });
    this.smartPaste = createSmartPaste({ getParser: () => this.parser });
    this.tableToolbar = createTableToolbar();

    this.editor = new TiptapCore({
      element: host,
      extensions: [
        StarterKit.configure({
          // StarterKit 默认包含 history，覆盖撤销重做
        }),
        Link.configure({ openOnClick: false, autolink: false }),
        TextStyle,
        Color,
        TextAlign.configure({
          types: ['paragraph', 'heading'],
          alignments: ['left', 'center', 'right'],
          // ⚠️ 不设 defaultAlignment，否则每个段落都会渲染 style="text-align:left"
          // 会覆盖表格 td/th 的列对齐。null 让未设置段落不带 inline style。
          defaultAlignment: null as any,
        }),
        AlignBackspace,
        EscapeInlineCode,
        LatexBlock,
        MermaidBlock,
        ImageWithBase,
        VideoBlock,
        MgTable,
        MgTableRow,
        MgTableHeader,
        MgTableCell,
        this.bubbleMenu.extension,
        this.slashMenu.extension,
        this.blockHandle.extension,
        this.contextMenu.extension,
        this.clipboardCopy.extension,
        this.smartPaste.extension,
        this.tableToolbar.extension,
      ],
      content: '',
      autofocus: false,
      editable: true,
      onUpdate: () => this.scheduleSync(),
    });
    this.parser = buildMarkdownParser(this.editor.schema);
    this.serializer = buildMarkdownSerializer(this.editor.schema);
    this.bubbleMenu.bind(this.editor);
    this.slashMenu.bind(this.editor);
    this.blockHandle.bind(this.editor);
    this.contextMenu.bind(this.editor);
    this.clipboardCopy.bind(this.editor);
    this.smartPaste.bind(this.editor);
    this.tableToolbar.bind(this.editor);
  }

  /** 用初始 markdown 启动 */
  bootstrap(markdown: string): void {
    this.setMarkdown(markdown);
    // 把 lastSentMarkdown 锁定为「往返后的稳态字符串」。
    // 这样初始化后即便某个插件触发一次 transaction → onUpdate → scheduleSync，
    // 序列化结果会与 lastSentMarkdown 相同 → 跳过回写，
    // 避免「打开文件就被标 dirty / 被规范化覆盖」。
    const out = this.getMarkdown();
    const normalized = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // ⚠️ 若 serialize 出错（out=''），绝不能用 '' 锁住 lastSentMarkdown，
    // 否则 onUpdate 比较时 '' === '' 跳过永远不再回写 + bootstrap 前已发的空内容也无法纠正。
    // 退化为锁住输入 markdown，至少避免后续把错误的空字符串当成「最新已发」状态。
    this.lastSentMarkdown = out.length > 0 ? out : normalized;
    if (out !== normalized) {
      this.cb.log?.('[TiptapEditor.bootstrap] roundtrip MISMATCH (lock to roundtrip output, no write-back)', {
        inLen: normalized.length,
        outLen: out.length,
        diff: diffPreview(normalized, out),
      });
    } else {
      this.cb.log?.('[TiptapEditor.bootstrap] roundtrip OK', { len: out.length });
    }
    // 解锁回写。任何在 bootstrap 之前排队的 setTimeout 在此之后才允许触发真正的 onSync。
    this.bootstrapped = true;
  }

  /** 外部强制设置内容（如外部修改了文件） */
  setMarkdown(markdown: string): void {
    const normalized = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (this.lastSentMarkdown !== null && normalized === this.lastSentMarkdown) {
      this.cb.log?.('[TiptapEditor.setMarkdown] echo skipped', { len: normalized.length });
      return;
    }
    let doc;
    try {
      doc = this.parser.parse(normalized);
    } catch (err: any) {
      this.cb.log?.('[TiptapEditor.setMarkdown] parse error', { msg: err?.message });
      return;
    }
    if (!doc) return;
    this.suppressSync = true;
    // commands.setContent 接受 ProseMirror Node、HTML 或 JSON；我们直接传 JSON 兜底
    this.editor.commands.setContent(doc.toJSON(), false);
    this.suppressSync = false;
    this.lastSentMarkdown = normalized;
  }

  /** 当前文档序列化为 markdown */
  getMarkdown(): string {
    try {
      const out = this.serializer.serialize(this.editor.state.doc);
      // POSIX 文件约定 + 与磁盘对齐：保证末尾恰好一个 \n。
      // 否则 parse↔serialize 不幂等，VS Code 会一直显示 dirty。
      return out.endsWith('\n') ? out : out + '\n';
    } catch (err: any) {
      this.cb.log?.('[TiptapEditor.getMarkdown] serialize error', { msg: err?.message });
      return '';
    }
  }

  destroy(): void {
    if (this.syncTimer !== null) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    this.bubbleMenu.destroy();
    this.slashMenu.destroy();
    this.blockHandle.destroy();
    this.contextMenu.destroy();
    this.tableToolbar.destroy();
    this.editor.destroy();
  }

  /** 动态修改 slash 触发字符（来自配置） */
  setSlashTrigger(trigger: string): void {
    this.slashMenu.setTrigger(trigger);
  }

  /** 动态修改默认复制格式 */
  setCopyFormat(format: CopyFormat): void {
    this.clipboardCopy.setFormat(format);
  }

  // -------- internal --------

  private scheduleSync(): void {
    if (this.suppressSync) {
      this.cb.log?.('[TiptapEditor.scheduleSync] suppressed (internal setContent)');
      return;
    }
    if (this.syncTimer !== null) return;
    this.syncTimer = window.setTimeout(() => {
      this.syncTimer = null;
      // 守卫：bootstrap 前一切 onUpdate 都不允许回写宿主——否则空 doc 会覆盖文件。
      if (!this.bootstrapped) {
        this.cb.log?.('[TiptapEditor.scheduleSync] dropped (pre-bootstrap)');
        return;
      }
      const md = this.getMarkdown();
      // === DEBUG ===
      this.cb.log?.('[TiptapEditor.onUpdate->serialize]', {
        len: md.length,
        prevLen: this.lastSentMarkdown?.length,
        equalToPrev: md === this.lastSentMarkdown,
        diff: this.lastSentMarkdown !== null ? diffPreview(this.lastSentMarkdown, md) : null,
      });
      if (md === this.lastSentMarkdown) return;
      this.lastSentMarkdown = md;
      this.cb.onSync(md);
    }, SYNC_DEBOUNCE_MS);
  }
}

/** 调试：返回首处差异附近的字符上下文 */
function diffPreview(a: string, b: string): { at: number; aCtx: string; bCtx: string } | null {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  if (i === max && a.length === b.length) return null;
  const start = Math.max(0, i - 12);
  return {
    at: i,
    aCtx: JSON.stringify(a.slice(start, i + 16)),
    bCtx: JSON.stringify(b.slice(start, i + 16)),
  };
}
