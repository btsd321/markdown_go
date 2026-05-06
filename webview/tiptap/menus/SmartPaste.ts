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
import { Slice, Fragment } from '@tiptap/pm/model';

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
  function shouldIntercept(text: string): boolean {
    if (!text) return false;
    return RE_LATEX_BLOCK.test(text) || RE_MERMAID_FENCE.test(text);
  }

  const plugin = new Plugin({
    key: new PluginKey('mg-smart-paste'),
    props: {
      handlePaste(view, event) {
        const cd = (event as ClipboardEvent).clipboardData;
        if (!cd) return false;
        // 若剪贴板有 HTML（来自富文本），ProseMirror 默认行为更合理，让它走默认
        const text = cd.getData('text/plain');
        if (!shouldIntercept(text)) return false;

        let doc;
        try {
          doc = opts.getParser().parse(text);
        } catch {
          return false;
        }
        if (!doc) return false;

        // 提取顶层子节点作为 Fragment
        const frag = Fragment.from(doc.content);
        if (frag.size === 0) return false;

        // openStart/openEnd = 0：插入完整块
        const slice = new Slice(frag, 0, 0);
        const tr = view.state.tr.replaceSelection(slice).scrollIntoView();
        view.dispatch(tr);
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
    bind(_editor: Editor) {
      /* no-op */
    },
  };
}
