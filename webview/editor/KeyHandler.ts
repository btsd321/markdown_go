/**
 * 键盘事件分发
 *
 * 集中处理块编辑相关的快捷键：
 * - Enter           在当前块后插入新段落块，光标移过去
 * - Shift+Enter     块内插入软换行（\n）
 * - Backspace       光标在块开头且块为空时删除块；光标在块开头且非空则与上一块合并
 * - Ctrl/Cmd+Z      撤销
 * - Ctrl/Cmd+Y / Ctrl+Shift+Z  重做
 *
 * 拦截后调用注入的回调。具体的模型操作放在 Editor 内部。
 */

export interface KeyHandlerCallbacks {
  enterAfter(blockId: string): void;
  softLineBreak(blockId: string): void;
  backspaceAtStart(blockId: string): void;
  undo(): void;
  redo(): void;
}

export function attachKeyHandler(
  el: HTMLElement,
  blockId: string,
  isCaretAtStart: () => boolean,
  isContentEmpty: () => boolean,
  cb: KeyHandlerCallbacks
): void {
  el.addEventListener('keydown', (e: KeyboardEvent) => {
    const meta = e.ctrlKey || e.metaKey;

    // Undo / Redo
    if (meta && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      cb.undo();
      return;
    }
    if (meta && ((e.shiftKey && (e.key === 'z' || e.key === 'Z')) || e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      cb.redo();
      return;
    }

    // Enter
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // 软换行交给浏览器默认会插 <br>，我们改为在 textContent 里插 \n
        e.preventDefault();
        cb.softLineBreak(blockId);
        return;
      }
      e.preventDefault();
      cb.enterAfter(blockId);
      return;
    }

    // Backspace
    if (e.key === 'Backspace' && isCaretAtStart()) {
      // 块开头按删除：交给上层决定（合并或删除）
      e.preventDefault();
      cb.backspaceAtStart(blockId);
      return;
    }
  });
}
