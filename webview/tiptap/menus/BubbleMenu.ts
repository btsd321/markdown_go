/**
 * 编辑栏（EditToolbar）—— 选区非空时由右键触发的浮动格式化工具栏
 *
 * 改造自原 BubbleMenu：
 *   - 不再随选区自动浮出（tippy 移除）
 *   - 由 ContextMenu 在右键非空选区时调用 `showAt(x, y)` 主动显示
 *   - 选区变更 / 点击外部 / Esc / 滚动 / resize 自动隐藏
 *
 * 含两组：
 *   1. 块类型下拉 `T ▾`：段落 / H1-H3 / 无序 / 有序 / 引用 / 代码块
 *      + 三项"合并"：合并为无序列表（单项）/ 合并为有序列表（单项）/ 合并为代码块
 *   2. 内联：B / I / S / `<>`
 *
 * 注：导出名仍叫 createBubbleMenu / BubbleMenuFactory 以减少调用方修改。
 */
import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { t, onLocaleChange } from '../../i18n';

/** 对齐图标（svg 字符串）—— 与编辑栏其它按钮等高（14px） */
const ALIGN_ICONS: Record<'left' | 'center' | 'right', string> = {
  left:
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
    '<rect x="2" y="3" width="12" height="1.6" rx="0.3"/>' +
    '<rect x="2" y="6.4" width="8" height="1.6" rx="0.3"/>' +
    '<rect x="2" y="9.8" width="12" height="1.6" rx="0.3"/>' +
    '<rect x="2" y="13.2" width="8" height="1.6" rx="0.3"/>' +
    '</svg>',
  center:
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
    '<rect x="2" y="3" width="12" height="1.6" rx="0.3"/>' +
    '<rect x="4" y="6.4" width="8" height="1.6" rx="0.3"/>' +
    '<rect x="2" y="9.8" width="12" height="1.6" rx="0.3"/>' +
    '<rect x="4" y="13.2" width="8" height="1.6" rx="0.3"/>' +
    '</svg>',
  right:
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
    '<rect x="2" y="3" width="12" height="1.6" rx="0.3"/>' +
    '<rect x="6" y="6.4" width="8" height="1.6" rx="0.3"/>' +
    '<rect x="2" y="9.8" width="12" height="1.6" rx="0.3"/>' +
    '<rect x="6" y="13.2" width="8" height="1.6" rx="0.3"/>' +
    '</svg>',
};

interface AlignItem {
  key: 'left' | 'center' | 'right';
  getLabel(): string;
}
const ALIGNS: AlignItem[] = [
  { key: 'left', getLabel: () => t('bubble.alignLeft') },
  { key: 'center', getLabel: () => t('bubble.alignCenter') },
  { key: 'right', getLabel: () => t('bubble.alignRight') },
];

interface BlockTypeItem {
  key: string;
  getLabel(): string;
  isActive?: (e: Editor) => boolean;
  apply: (e: Editor) => void;
  separatorBefore?: boolean;
}

