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
   */
  fromMarkdown(text: string): void {
    const lines = text.split('\n');
    const newBlocks: Block[] = [];

    let inCodeBlock = false;
    let codeBlockType: 'latex' | 'mermaid' | null = null;
    let codeBlockContent: string[] = [];

    for (const line of lines) {
      // 检测代码块开始/结束
      if (line.trim().startsWith('```')) {
        if (!inCodeBlock) {
          // 开始代码块
          const lang = line.trim().slice(3).toLowerCase();
          if (lang === 'latex' || lang === 'mermaid') {
            inCodeBlock = true;
            codeBlockType = lang;
            codeBlockContent = [];
            continue;
          }
        } else {
          // 结束代码块
          if (codeBlockType) {
            newBlocks.push({
              id: this.generateId(),
              type: codeBlockType,
              content: codeBlockContent.join('\n'),
            });
          }
          inCodeBlock = false;
          codeBlockType = null;
          codeBlockContent = [];
          continue;
        }
      }

      if (inCodeBlock) {
        codeBlockContent.push(line);
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

      // 普通段落
      if (line.trim()) {
        newBlocks.push({
          id: this.generateId(),
          type: 'paragraph',
          content: line,
        });
      }
    }

    // 替换所有块
    this.blocks = newBlocks;
    this.rebuildMap();
  }

  /**
   * 转换为 Markdown 文本
   */
  toMarkdown(): string {
    const lines: string[] = [];

    for (const block of this.blocks) {
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
        case 'latex':
          lines.push('```latex');
          lines.push(block.content);
          lines.push('```');
          break;
        case 'mermaid':
          lines.push('```mermaid');
          lines.push(block.content);
          lines.push('```');
          break;
        case 'paragraph':
          lines.push(block.content);
          break;
      }
      lines.push(''); // 空行分隔
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
