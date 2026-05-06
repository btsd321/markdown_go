/**
 * 视频插入对话框：双 Tab（网络 URL / 本地文件） + 类型选择（自动 / video / iframe）
 *
 * 返回:
 *   - URL 模式: { src: <input value>, kind, title }
 *   - Local 模式: { src: <relativePath from picker>, kind: 'video', title }
 *
 * kind 自动判定（"自动"模式下）：
 *   - URL 路径名以视频扩展名结尾 → 'video'
 *   - 其余 → 'iframe'
 *   - 本地文件统一 → 'video'
 */
import { t } from '../i18n';
import { bridge } from '../core/bridge';
import { MessageType } from '../../shared';
import type { VideoPickResponse } from '../../shared';

export interface VideoDialogResult {
  src: string;
  kind: 'video' | 'iframe';
  title: string;
}

const VIDEO_EXTS = new Set([
  'mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v', 'mkv', 'avi',
]);

function detectKind(src: string): 'video' | 'iframe' {
  try {
    const u = new URL(src);
    const path = u.pathname.toLowerCase();
    const dot = path.lastIndexOf('.');
    if (dot >= 0) {
      const ext = path.slice(dot + 1);
      if (VIDEO_EXTS.has(ext)) return 'video';
    }
    return 'iframe';
  } catch {
    // 非合法 URL：按扩展名兜底
    const m = /\.([a-z0-9]+)(?:\?|$)/i.exec(src);
    if (m && VIDEO_EXTS.has(m[1].toLowerCase())) return 'video';
    return 'iframe';
  }
}

export function openVideoDialog(): Promise<VideoDialogResult | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog modal-video-dialog';
    dialog.addEventListener('mousedown', (e) => e.stopPropagation());

    const titleEl = document.createElement('div');
    titleEl.className = 'modal-title';
    titleEl.textContent = t('dialog.video.title');

    // ---- Tabs ----
    const tabs = document.createElement('div');
    tabs.className = 'modal-tabs';
    const tabUrl = document.createElement('button');
    tabUrl.type = 'button';
    tabUrl.className = 'modal-tab is-active';
    tabUrl.textContent = t('dialog.video.tabUrl');
    const tabLocal = document.createElement('button');
    tabLocal.type = 'button';
    tabLocal.className = 'modal-tab';
    tabLocal.textContent = t('dialog.video.tabLocal');
    tabs.append(tabUrl, tabLocal);

    // ---- URL panel ----
    const urlPanel = document.createElement('div');
    urlPanel.className = 'modal-tabpanel';
    const urlLabel = document.createElement('div');
    urlLabel.className = 'modal-hint';
    urlLabel.textContent = t('dialog.video.urlLabel');
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.className = 'modal-input';
    urlInput.placeholder = t('dialog.video.urlPlaceholder');

    // kind chooser
    const kindLabel = document.createElement('div');
    kindLabel.className = 'modal-hint';
    kindLabel.textContent = t('dialog.video.kindLabel');
    const kindRow = document.createElement('div');
    kindRow.className = 'modal-video-kindrow';
    const kindGroup = 'video-kind-' + Math.random().toString(36).slice(2, 8);
    function makeRadio(value: string, label: string, checked = false): HTMLLabelElement {
      const wrap = document.createElement('label');
      wrap.className = 'modal-video-kindopt';
      const r = document.createElement('input');
      r.type = 'radio';
      r.name = kindGroup;
      r.value = value;
      r.checked = checked;
      const span = document.createElement('span');
      span.textContent = label;
      wrap.append(r, span);
      return wrap;
    }
    const optAuto = makeRadio('auto', t('dialog.video.kindAuto'), true);
    const optVideo = makeRadio('video', t('dialog.video.kindVideo'));
    const optIframe = makeRadio('iframe', t('dialog.video.kindIframe'));
    kindRow.append(optAuto, optVideo, optIframe);
    urlPanel.append(urlLabel, urlInput, kindLabel, kindRow);

    // ---- Local panel ----
    const localPanel = document.createElement('div');
    localPanel.className = 'modal-tabpanel';
    localPanel.style.display = 'none';
    const localRow = document.createElement('div');
    localRow.className = 'modal-image-localrow';
    const chooseBtn = document.createElement('button');
    chooseBtn.type = 'button';
    chooseBtn.className = 'modal-btn modal-btn-secondary';
    chooseBtn.textContent = t('dialog.video.choose');
    const pathLabel = document.createElement('span');
    pathLabel.className = 'modal-image-pathlabel';
    pathLabel.textContent = t('dialog.video.noFile');
    localRow.append(chooseBtn, pathLabel);
    const previewWrap = document.createElement('div');
    previewWrap.className = 'modal-video-preview';
    const previewVideo = document.createElement('video');
    previewVideo.controls = true;
    previewVideo.style.display = 'none';
    previewVideo.style.maxWidth = '100%';
    previewWrap.appendChild(previewVideo);
    localPanel.append(localRow, previewWrap);

    // ---- Common: title ----
    const titleLabel = document.createElement('div');
    titleLabel.className = 'modal-hint';
    titleLabel.textContent = t('dialog.video.titleLabel');
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'modal-input';
    titleInput.placeholder = t('dialog.video.titlePlaceholder');

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

    dialog.append(titleEl, tabs, urlPanel, localPanel, titleLabel, titleInput, actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    let activeTab: 'url' | 'local' = 'url';
    let pickedRelative: string | null = null;
    let pickedWebviewUri: string | null = null;

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
      const resp = await bridge.request<unknown, VideoPickResponse>(
        MessageType.VIDEO_PICK,
        {},
      );
      if (!resp || !resp.absolutePath) return;
      pickedRelative = resp.relativePath || resp.absolutePath;
      pickedWebviewUri = resp.webviewUri;
      pathLabel.textContent = pickedRelative;
      pathLabel.title = resp.absolutePath;
      if (resp.webviewUri) {
        previewVideo.src = resp.webviewUri;
        previewVideo.style.display = '';
      }
    });

    function getSelectedKind(): 'auto' | 'video' | 'iframe' {
      const checked = kindRow.querySelector<HTMLInputElement>('input[type="radio"]:checked');
      return (checked?.value as 'auto' | 'video' | 'iframe') || 'auto';
    }

    function cleanup() {
      overlay.remove();
      previewVideo.pause();
      previewVideo.removeAttribute('src');
      document.removeEventListener('keydown', onKey);
    }
    function commit() {
      let src = '';
      let kind: 'video' | 'iframe' = 'video';
      if (activeTab === 'url') {
        src = urlInput.value.trim();
        if (!src) { urlInput.focus(); return; }
        const sel = getSelectedKind();
        kind = sel === 'auto' ? detectKind(src) : sel;
      } else {
        if (!pickedRelative) { chooseBtn.focus(); return; }
        src = pickedRelative;
        kind = 'video';
      }
      cleanup();
      resolve({ src, kind, title: titleInput.value.trim() });
    }
    function cancel() {
      cleanup();
      resolve(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      } else if (e.key === 'Enter' && (e.target === urlInput || e.target === titleInput)) {
        e.preventDefault();
        commit();
      }
    }
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', cancel);
    okBtn.addEventListener('click', commit);
    cancelBtn.addEventListener('click', cancel);

    setTimeout(() => urlInput.focus(), 0);
    // 引用未使用的变量避免 TS 警告
    void pickedWebviewUri;
  });
}
