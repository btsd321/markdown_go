/**
 * Markdown 解析器：markdown 文本 → ProseMirror Document
 *
 * 基于 prosemirror-markdown 的 MarkdownParser，绑定到 Tiptap 实例的 schema。
 * 在 CommonMark 之外扩展：
 *   - $$...$$  → latexBlock（atom 节点，src 存 attrs）
 *   - ```mermaid → mermaidBlock（atom 节点，src 存 attrs）
 *   - ```lang   → codeBlock + attrs.language
 *
 * 注：MarkdownIt 用 `any`，回避 prosemirror-markdown 内嵌 @types/markdown-it
 * 与顶层 markdown-it 类型不兼容的问题。
 */
import type { Schema } from '@tiptap/pm/model';
import { MarkdownParser } from 'prosemirror-markdown';
import MarkdownIt from 'markdown-it';

/** 块级 $$...$$ 公式插件 */
function mathBlockPlugin(md: any): void {
  md.block.ruler.before(
    'fence',
    'math_block',
    function mathBlock(state: any, startLine: number, endLine: number, silent: boolean) {
      const startPos = state.bMarks[startLine] + state.tShift[startLine];
      const maxPos = state.eMarks[startLine];
      if (startPos + 2 > maxPos) return false;
      if (state.src.slice(startPos, startPos + 2) !== '$$') return false;
      if (silent) return true;

      const firstLineRest = state.src.slice(startPos + 2, maxPos);
      let nextLine = startLine;
      let content = '';
      let found = false;

      if (firstLineRest.trimEnd().endsWith('$$')) {
        // 单行 $$ x $$
        content = firstLineRest.replace(/\$\$\s*$/, '');
        found = true;
        nextLine = startLine + 1;
      } else {
        const lines: string[] = [];
        if (firstLineRest.trim()) lines.push(firstLineRest);
        for (nextLine = startLine + 1; nextLine < endLine; nextLine++) {
          const lStart = state.bMarks[nextLine] + state.tShift[nextLine];
          const lEnd = state.eMarks[nextLine];
          const lineText = state.src.slice(lStart, lEnd);
          if (lineText.trimEnd().endsWith('$$')) {
            const before = lineText.replace(/\$\$\s*$/, '');
            if (before.trim()) lines.push(before);
            content = lines.join('\n');
            found = true;
            nextLine++;
            break;
          }
          lines.push(lineText);
        }
      }

      if (!found) return false;

      const token = state.push('math_block', 'div', 0);
      token.block = true;
      token.content = content;
      token.map = [startLine, nextLine];
      state.line = nextLine;
      return true;
    },
    { alt: [] }
  );
}

/** 把 fence info=mermaid 的 token 改名为 mermaid_block，方便单独路由 */
function mermaidRoutePlugin(md: any): void {
  md.core.ruler.after('block', 'mermaid_route', (state: any) => {
    for (const t of state.tokens) {
      if (t.type === 'fence' && (t.info || '').trim().toLowerCase() === 'mermaid') {
        t.type = 'mermaid_block';
        t.tag = 'div';
      }
    }
    return true;
  });
}

/**
 * 将 inline html_inline 的 <span style="color: ..."> ... </span> 成对
 * 转成自定义 color_open/color_close token，供 MarkdownParser 映射为 textStyle mark。
 * 仅识别符合 `style` 中 `color: <value>` 的 span，其他 html 保持原状。
 */
function colorSpanPlugin(md: any): void {
  const SPAN_OPEN = /^<span\s+[^>]*style\s*=\s*"[^"]*color\s*:\s*([^";]+)[^"]*"[^>]*>$/i;
  const SPAN_OPEN_SQ = /^<span\s+[^>]*style\s*=\s*'[^']*color\s*:\s*([^';]+)[^']*'[^>]*>$/i;
  const SPAN_CLOSE = /^<\/span>$/i;
  md.core.ruler.after('inline', 'color_span', (state: any) => {
    for (const blk of state.tokens) {
      if (blk.type !== 'inline' || !blk.children) continue;
      const stack: number[] = [];
      for (let i = 0; i < blk.children.length; i++) {
        const t = blk.children[i];
        if (t.type !== 'html_inline') continue;
        const m = SPAN_OPEN.exec(t.content) || SPAN_OPEN_SQ.exec(t.content);
        if (m) {
          t.type = 'color_open';
          t.tag = 'span';
          t.nesting = 1;
          t.attrs = [['color', m[1].trim()]];
          stack.push(i);
          continue;
        }
        if (SPAN_CLOSE.test(t.content) && stack.length) {
          t.type = 'color_close';
          t.tag = 'span';
          t.nesting = -1;
          t.attrs = null;
          stack.pop();
        }
      }
      // 剩余未识别的 html_inline 转为纯文本，避免 PM 解析报 "Token type not supported"
      for (const t of blk.children) {
        if (t.type === 'html_inline') {
          t.type = 'text';
          t.tag = '';
          t.nesting = 0;
        }
      }
    }
    return true;
  });
}

export function buildMarkdownParser(schema: Schema): MarkdownParser {
  // 启用 inline html，供 color_span 插件识别 <span style="color:...">
  const md = new MarkdownIt('commonmark', { html: true });
  md.enable(['strikethrough']);
  // 禁用块级 html 解析，避免 html_block token 进入 schema（无对应节点）
  try { md.disable(['html_block']); } catch { /* ignore */ }
  md.use(mathBlockPlugin);
  md.use(mermaidRoutePlugin);
  md.use(colorSpanPlugin);

  // 完整 token-spec；运行时若 schema 中无对应节点/mark，会被剔除
  const allTokens: Record<string, any> = {
    paragraph: { block: 'paragraph' },
    heading: {
      block: 'heading',
      getAttrs: (tok: any) => ({ level: Number(tok.tag.slice(1)) }),
    },
    bullet_list: { block: 'bulletList' },
    ordered_list: {
      block: 'orderedList',
      getAttrs: (tok: any) => ({ start: Number(tok.attrGet('start')) || 1 }),
    },
    list_item: { block: 'listItem' },
    blockquote: { block: 'blockquote' },
    hr: { node: 'horizontalRule' },
    hardbreak: { node: 'hardBreak' },
    code_block: { block: 'codeBlock', noCloseToken: true },
    fence: {
      block: 'codeBlock',
      getAttrs: (tok: any) => ({ language: (tok.info || '').trim() || null }),
      noCloseToken: true,
    },
    math_block: {
      node: 'latexBlock',
      getAttrs: (tok: any) => ({ src: tok.content }),
    },
    mermaid_block: {
      node: 'mermaidBlock',
      getAttrs: (tok: any) => ({ src: tok.content }),
    },
    em: { mark: 'italic' },
    strong: { mark: 'bold' },
    s: { mark: 'strike' },
    code_inline: { mark: 'code', noCloseToken: true },
    link: {
      mark: 'link',
      getAttrs: (tok: any) => ({
        href: tok.attrGet('href'),
        title: tok.attrGet('title') || null,
      }),
    },
    color: {
      mark: 'textStyle',
      getAttrs: (tok: any) => ({ color: tok.attrGet('color') }),
    },
  };

  const tokens: Record<string, any> = {};
  for (const [k, cfg] of Object.entries(allTokens)) {
    const target: string | undefined = cfg.block || cfg.node || cfg.mark;
    if (!target) continue;
    if (cfg.mark && !schema.marks[target]) continue;
    if ((cfg.block || cfg.node) && !schema.nodes[target]) continue;
    tokens[k] = cfg;
  }

  return new MarkdownParser(schema, md, tokens);
}
