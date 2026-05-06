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
import { InsertItem, filterItems } from './insertItems';
import { onLocaleChange } from '../../i18n';
import { t } from '../../i18n';

interface SlashState {
  active: boolean;
  /** trigger 字符在文档中的位置（trigger 本身那一格） */
  from: number;
  /** trigger 之后的查询文本 */
  query: string;
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

  // ----- DOM -----
  const popup = document.createElement('div');
  popup.className = 'slash-menu';
  popup.style.display = 'none';
  document.body.appendChild(popup);

  let editorRef: Editor | null = null;
  let activeIndex = 0;
  let visibleItems: InsertItem[] = [];
  /** 子菜单覆盖列表：非空时 render 走它，忽略 query 过滤 */
  let overrideItems: InsertItem[] | null = null;
  let currentState: SlashState = { active: false, from: 0, query: '' };
  let lastView: EditorView | null = null;

  // 语言切换：若当前菜单打开，重新渲染以使 label 本地化
  const offLocale = onLocaleChange(() => {
    if (currentState.active && lastView) render(currentState, lastView);
  });

  function hide() {
    popup.style.display = 'none';
    visibleItems = [];
    overrideItems = null;
  }

  function render(state: SlashState, view: EditorView) {
    lastView = view;
    if (overrideItems) {
      visibleItems = overrideItems;
    } else {
      visibleItems = filterItems(state.query);
    }
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
    // 返回上一级
    if (item.key === '__back__') {
      overrideItems = null;
      activeIndex = 0;
      if (lastView) render(currentState, lastView);
      return;
    }
    // 子菜单：替换 visibleItems = [back, ...children]，不删 trigger 文本
    if (item.children && item.children.length) {
      const back: InsertItem = {
        key: '__back__',
        label: t('menu.back'),
        keywords: [],
      };
      overrideItems = [back, ...item.children];
      activeIndex = 0;
      if (lastView) render(currentState, lastView);
      return;
    }
    const view = editorRef.view;
    const { from } = currentState;
    const to = view.state.selection.from;
    // 删除 trigger..cursor 文本
    if (to > from) {
      view.dispatch(view.state.tr.delete(from, to));
    }
    // 立即关闭
    hide();
    if (!item.run) return;
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
        const queryChanged = next.query !== currentState.query;
        currentState = next;
        if (!next.active) {
          hide();
          return;
        }
        // query 变化 → 退出子菜单覆盖，回到过滤后的顶级列表
        if (queryChanged) overrideItems = null;
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
      offLocale();
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
