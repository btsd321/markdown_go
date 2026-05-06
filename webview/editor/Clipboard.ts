/**
 * 粘贴 / 剪切 处理
 *
 * - 粘贴：阻止默认富文本行为，只插入纯文本（避免把 Word/网页样式带入）
 * - 剪切：让浏览器执行默认操作，随后通知调用方同步内容
 */

export interface ClipboardCallbacks {
  onContentChanged: () => void;
}

export function attachClipboard(el: HTMLElement, cb: ClipboardCallbacks): void {
  el.addEventListener('paste', (e: ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (!text) return;
    insertTextAtCaret(text);
    cb.onContentChanged();
  });

  el.addEventListener('cut', () => {
    // 浏览器默认会清空选中文本。下一帧再读 textContent
    queueMicrotask(() => cb.onContentChanged());
  });
}

function insertTextAtCaret(text: string): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  // 光标移到插入文本之后
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}
