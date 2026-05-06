/**
 * SlashMenu —— 输入触发字符（默认 "/"）后弹出的快速插入菜单。
 *
 * 实现：自定义 ProseMirror 插件，不依赖 tippy / suggestion。
 *
 * 触发规则：
 *   - 当光标处于段落 / heading 等"文本块"且左侧最近一段以 trigger 开头、不含空格
 *   - state 中保存 { from, query }
 *   - 用 view.coordsAtPos(from) 定位浮窗
 *
 * 交互：
 *   - 上 / 下：选择
 *   - Enter：确认
 *   - Esc：关闭
 *   - 鼠标点击：确认
 *   - 失焦 / 离开 trigger 段：关闭
 *
 * 命令项：
 *   H1/H2/H3、段落、引用、无序、有序、代码块、分割线、LaTeX、Mermaid
 *   选中后：删除 trigger..cursor 文本，再执行对应命令
 */
import type { Editor } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { openPromptDialog } from '../../ui/PromptDialog';

interface SlashState {
  active: boolean;
  /** trigger 字符在文档中的位置（trigger 本身那一格） */
  from: number;
  /** trigger 之后的查询文本 */
  query: string;
}

interface SlashItem {
  key: string;
  label: string;
  hint?: string;
  /** 关键字（用于过滤） */
  keywords: string[];
  /** 已删除 trigger..cursor 后执行 */
  run: (editor: Editor) => unknown | Promise<unknown>;
}

