/**
 * TableToolbar —— 光标进入表格时浮于表格上方的工具栏
 *
 * 参考 Outline / Notion / Tiptap 官方 demo：
 *   - 行操作：上方插入行 / 下方插入行 / 删除行
 *   - 列操作：左侧插入列 / 右侧插入列 / 删除列
 *   - 列对齐：左 / 居中 / 右
 *   - 删除整张表
 *
 * 不支持 mergeCells / splitCell（GFM 兼容性约束）。
 *
 * 显示策略：
 *   - selectionUpdate 时检测 editor.isActive('table')
 *   - 用最近的 table DOM 定位（getBoundingClientRect）
 *   - 失活 / 选中范围跨表格 / 焦点离开 → 隐藏
 */
import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { t, onLocaleChange } from '../../i18n';

type Align = 'left' | 'center' | 'right' | null;

export interface TableToolbarController {
  extension: Extension;
  bind(editor: Editor): void;
  destroy(): void;
}

export function createTableToolbar(): TableToolbarController {
  const root = document.createElement('div');
  root.className = 'mg-table-toolbar';
  root.style.display = 'none';
  root.style.position = 'fixed';
  root.style.zIndex = '1480';
  document.body.appendChild(root);

  let editorRef: Editor | null = null;
  let visible = false;

  // 按钮定义；title 走 i18n
  type Btn = {
    key: string;
    titleKey: string;
    icon: string;
    cmd: (e: Editor) => void;
    /** active 检测（如对齐按钮） */
    isActive?: (e: Editor) => boolean;
    sepBefore?: boolean;
  };

  /** 简单 SVG 图标集（14×14），仅描边/填充几何形状，跟随 currentColor */
  const ICONS = {
    rowAbove:
      '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="9" width="12" height="5" rx="1"/><path d="M5 5h6M8 2v6"/></svg>',
    rowBelow:
      '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="2" width="12" height="5" rx="1"/><path d="M5 11h6M8 14V8"/></svg>',
    rowDel:
      '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="6" width="12" height="4" rx="1"/><path d="M11 3l3 3M14 3l-3 3"/></svg>',
    colLeft:
      '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="9" y="2" width="5" height="12" rx="1"/><path d="M5 5v6M2 8h6"/></svg>',
    colRight:
      '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="2" width="5" height="12" rx="1"/><path d="M11 5v6M14 8H8"/></svg>',
    colDel:
      '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="6" y="2" width="4" height="12" rx="1"/><path d="M3 11l3 3M3 14l3-3"/></svg>',
    alignL:
      '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="3" width="12" height="1.6" rx="0.3"/><rect x="2" y="6.4" width="8" height="1.6" rx="0.3"/><rect x="2" y="9.8" width="12" height="1.6" rx="0.3"/><rect x="2" y="13.2" width="8" height="1.6" rx="0.3"/></svg>',
    alignC:
      '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="3" width="12" height="1.6" rx="0.3"/><rect x="4" y="6.4" width="8" height="1.6" rx="0.3"/><rect x="2" y="9.8" width="12" height="1.6" rx="0.3"/><rect x="4" y="13.2" width="8" height="1.6" rx="0.3"/></svg>',
    alignR:
      '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="3" width="12" height="1.6" rx="0.3"/><rect x="6" y="6.4" width="8" height="1.6" rx="0.3"/><rect x="2" y="9.8" width="12" height="1.6" rx="0.3"/><rect x="6" y="13.2" width="8" height="1.6" rx="0.3"/></svg>',
    del:
      '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 5h10M6 5V3h4v2M5 5l1 9h4l1-9"/></svg>',
  };

  const BUTTONS: Btn[] = [
    {
      key: 'rowAbove', titleKey: 'table.rowAbove', icon: ICONS.rowAbove,
      cmd: (e) => (e.chain().focus() as any).addRowBefore().run(),
    },
    {
      key: 'rowBelow', titleKey: 'table.rowBelow', icon: ICONS.rowBelow,
      cmd: (e) => (e.chain().focus() as any).addRowAfter().run(),
    },
    {
      key: 'rowDel', titleKey: 'table.rowDelete', icon: ICONS.rowDel,
      cmd: (e) => (e.chain().focus() as any).deleteRow().run(),
    },
    {
      key: 'colLeft', titleKey: 'table.colLeft', icon: ICONS.colLeft, sepBefore: true,
      cmd: (e) => (e.chain().focus() as any).addColumnBefore().run(),
    },
    {
      key: 'colRight', titleKey: 'table.colRight', icon: ICONS.colRight,
      cmd: (e) => (e.chain().focus() as any).addColumnAfter().run(),
    },
    {
      key: 'colDel', titleKey: 'table.colDelete', icon: ICONS.colDel,
      cmd: (e) => (e.chain().focus() as any).deleteColumn().run(),
    },
    {
      key: 'alignL', titleKey: 'table.alignLeft', icon: ICONS.alignL, sepBefore: true,
      cmd: (e) => setColumnAlign(e, 'left'),
      isActive: (e) => currentColumnAlign(e) === 'left',
    },
    {
      key: 'alignC', titleKey: 'table.alignCenter', icon: ICONS.alignC,
      cmd: (e) => setColumnAlign(e, 'center'),
      isActive: (e) => currentColumnAlign(e) === 'center',
    },
    {
      key: 'alignR', titleKey: 'table.alignRight', icon: ICONS.alignR,
      cmd: (e) => setColumnAlign(e, 'right'),
      isActive: (e) => currentColumnAlign(e) === 'right',
    },
    {
      key: 'del', titleKey: 'table.delete', icon: ICONS.del, sepBefore: true,
      cmd: (e) => (e.chain().focus() as any).deleteTable().run(),
    },
  ];

  const btnEls: { btn: Btn; el: HTMLButtonElement }[] = [];

  function build() {
    root.innerHTML = '';
    btnEls.length = 0;
    for (const btn of BUTTONS) {
      if (btn.sepBefore) {
        const sep = document.createElement('span');
        sep.className = 'mg-table-toolbar-sep';
        root.appendChild(sep);
      }
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'mg-table-toolbar-btn';
      el.innerHTML = btn.icon;
      el.title = t(btn.titleKey);
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!editorRef) return;
        btn.cmd(editorRef);
        // 命令执行后立即刷新位置 / active 态
        setTimeout(refresh, 0);
      });
      root.appendChild(el);
      btnEls.push({ btn, el });
    }
  }

  function refreshActive() {
    if (!editorRef) return;
    for (const { btn, el } of btnEls) {
      el.classList.toggle('is-active', !!btn.isActive?.(editorRef));
    }
  }

  /** 找到当前光标所在 table 的 DOM，并把工具栏定位到它上方 */
  function refresh() {
    if (!editorRef) { hide(); return; }
    if (!editorRef.isActive('table')) { hide(); return; }

    const view = editorRef.view;
    const { $from } = editorRef.state.selection;
    let tablePos = -1;
    for (let d = $from.depth; d > 0; d--) {
      if ($from.node(d).type.name === 'table') {
        tablePos = $from.before(d);
        break;
      }
    }
    if (tablePos < 0) { hide(); return; }

    let dom: HTMLElement | null = null;
    try {
      const node = view.nodeDOM(tablePos);
      dom = node instanceof HTMLElement ? node : null;
    } catch {
      dom = null;
    }
    if (!dom) { hide(); return; }
    // dom 可能是 .tableWrapper 包裹层；找内部 table 也行，外层定位更稳定
    const r = dom.getBoundingClientRect();
    visible = true;
    root.style.display = '';
    refreshActive();
    requestAnimationFrame(() => {
      const tb = root.getBoundingClientRect();
      const margin = 6;
      let nx = Math.round(r.left);
      let ny = Math.round(r.top - tb.height - margin);
      if (ny < margin) ny = Math.round(r.bottom + margin);
      if (nx + tb.width > window.innerWidth - margin) {
        nx = Math.max(margin, window.innerWidth - tb.width - margin);
      }
      if (nx < margin) nx = margin;
      root.style.left = `${nx}px`;
      root.style.top = `${ny}px`;
    });
  }

  function hide() {
    if (!visible) return;
    visible = false;
    root.style.display = 'none';
  }

  const offLocale = onLocaleChange(() => {
    for (const { btn, el } of btnEls) el.title = t(btn.titleKey);
  });

  const onScroll = () => { if (visible) refresh(); };
  const onResize = () => { if (visible) refresh(); };
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);

  const extension = Extension.create({ name: 'mgTableToolbarPlaceholder' });

  return {
    extension,
    bind(editor: Editor) {
      editorRef = editor;
      build();
      editor.on('selectionUpdate', refresh);
      editor.on('focus', refresh);
      editor.on('blur', () => {
        // 让点击工具栏自身的 mousedown 不触发 blur 隐藏
        setTimeout(() => {
          if (!root.matches(':hover')) hide();
        }, 0);
      });
      editor.on('update', refresh);
    },
    destroy() {
      offLocale();
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      root.remove();
    },
  };
}

