import { Extension } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

export const EscapeInlineCode = Extension.create({
  name: 'mgEscapeInlineCode',
  // 高优先级，确保在默认箭头键行为之前执行
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      ArrowRight: () => {
        const { state, view } = this.editor;
        const sel = state.selection;
        if (!sel.empty) return false;
        const codeType = state.schema.marks.code;
        if (!codeType) return false;
        const $pos = sel.$from;
        const stored = state.storedMarks;
        const posMarks = $pos.marks();
        const marks = stored ?? posMarks;
        const inCodeStored = marks.some((m) => m.type === codeType);
        const after = $pos.nodeAfter;
        const before = $pos.nodeBefore;
        const afterIsCode = !!(after && after.marks.some((m) => m.type === codeType));
        const beforeIsCode = !!(before && before.marks.some((m) => m.type === codeType));
        const parentEnd = $pos.end($pos.depth);
        if (!inCodeStored && !beforeIsCode) return false;
        if (afterIsCode) return false;
        // 命中：清掉 storedMarks 里的 code
        const tr = state.tr;
        const baseMarks = stored ?? posMarks;
        const filtered = baseMarks.filter((m) => m.type !== codeType);
        tr.setStoredMarks(filtered);
        if (sel.from < parentEnd) {
          // 同一文本块内右移一位，让用户看到光标跨过 code 边界
          const $next = state.doc.resolve(sel.from + 1);
          tr.setSelection(TextSelection.create(tr.doc, $next.pos));
        } else {
          // 已经在文本块末尾（如表格单元格末尾）：插入一个不带 code mark 的空格作为落点，
          // 把光标移到空格之后；这样视觉上光标真的脱离 code 区域，且不会跨格 / 跨行。
          tr.insertText(' ', sel.from);
          tr.removeMark(sel.from, sel.from + 1, codeType);
          tr.setSelection(TextSelection.create(tr.doc, sel.from + 1));
          tr.setStoredMarks(filtered);
        }
        view.dispatch(tr);
        return true;
      },
      ArrowLeft: () => {
        const { state, view } = this.editor;
        const sel = state.selection;
        if (!sel.empty) return false;
        const codeType = state.schema.marks.code;
        if (!codeType) return false;
        const $pos = sel.$from;
        // 当前已带 code（在 code 内部 / 续写状态）→ 让默认行为
        const marks = state.storedMarks ?? $pos.marks();
        if (marks.some((m) => m.type === codeType)) return false;
        // 左侧必须是 code 字符
        const before = $pos.nodeBefore;
        if (!before || !before.marks.some((m) => m.type === codeType)) return false;
        const tr = state.tr;
        const codeMark = codeType.create();
        tr.setStoredMarks([...(state.storedMarks ?? []), codeMark]);
        // 同一文本块内左移一位，进入 code 内部；已在块首则只更新 storedMarks。
        const parentStart = $pos.start($pos.depth);
        if (sel.from > parentStart) {
          const $prev = state.doc.resolve(sel.from - 1);
          tr.setSelection(TextSelection.create(tr.doc, $prev.pos));
        }
        view.dispatch(tr);
        return true;
      },
    };
  },
});

