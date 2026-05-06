/**
 * 选区浮动工具栏（BubbleMenu）
 *
 * 功能：
 *   - 块类型下拉：段落 / H1 / H2 / H3 / 无序 / 有序 / 引用 / 代码块
 *   - 内联格式：B / I / S / 行内代码
 *
 * 实现：用 @tiptap/extension-bubble-menu 提供的定位机制，DOM 自定义。
 */
import type { Editor } from '@tiptap/core';
import BubbleMenu from '@tiptap/extension-bubble-menu';
import { t, onLocaleChange } from '../../i18n';

interface BlockTypeItem {
  key: string;
  /** 本地化 label 的接口 */
  getLabel(): string;
  isActive: (e: Editor) => boolean;
  apply: (e: Editor) => void;
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
];

interface InlineItem {
  key: string;
  label: string;
  /** 本地化 title 的接口 */
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
  /** Tiptap 扩展实例（注入到 editor extensions） */
  extension: ReturnType<typeof BubbleMenu.configure>;
  /** DOM 容器（已挂入 document.body） */
  element: HTMLElement;
  /** 在 editor 创建后绑定 */
  bind(editor: Editor): void;
  destroy(): void;
}

export function createBubbleMenu(): BubbleMenuFactory {
  const element = document.createElement('div');
  element.className = 'bubble-menu';
  element.style.display = 'none';
  // 初始 DOM——按钮在 bind() 后才能正确响应
  const typeWrap = document.createElement('div');
  typeWrap.className = 'bubble-group bubble-group-type';
  const typeBtn = document.createElement('button');
  typeBtn.type = 'button';
  typeBtn.className = 'bubble-btn bubble-type-btn';
  typeBtn.title = t('bubble.typeBtnTitle');
  typeBtn.innerHTML = `<span class="bubble-type-label">${t('block.paragraph')}</span><span class="bubble-caret">▾</span>`;
  const typeMenu = document.createElement('div');
  typeMenu.className = 'bubble-type-menu';
  typeMenu.style.display = 'none';
  typeWrap.append(typeBtn, typeMenu);

  const inlineWrap = document.createElement('div');
  inlineWrap.className = 'bubble-group bubble-group-inline';

  element.append(typeWrap, inlineWrap);
  document.body.appendChild(element);

  const typeItemEls: { item: BlockTypeItem; el: HTMLElement }[] = [];
  const inlineItemEls: { item: InlineItem; el: HTMLElement }[] = [];

  let editorRef: Editor | null = null;
  let menuOpen = false;

  const closeTypeMenu = () => {
    menuOpen = false;
    typeMenu.style.display = 'none';
  };
  const openTypeMenu = () => {
    menuOpen = true;
    typeMenu.style.display = '';
    refreshActive();
  };

  typeBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (menuOpen) closeTypeMenu();
    else openTypeMenu();
  });

  // 点击工具栏外关闭 dropdown
  document.addEventListener('mousedown', (e) => {
    if (!menuOpen) return;
    if (element.contains(e.target as Node)) return;
    closeTypeMenu();
  });

  function buildItems(editor: Editor) {
    typeMenu.innerHTML = '';
    typeItemEls.length = 0;
    for (const item of BLOCK_TYPES) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'bubble-type-item';
      el.textContent = item.getLabel();
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        item.apply(editor);
        closeTypeMenu();
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
    let activeLabel = t('block.paragraph');
    for (const { item, el } of typeItemEls) {
      const active = item.isActive(editorRef);
      el.classList.toggle('is-active', active);
      if (active) activeLabel = item.getLabel();
    }
    const labelEl = typeBtn.querySelector('.bubble-type-label');
    if (labelEl) labelEl.textContent = activeLabel;
    for (const { item, el } of inlineItemEls) {
      el.classList.toggle('is-active', item.isActive(editorRef));
    }
  }

  // 语言切换：重建项 + 刷新高亮 + 同步 typeBtn title
  const offLocale = onLocaleChange(() => {
    typeBtn.title = t('bubble.typeBtnTitle');
    if (editorRef) {
      buildItems(editorRef);
      refreshActive();
    }
  });

  const extension = BubbleMenu.configure({
    element,
    pluginKey: 'mg-bubble-menu',
    tippyOptions: {
      duration: 100,
      placement: 'top',
    },
    shouldShow: ({ editor, state, from, to }) => {
      // 仅在有非空选区时显示；选中 atom 节点时不显示（latex/mermaid 双击编辑）
      if (from === to) return false;
      if (editor.isActive('latexBlock') || editor.isActive('mermaidBlock')) return false;
      // 选区跨度 > 0 但全是 atom 节点也跳过
      const slice = state.doc.cut(from, to);
      if (slice.content.size === 0) return false;
      return true;
    },
  });

  return {
    extension,
    element,
    bind(editor: Editor) {
      editorRef = editor;
      buildItems(editor);
      editor.on('selectionUpdate', refreshActive);
      editor.on('transaction', refreshActive);
      refreshActive();
    },
    destroy() {
      offLocale();
      element.remove();
    },
  };
}
