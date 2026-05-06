/**
 * Markdown 序列化器：ProseMirror Document → markdown 文本
 *
 * 复用 prosemirror-markdown 的 defaultMarkdownSerializer 节点 / mark 处理器，
 * 注入自定义节点：codeBlock(language) / latexBlock / mermaidBlock。
 */
import {
  MarkdownSerializer,
  defaultMarkdownSerializer,
} from 'prosemirror-markdown';
import type { Schema } from '@tiptap/pm/model';

export function buildMarkdownSerializer(schema: Schema): MarkdownSerializer {
  const def = defaultMarkdownSerializer;

  const nodes: Record<string, any> = {
    paragraph: def.nodes.paragraph,
    heading: def.nodes.heading,
    blockquote: def.nodes.blockquote,
    horizontal_rule: def.nodes.horizontal_rule,
    hard_break: def.nodes.hard_break,
    text: def.nodes.text,
  };

  // Tiptap 节点用 camelCase 名字，prosemirror-markdown 默认是 snake_case
  if (schema.nodes.bulletList) nodes.bulletList = def.nodes.bullet_list;
  if (schema.nodes.orderedList) nodes.orderedList = def.nodes.ordered_list;
  if (schema.nodes.listItem) nodes.listItem = def.nodes.list_item;
  if (schema.nodes.horizontalRule) nodes.horizontalRule = def.nodes.horizontal_rule;
  if (schema.nodes.hardBreak) nodes.hardBreak = def.nodes.hard_break;

  if (schema.nodes.codeBlock) {
    nodes.codeBlock = (state: any, node: any) => {
      const lang = node.attrs.language || '';
      state.write('```' + lang + '\n');
      state.text(node.textContent, false);
      state.ensureNewLine();
      state.write('```');
      state.closeBlock(node);
    };
  }

  if (schema.nodes.latexBlock) {
    nodes.latexBlock = (state: any, node: any) => {
      const src = (node.attrs.src || '').trim();
      state.write('$$\n');
      state.text(src, false);
      state.ensureNewLine();
      state.write('$$');
      state.closeBlock(node);
    };
  }

  if (schema.nodes.mermaidBlock) {
    nodes.mermaidBlock = (state: any, node: any) => {
      const src = (node.attrs.src || '').trim();
      state.write('```mermaid\n');
      state.text(src, false);
      state.ensureNewLine();
      state.write('```');
      state.closeBlock(node);
    };
  }

  // 删除 schema 中不存在的节点处理器，避免 PM 序列化时找不到
  for (const k of Object.keys(nodes)) {
    if (!schema.nodes[k]) delete nodes[k];
  }

  const marks: Record<string, any> = {
    italic: def.marks.em,
    bold: def.marks.strong,
    code: def.marks.code,
    link: def.marks.link,
    strike: {
      open: '~~',
      close: '~~',
      mixable: true,
      expelEnclosingWhitespace: true,
    },
  };
  for (const k of Object.keys(marks)) {
    if (!schema.marks[k]) delete marks[k];
  }

  return new MarkdownSerializer(nodes, marks);
}
