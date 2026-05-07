/**
 * 表格节点（基于 prosemirror-tables / @tiptap/extension-table）
 *
 * 在原生 TableCell / TableHeader 上扩展 `align` 属性（GFM 列对齐），
 * 序列化时由 header 行的 align 决定列分隔符（`:--- / :---: / ---:`）。
 *
 * Markdown 兼容性约束（GFM）：
 *   - 必须有表头行（schema 默认即如此）
 *   - 暂不支持单元格合并（不开启 mergeCells / splitCell 工具栏）
 *   - 单元格内禁止块级（列表 / 代码块 / mermaid / latex 块）
 *     — 实现上：保持节点 schema 默认 `block+`，但 UI 层（SlashMenu/快捷键）
 *       不在表格内提供这些块插入入口；序列化时若遇到块级会压平为单段落 + `<br>`。
 */
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';

type Align = 'left' | 'center' | 'right' | null;

const alignAttr = {
  align: {
    default: null as Align,
    parseHTML: (el: HTMLElement): Align => {
      const a = (el.getAttribute('align') || el.style.textAlign || '').toLowerCase();
      return a === 'left' || a === 'center' || a === 'right' ? (a as Align) : null;
    },
    renderHTML: (attrs: Record<string, unknown>) => {
      const a = attrs.align as Align;
      return a ? { style: `text-align: ${a}` } : {};
    },
  },
};

export const MgTable = Table.configure({
  resizable: true,
  HTMLAttributes: { class: 'mg-table' },
});

export const MgTableRow = TableRow;

export const MgTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...(this.parent?.() ?? {}), ...alignAttr };
  },
});

export const MgTableCell = TableCell.extend({
  addAttributes() {
    return { ...(this.parent?.() ?? {}), ...alignAttr };
  },
});
