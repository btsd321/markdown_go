/**
 * BlockHandle —— 行首块按钮（鼠标移到块上时显示左侧 "+"）。
 *
 * 实现：ProseMirror Plugin 监听 mousemove，找到光标下的顶层块。
 *   - 浮动 `+` 按钮挂到 document.body
 *   - 点击 `+` 弹出共享 InsertItems 菜单
 *   - 选择项：在当前块**之后**插入空段落，光标移过去，再执行 item.run
 *
 * 不在编辑器内部 DOM 渲染，避免破坏 ProseMirror 节点结构。
 */
import type { Editor } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { getInsertItems, InsertItem } from './insertItems';
import { t, onLocaleChange } from '../../i18n';

/** 根据块节点生成表示标签（对齐老版：H1/H2/H3/T/•/n./>/{ }/—/TeX/Mermaid） */
function blockLabel(node: PMNode): string {
  switch (node.type.name) {
    case 'heading': {
      const level = (node.attrs as { level?: number }).level ?? 1;
      return `H${level}`;
    }
    case 'paragraph': return 'T';
    case 'bulletList': return '•';
    case 'orderedList': return 'n.';
    case 'blockquote': return '>';
    case 'codeBlock': return '{ }';
    case 'horizontalRule': return '—';
    case 'latexBlock': return 'TeX';
    case 'mermaidBlock': return 'Mermaid';
    default: return '+';
  }
}

export interface BlockHandleController {
  extension: Extension;
  bind(editor: Editor): void;
  destroy(): void;
}

