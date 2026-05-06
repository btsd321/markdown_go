/**
 * ClipboardCopy —— 覆盖 Ctrl+C / Ctrl+X 复制行为
 *
 * 当 format = 'markdown' 时：
 *   - 写入 text/plain 为 markdown 源码
 *   - 清空 text/html，避免目标侧渲染为富文本
 * 当 format = 'plain' 时：使用 ProseMirror 默认行为。
 */
import type { Editor } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { MarkdownSerializer } from 'prosemirror-markdown';
import type { CopyFormat } from '../../../shared';
import { serializeRange } from '../utils/serializeRange';

export interface ClipboardCopyController {
  extension: Extension;
  bind(editor: Editor): void;
  setFormat(format: CopyFormat): void;
}

export interface ClipboardCopyOptions {
  initialFormat: CopyFormat;
  getSerializer: () => MarkdownSerializer;
}

export function createClipboardCopy(opts: ClipboardCopyOptions): ClipboardCopyController {
  let format: CopyFormat = opts.initialFormat;

  function writeMarkdown(view: { state: any }, ev: ClipboardEvent): boolean {
    const { from, to, empty } = view.state.selection;
    if (empty) return false;
    let md = serializeRange(view.state, from, to, opts.getSerializer());
    if (md.endsWith('\n')) md = md.slice(0, -1);
    if (!ev.clipboardData) return false;
    ev.clipboardData.setData('text/plain', md);
    ev.clipboardData.setData('text/html', '');
    ev.preventDefault();
    return true;
  }

  const plugin = new Plugin({
    key: new PluginKey('mg-clipboard-copy'),
    props: {
      handleDOMEvents: {
        copy(view, ev) {
          if (format !== 'markdown') return false;
          return writeMarkdown(view, ev as ClipboardEvent);
        },
        cut(view, ev) {
          if (format !== 'markdown') return false;
          const handled = writeMarkdown(view, ev as ClipboardEvent);
          if (!handled) return false;
          // 复制成功后删除选区（cut 语义）
          const { from, to } = view.state.selection;
          view.dispatch(view.state.tr.delete(from, to));
          return true;
        },
      },
    },
  });

  const extension = Extension.create({
    name: 'mgClipboardCopy',
    addProseMirrorPlugins() {
      return [plugin];
    },
  });

  return {
    extension,
    bind(_editor: Editor) {
      /* no-op */
    },
    setFormat(f: CopyFormat) {
      format = f;
    },
  };
}
