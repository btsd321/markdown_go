/**
 * 表格大小选择器（Notion / 语雀风格）
 *
 * - 鼠标悬浮在格子上：高亮 NxM 区域，显示 "rows × cols"
 * - 点击：返回选中尺寸
 * - Esc / 点遮罩：取消（返回 null）
 *
 * 默认最大可选 8 行 × 8 列；超出范围时可拖动到边缘自动扩展（暂不实现，先固定）。
 */
import { t } from '../i18n';

export interface TablePickerResult {
  rows: number;
  cols: number;
}

const MAX_ROWS = 8;
const MAX_COLS = 8;

export function openTablePicker(): Promise<TablePickerResult | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay mg-table-picker-overlay';

    const panel = document.createElement('div');
    panel.className = 'mg-table-picker';
    panel.addEventListener('mousedown', (e) => e.stopPropagation());

    const title = document.createElement('div');
    title.className = 'mg-table-picker-title';
    title.textContent = t('dialog.table.title');

    const label = document.createElement('div');
    label.className = 'mg-table-picker-label';
    label.textContent = `0 × 0`;

    const grid = document.createElement('div');
    grid.className = 'mg-table-picker-grid';
    grid.style.setProperty('--cols', String(MAX_COLS));

    const cells: HTMLElement[][] = [];
    let hoverR = 0;
    let hoverC = 0;

    const refresh = () => {
      for (let r = 0; r < MAX_ROWS; r++) {
        for (let c = 0; c < MAX_COLS; c++) {
          const inside = r < hoverR && c < hoverC;
          cells[r][c].classList.toggle('is-active', inside);
        }
      }
      label.textContent = `${hoverR} × ${hoverC}`;
    };

    for (let r = 0; r < MAX_ROWS; r++) {
      cells[r] = [];
      for (let c = 0; c < MAX_COLS; c++) {
        const cell = document.createElement('div');
        cell.className = 'mg-table-picker-cell';
        cell.addEventListener('mouseenter', () => {
          hoverR = r + 1;
          hoverC = c + 1;
          refresh();
        });
        cell.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          settle({ rows: r + 1, cols: c + 1 });
        });
        grid.appendChild(cell);
        cells[r].push(cell);
      }
    }

    const hint = document.createElement('div');
    hint.className = 'mg-table-picker-hint';
    hint.textContent = t('dialog.table.hint');

    panel.append(title, label, grid, hint);
    overlay.append(panel);
    document.body.appendChild(overlay);

    let settled = false;
    const settle = (v: TablePickerResult | null) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(v);
    };

    overlay.addEventListener('mousedown', () => settle(null));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        settle(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
  });
}
