/**
 * "+" 行首按钮的弹出菜单：选择要插入的块类型。
 *
 * 仅负责 DOM 构造与定位。点击外部由调用方处理（监听 document click）。
 */
import { BlockType } from '../../shared';

export interface InsertMenuItem {
  label: string;
  type: BlockType;
  initial?: string;
}

export const DEFAULT_INSERT_MENU: InsertMenuItem[] = [
  { label: '一级标题  H1', type: 'heading-1' },
  { label: '二级标题  H2', type: 'heading-2' },
  { label: '三级标题  H3', type: 'heading-3' },
  { label: '正文段落', type: 'paragraph' },
  { label: 'LaTeX 公式', type: 'latex', initial: 'E = mc^2' },
  { label: 'Mermaid 流程图', type: 'mermaid', initial: 'graph LR\n  A --> B' },
];

export function renderInsertMenu(
  anchor: HTMLElement,
  items: InsertMenuItem[],
  onPick: (item: InsertMenuItem) => void
): HTMLElement {
  const menu = document.createElement('div');
  menu.className = 'popup-menu';

  for (const item of items) {
    const el = document.createElement('div');
    el.className = 'popup-menu-item';
    el.textContent = item.label;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      onPick(item);
    });
    menu.appendChild(el);
  }

  // 先挂上才能拿到尺寸
  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.left = `${rect.right + 4}px`;
  menu.style.top = `${rect.top}px`;
  return menu;
}
