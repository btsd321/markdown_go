/**
 * 纯文本模式
 *
 * 直接显示 / 编辑 markdown 源码（textarea），不做块解析。
 */

export interface PlainViewCallbacks {
  onChange(markdown: string): void;
  log?(message: string, data?: any): void;
}

export class PlainView {
  private root: HTMLElement;
  private textarea: HTMLTextAreaElement;
  private suppress = false;
  private syncTimer: number | null = null;

  constructor(host: HTMLElement, private cb: PlainViewCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'plain-view';

    this.textarea = document.createElement('textarea');
    this.textarea.className = 'plain-textarea';
    this.textarea.spellcheck = false;
    this.textarea.addEventListener('input', () => {
      if (this.suppress) return;
      this.cb.log?.('[PlainView.input]', {
        len: this.textarea.value.length,
        caret: this.textarea.selectionStart,
        tail: JSON.stringify(this.textarea.value.slice(-40)),
      });
      if (this.syncTimer !== null) return;
      this.syncTimer = window.setTimeout(() => {
        this.syncTimer = null;
        this.cb.onChange(this.textarea.value);
      }, 80);
    });
    this.root.appendChild(this.textarea);
    host.appendChild(this.root);
  }

  setMarkdown(text: string): void {
    // 归一化 CRLF 后再比较：宿主回灌的内容会含 \r\n，
    // 直接 === 比较会误判不相等并重写 value，导致光标跳到末尾
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const same = this.textarea.value === normalized;
    this.cb.log?.('[PlainView.setMarkdown]', {
      same,
      incomingLen: text.length,
      normalizedLen: normalized.length,
      currentLen: this.textarea.value.length,
      currentTail: JSON.stringify(this.textarea.value.slice(-40)),
      normalizedTail: JSON.stringify(normalized.slice(-40)),
    });
    if (same) return;
    // 保留光标位置，避免外部回灌时光标跳到末尾
    const selStart = this.textarea.selectionStart;
    const selEnd = this.textarea.selectionEnd;
    const hadFocus = document.activeElement === this.textarea;
    this.suppress = true;
    this.textarea.value = normalized;
    this.suppress = false;
    if (hadFocus) {
      const max = normalized.length;
      this.textarea.selectionStart = Math.min(selStart, max);
      this.textarea.selectionEnd = Math.min(selEnd, max);
    }
  }

  getMarkdown(): string {
    return this.textarea.value;
  }

  show(): void {
    this.root.style.display = '';
    this.textarea.focus();
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  destroy(): void {
    if (this.syncTimer !== null) {
      window.clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    this.root.remove();
  }
}
