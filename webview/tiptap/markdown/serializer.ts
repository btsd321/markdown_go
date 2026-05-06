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

  /** \u5982\u679c\u8282\u70b9\u542b\u975e\u9ed8\u8ba4 textAlign\uff0c\u5219\u7528 `<div align="X">...</div>` \u5305\u88f9\u8f93\u51fa */
  const wrapAlign = (state: any, node: any, render: () => void) => {
    const align = node.attrs?.textAlign;
    if (!align || align === 'left') {
      render();
      return;
    }
    state.write(`<div align="${align}">`);
    state.closeBlock(node);
    render();
    state.write('</div>');
    state.closeBlock(node);
  };

  const nodes: Record<string, any> = {
    paragraph: (state: any, node: any, parent: any, index: number) => {
      wrapAlign(state, node, () => def.nodes.paragraph(state, node, parent, index));
    },
    heading: (state: any, node: any, parent: any, index: number) => {
      wrapAlign(state, node, () => def.nodes.heading(state, node, parent, index));
    },
    blockquote: def.nodes.blockquote,
    horizontal_rule: def.nodes.horizontal_rule,
    hard_break: def.nodes.hard_break,
    text: def.nodes.text,
  };

  // Tiptap 节点用 camelCase 名字，prosemirror-markdown 默认是 snake_case。
  // bulletList / orderedList 需要自定义：
  //   1. bullet 标记用 "-" 而非默认 "*"（与 markdown-it parse 出来的更对齐）
  //   2. Tiptap schema 没有 tight 属性 → 通过 options.tightLists=true 让列表紧凑
  if (schema.nodes.bulletList) {
    nodes.bulletList = (state: any, node: any) => {
      state.renderList(node, '  ', () => '- ');
    };
  }
  if (schema.nodes.orderedList) {
    nodes.orderedList = (state: any, node: any) => {
      const start = node.attrs.start || 1;
      const maxW = String(start + node.childCount - 1).length;
      const space = state.repeat(' ', maxW + 2);
      state.renderList(node, space, (i: number) => {
        const nStr = String(start + i);
        return state.repeat(' ', maxW - nStr.length) + nStr + '. ';
      });
    };
  }
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

  if (schema.nodes.videoBlock) {
    nodes.videoBlock = (state: any, node: any) => {
      const src = String(node.attrs.src || '');
      const kind = node.attrs.kind === 'iframe' ? 'iframe' : 'video';
      const title = node.attrs.title ? ` title="${String(node.attrs.title).replace(/"/g, '&quot;')}"` : '';
      const width = node.attrs.width ? ` width="${node.attrs.width}"` : '';
      const height = node.attrs.height ? ` height="${node.attrs.height}"` : '';
      const safeSrc = src.replace(/"/g, '&quot;');
      if (kind === 'iframe') {
        state.write(`<iframe src="${safeSrc}"${title}${width}${height} frameborder="0" allowfullscreen></iframe>`);
      } else {
        state.write(`<video src="${safeSrc}"${title}${width}${height} controls></video>`);
      }
      state.closeBlock(node);
    };
  }

  if (schema.nodes.image) {
    nodes.image = (state: any, node: any) => {
      const src = node.attrs.src || '';
      const alt = node.attrs.alt || '';
      const title = node.attrs.title || '';
      const escAlt = String(alt).replace(/[\[\]]/g, (m: string) => '\\' + m);
      const escSrc = String(src).replace(/[\(\)\s]/g, (m: string) =>
        m === ' ' ? '%20' : '\\' + m,
      );
      let out = `![${escAlt}](${escSrc}`;
      if (title) out += ` "${String(title).replace(/"/g, '\\"')}"`;
      out += ')';
      state.write(out);
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
    // 文本颜色：textStyle 携带 color 属性 → 写为内联 HTML <span>
    // 没有 color 属性的 textStyle 标记不输出任何包裹符号
    textStyle: {
      open: (_state: any, mark: any) =>
        mark.attrs.color ? `<span style="color: ${mark.attrs.color}">` : '',
      close: (_state: any, mark: any) => (mark.attrs.color ? '</span>' : ''),
      mixable: true,
      expelEnclosingWhitespace: true,
    },
  };
  for (const k of Object.keys(marks)) {
    if (!schema.marks[k]) delete marks[k];
  }

  // tightLists 在 prosemirror-markdown 运行时支持（renderList 内读取），
  // 但 d.ts 未暴露 → 用 as any 绕开。
  return new MarkdownSerializer(nodes, marks, { tightLists: true } as any);
}
