/**
 * 共享插入项：SlashMenu 与 BlockHandle 公用同一份"可插入的块类型"。
 *
 * - SlashMenu：删除 trigger..cursor 后，在当前块执行 run（如 setNode）
 * - BlockHandle：在目标块**之后**插入空段落、把光标移过去，再执行 run
 *
 * label / hint 通过 i18n 动态本地化；keywords 同时含中英以便搜索。
 */
import type { Editor } from '@tiptap/core';
import { openPromptDialog } from '../../ui/PromptDialog';
import { t } from '../../i18n';

export interface InsertItem {
  key: string;
  label: string;
  hint?: string;
  /** 关键字（用于过滤） */
  keywords: string[];
  /** 执行命令（光标已置于目标块） */
  run: (editor: Editor) => unknown | Promise<unknown>;
}

/** 每次调用返回当前语言下的最新一份列表（label / hint 实时本地化） */
export function getInsertItems(): InsertItem[] {
  return [
    {
      key: 'h1',
      label: t('block.h1'),
      hint: 'H1',
      keywords: ['h1', 'heading1', '标题', 'biaoti'],
      run: (e) => e.chain().focus().setNode('heading', { level: 1 }).run(),
    },
    {
      key: 'h2',
      label: t('block.h2'),
      hint: 'H2',
      keywords: ['h2', 'heading2', '标题'],
      run: (e) => e.chain().focus().setNode('heading', { level: 2 }).run(),
    },
    {
      key: 'h3',
      label: t('block.h3'),
      hint: 'H3',
      keywords: ['h3', 'heading3', '标题'],
      run: (e) => e.chain().focus().setNode('heading', { level: 3 }).run(),
    },
    {
      key: 'p',
      label: t('block.paragraph'),
      hint: 'P',
      keywords: ['p', 'paragraph', '段落', 'duanluo'],
      run: (e) => e.chain().focus().setParagraph().run(),
    },
    {
      key: 'ul',
      label: t('block.ul'),
      hint: '- ',
      keywords: ['ul', 'bullet', '无序', 'list', 'liebiao'],
      run: (e) => e.chain().focus().toggleBulletList().run(),
    },
    {
      key: 'ol',
      label: t('block.ol'),
      hint: '1.',
      keywords: ['ol', 'order', '有序', 'list'],
      run: (e) => e.chain().focus().toggleOrderedList().run(),
    },
    {
      key: 'quote',
      label: t('block.quote'),
      hint: '> ',
      keywords: ['quote', 'blockquote', '引用', 'yinyong'],
      run: (e) => e.chain().focus().toggleBlockquote().run(),
    },
    {
      key: 'code',
      label: t('block.codeBlock'),
      hint: '{ }',
      keywords: ['code', 'codeblock', '代码', 'daima'],
      run: (e) => e.chain().focus().toggleCodeBlock().run(),
    },
    {
      key: 'hr',
      label: t('block.hr'),
      hint: '---',
      keywords: ['hr', 'rule', '分割', 'fenge'],
      run: (e) => e.chain().focus().setHorizontalRule().run(),
    },
    {
      key: 'latex',
      label: t('block.latex'),
      hint: '$$',
      keywords: ['latex', 'math', '公式', 'formula', 'gongshi'],
      run: async (e) => {
        const src = await openPromptDialog({
          title: t('dialog.latex.title'),
          placeholder: t('dialog.latex.placeholder'),
          confirmLabel: t('dialog.confirm'),
        });
        if (src === null || !src.trim()) return;
        e.chain().focus().insertContent({
          type: 'latexBlock',
          attrs: { src: src.trim() },
        }).run();
      },
    },
    {
      key: 'mermaid',
      label: t('block.mermaid'),
      hint: '◇',
      keywords: ['mermaid', '图表', 'tubiao', 'diagram', 'flow'],
      run: async (e) => {
        const src = await openPromptDialog({
          title: t('dialog.mermaid.title'),
          placeholder: t('dialog.mermaid.placeholder'),
          confirmLabel: t('dialog.confirm'),
        });
        if (src === null || !src.trim()) return;
        e.chain().focus().insertContent({
          type: 'mermaidBlock',
          attrs: { src: src.trim() },
        }).run();
      },
    },
  ];
}

export function filterItems(query: string): InsertItem[] {
  const items = getInsertItems();
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((it) => {
    if (it.label.toLowerCase().includes(q)) return true;
    return it.keywords.some((k) => k.toLowerCase().includes(q));
  });
}
