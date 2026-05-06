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
import { LatexBlock } from './nodes/LatexBlock';
import { MermaidBlock } from './nodes/MermaidBlock';
import { buildMarkdownParser } from './markdown/parser';
import { buildMarkdownSerializer } from './markdown/serializer';

export interface TiptapEditorCallbacks {
  /** 文档变化（已序列化为 markdown） */
  onSync(markdown: string): void;
  /** 日志通道 */
  log?(message: string, data?: any): void;
}

const SYNC_DEBOUNCE_MS = 80;

export class TiptapEditor {
  readonly editor: TiptapCore;
  private parser: ReturnType<typeof buildMarkdownParser>;
  private serializer: ReturnType<typeof buildMarkdownSerializer>;

  /** 上次主动写出的 markdown，用于回灌时识别 echo */
  private lastSentMarkdown: string | null = null;
  private syncTimer: number | null = null;
  /** 由 setMarkdown 触发的内部更新，不应再回写宿主 */
  private suppressSync = false;

  constructor(host: HTMLElement, private cb: TiptapEditorCallbacks) {
    this.editor = new TiptapCore({
      element: host,
      extensions: [
        StarterKit.configure({
          // 我们用自己的语法路由：禁用 markdown shortcut 中的 codeBlock 与 heading 默认即可
          // StarterKit 默认包含 history，刚好覆盖撤销重做
        }),
        LatexBlock,
        MermaidBlock,
      ],
      content: '',
      autofocus: false,
      editable: true,
      onUpdate: () => this.scheduleSync(),
    });
    this.parser = buildMarkdownParser(this.editor.schema);
    this.serializer = buildMarkdownSerializer(this.editor.schema);
  }

  /** 用初始 markdown 启动 */
  bootstrap(markdown: string): void {
    this.setMarkdown(markdown);
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
      return this.serializer.serialize(this.editor.state.doc);
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
    this.editor.destroy();
  }

  // -------- internal --------

  private scheduleSync(): void {
    if (this.suppressSync) return;
    if (this.syncTimer !== null) return;
    this.syncTimer = window.setTimeout(() => {
      this.syncTimer = null;
      const md = this.getMarkdown();
      if (md === this.lastSentMarkdown) return;
      this.lastSentMarkdown = md;
      this.cb.onSync(md);
    }, SYNC_DEBOUNCE_MS);
  }
}
