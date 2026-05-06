/**
 * 自定义 Image 扩展：在 renderHTML 时把相对路径的 src 替换成 webview 可加载的 URI。
 * 序列化到 markdown 时仍写原始相对路径（attrs.src 保持不变）。
 *
 * 额外：图片是 inline atom（selectable/draggable），点击图片末尾时 ProseMirror 常把
 * 选区置为 NodeSelection→图片，按 Enter 默认不会拆分段落，导致用户感到“无法换行”。
 * 在此扩展加入 Enter keymap：当当前选中的就是 image 节点时，把光标移到图片之后并
 * 插入新段落。
 */
import Image from '@tiptap/extension-image';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { resolveImageSrc } from '../../runtime/imageBase';
import { bridge } from '../../core/bridge';

const loggedSrc = new Set<string>();

export const ImageWithBase = Image.extend({
  name: 'image',
  inline: true,
  group: 'inline',
  draggable: true,
  renderHTML({ HTMLAttributes }) {
    const src = (HTMLAttributes as { src?: string }).src ?? '';
    const display = resolveImageSrc(src);
    if (src && !loggedSrc.has(src)) {
      loggedSrc.add(src);
      bridge.log('info', '[ImageWithBase] resolveImageSrc', { src, display });
    }
    return ['img', { ...HTMLAttributes, src: display }];
  },
  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { state, dispatch } = this.editor.view;
        const sel = state.selection;
        // 1) 直接选中了 image 节点
        if (sel instanceof NodeSelection && sel.node.type.name === 'image') {
          const after = sel.$from.after();
          const tr = state.tr.insert(
            after,
            state.schema.nodes.paragraph.create(),
          );
          tr.setSelection(TextSelection.create(tr.doc, after + 1));
          tr.scrollIntoView();
          dispatch(tr);
          return true;
        }
        // 2) 文本光标位于 image 紧邻其后的位置（段落末尾），让默认行为接管
        return false;
      },
    };
  },
});
