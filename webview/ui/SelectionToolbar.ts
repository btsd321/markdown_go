/**
 * 多块选区浮动工具栏
 *
 * 当用户拖动选中跨多个块的文本时，于选区上方弹出此工具栏。
 * v1 仅实现 “T ▾” 块类型转换，其余按钮位作为视觉占位（disabled）。
 */
import { BlockType } from '../../shared';

export interface BlockTypeOption {
  label: string;
  type: BlockType | 'code-merge';
}

const BLOCK_TYPE_OPTIONS: BlockTypeOption[] = [
  { label: '正文段落', type: 'paragraph' },
  { label: '一级标题  H1', type: 'heading-1' },
  { label: '二级标题  H2', type: 'heading-2' },
  { label: '三级标题  H3', type: 'heading-3' },
  { label: '无序列表  •', type: 'list-unordered' },
  { label: '有序列表  n.', type: 'list-ordered' },
  { label: '代码块  { }（合并）', type: 'code-merge' },
];

export interface SelectionToolbarHandle {
  /** 根据当前 DOM 选区重新计算位置 */
  reposition(): void;
  /** 卸载 */
  dispose(): void;
}

export interface SelectionToolbarCallbacks {
  /** 用户在 T 下拉菜单中点击了某一项 */
  onPickBlockType(option: BlockTypeOption): void;
}

/**
 * 显示工具栏。返回句柄；调用 dispose 卸载。
 */
export function showSelectionToolbar(
  cb: SelectionToolbarCallbacks
): SelectionToolbarHandle {
  const bar = document.createElement('div');
  bar.className = 'selection-toolbar';

  // T ▾
  const tBtn = document.createElement('button');
  tBtn.type = 'button';
  tBtn.className = 'selection-toolbar-btn';
  tBtn.title = '转换为...';
  tBtn.innerHTML = '<span style="font-weight:600">T</span><span style="opacity:.7;margin-left:2px">▾</span>';
  // 防止按下按钮时浏览器清掉选区
  tBtn.addEventListener('mousedown', (e) => e.preventDefault());
  bar.appendChild(tBtn);

  // 视觉占位按钮（禁用），保留后续扩展槽位
  for (const label of ['B', 'I', 'U']) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'selection-toolbar-btn is-disabled';
    btn.disabled = true;
    btn.textContent = label;
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    bar.appendChild(btn);
  }

  document.body.appendChild(bar);

  let dropdown: HTMLElement | null = null;

  const closeDropdown = () => {
    if (dropdown) {
      dropdown.remove();
      dropdown = null;
    }
  };

  tBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dropdown) {
      closeDropdown();
      return;
    }
    dropdown = document.createElement('div');
    dropdown.className = 'popup-menu selection-toolbar-menu';
    for (const opt of BLOCK_TYPE_OPTIONS) {
      const item = document.createElement('div');
      item.className = 'popup-menu-item';
      item.textContent = opt.label;
      item.addEventListener('mousedown', (ev) => ev.preventDefault());
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        closeDropdown();
        cb.onPickBlockType(opt);
      });
      dropdown.appendChild(item);
    }
    document.body.appendChild(dropdown);
    const r = tBtn.getBoundingClientRect();
    dropdown.style.left = `${r.left}px`;
    dropdown.style.top = `${r.bottom + 4}px`;
  });

  function position(): void {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    // 先挂上才能拿到尺寸
    const barRect = bar.getBoundingClientRect();
    const left = Math.max(8, rect.left + rect.width / 2 - barRect.width / 2);
    const top = Math.max(8, rect.top - barRect.height - 8);
    bar.style.left = `${left}px`;
    bar.style.top = `${top}px`;
  }
  // 首次定位需在 DOM 测量稳定后
  requestAnimationFrame(position);

  return {
    reposition: position,
    dispose: () => {
      closeDropdown();
      bar.remove();
    },
  };
}
