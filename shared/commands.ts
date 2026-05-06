import type { BlockType, Block, LanguageCode } from './types';

/**
 * 命令上下文
 */
export interface CommandContext {
  currentBlockId: string;
  selection?: {
    start: number;
    end: number;
  };
}

/**
 * 命令定义
 */
export interface Command {
  id: string;
  titleKey: string;
  icon?: string;
  group: 'basic' | 'common' | 'heading' | 'system';
  execute(ctx: CommandContext, args?: any): void | Promise<void>;
  isEnabled?(ctx: CommandContext): boolean;
}

/**
 * 块变更类型
 */
export type BlockChange =
  | { kind: 'insert'; block: Block; afterId: string | null }
  | { kind: 'update'; id: string; patch: Partial<Block> }
  | { kind: 'delete'; id: string }
  | { kind: 'transform'; id: string; from: BlockType; to: BlockType };

/**
 * 渲染结果
 */
export interface RenderResult {
  html: string;
  errors?: RenderError[];
}

/**
 * 渲染错误
 */
export interface RenderError {
  message: string;
  line?: number;
}

/**
 * 语言选项
 */
export interface LanguageOption {
  code: LanguageCode;
  label: string;
}
