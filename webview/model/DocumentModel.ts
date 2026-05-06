import { Block, BlockType, BlockChange } from '../../shared/index';

type ChangeHandler = (changes: BlockChange[]) => void;

/**
 * 文档模型 - 管理块级结构
 */
export class DocumentModel {
  private blocks: Block[] = [];
  private blockMap = new Map<string, Block>();
  private changeHandlers: ChangeHandler[] = [];
  private idCounter = 0;

  /**
   * 从 Markdown 文本解析
   *
   * 注意：先把 CRLF / CR 归一化为 LF，否则块内容会残留 \r，
   * 导致后续 toMarkdown 与宿主回灌内容比对失败、引发回环。
   */
  fromMarkdown(text: string): void {
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');
    const newBlocks: Block[] = [];

    // 围栏类型：
    //   - 'mermaid' → ```mermaid ... ```
    //   - 'latex'   → $$ ... $$（独占一行）
    type FenceKind = 'latex' | 'mermaid';
    let fence: FenceKind | null = null;
    let buf: string[] = [];

    const flushFence = () => {
      if (!fence) return;
      newBlocks.push({
        id: this.generateId(),
        type: fence,
        content: buf.join('\n'),
      });
      fence = null;
      buf = [];
    };

    for (const line of lines) {
      const trimmed = line.trim();

      // 已在围栏内：判断是否到达对应的结束标记
      if (fence === 'mermaid') {
        if (trimmed.startsWith('```')) {
          flushFence();
        } else {
          buf.push(line);
        }
        continue;
      }
      if (fence === 'latex') {
        if (trimmed === '$$') {
          flushFence();
        } else {
          buf.push(line);
        }
        continue;
      }

      // 围栏开始：```mermaid
      if (trimmed.startsWith('```')) {
        const lang = trimmed.slice(3).toLowerCase();
        if (lang === 'mermaid') {
          fence = 'mermaid';
          buf = [];
          continue;
        }
        // 其他语言的代码块暂不特殊处理，按普通段落保留
      }

      // 围栏开始：$$（独占一行）
      if (trimmed === '$$') {
        fence = 'latex';
        buf = [];
        continue;
      }

      // 检测标题
      const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const content = headingMatch[2];
        newBlocks.push({
          id: this.generateId(),
          type: `heading-${level}` as BlockType,
          content,
        });
        continue;
      }

      // 无序列表：“- xxx” / “* xxx” / “+ xxx”（允许前导空格）
      const ulMatch = line.match(/^(\s*)([-*+])\s+(.*)$/);
      if (ulMatch) {
        newBlocks.push({
          id: this.generateId(),
          type: 'list-unordered',
          content: ulMatch[3],
        });
        continue;
      }

      // 有序列表：“1. xxx” 原始序号忽略，序列化时重编
      const olMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
      if (olMatch) {
        newBlocks.push({
          id: this.generateId(),
          type: 'list-ordered',
          content: olMatch[3],
        });
        continue;
      }

      // 普通行（包括空行）都作为一个独立的 paragraph 块，
      // 这样源文件中的空行/缩进能被原样保留。
      newBlocks.push({
        id: this.generateId(),
        type: 'paragraph',
        content: line,
      });
    }

    // 文件结尾仍处于未闭合围栏：把已收集内容作为该类型块保留
    if (fence) flushFence();

    // 替换所有块
    this.blocks = newBlocks;
    this.rebuildMap();
  }

  /**
   * 转换为 Markdown 文本
   *
   * 采用"一行一块"策略：直接用单个 \n 拼接所有块，
   * 空 paragraph 输出为空行。源文件与块列表保持 1:1 映射，
   * 不再需要为不同类型块补空行。
   */
  toMarkdown(): string {
    const lines: string[] = [];
    let olCounter = 0; // 连续有序列表项的序号；遇到非 list-ordered 即重置

    for (const block of this.blocks) {
      if (block.type === 'list-ordered') olCounter += 1;
      else olCounter = 0;

      switch (block.type) {
        case 'heading-1':
          lines.push(`# ${block.content}`);
          break;
        case 'heading-2':
          lines.push(`## ${block.content}`);
          break;
        case 'heading-3':
          lines.push(`### ${block.content}`);
          break;
        case 'list-unordered':
          lines.push(`- ${block.content}`);
          break;
        case 'list-ordered':
          lines.push(`${olCounter}. ${block.content}`);
          break;
        case 'latex':
          // 主流（Pandoc / KaTeX / mdmath）写法：$$ ... $$ 围栏
          lines.push('$$');
          for (const l of block.content.split('\n')) lines.push(l);
          lines.push('$$');
          break;
        case 'mermaid':
          lines.push('```mermaid');
          for (const l of block.content.split('\n')) lines.push(l);
          lines.push('```');
          break;
        case 'paragraph':
        default:
          lines.push(block.content);
          break;
      }
    }

    return lines.join('\n');
  }

  /**
   * 获取所有块
   */
  getAllBlocks(): Block[] {
    return [...this.blocks];
  }

  /**
   * 根据 ID 获取块
   */
  getBlock(id: string): Block | undefined {
    return this.blockMap.get(id);
  }

  /**
   * 插入块
   */
  insertBlock(afterId: string | null, block: Block): void {
    if (!block.id) {
      block.id = this.generateId();
    }

    if (afterId === null) {
      this.blocks.unshift(block);
    } else {
      const index = this.blocks.findIndex((b) => b.id === afterId);
      if (index === -1) {
        this.blocks.push(block);
      } else {
        this.blocks.splice(index + 1, 0, block);
      }
    }

    this.blockMap.set(block.id, block);
    this.notifyChange([{ kind: 'insert', block, afterId }]);
  }

  /**
   * 更新块
   */
  updateBlock(id: string, patch: Partial<Block>): void {
    const block = this.blockMap.get(id);
    if (!block) return;

    Object.assign(block, patch);
    this.notifyChange([{ kind: 'update', id, patch }]);
  }

  /**
   * 删除块
   */
  deleteBlock(id: string): void {
    const index = this.blocks.findIndex((b) => b.id === id);
    if (index === -1) return;

    this.blocks.splice(index, 1);
    this.blockMap.delete(id);
    this.notifyChange([{ kind: 'delete', id }]);
  }

  /**
   * 转换块类型
   */
  transformBlock(id: string, newType: BlockType): void {
    const block = this.blockMap.get(id);
    if (!block) return;

    const oldType = block.type;
    block.type = newType;
    this.notifyChange([{ kind: 'transform', id, from: oldType, to: newType }]);
  }

  /**
   * 监听变更
   */
  onChange(handler: ChangeHandler): () => void {
    this.changeHandlers.push(handler);
    return () => {
      const index = this.changeHandlers.indexOf(handler);
      if (index > -1) {
        this.changeHandlers.splice(index, 1);
      }
    };
  }

  private generateId(): string {
    return `block_${++this.idCounter}_${Date.now()}`;
  }

  private rebuildMap(): void {
    this.blockMap.clear();
    for (const block of this.blocks) {
      this.blockMap.set(block.id, block);
    }
  }

  private notifyChange(changes: BlockChange[]): void {
    this.changeHandlers.forEach((handler) => handler(changes));
  }
}
