/**
 * Mermaid 块节点（Tiptap 自定义 Node）
 *
 * - atom 节点：内容存于 attrs.src，文档内不可编辑（双击弹 PromptDialog 修改）
 * - 渲染：mermaid 懒加载 + 异步渲染
 */
import { Node, mergeAttributes } from '@tiptap/core';
import { renderMermaid } from '../../render/MermaidRenderer';
import { openPromptDialog } from '../../ui/PromptDialog';

export interface MermaidBlockOptions {
  HTMLAttributes: Record<string, any>;
}

export const MermaidBlock = Node.create<MermaidBlockOptions>({
  name: 'mermaidBlock',
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
    return [{ tag: 'div[data-mermaid-block]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes({ 'data-mermaid-block': 'true' }, HTMLAttributes),
      0,
    ];
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div');
      dom.className = 'mg-fenced mg-mermaid';
      dom.setAttribute('data-mermaid-block', 'true');
      dom.contentEditable = 'false';
      dom.title = '双击编辑流程图';

      let lastSrc = '';
      const renderInto = (src: string) => {
        const trimmed = (src || '').trim();
        if (trimmed === lastSrc) return;
        lastSrc = trimmed;
        if (!trimmed) {
          dom.classList.add('is-error');
          dom.textContent = '(空 mermaid 块)';
          return;
        }
        dom.classList.remove('is-error');
        dom.textContent = '渲染中…';
        renderMermaid(trimmed).then((res) => {
          if (lastSrc !== trimmed) return; // 已被覆盖
          if (res.ok) {
            dom.classList.remove('is-error');
            dom.innerHTML = res.svg;
          } else {
            dom.classList.add('is-error');
            dom.textContent = `Mermaid 渲染失败：${res.message}`;
          }
        });
      };
      renderInto(node.attrs.src || '');

      dom.addEventListener('dblclick', async (e) => {
        e.preventDefault();
        const next = await openPromptDialog({
          title: '编辑 Mermaid 流程图',
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
          if (updated.type.name !== 'mermaidBlock') return false;
          renderInto(updated.attrs.src || '');
          return true;
        },
      };
    };
  },
});