const BLOCK_TYPES: BlockTypeItem[] = [
  {
    key: 'paragraph',
    getLabel: () => t('block.paragraph'),
    isActive: (e) => e.isActive('paragraph') && !e.isActive('heading'),
    apply: (e) => e.chain().focus().setParagraph().run(),
  },
  {
    key: 'h1',
    getLabel: () => t('block.h1'),
    isActive: (e) => e.isActive('heading', { level: 1 }),
    apply: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    key: 'h2',
    getLabel: () => t('block.h2'),
    isActive: (e) => e.isActive('heading', { level: 2 }),
    apply: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    key: 'h3',
    getLabel: () => t('block.h3'),
    isActive: (e) => e.isActive('heading', { level: 3 }),
    apply: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    key: 'ul',
    getLabel: () => t('block.ul'),
    isActive: (e) => e.isActive('bulletList'),
    apply: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    key: 'ol',
    getLabel: () => t('block.ol'),
    isActive: (e) => e.isActive('orderedList'),
    apply: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    key: 'quote',
    getLabel: () => t('block.quote'),
    isActive: (e) => e.isActive('blockquote'),
    apply: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    key: 'code',
    getLabel: () => t('block.codeBlock'),
    isActive: (e) => e.isActive('codeBlock'),
    apply: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
  {
    key: 'merge-ul',
    getLabel: () => t('block.mergeUL'),
    apply: (e) => mergeSelectionIntoSingleListItem(e, 'bulletList'),
    separatorBefore: true,
  },
  {
    key: 'merge-ol',
    getLabel: () => t('block.mergeOL'),
    apply: (e) => mergeSelectionIntoSingleListItem(e, 'orderedList'),
  },
  {
    key: 'merge-code',
    getLabel: () => t('block.mergeCode'),
    apply: (e) => mergeSelectionIntoCodeBlock(e),
  },
];

interface InlineItem {
  key: string;
  label: string;
  getTitle(): string;
  isActive: (e: Editor) => boolean;
  apply: (e: Editor) => void;
}

const INLINES: InlineItem[] = [
  {
    key: 'bold',
    label: 'B',
    getTitle: () => t('inline.bold'),
    isActive: (e) => e.isActive('bold'),
    apply: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    key: 'italic',
    label: 'I',
    getTitle: () => t('inline.italic'),
    isActive: (e) => e.isActive('italic'),
    apply: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    key: 'strike',
    label: 'S',
    getTitle: () => t('inline.strike'),
    isActive: (e) => e.isActive('strike'),
    apply: (e) => e.chain().focus().toggleStrike().run(),
  },
  {
    key: 'code',
    label: '<>',
    getTitle: () => t('inline.code'),
    isActive: (e) => e.isActive('code'),
    apply: (e) => e.chain().focus().toggleCode().run(),
  },
];

export interface BubbleMenuFactory {
  /** 占位扩展（保持调用方接口兼容） */
  extension: Extension;
  element: HTMLElement;
  bind(editor: Editor): void;
  /** 在屏幕坐标处显示编辑栏 */
  showAt(x: number, y: number): void;
  hide(): void;
  destroy(): void;
}

export function createBubbleMenu(): BubbleMenuFactory {
  const element = document.createElement('div');
  element.className = 'bubble-menu';
  element.style.display = 'none';
  element.style.position = 'fixed';
  element.style.zIndex = '1500';

  const typeWrap = document.createElement('div');
  typeWrap.className = 'bubble-group bubble-group-type';
  const typeBtn = document.createElement('button');
  typeBtn.type = 'button';
  typeBtn.className = 'bubble-btn bubble-type-btn';
  typeBtn.title = t('bubble.typeBtnTitle');
  typeBtn.innerHTML =
    `<span class="bubble-type-label">${t('block.paragraph')}</span>` +
    `<span class="bubble-caret">▾</span>`;
  const typeMenu = document.createElement('div');
  typeMenu.className = 'bubble-type-menu';
  typeMenu.style.display = 'none';
  typeWrap.append(typeBtn, typeMenu);

  const inlineWrap = document.createElement('div');
  inlineWrap.className = 'bubble-group bubble-group-inline';

  // 对齐组：当前对齐图标 + 下拉菜单（左/居中/右）
  const alignWrap = document.createElement('div');
  alignWrap.className = 'bubble-group bubble-group-align';
  const alignBtn = document.createElement('button');
  alignBtn.type = 'button';
  alignBtn.className = 'bubble-btn bubble-align-btn';
  alignBtn.title = t('bubble.alignTitle');
  alignBtn.innerHTML =
    `<span class="bubble-align-icon" data-align="left">${ALIGN_ICONS.left}</span>` +
    `<span class="bubble-caret">▾</span>`;
  const alignMenu = document.createElement('div');
  alignMenu.className = 'bubble-align-menu';
  alignMenu.style.display = 'none';
  alignWrap.append(alignBtn, alignMenu);

  // 颜色组：调色按钮 + 弹出色板
  const colorWrap = document.createElement('div');
  colorWrap.className = 'bubble-group bubble-group-color';
  const colorBtn = document.createElement('button');
  colorBtn.type = 'button';
  colorBtn.className = 'bubble-btn bubble-color-btn';
  colorBtn.title = t('bubble.colorTitle');
  colorBtn.innerHTML =
    `<span class="bubble-color-letter">A</span>` +
    `<span class="bubble-color-bar"></span>` +
    `<span class="bubble-caret">▾</span>`;
  const colorPanel = document.createElement('div');
  colorPanel.className = 'bubble-color-panel';
  colorPanel.style.display = 'none';
  colorWrap.append(colorBtn, colorPanel);

  element.append(typeWrap, alignWrap, inlineWrap, colorWrap);
  document.body.appendChild(element);

  const typeItemEls: { item: BlockTypeItem; el: HTMLElement }[] = [];
  const inlineItemEls: { item: InlineItem; el: HTMLElement }[] = [];

  let editorRef: Editor | null = null;
  let visible = false;
  let typeMenuOpen = false;
  let alignMenuOpen = false;

  const closeTypeMenu = () => {
    typeMenuOpen = false;
    typeMenu.style.display = 'none';
  };
  const openTypeMenu = () => {
    typeMenuOpen = true;
    typeMenu.style.display = '';
    refreshActive();
  };

  typeBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeBtn.disabled) return;
    if (typeMenuOpen) closeTypeMenu();
    else openTypeMenu();
  });

  // ===== 对齐下拉 =====
  const closeAlignMenu = () => {
    alignMenuOpen = false;
    alignMenu.style.display = 'none';
  };
  function buildAlignMenu() {
    alignMenu.innerHTML = '';
    for (const it of ALIGNS) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'bubble-align-item';
      el.dataset.align = it.key;
      el.innerHTML =
        `<span class="bubble-align-icon">${ALIGN_ICONS[it.key]}</span>` +
        `<span class="bubble-align-label">${it.getLabel()}</span>`;
      const cur = currentAlign();
      if (cur === it.key) el.classList.add('is-active');
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!editorRef) return;
        editorRef.chain().focus().setTextAlign(it.key).run();
        closeAlignMenu();
        refreshActive();
      });
      alignMenu.appendChild(el);
    }
  }
  alignBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (alignMenuOpen) {
      closeAlignMenu();
      return;
    }
    closeTypeMenu();
    closeColorPanel();
    buildAlignMenu();
    alignMenuOpen = true;
    alignMenu.style.display = '';
  });

  function currentAlign(): 'left' | 'center' | 'right' {
    if (!editorRef) return 'left';
    if (editorRef.isActive({ textAlign: 'center' })) return 'center';
    if (editorRef.isActive({ textAlign: 'right' })) return 'right';
    return 'left';
  }

  // ===== 颜色面板 =====
  const COLOR_SWATCHES: { name: string; value: string | null }[] = [
    { name: 'default', value: null },
    { name: 'red', value: '#e03131' },
    { name: 'orange', value: '#f08c00' },
    { name: 'yellow', value: '#f59f00' },
    { name: 'green', value: '#2f9e44' },
    { name: 'teal', value: '#0ca678' },
    { name: 'blue', value: '#1971c2' },
    { name: 'indigo', value: '#4263eb' },
    { name: 'violet', value: '#7048e8' },
    { name: 'pink', value: '#d6336c' },
    { name: 'gray', value: '#868e96' },
    { name: 'black', value: '#000000' },
  ];
  let colorPanelOpen = false;
  const closeColorPanel = () => {
    colorPanelOpen = false;
    colorPanel.style.display = 'none';
  };
  function buildColorPanel() {
    if (!editorRef) return;
    colorPanel.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'bubble-color-grid';
    for (const sw of COLOR_SWATCHES) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'bubble-color-swatch';
      if (sw.value) {
        el.style.background = sw.value;
        el.title = sw.value;
      } else {
        el.classList.add('is-default');
        el.title = t('bubble.colorClear');
      }
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!editorRef) return;
        if (sw.value) {
          editorRef.chain().focus().setColor(sw.value).run();
        } else {
          editorRef.chain().focus().unsetColor().run();
        }
        closeColorPanel();
        refreshActive();
      });
      grid.appendChild(el);
    }
    colorPanel.appendChild(grid);

    // 自定义颜色（原生 color input）
    const customRow = document.createElement('div');
    customRow.className = 'bubble-color-custom';
    const labelEl = document.createElement('label');
    labelEl.textContent = t('bubble.colorCustom');
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'bubble-color-input';
    const cur = editorRef.getAttributes('textStyle')?.color;
    if (cur && /^#[0-9a-f]{6}$/i.test(cur)) colorInput.value = cur;
    colorInput.addEventListener('input', () => {
      if (!editorRef) return;
      editorRef.chain().focus().setColor(colorInput.value).run();
      refreshActive();
    });
    // 阻止 mousedown 冒泡导致面板关闭
    colorInput.addEventListener('mousedown', (e) => e.stopPropagation());
    customRow.append(labelEl, colorInput);
    colorPanel.appendChild(customRow);
  }
  colorBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (colorPanelOpen) {
      closeColorPanel();
      return;
    }
    closeTypeMenu();
    closeAlignMenu();
    buildColorPanel();
    colorPanelOpen = true;
    colorPanel.style.display = '';
  });

  function buildItems(editor: Editor) {
    typeMenu.innerHTML = '';
    typeItemEls.length = 0;
    for (const item of BLOCK_TYPES) {
      if (item.separatorBefore) {
        const sep = document.createElement('div');
        sep.className = 'bubble-type-sep';
        typeMenu.appendChild(sep);
      }
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'bubble-type-item';
      el.textContent = item.getLabel();
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        item.apply(editor);
        closeTypeMenu();
        hide();
      });
      typeMenu.appendChild(el);
      typeItemEls.push({ item, el });
    }

    inlineWrap.innerHTML = '';
    inlineItemEls.length = 0;
    for (const item of INLINES) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'bubble-btn bubble-inline-btn';
      el.title = item.getTitle();
      el.textContent = item.label;
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        item.apply(editor);
        refreshActive();
      });
      inlineWrap.appendChild(el);
      inlineItemEls.push({ item, el });
    }
  }

  function refreshActive() {
    if (!editorRef) return;
    // 表格内禁止切换块类型（GFM 单元格不允许 heading / list / quote / codeBlock 等块），
    // 把"块类型"按钮置灰禁用；若菜单正打开则强制关闭。
    const inTable = editorRef.isActive('table');
    typeBtn.disabled = inTable;
    typeBtn.classList.toggle('is-disabled', inTable);
    typeBtn.title = inTable ? t('bubble.typeBtnDisabledInTable') : t('bubble.typeBtnTitle');
    if (inTable && typeMenuOpen) closeTypeMenu();

    let activeLabel = t('block.paragraph');
    for (const { item, el } of typeItemEls) {
      const active = item.isActive ? item.isActive(editorRef) : false;
      el.classList.toggle('is-active', active);
      if (active) activeLabel = item.getLabel();
    }
    const labelEl = typeBtn.querySelector('.bubble-type-label');
    if (labelEl) labelEl.textContent = activeLabel;
    for (const { item, el } of inlineItemEls) {
      el.classList.toggle('is-active', item.isActive(editorRef));
    }
    // 同步颜色指示条
    const cur = editorRef.getAttributes('textStyle')?.color;
    const bar = colorBtn.querySelector('.bubble-color-bar') as HTMLElement | null;
    if (bar) bar.style.background = cur || 'transparent';
    // 同步对齐图标
    const ai = currentAlign();
    const aIcon = alignBtn.querySelector('.bubble-align-icon') as HTMLElement | null;
    if (aIcon) {
      aIcon.dataset.align = ai;
      aIcon.innerHTML = ALIGN_ICONS[ai];
    }
  }

  /**
   * 在选区错位上方弹出。(x, y) 为选区“锔点”（处于选区顶部平均 x，
   * top 为选区顶部 y）。实际位置在该点上方；如上方放不下则下移。
   * 四边超出视口 8px 边距时自动裁切。
   */
  function showAt(x: number, y: number) {
    if (!editorRef) return;
    const sel = editorRef.state.selection;
    if (sel.empty) return;
    if (editorRef.isActive('latexBlock') || editorRef.isActive('mermaidBlock')) return;

    visible = true;
    closeTypeMenu();
    refreshActive();
    element.style.display = '';
    // 先上屏再量尺寸，避免初始 0 宽高造成偏移
    element.style.left = '0px';
    element.style.top = '0px';
    requestAnimationFrame(() => {
      const r = element.getBoundingClientRect();
      const margin = 8;
      let nx = Math.round(x - r.width / 2);
      let ny = Math.round(y - r.height - margin);
      // 上方放不下 → 改放下方（距选区顶 ~24px，避开光标）
      if (ny < margin) ny = Math.round(y + 24);
      // 水平裁切
      if (nx < margin) nx = margin;
      if (nx + r.width > window.innerWidth - margin) {
        nx = Math.max(margin, window.innerWidth - r.width - margin);
      }
      // 垂直裁切兼顾下边界
      if (ny + r.height > window.innerHeight - margin) {
        ny = Math.max(margin, window.innerHeight - r.height - margin);
      }
      element.style.left = `${nx}px`;
      element.style.top = `${ny}px`;
    });
  }

  /** 根据当前选区自动计算坐标并弹出 */
  function showAtSelection() {
    if (!editorRef) return;
    const sel = editorRef.state.selection;
    if (sel.empty) return;
    if (editorRef.isActive('latexBlock') || editorRef.isActive('mermaidBlock')) return;
    let startC: { left: number; top: number; right: number; bottom: number };
    let endC: { left: number; top: number; right: number; bottom: number };
    try {
      startC = editorRef.view.coordsAtPos(sel.from);
      endC = editorRef.view.coordsAtPos(sel.to);
    } catch {
      return;
    }
    const cx = (startC.left + endC.left) / 2;
    const cy = startC.top;
    showAt(cx, cy);
  }

  function hide() {
    if (!visible) return;
    visible = false;
    closeTypeMenu();
    closeAlignMenu();
    closeColorPanel();
    element.style.display = 'none';
  }

  // 拖选期间不弹，抬鼠标后才评估
  let isMouseDown = false;
  let pendingAutoShow = false;

  function scheduleAutoShow() {
    if (isMouseDown) {
      pendingAutoShow = true;
      return;
    }
    if (!editorRef) return;
    if (editorRef.state.selection.empty) {
      hide();
      return;
    }
    if (editorRef.isActive('latexBlock') || editorRef.isActive('mermaidBlock')) {
      hide();
      return;
    }
    showAtSelection();
  }

  document.addEventListener('mousedown', (e) => {
    // 点击编辑栏内部 → 不作为“点外隐藏”也不作为选区拖动
    if (element.contains(e.target as Node)) return;
    isMouseDown = true;
    if (visible) hide();
  });
  document.addEventListener('mouseup', () => {
    if (!isMouseDown) return;
    isMouseDown = false;
    if (pendingAutoShow) {
      pendingAutoShow = false;
      // 让 PM 先提交 selectionUpdate
      setTimeout(scheduleAutoShow, 0);
    } else {
      // 点击空白处释放：如果选区仍非空（如 shift+click）也试着弹
      setTimeout(scheduleAutoShow, 0);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (visible && e.key === 'Escape') {
      e.stopPropagation();
      hide();
    }
  });
  window.addEventListener('resize', hide);
  window.addEventListener('scroll', () => hide(), true);

  const offLocale = onLocaleChange(() => {
    typeBtn.title = t('bubble.typeBtnTitle');
    if (editorRef) {
      buildItems(editorRef);
      refreshActive();
    }
  });

  // 占位扩展：保留旧契约，但不再注入插件
  const extension = Extension.create({ name: 'mgEditToolbarPlaceholder' });

  return {
    extension,
    element,
    bind(editor: Editor) {
      editorRef = editor;
      buildItems(editor);
      editor.on('selectionUpdate', () => scheduleAutoShow());
      editor.on('blur', () => {
        // 点击到编辑器外部且不是编辑栏 → 隐藏
        setTimeout(() => {
          if (!editorRef) return;
          const active = document.activeElement;
          if (active && element.contains(active)) return;
          hide();
        }, 0);
      });
      refreshActive();
    },
    showAt,
    hide,
    destroy() {
      offLocale();
      element.remove();
    },
  };
}

