/**
 * 链接输入弹窗：双字段（URL + 显示文本）
 */
import { t } from '../i18n';

export interface LinkDialogOptions {
  initialHref?: string;
  initialText?: string;
}

export interface LinkDialogResult {
  href: string;
  text: string;
}

export function openLinkDialog(opts: LinkDialogOptions = {}): Promise<LinkDialogResult | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';
    dialog.addEventListener('mousedown', (e) => e.stopPropagation());

    const titleEl = document.createElement('div');
    titleEl.className = 'modal-title';
    titleEl.textContent = t('dialog.link.title');

    const hrefLabel = document.createElement('div');
    hrefLabel.className = 'modal-hint';
    hrefLabel.textContent = t('dialog.link.urlLabel');
    const hrefInput = document.createElement('input');
    hrefInput.type = 'text';
    hrefInput.className = 'modal-input';
    hrefInput.placeholder = t('dialog.link.urlPlaceholder');
    if (opts.initialHref) hrefInput.value = opts.initialHref;

    const textLabel = document.createElement('div');
    textLabel.className = 'modal-hint';
    textLabel.textContent = t('dialog.link.textLabel');
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'modal-input';
    textInput.placeholder = t('dialog.link.textPlaceholder');
    if (opts.initialText) textInput.value = opts.initialText;

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'modal-btn modal-btn-secondary';
    cancelBtn.textContent = t('dialog.cancel');

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'modal-btn modal-btn-primary';
    okBtn.textContent = t('dialog.confirm');

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);

    dialog.appendChild(titleEl);
    dialog.appendChild(hrefLabel);
    dialog.appendChild(hrefInput);
    dialog.appendChild(textLabel);
    dialog.appendChild(textInput);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    function cleanup() {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    }
    function commit() {
      const href = hrefInput.value.trim();
      if (!href) {
        hrefInput.focus();
        return;
      }
      const text = textInput.value.trim() || href;
      cleanup();
      resolve({ href, text });
    }
    function cancel() {
      cleanup();
      resolve(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commit();
      }
    }
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', cancel);
    okBtn.addEventListener('click', commit);
    cancelBtn.addEventListener('click', cancel);

    setTimeout(() => (opts.initialHref ? textInput : hrefInput).focus(), 0);
  });
}
