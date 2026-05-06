/**
 * 图片插入对话框：双 Tab（网络 URL / 本地文件）
 *
 * 返回:
 *   - URL 模式: { src: <input value>, alt }
 *   - Local 模式: { src: <relativePath from picker>, alt, displaySrc: <webviewUri> }
 *     · displaySrc 仅供调用方在插入后立即预览（编辑器实际由 ImageWithBase 解析 src）
 */
import { t } from '../i18n';
import { bridge } from '../core/bridge';
import { MessageType } from '../../shared';
import type { ImagePickResponse } from '../../shared';

export interface ImageDialogResult {
  src: string;
  alt: string;
  title?: string;
}

export function openImageDialog(): Promise<ImageDialogResult | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog modal-image-dialog';
    dialog.addEventListener('mousedown', (e) => e.stopPropagation());

    const titleEl = document.createElement('div');
    titleEl.className = 'modal-title';
    titleEl.textContent = t('dialog.image.title');

    // ---- Tabs ----
    const tabs = document.createElement('div');
    tabs.className = 'modal-tabs';
    const tabUrl = document.createElement('button');
    tabUrl.type = 'button';
    tabUrl.className = 'modal-tab is-active';
    tabUrl.textContent = t('dialog.image.tabUrl');
    const tabLocal = document.createElement('button');
    tabLocal.type = 'button';
    tabLocal.className = 'modal-tab';
    tabLocal.textContent = t('dialog.image.tabLocal');
    tabs.append(tabUrl, tabLocal);

    // ---- URL panel ----
    const urlPanel = document.createElement('div');
    urlPanel.className = 'modal-tabpanel';
    const urlLabel = document.createElement('div');
    urlLabel.className = 'modal-hint';
    urlLabel.textContent = t('dialog.image.urlLabel');
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.className = 'modal-input';
    urlInput.placeholder = t('dialog.image.urlPlaceholder');
    urlPanel.append(urlLabel, urlInput);

    // ---- Local panel ----
    const localPanel = document.createElement('div');
    localPanel.className = 'modal-tabpanel';
    localPanel.style.display = 'none';
    const localRow = document.createElement('div');
    localRow.className = 'modal-image-localrow';
    const chooseBtn = document.createElement('button');
    chooseBtn.type = 'button';
    chooseBtn.className = 'modal-btn modal-btn-secondary';
    chooseBtn.textContent = t('dialog.image.choose');
    const pathLabel = document.createElement('span');
    pathLabel.className = 'modal-image-pathlabel';
    pathLabel.textContent = t('dialog.image.noFile');
    localRow.append(chooseBtn, pathLabel);
    const previewWrap = document.createElement('div');
    previewWrap.className = 'modal-image-preview';
    const previewImg = document.createElement('img');
    previewImg.alt = '';
    previewImg.style.display = 'none';
    previewWrap.appendChild(previewImg);
    localPanel.append(localRow, previewWrap);

    // ---- Common: alt ----
    const altLabel = document.createElement('div');
    altLabel.className = 'modal-hint';
    altLabel.textContent = t('dialog.image.altLabel');
    const altInput = document.createElement('input');
    altInput.type = 'text';
    altInput.className = 'modal-input';
    altInput.placeholder = t('dialog.image.altPlaceholder');

    // ---- Actions ----
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
    actions.append(cancelBtn, okBtn);

    dialog.append(titleEl, tabs, urlPanel, localPanel, altLabel, altInput, actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    let activeTab: 'url' | 'local' = 'url';
    let pickedRelative: string | null = null;
    function activate(tab: 'url' | 'local') {
      activeTab = tab;
      tabUrl.classList.toggle('is-active', tab === 'url');
      tabLocal.classList.toggle('is-active', tab === 'local');
      urlPanel.style.display = tab === 'url' ? '' : 'none';
      localPanel.style.display = tab === 'local' ? '' : 'none';
      setTimeout(() => (tab === 'url' ? urlInput : chooseBtn).focus(), 0);
    }
    tabUrl.addEventListener('click', () => activate('url'));
    tabLocal.addEventListener('click', () => activate('local'));

    chooseBtn.addEventListener('click', async () => {
      const resp = await bridge.request<unknown, ImagePickResponse>(
        MessageType.IMAGE_PICK,
        {},
      );
      if (!resp || !resp.absolutePath) return;
      pickedRelative = resp.relativePath || resp.absolutePath;
      pathLabel.textContent = pickedRelative;
      pathLabel.title = resp.absolutePath;
      if (resp.webviewUri) {
        previewImg.src = resp.webviewUri;
        previewImg.style.display = '';
      }
    });

    function cleanup() {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
    }
    function commit() {
      let src = '';
      if (activeTab === 'url') {
        src = urlInput.value.trim();
      } else if (pickedRelative) {
        src = pickedRelative;
      }
      if (!src) {
        if (activeTab === 'url') urlInput.focus();
        else chooseBtn.focus();
        return;
      }
      cleanup();
      resolve({ src, alt: altInput.value.trim() });
    }
    function cancel() {
      cleanup();
      resolve(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      } else if (e.key === 'Enter' && (e.target === urlInput || e.target === altInput)) {
        e.preventDefault();
        commit();
      }
    }
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', cancel);
    okBtn.addEventListener('click', commit);
    cancelBtn.addEventListener('click', cancel);

    setTimeout(() => urlInput.focus(), 0);
  });
}
