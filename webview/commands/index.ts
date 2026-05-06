import { BlockType } from '../../shared';
import { DocumentModel } from '../model/DocumentModel';
import { commandRegistry } from '../core/CommandRegistry';

/**
 * 注册所有内置命令
 */
export function registerBuiltinCommands(model: DocumentModel) {
  // 插入 H1
  commandRegistry.register({
    id: 'insert.heading.h1',
    titleKey: 'command.insertH1',
    group: 'basic',
    execute: (ctx) => {
      model.transformBlock(ctx.currentBlockId, 'heading-1');
    },
  });

  // 插入 H2
  commandRegistry.register({
    id: 'insert.heading.h2',
    titleKey: 'command.insertH2',
    group: 'basic',
    execute: (ctx) => {
      model.transformBlock(ctx.currentBlockId, 'heading-2');
    },
  });

  // 插入 H3
  commandRegistry.register({
    id: 'insert.heading.h3',
    titleKey: 'command.insertH3',
    group: 'basic',
    execute: (ctx) => {
      model.transformBlock(ctx.currentBlockId, 'heading-3');
    },
  });

  // 转为正文
  commandRegistry.register({
    id: 'transform.toParagraph',
    titleKey: 'command.toParagraph',
    group: 'heading',
    execute: (ctx) => {
      model.transformBlock(ctx.currentBlockId, 'paragraph');
    },
  });

  // 转为标题
  commandRegistry.register({
    id: 'transform.toHeading',
    titleKey: 'command.toHeading',
    group: 'heading',
    execute: (ctx, args) => {
      const level = args?.level || 1;
      const type: BlockType = `heading-${level}` as BlockType;
      model.transformBlock(ctx.currentBlockId, type);
    },
  });

  // 插入 LaTeX
  commandRegistry.register({
    id: 'insert.latex',
    titleKey: 'command.insertLatex',
    group: 'common',
    execute: (ctx) => {
      const block = model.getBlock(ctx.currentBlockId);
      if (block) {
        model.insertBlock(ctx.currentBlockId, {
          id: '',
          type: 'latex',
          content: 'E = mc^2',
        });
      }
    },
  });

  // 插入 Mermaid
  commandRegistry.register({
    id: 'insert.mermaid',
    titleKey: 'command.insertMermaid',
    group: 'common',
    execute: (ctx) => {
      const block = model.getBlock(ctx.currentBlockId);
      if (block) {
        model.insertBlock(ctx.currentBlockId, {
          id: '',
          type: 'mermaid',
          content: 'graph LR\n  A --> B',
        });
      }
    },
  });
}
