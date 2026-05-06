/**
 * AlignBackspace —— 让 Backspace 在 “非左对齐 + 段首” 时先重置对齐为 left。
 *
 * 用户场景：图片居中后 Enter 换行，光标落在新段首；用户希望按 Backspace 把
 * 当前段恢复成左对齐（而不是把光标合并到上一段、丢失刚换行的结果）。
 *
 * 行为：
 *   - 仅在当前选区为空（光标）且位于段落/标题的最前部 时触发；
 *   - 仅在当前块的 textAlign 不为 'left' 时触发；
 *   - 触发后调用 setTextAlign('left') 并消费按键，不再向下传递。
 *   - 其他情况让默认 Backspace 处理（合并段、删字符）。
 */
import { Extension } from '@tiptap/core';

export const AlignBackspace = Extension.create({
  name: 'mgAlignBackspace',
  // 高优先级，确保在 StarterKit 默认 Backspace（合并段落/删除）之前执行
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Backspace: () => {
        const { state } = this.editor;
        const sel = state.selection;
        if (!sel.empty) return false;
        const $from = sel.$from;
        // 仅当光标位于父块的开头（parentOffset === 0）
        if ($from.parentOffset !== 0) return false;
        const parent = $from.parent;
        const align = parent.attrs?.textAlign;
        if (!align || align === 'left') return false;
        // 仅作用于支持 textAlign 的节点
        if (parent.type.name !== 'paragraph' && parent.type.name !== 'heading') {
          return false;
        }
        return this.editor.chain().focus().setTextAlign('left').run();
      },
    };
  },
});
