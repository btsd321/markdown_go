/**
 * 选区与光标工具
 *
 * 围绕 contenteditable 的 Range/Selection API 做轻量封装，
 * 只关心"块内文本偏移量"。
 */

/** 获取当前光标在指定元素内的字符偏移（从 0 开始） */
export function getCaretOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return 0;

  const pre = range.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

/** 把光标设置到元素内的指定字符偏移 */
export function setCaretOffset(el: HTMLElement, offset: number): void {
  el.focus();
  const sel = window.getSelection();
  if (!sel) return;

  const range = document.createRange();
  let remain = offset;
  let placed = false;

  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.nodeValue || '').length;
      if (remain <= len) {
        range.setStart(node, remain);
        range.collapse(true);
        placed = true;
        return true;
      }
      remain -= len;
    } else {
      for (const child of Array.from(node.childNodes)) {
        if (walk(child)) return true;
      }
    }
    return false;
  };

  walk(el);
  if (!placed) {
    range.selectNodeContents(el);
    range.collapse(false); // 末尾
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

/** 把光标移到末尾 */
export function setCaretToEnd(el: HTMLElement): void {
  setCaretOffset(el, (el.textContent || '').length);
}

/** 判断光标是否在元素的最开头 */
export function isCaretAtStart(el: HTMLElement): boolean {
  return getCaretOffset(el) === 0;
}
