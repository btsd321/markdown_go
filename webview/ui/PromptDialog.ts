/**
 * 通用输入弹窗（用于粘贴 LaTeX/Mermaid 等多行源码）。
 *
 * 交互：
 *   - Enter         → 确认
 *   - Shift+Enter   → 在 textarea 内换行
 *   - Esc           → 取消
 *   - 点击遮罩区域  → 取消
 */
import { t } from '../i18n';
export interface PromptDialogOptions {
  title: string;
  placeholder?: string;
  initial?: string;
  /** 确认按钮文本，默认 "插入" */
  confirmLabel?: string;
  /** 取消按钮文本，默认 "取消" */
  cancelLabel?: string;
}

export function openPromptDialog(opts: PromptDialogOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';
    dialog.addEventListener('mousedown', (e) => e.stopPropagation());

    const titleEl = document.createElement('div');
    titleEl.className = 'modal-title';
    titleEl.textContent = opts.title;

    const hint = document.createElement('div');
    hint.className = 'modal-hint';
    hint.textContent = t('dialog.hint');

    const textarea = document.createElement('textarea');
    textarea.className = 'modal-textarea';
    textarea.rows = 6;
    if (opts.placeholder) textarea.placeholder = opts.placeholder;
    if (opts.initial) textarea.value = opts.initial;

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'modal-btn modal-btn-secondary';
    cancelBtn.textContent = opts.cancelLabel ?? t('dialog.cancel');

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'modal-btn modal-btn-primary';
    okBtn.textContent = opts.confirmLabel ?? t('dialog.confirm');

    actions.append(cancelBtn, okBtn);
    dialog.append(titleEl, hint, textarea, actions);
    overlay.append(dialog);
    document.body.appendChild(overlay);

    let settled = false;
    const cleanup = (value: string | null) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(value);
    };

    const confirm = () => cleanup(textarea.value);
    const cancel = () => cleanup(null);

    okBtn.addEventListener('click', confirm);
    cancelBtn.addEventListener('click', cancel);
    overlay.addEventListener('mousedown', cancel);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        confirm();
      }
    };
    document.addEventListener('keydown', onKey, true);

    // 自动聚焦并将光标置于末尾
    setTimeout(() => {
      textarea.focus();
      const len = textarea.value.length;
      textarea.setSelectionRange(len, len);
    }, 0);
  });
}
