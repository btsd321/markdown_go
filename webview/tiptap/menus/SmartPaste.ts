/**
 * SmartPaste —— Ctrl+V 智能粘贴
 *
 * 目的：当剪贴板内容包含本工程支持的特殊块（latex / mermaid）时，
 *      解析为对应的 atom 节点而不是被 ProseMirror 当作纯文本插入。
 *
 * 触发条件（任一）：
 *   - 文本含 `$$ ... $$` 块（行首/独立）
 *   - 文本含 ```mermaid 围栏
 *
 * 满足条件时：用 markdown parser 解析整段文本，从结果中提取顶层节点，
 *           作为 fragment 插入到当前选区。否则放行默认粘贴行为。
 */
import type { Editor } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { MarkdownParser } from 'prosemirror-markdown';

export interface SmartPasteController {
  extension: Extension;
  bind(editor: Editor): void;
}

export interface SmartPasteOptions {
  /** 延迟取 markdown parser（schema 准备好之后） */
  getParser: () => MarkdownParser;
}

const RE_LATEX_BLOCK = /(^|\n)\s*\$\$[\s\S]*?\$\$\s*(\n|$)/;
const RE_MERMAID_FENCE = /(^|\n)\s*```mermaid\b[\s\S]*?```/i;

export function createSmartPaste(opts: SmartPasteOptions): SmartPasteController {
  let editorRef: Editor | null = null;

  function shouldIntercept(text: string): boolean {
    if (!text) return false;
    return RE_LATEX_BLOCK.test(text) || RE_MERMAID_FENCE.test(text);
  }

  const plugin = new Plugin({
    key: new PluginKey('mg-smart-paste'),
    props: {
      handlePaste(_view, event) {
        if (!editorRef) return false;
        const cd = (event as ClipboardEvent).clipboardData;
        if (!cd) return false;
        const text = cd.getData('text/plain');
        if (!shouldIntercept(text)) return false;

        let doc;
        try {
          doc = opts.getParser().parse(text);
        } catch {
          return false;
        }
        if (!doc || doc.content.size === 0) return false;

        // 交给 Tiptap insertContent 处理：在空 textblock 处会替换当前块，
        // 避免 replaceSelection 把 heading/段落划分成两个空块
        editorRef
          .chain()
          .focus()
          .insertContent(doc.toJSON().content, {
            parseOptions: { preserveWhitespace: 'full' },
          })
          .run();
        return true;
      },
    },
  });

  const extension = Extension.create({
    name: 'mgSmartPaste',
    addProseMirrorPlugins() {
      return [plugin];
    },
  });

  return {
    extension,
    bind(editor: Editor) {
      editorRef = editor;
    },
  };
}