function buildItems(): SlashItem[] {
  return [
    {
      key: 'h1',
      label: '标题 1',
      hint: 'H1',
      keywords: ['h1', 'heading1', '标题', 'biaoti'],
      run: (e) => e.chain().focus().setNode('heading', { level: 1 }).run(),
    },
    {
      key: 'h2',
      label: '标题 2',
      hint: 'H2',
      keywords: ['h2', 'heading2', '标题'],
      run: (e) => e.chain().focus().setNode('heading', { level: 2 }).run(),
    },
    {
      key: 'h3',
      label: '标题 3',
      hint: 'H3',
      keywords: ['h3', 'heading3', '标题'],
      run: (e) => e.chain().focus().setNode('heading', { level: 3 }).run(),
    },
    {
      key: 'p',
      label: '正文段落',
      hint: 'P',
      keywords: ['p', 'paragraph', '段落', 'duanluo'],
      run: (e) => e.chain().focus().setParagraph().run(),
    },
    {
      key: 'ul',
      label: '无序列表',
      hint: '- ',
      keywords: ['ul', 'bullet', '无序', 'list', 'liebiao'],
      run: (e) => e.chain().focus().toggleBulletList().run(),
    },
    {
      key: 'ol',
      label: '有序列表',
      hint: '1.',
      keywords: ['ol', 'order', '有序', 'list'],
      run: (e) => e.chain().focus().toggleOrderedList().run(),
    },
    {
      key: 'quote',
      label: '引用',
      hint: '> ',
      keywords: ['quote', 'blockquote', '引用', 'yinyong'],
      run: (e) => e.chain().focus().toggleBlockquote().run(),
    },
    {
      key: 'code',
      label: '代码块',
      hint: '{ }',
      keywords: ['code', 'codeblock', '代码', 'daima'],
      run: (e) => e.chain().focus().toggleCodeBlock().run(),
    },
    {
      key: 'hr',
      label: '分割线',
      hint: '---',
      keywords: ['hr', 'rule', '分割', 'fenge'],
      run: (e) => e.chain().focus().setHorizontalRule().run(),
    },
    {
      key: 'latex',
      label: 'LaTeX 公式',
      hint: '$$',
      keywords: ['latex', 'math', '公式', 'formula', 'gongshi'],
      run: async (e) => {
        const src = await openPromptDialog({
          title: '插入 LaTeX 公式',
          placeholder: 'E = mc^2',
          confirmLabel: '插入',
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
      label: 'Mermaid 图表',
      hint: '◇',
      keywords: ['mermaid', '图表', 'tubiao', 'diagram', 'flow'],
      run: async (e) => {
        const src = await openPromptDialog({
          title: '插入 Mermaid 图表',
          placeholder: 'graph LR\n  A --> B',
          confirmLabel: '插入',
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

function filterItems(items: SlashItem[], query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((it) => {
    if (it.label.toLowerCase().includes(q)) return true;
    return it.keywords.some((k) => k.toLowerCase().includes(q));
  });
}

export interface SlashMenuOptions {
  trigger: string;
}

export interface SlashMenuController {
  extension: Extension;
  bind(editor: Editor): void;
  setTrigger(trigger: string): void;
  destroy(): void;
}

export function createSlashMenu(opts: SlashMenuOptions): SlashMenuController {
  let trigger = opts.trigger || '/';
  const items = buildItems();

  // ----- DOM -----
  const popup = document.createElement('div');
  popup.className = 'slash-menu';
  popup.style.display = 'none';
  document.body.appendChild(popup);

  let editorRef: Editor | null = null;
  let activeIndex = 0;
  let visibleItems: SlashItem[] = [];
  let currentState: SlashState = { active: false, from: 0, query: '' };

  function hide() {
    popup.style.display = 'none';
    visibleItems = [];
  }

  function render(state: SlashState, view: EditorView) {
    visibleItems = filterItems(items, state.query);
    if (visibleItems.length === 0) {
      hide();
      return;
    }
    if (activeIndex >= visibleItems.length) activeIndex = 0;

    popup.innerHTML = '';
    visibleItems.forEach((it, i) => {
      const el = document.createElement('div');
      el.className = 'slash-item' + (i === activeIndex ? ' is-active' : '');
      el.innerHTML =
        `<span class="slash-item-label">${escapeHTML(it.label)}</span>` +
        (it.hint ? `<span class="slash-item-hint">${escapeHTML(it.hint)}</span>` : '');
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        choose(i);
      });
      el.addEventListener('mouseenter', () => {
        activeIndex = i;
        refreshActive();
      });
      popup.appendChild(el);
    });

    // 定位
    const coords = view.coordsAtPos(state.from);
    popup.style.display = '';
    // 为了能拿到 offsetHeight，先显示再调整
    const top = coords.bottom + 4;
    const left = coords.left;
    popup.style.top = `${Math.round(top)}px`;
    popup.style.left = `${Math.round(left)}px`;

    // 防越界
    requestAnimationFrame(() => {
      const r = popup.getBoundingClientRect();
      if (r.right > window.innerWidth - 8) {
        popup.style.left = `${Math.round(window.innerWidth - r.width - 8)}px`;
      }
      if (r.bottom > window.innerHeight - 8) {
        popup.style.top = `${Math.round(coords.top - r.height - 4)}px`;
      }
    });
  }

  function refreshActive() {
    const els = popup.querySelectorAll('.slash-item');
    els.forEach((el, i) => el.classList.toggle('is-active', i === activeIndex));
  }

  function choose(index: number) {
    if (!editorRef) return;
    const item = visibleItems[index];
    if (!item) return;
    const view = editorRef.view;
    const { from } = currentState;
    const to = view.state.selection.from;
    // 删除 trigger..cursor 文本
    if (to > from) {
      view.dispatch(view.state.tr.delete(from, to));
    }
    // 立即关闭
    hide();
    // 执行命令
    Promise.resolve(item.run(editorRef)).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[slashMenu] run failed', err);
    });
  }

  // ----- Plugin -----
  const pluginKey = new PluginKey<SlashState>('mg-slash-menu');

  function detect(view: EditorView): SlashState {
    const { state } = view;
    const sel = state.selection;
    if (!sel.empty) return { active: false, from: 0, query: '' };
    const $pos = sel.$from;
    // 仅在文本块（非 atom）内触发
    const parent = $pos.parent;
    if (!parent.isTextblock) return { active: false, from: 0, query: '' };
    if (parent.type.name === 'codeBlock') return { active: false, from: 0, query: '' };

    const textBefore = parent.textBetween(0, $pos.parentOffset, undefined, '\u0000');
    // 找最后一个 trigger
    const idx = textBefore.lastIndexOf(trigger);
    if (idx === -1) return { active: false, from: 0, query: '' };
    // trigger 前必须是行首或空白
    const prev = idx === 0 ? '' : textBefore.charAt(idx - 1);
    if (prev && !/\s/.test(prev)) return { active: false, from: 0, query: '' };
    const query = textBefore.slice(idx + trigger.length);
    if (/\s/.test(query)) return { active: false, from: 0, query: '' };
    // 计算 trigger 在文档中的绝对位置
    const triggerDocPos = $pos.start() + idx;
    return { active: true, from: triggerDocPos, query };
  }

  const plugin = new Plugin<SlashState>({
    key: pluginKey,
    state: {
      init: () => ({ active: false, from: 0, query: '' }),
      apply: (_tr, value) => value, // 由 view handler 直接更新
    },
    view: (view) => {
      const update = () => {
        const next = detect(view);
        currentState = next;
        if (!next.active) {
          hide();
          return;
        }
        // 若 query 变了或刚激活，重置高亮到 0
        activeIndex = 0;
        render(next, view);
      };
      const onBlur = () => hide();
      view.dom.addEventListener('blur', onBlur);
      return {
        update,
        destroy: () => {
          view.dom.removeEventListener('blur', onBlur);
          hide();
        },
      };
    },
    props: {
      handleKeyDown(_view, event) {
        if (!currentState.active || visibleItems.length === 0) return false;
        if (event.key === 'ArrowDown') {
          activeIndex = (activeIndex + 1) % visibleItems.length;
          refreshActive();
          return true;
        }
        if (event.key === 'ArrowUp') {
          activeIndex = (activeIndex - 1 + visibleItems.length) % visibleItems.length;
          refreshActive();
          return true;
        }
        if (event.key === 'Enter') {
          choose(activeIndex);
          return true;
        }
        if (event.key === 'Escape') {
          hide();
          currentState = { active: false, from: 0, query: '' };
          return true;
        }
        return false;
      },
    },
  });

  const extension = Extension.create({
    name: 'mgSlashMenu',
    addProseMirrorPlugins() {
      return [plugin];
    },
  });

  return {
    extension,
    bind(editor: Editor) {
      editorRef = editor;
    },
    setTrigger(next: string) {
      if (next && next.length >= 1) trigger = next.slice(0, 4);
    },
    destroy() {
      hide();
      popup.remove();
    },
  };
}

function escapeHTML(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}