export function createBlockHandle(): BlockHandleController {
  // ----- 行首按钮（文本随当前块类型变化） -----
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'mg-block-handle';
  handle.title = t('blockHandle.title');
  handle.textContent = '+';
  handle.style.display = 'none';
  document.body.appendChild(handle);

  // 语言切换 -> 同步按钮 title 与菜单项
  const offLocale = onLocaleChange(() => {
    handle.title = t('blockHandle.title');
    if (menuOpen) {
      menuItems = getInsertItems();
      renderMenu(menuItems);
    }
  });

  // ----- 弹出菜单（独立浮窗，复用 .slash-menu 样式） -----
  const menu = document.createElement('div');
  menu.className = 'slash-menu mg-block-handle-menu';
  menu.style.display = 'none';
  document.body.appendChild(menu);

  let editorRef: Editor | null = null;
  /** 当前 hover 块的起始位置（doc pos）；-1 表示无 */
  let currentBlockPos = -1;
  /** 当前 hover 块的结束位置（用于在其后插入） */
  let currentBlockEnd = -1;
  let menuOpen = false;
  let menuActiveIndex = 0;
  /** 菜单打开期间冻结的 items 快照，避免语言切换中途导致 index 错位 */
  let menuItems: InsertItem[] = [];
  /** 延迟隐藏定时器 —— 给鼠标从编辑器移到 handle 留缓冲 */
  let hideTimer: number | null = null;

  function cancelHide() {
    if (hideTimer !== null) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function scheduleHide(delay = 200) {
    cancelHide();
    hideTimer = window.setTimeout(() => {
      hideTimer = null;
      if (menuOpen) return;
      hideHandle();
    }, delay);
  }

  function hideHandle() {
    handle.style.display = 'none';
    currentBlockPos = -1;
    currentBlockEnd = -1;
  }

  function hideMenu() {
    menu.style.display = 'none';
    menuOpen = false;
  }

  // 鼠标进入按钮/菜单 → 取消隐藏
  handle.addEventListener('mouseenter', cancelHide);
  menu.addEventListener('mouseenter', cancelHide);

  function positionHandle(view: EditorView, blockFrom: number, node: PMNode) {
    try {
      // atom 节点（latexBlock / mermaidBlock / horizontalRule）内部无有效 pos，
      // coordsAtPos 会返回块外缘——直接用 NodeView DOM rect 取垂直中点
      let topY: number;
      let bottomY: number;
      if (node.isAtom || node.type.name === 'latexBlock' || node.type.name === 'mermaidBlock' || node.type.name === 'horizontalRule') {
        const dom = view.nodeDOM(blockFrom) as HTMLElement | null;
        if (dom && typeof dom.getBoundingClientRect === 'function') {
          const r = dom.getBoundingClientRect();
          topY = r.top;
          bottomY = r.bottom;
        } else {
          const c = view.coordsAtPos(blockFrom + 1);
          topY = c.top;
          bottomY = c.bottom;
        }
      } else {
        const coords = view.coordsAtPos(blockFrom + 1);
        topY = coords.top;
        bottomY = coords.bottom;
      }
      const editorRect = view.dom.getBoundingClientRect();
      handle.style.display = '';
      handle.style.position = 'fixed';
      const w = handle.offsetWidth || 24;
      const h = handle.offsetHeight || 22;
      const left = Math.max(4, editorRect.left - w - 6);
      handle.style.left = `${Math.round(left)}px`;
      // 取视觉中点；多行块也对齐到首行附近会更好——这里用首行高度（1.5em ≈ 22px）
      const lineH = Math.min(bottomY - topY, 28);
      handle.style.top = `${Math.round(topY + lineH / 2 - h / 2)}px`;
    } catch {
      hideHandle();
    }
  }

  function findTopBlock(view: EditorView, clientX: number, clientY: number): { from: number; to: number; node: PMNode } | null {
    // 1) 直接命中
    let posInfo = view.posAtCoords({ left: clientX, top: clientY });
    if (!posInfo) {
      // 2) 在编辑器水平范围内、垂直范围内但落在 padding/空白处时，尝试用编辑器 left + 当前 y 命中
      const r = view.dom.getBoundingClientRect();
      if (clientY < r.top || clientY > r.bottom) return null;
      posInfo = view.posAtCoords({ left: r.left + 16, top: clientY });
      if (!posInfo) return null;
    }
    const $pos = view.state.doc.resolve(posInfo.pos);
    if ($pos.depth === 0) {
      // 顶层之间——选中后一个块
      const nodeAfter = view.state.doc.maybeChild($pos.index(0));
      if (!nodeAfter) return null;
      const from = $pos.posAtIndex($pos.index(0));
      return { from, to: from + nodeAfter.nodeSize, node: nodeAfter };
    }
    // 沿着深度回到最外层 block（depth=1）
    const from = $pos.before(1);
    const top = view.state.doc.resolve(from).nodeAfter;
    if (!top) return null;
    return { from, to: from + top.nodeSize, node: top };
  }

  // ----- 菜单渲染 -----
  function renderMenu(items: InsertItem[]) {
    menu.innerHTML = '';
    items.forEach((it, i) => {
      const el = document.createElement('div');
      el.className = 'slash-item' + (i === menuActiveIndex ? ' is-active' : '');
      el.innerHTML =
        `<span class="slash-item-label">${escapeHTML(it.label)}</span>` +
        (it.hint ? `<span class="slash-item-hint">${escapeHTML(it.hint)}</span>` : '');
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        choose(i);
      });
      el.addEventListener('mouseenter', () => {
        menuActiveIndex = i;
        renderMenu(items);
      });
      menu.appendChild(el);
    });
  }

  function openMenuFor(_view: EditorView) {
    if (currentBlockPos < 0) return;
    menuOpen = true;
    menuActiveIndex = 0;
    menuItems = getInsertItems();
    renderMenu(menuItems);
    menu.style.display = '';
    menu.style.position = 'fixed';
    const r = handle.getBoundingClientRect();
    menu.style.left = `${Math.round(r.right + 4)}px`;
    menu.style.top = `${Math.round(r.top)}px`;
    // 防越界
    requestAnimationFrame(() => {
      const mr = menu.getBoundingClientRect();
      if (mr.right > window.innerWidth - 8) {
        menu.style.left = `${Math.round(window.innerWidth - mr.width - 8)}px`;
      }
      if (mr.bottom > window.innerHeight - 8) {
        menu.style.top = `${Math.round(window.innerHeight - mr.height - 8)}px`;
      }
    });
  }

  function choose(index: number) {
    if (!editorRef) return;
    const item = menuItems[index];
    if (!item) return;
    const insertAt = currentBlockEnd;
    hideMenu();
    if (insertAt < 0) return;
    // 1) 在当前块之后插入空段落
    const view = editorRef.view;
    const tr = view.state.tr.insert(
      insertAt,
      view.state.schema.nodes.paragraph.create(),
    );
    // 2) 光标移到新段落里（pos = insertAt + 1）
    view.dispatch(tr);
    editorRef.commands.focus(insertAt + 1);
    // 3) 执行 item.run
    Promise.resolve(item.run(editorRef)).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[blockHandle] run failed', err);
    });
  }

  // ----- "+" 点击 -----
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editorRef) return;
    if (menuOpen) hideMenu();
    else openMenuFor(editorRef.view);
  });

  // 点击外部关闭菜单
  document.addEventListener('mousedown', (e) => {
    if (!menuOpen) return;
    const t = e.target as Node;
    if (menu.contains(t) || handle.contains(t)) return;
    hideMenu();
  });

  // ----- ProseMirror Plugin -----
  const pluginKey = new PluginKey('mg-block-handle');
  const plugin = new Plugin({
    key: pluginKey,
    view: (view) => {
      const onMove = (e: MouseEvent) => {
        if (menuOpen) return; // 菜单打开时锁定
        cancelHide();
        const found = findTopBlock(view, e.clientX, e.clientY);
        if (!found) {
          scheduleHide();
          return;
        }
        if (found.from === currentBlockPos) {
          // 块未变——仍需同步一下标签（例如同位置上刚被转为另一种块类型）
          handle.textContent = blockLabel(found.node);
          return;
        }
        currentBlockPos = found.from;
        currentBlockEnd = found.to;
        handle.textContent = blockLabel(found.node);
        positionHandle(view, found.from, found.node);
      };
      const onLeave = (_e: MouseEvent) => {
        if (menuOpen) return;
        // 不立即隐藏 —— 鼠标可能正穿越 editor → handle 之间的空隙
        scheduleHide();
      };
      view.dom.addEventListener('mousemove', onMove);
      view.dom.addEventListener('mouseleave', onLeave);
      return {
        destroy: () => {
          view.dom.removeEventListener('mousemove', onMove);
          view.dom.removeEventListener('mouseleave', onLeave);
          hideHandle();
          hideMenu();
        },
      };
    },
    props: {
      handleKeyDown(_view, event) {
        if (!menuOpen) return false;
        if (event.key === 'ArrowDown') {
          menuActiveIndex = (menuActiveIndex + 1) % menuItems.length;
          renderMenu(menuItems);
          return true;
        }
        if (event.key === 'ArrowUp') {
          menuActiveIndex = (menuActiveIndex - 1 + menuItems.length) % menuItems.length;
          renderMenu(menuItems);
          return true;
        }
        if (event.key === 'Enter') {
          choose(menuActiveIndex);
          return true;
        }
        if (event.key === 'Escape') {
          hideMenu();
          return true;
        }
        return false;
      },
    },
  });

  const extension = Extension.create({
    name: 'mgBlockHandle',
    addProseMirrorPlugins() {
      return [plugin];
    },
  });

  return {
    extension,
    bind(editor: Editor) {
      editorRef = editor;
    },
    destroy() {
      offLocale();
      hideHandle();
      hideMenu();
      handle.remove();
      menu.remove();
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