/** 找到当前光标所在 cell 的列索引 + 所在 table 节点 / 起始位置 */
function locateCell(editor: Editor): {
  table: PMNode;
  tablePos: number;
  colIndex: number;
} | null {
  const { $from } = editor.state.selection;
  let tableDepth = -1;
  let rowDepth = -1;
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d);
    if (n.type.name === 'tableRow' && rowDepth < 0) rowDepth = d;
    if (n.type.name === 'table') { tableDepth = d; break; }
  }
  if (tableDepth < 0 || rowDepth < 0) return null;
  return {
    table: $from.node(tableDepth),
    tablePos: $from.before(tableDepth),
    colIndex: $from.index(rowDepth),
  };
}

function currentColumnAlign(editor: Editor): Align {
  const loc = locateCell(editor);
  if (!loc) return null;
  // 取 header 行（第一行）该列的 align；header 不存在时取首个数据行
  const firstRow = loc.table.firstChild;
  if (!firstRow || loc.colIndex >= firstRow.childCount) return null;
  const cell = firstRow.child(loc.colIndex);
  const a = cell.attrs?.align;
  return a === 'left' || a === 'center' || a === 'right' ? a : null;
}

function setColumnAlign(editor: Editor, align: Align): void {
  const loc = locateCell(editor);
  if (!loc) return;
  const { table, tablePos, colIndex } = loc;
  const tr = editor.state.tr;
  // 遍历每一行的第 colIndex 个 cell，更新 align
  // 位置计算：tablePos 是 table 之前的位置；tablePos+1 是 table content 起点
  let rowOffset = tablePos + 1;
  table.forEach((row) => {
    if (colIndex < row.childCount) {
      let cellOffset = rowOffset + 1; // row content 起点
      for (let i = 0; i < colIndex; i++) cellOffset += row.child(i).nodeSize;
      const cell = row.child(colIndex);
      tr.setNodeMarkup(cellOffset, undefined, { ...cell.attrs, align });
    }
    rowOffset += row.nodeSize;
  });
  editor.view.dispatch(tr);
}
