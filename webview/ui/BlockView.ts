/**
 * 单个块的 DOM 视图
 *
 * 只关心一个块的 DOM 构造（行首按钮 + contenteditable 内容区），
 * 通过回调把交互事件抛给 Editor。
 */
import { Block } from '../../shared';

/** 行首按钮显示的标签：根据块类型变化 */
function handleLabelOf(type: Block['type']): string {
  switch (type) {
    case 'heading-1':
      return 'H1';
    case 'heading-2':
      return 'H2';
    case 'heading-3':
      return 'H3';
    case 'list-unordered':
      return '•';
    case 'list-ordered':
      return 'n.';
    case 'latex':
      return 'fx';
    case 'mermaid':
      return 'M';
    case 'code':
      return '{ }';
    case 'paragraph':
    default:
      return '+';
  }
}

export interface BlockViewCallbacks {
  onFocus(blockId: string): void;
  /** 内容文本变化（contenteditable input 事件） */
  onInput(blockId: string, text: string): void;
  /** 点击行首 + 按钮 */
  onHandleClick(blockId: string, handle: HTMLElement): void;
  /** 用户请求进入源码编辑（双击预览） */
  onEnterEditing?(blockId: string): void;
  /**
   * 在内容元素上挂事件（键盘、剪贴板等）
   * Editor 通过这个回调把 KeyHandler / Clipboard 注入进来。
   */
  attachContentListeners(blockId: string, content: HTMLElement): void;
}

export interface BlockElement {
  root: HTMLElement;
  content: HTMLElement;
  /** 渲染预览容器（仅对 mermaid/latex 等需要预览的块存在） */
  preview?: HTMLElement;
}

export function renderBlock(block: Block, cb: BlockViewCallbacks): BlockElement {
  const root = document.createElement('div');
  root.className = 'block';
  root.dataset.id = block.id;
  root.dataset.type = block.type;
  const needsPreview = block.type === 'mermaid' || block.type === 'latex' || block.type === 'code';
  if (needsPreview) root.classList.add('has-preview');

  // 行首 + 按钮
  const handle = document.createElement('button');
  handle.className = 'block-handle';
  handle.type = 'button';
  handle.title = '插入块';
  handle.textContent = handleLabelOf(block.type);
  handle.addEventListener('mousedown', (e) => e.preventDefault()); // 不抢焦点
  handle.addEventListener('click', (e) => {
    e.stopPropagation();
    cb.onHandleClick(block.id, handle);
  });
  root.appendChild(handle);

  // 内容
  const content = document.createElement('div');
  content.className = 'block-content';
  content.contentEditable = 'true';
  content.spellcheck = false;
  content.textContent = block.content;

  content.addEventListener('focus', () => cb.onFocus(block.id));
  content.addEventListener('input', () => {
    cb.onInput(block.id, content.textContent || '');
  });

  cb.attachContentListeners(block.id, content);

  root.appendChild(content);

  let preview: HTMLElement | undefined;
  if (needsPreview) {
    preview = document.createElement('div');
    preview.className = 'block-preview';
    preview.title = '双击编辑源码';
    // 单击：仅激活块（显示 + 按钮），不抢焦点、不进入编辑
    preview.addEventListener('mousedown', (e) => {
      e.preventDefault();
      cb.onFocus(block.id);
    });
    // 双击：进入源码编辑模式
    preview.addEventListener('dblclick', () => {
      cb.onEnterEditing?.(block.id);
    });
    root.appendChild(preview);
  }

  return { root, content, preview };
}