// ========== 合并辅助 ==========

function mergeSelectionIntoSingleListItem(
  editor: Editor,
  listType: 'bulletList' | 'orderedList',
): void {
  const { state } = editor;
  const { from, to } = state.selection;
  const range = expandToBlockRange(state.doc, from, to);
  if (!range) return;

  const lines = collectInlineLines(state.doc, range.from, range.to);
  if (lines.length === 0) return;

  const schema = state.schema;
  const ListType = schema.nodes[listType];
  const ListItemType = schema.nodes.listItem;
  const ParaType = schema.nodes.paragraph;
  const HardBreakType = schema.nodes.hardBreak;
  if (!ListType || !ListItemType || !ParaType) return;

  const paraContent: PMNode[] = [];
  lines.forEach((line, i) => {
    if (i > 0 && HardBreakType) paraContent.push(HardBreakType.create());
    if (line) paraContent.push(schema.text(line));
  });
  const paragraph = ParaType.create(null, paraContent);
  const listItem = ListItemType.create(null, paragraph);
  const list = ListType.create(null, listItem);

  editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.replaceWith(range.from, range.to, list);
      return true;
    })
    .run();
}

function mergeSelectionIntoCodeBlock(editor: Editor): void {
  const { state } = editor;
  const { from, to } = state.selection;
  const range = expandToBlockRange(state.doc, from, to);
  if (!range) return;

  const lines = collectInlineLines(state.doc, range.from, range.to);
  const text = lines.join('\n');

  const CodeType = state.schema.nodes.codeBlock;
  if (!CodeType) return;
  const node = text
    ? CodeType.create({ language: null }, state.schema.text(text))
    : CodeType.create({ language: null });

  editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.replaceWith(range.from, range.to, node);
      return true;
    })
    .run();
}

function expandToBlockRange(
  doc: PMNode,
  from: number,
  to: number,
): { from: number; to: number } | null {
  const $from = doc.resolve(from);
  const $to = doc.resolve(to);
  if ($from.depth < 1 || $to.depth < 1) return null;
  const start = $from.before(1);
  const end = $to.after(1);
  return { from: start, to: end };
}

function collectInlineLines(doc: PMNode, from: number, to: number): string[] {
  const out: string[] = [];
  doc.nodesBetween(from, to, (node) => {
    const name = node.type.name;
    if (name === 'paragraph' || name === 'heading') {
      out.push(node.textContent);
      return false;
    }
    if (name === 'codeBlock') {
      const txt = node.textContent;
      if (txt) out.push(...txt.split('\n'));
      else out.push('');
      return false;
    }
    if (name === 'latexBlock' || name === 'mermaidBlock') {
      const src = (node.attrs as { src?: string }).src ?? '';
      out.push(src);
      return false;
    }
    if (name === 'horizontalRule') {
      return false;
    }
    return true;
  });
  return out;
}
