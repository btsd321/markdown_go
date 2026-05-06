/**
 * LaTeX 块节点（Tiptap 自定义 Node）
 *
 * - atom 节点：内容存于 attrs.src，文档内不可编辑（双击弹 PromptDialog 修改）
 * - 渲染：KaTeX renderToString，displayMode
 */
import { Node, mergeAttributes } from '@tiptap/core';
import { renderLatexBlock } from '../../render/LatexRenderer';
import { openPromptDialog } from '../../ui/PromptDialog';

export interface LatexBlockOptions {
  HTMLAttributes: Record<string, any>;
}

export const LatexBlock = Node.create<LatexBlockOptions>({
  name: 'latexBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      src: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-latex-block]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes({ 'data-latex-block': 'true' }, HTMLAttributes),
      0,
    ];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div');
      dom.className = 'mg-fenced mg-latex';
      dom.setAttribute('data-latex-block', 'true');
      dom.contentEditable = 'false';
      dom.title = '双击编辑公式';

      const renderInto = (src: string) => {
        const r = renderLatexBlock(src);
        dom.classList.toggle('is-error', !r.ok);
        dom.innerHTML = r.html;
      };
      renderInto(node.attrs.src || '');

      dom.addEventListener('dblclick', async (e) => {
        e.preventDefault();
        const next = await openPromptDialog({
          title: '编辑 LaTeX 公式',
          initial: node.attrs.src || '',
          confirmLabel: '保存',
        });
        if (next === null) return;
        const pos = typeof getPos === 'function' ? getPos() : null;
        if (pos == null) return;
        editor
          .chain()
          .focus()
          .command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, { src: next });
            return true;
          })
          .run();
      });

      return {
        dom,
        update(updated) {
          if (updated.type.name !== 'latexBlock') return false;
          renderInto(updated.attrs.src || '');
          return true;
        },
      };
    };
  },
});
