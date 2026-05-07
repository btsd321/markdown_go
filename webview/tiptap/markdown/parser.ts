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
import { bridge } from '../../core/bridge';

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
      // 特例：<br> 转为 hardbreak token，确保表格单元格内换行能正确还原
      for (const t of blk.children) {
        if (t.type === 'html_inline') {
          if (/^<br\s*\/?>$/i.test(t.content.trim())) {
            t.type = 'hardbreak';
            t.tag = 'br';
            t.nesting = 0;
            t.content = '';
          } else {
            t.type = 'text';
            t.tag = '';
            t.nesting = 0;
          }
        }
      }
    }
    return true;
  });
}

/**
 * 块级 `<div align="X">...</div>` 或 `<div style="text-align:X">...</div>` 包裹：
 * 将内部内容递归解析为 markdown，并给顶层 paragraph_open / heading_open 添加
 * `data-text-align` 属性，供 token-spec.getAttrs 读取并写回节点 textAlign。
 * 仅支持不嵌套、一个 `<div>` 块一个 `</div>` 块的简单形式。
 */
function divAlignPlugin(md: any): void {
  const OPEN_RE =
    /^<div\s+(?:align\s*=\s*"(left|center|right)"|style\s*=\s*"[^"]*text-align\s*:\s*(left|center|right)[^"]*")\s*>\s*$/i;
  const CLOSE_RE = /^<\/div>\s*$/i;
  md.block.ruler.before(
    'fence',
    'div_align',
    function divAlign(state: any, startLine: number, endLine: number, silent: boolean) {
      const start = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];
      const line = state.src.slice(start, max);
      const m = OPEN_RE.exec(line);
      if (!m) return false;
      if (silent) return true;
      const align = (m[1] || m[2] || 'left').toLowerCase();

      // 寻找匹配的 </div> 行（不支持嵌套）
      let endLineIdx = -1;
      for (let i = startLine + 1; i < endLine; i++) {
        const ls = state.bMarks[i] + state.tShift[i];
        const le = state.eMarks[i];
        if (CLOSE_RE.test(state.src.slice(ls, le))) {
          endLineIdx = i;
          break;
        }
      }
      if (endLineIdx === -1) return false;

      // 提取内部原文 (startLine+1 .. endLineIdx)
      const innerSrc = state.getLines(startLine + 1, endLineIdx, 0, false);

      // 递归解析块级内容
      const innerTokens: any[] = [];
      state.md.block.parse(innerSrc, state.md, state.env, innerTokens);

      // 为顶层 paragraph_open / heading_open 设置对齐属性
      let depth = 0;
      for (const tok of innerTokens) {
        if (depth === 0 && (tok.type === 'paragraph_open' || tok.type === 'heading_open')) {
          if (typeof tok.attrSet === 'function') tok.attrSet('data-text-align', align);
          else {
            tok.attrs = tok.attrs || [];
            tok.attrs.push(['data-text-align', align]);
          }
        }
        if (tok.nesting === 1) depth++;
        else if (tok.nesting === -1) depth--;
        state.tokens.push(tok);
      }

      state.line = endLineIdx + 1;
      return true;
    },
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] },
  );
}

/**
 * 块级 `<video ...></video>` / `<video ... />` / `<iframe ...></iframe>` 单标签写法
 * → 自定义 video_block token，attrs: kind / src / title / width / height
 *
 * 仅识别 "整行" 的 HTML 标签（与 div_align 同样的简单模型，不嵌套不跨复杂结构）。
 */
function videoBlockPlugin(md: any): void {
  const VIDEO_OPEN = /^<video\b([^>]*)>(.*)$/i;
  const VIDEO_SELF_CLOSE = /^<video\b([^>]*)\/>\s*$/i;
  const IFRAME_OPEN = /^<iframe\b([^>]*)>(.*)$/i;
  const IFRAME_SELF_CLOSE = /^<iframe\b([^>]*)\/>\s*$/i;
  const SOURCE_TAG = /<source\b([^>]*?)\/?>/i;
  const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"|([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*'([^']*)'/g;

  function parseAttrs(s: string): Record<string, string> {
    const out: Record<string, string> = {};
    let m: RegExpExecArray | null;
    ATTR_RE.lastIndex = 0;
    while ((m = ATTR_RE.exec(s)) !== null) {
      const k = (m[1] || m[3] || '').toLowerCase();
      const v = m[2] !== undefined ? m[2] : m[4];
      if (k) out[k] = v;
    }
    return out;
  }

  md.block.ruler.before(
    'fence',
    'video_block',
    function videoBlock(state: any, startLine: number, endLine: number, silent: boolean) {
      const start = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];
      const line = state.src.slice(start, max);

      let kind: 'video' | 'iframe' | null = null;
      let attrsStr = '';
      let consumed = startLine + 1;

      // 自闭合
      let m = VIDEO_SELF_CLOSE.exec(line);
      if (m) { kind = 'video'; attrsStr = m[1]; }
      else if ((m = IFRAME_SELF_CLOSE.exec(line))) { kind = 'iframe'; attrsStr = m[1]; }
      else {
        // 寻找开/闭合分行写法：<video ...>...</video> 可能跨多行
        const openMatch = VIDEO_OPEN.exec(line) ? { kind: 'video' as const, re: /<\/video>/i }
          : IFRAME_OPEN.exec(line) ? { kind: 'iframe' as const, re: /<\/iframe>/i }
          : null;
        if (!openMatch) return false;
        kind = openMatch.kind;
        // 在剩余行里继续找闭合
        let collected = line;
        let i = startLine;
        while (i < endLine && !openMatch.re.test(collected)) {
          i++;
          if (i >= endLine) return false;
          const ls = state.bMarks[i] + state.tShift[i];
          const le = state.eMarks[i];
          collected += '\n' + state.src.slice(ls, le);
        }
        consumed = i + 1;
        // 提取属性串：开标签里的属性
        const openTagRe = kind === 'video' ? /^<video\b([^>]*)>/i : /^<iframe\b([^>]*)>/i;
        const om = openTagRe.exec(collected);
        attrsStr = om ? om[1] : '';
        // 若 video 内嵌 source[src]，把 src 写进 attrs
        if (kind === 'video' && !/\bsrc\s*=/i.test(attrsStr)) {
          const sm = SOURCE_TAG.exec(collected);
          if (sm) {
            const sa = parseAttrs(sm[1]);
            if (sa.src) attrsStr += ` src="${sa.src.replace(/"/g, '&quot;')}"`;
          }
        }
      }

      if (silent) return true;

      const attrs = parseAttrs(attrsStr);
      const tok = state.push('video_block', kind === 'video' ? 'video' : 'iframe', 0);
      tok.block = true;
      tok.markup = kind!;
      tok.content = '';
      tok.map = [startLine, consumed];
      tok.info = kind!;
      tok.attrs = [
        ['kind', kind!],
        ['src', attrs.src || ''],
        ['title', attrs.title || ''],
        ['width', attrs.width || ''],
        ['height', attrs.height || ''],
      ];
      state.line = consumed;
      return true;
    },
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] },
  );
}

/**
 * GFM 表格 token 规范化：
 *   markdown-it 的表格 token 流为
 *     table_open
 *       thead_open / tr_open / th_open / inline / th_close / ... / tr_close / thead_close
 *       tbody_open / tr_open / td_open / inline / td_close / ... / tr_close / ... / tbody_close
 *     table_close
 *
 *   而 prosemirror-tables / Tiptap 的结构是 `table > tableRow > (tableHeader|tableCell)`
 *   并要求单元格内是 `block+`（必须是 paragraph 等块）。因此本插件做两件事：
 *     1) 删除 thead_open / thead_close / tbody_open / tbody_close（直接拍平）
 *     2) 把 th/td 单元格内"裸 inline"包成 paragraph_open + inline + paragraph_close
 *     3) 从 th/td 的 style="text-align:..." 提取 align 写到自定义 attrs（供 token-spec 读取）
 */
function tableNormalizePlugin(md: any): void {
  md.core.ruler.after('block', 'table_normalize', (state: any) => {
    const src = state.tokens;
    const out: any[] = [];
    for (let i = 0; i < src.length; i++) {
      const t = src[i];
      // 拍平 thead/tbody
      if (
        t.type === 'thead_open' || t.type === 'thead_close' ||
        t.type === 'tbody_open' || t.type === 'tbody_close'
      ) continue;

      // 提取 align（来自 style="text-align:left|center|right"）
      if (t.type === 'th_open' || t.type === 'td_open') {
        const style = (typeof t.attrGet === 'function' ? t.attrGet('style') : null) || '';
        const m = /text-align\s*:\s*(left|center|right)/i.exec(style);
        if (m) {
          if (typeof t.attrSet === 'function') t.attrSet('data-align', m[1].toLowerCase());
          else {
            t.attrs = t.attrs || [];
            t.attrs.push(['data-align', m[1].toLowerCase()]);
          }
        }
      }

      out.push(t);

      // 在 th_open / td_open 之后插入 paragraph_open；遇到对应 close 之前插入 paragraph_close
      if (t.type === 'th_open' || t.type === 'td_open') {
        const pOpen = new state.Token('paragraph_open', 'p', 1);
        pOpen.block = true;
        pOpen.hidden = true; // 不影响输出但保留语义
        out.push(pOpen);
      }
      // 处理 close 在下一轮：如果下一个是 th_close / td_close，则在 push 之前补一个 paragraph_close
      const nxt = src[i + 1];
      if (
        (t.type === 'inline' || t.type === 'th_open' || t.type === 'td_open') &&
        nxt && (nxt.type === 'th_close' || nxt.type === 'td_close')
      ) {
        const pClose = new state.Token('paragraph_close', 'p', -1);
        pClose.block = true;
        pClose.hidden = true;
        out.push(pClose);
      }
    }
    state.tokens = out;
    return true;
  });
}

/**
 * 表格单元格内的 `<div align="X">…</div>` → 对应 paragraph_open 加 `data-text-align`
 *
 * 仅当一个单元格的 inline 内容首尾恰好是 `<div align="X">` / `</div>` 时生效（忽略首尾空白）。
 * 必须在 colorSpanPlugin **之前** 运行（colorSpan 会把未识别的 html_inline 转成纯文本）。
 *
 * 依赖 tableNormalizePlugin 产出的 paragraph_open / paragraph_close 包装。两者都注册在
 * 不同阶段（normalize 在 after('block')，本插件在 after('inline')），运行顺序天然满足。
 */
function tableCellAlignPlugin(md: any): void {
  const OPEN = /^<div\s+align\s*=\s*"(left|center|right)"\s*>$/i;
  const OPEN_SQ = /^<div\s+align\s*=\s*'(left|center|right)'\s*>$/i;
  const CLOSE = /^<\/div>\s*$/i;
  // ⚠️ 必须 `before('color_span')` 而非 `after('inline')`：markdown-it 的 ruler.after 同 anchor
  // 时**后注册的规则反而先执行**，会被 colorSpanPlugin 的 html_inline→text 兜底先吞掉 div。
  md.core.ruler.before('color_span', 'table_cell_align', (state: any) => {
    const toks = state.tokens;
    let cellsScanned = 0;
    let cellsMatched = 0;
    const samples: any[] = [];
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.type !== 'th_open' && t.type !== 'td_open') continue;
      cellsScanned++;
      const pOpen = toks[i + 1];
      const inline = toks[i + 2];
      if (!pOpen || pOpen.type !== 'paragraph_open') {
        if (samples.length < 3) samples.push({ skip: 'no-pOpen', i, after: toks[i + 1]?.type });
        continue;
      }
      if (!inline || inline.type !== 'inline' || !inline.children) {
        if (samples.length < 3) samples.push({ skip: 'no-inline', i, after: toks[i + 2]?.type });
        continue;
      }
      const ch = inline.children;
      // 跳过首尾纯空白文本
      let s = 0, e = ch.length - 1;
      while (s <= e && ch[s].type === 'text' && ch[s].content.trim() === '') s++;
      while (e >= s && ch[e].type === 'text' && ch[e].content.trim() === '') e--;
      if (s >= e) {
        if (samples.length < 3) samples.push({ skip: 'empty-or-single', s, e, n: ch.length });
        continue;
      }
      const first = ch[s];
      const last = ch[e];
      if (first.type !== 'html_inline' || last.type !== 'html_inline') {
        if (samples.length < 3) {
          samples.push({
            skip: 'not-html_inline-pair',
            firstType: first.type, firstContent: first.content,
            lastType: last.type, lastContent: last.content,
            childTypes: ch.map((c: any) => c.type),
          });
        }
        continue;
      }
      const m = OPEN.exec(first.content) || OPEN_SQ.exec(first.content);
      if (!m) {
        if (samples.length < 3) samples.push({ skip: 'open-not-match', content: first.content });
        continue;
      }
      if (!CLOSE.test(last.content)) {
        if (samples.length < 3) samples.push({ skip: 'close-not-match', content: last.content });
        continue;
      }
      const align = m[1].toLowerCase();
      if (typeof pOpen.attrSet === 'function') pOpen.attrSet('data-text-align', align);
      else {
        pOpen.attrs = pOpen.attrs || [];
        pOpen.attrs.push(['data-text-align', align]);
      }
      ch.splice(e, 1);
      ch.splice(s, 1);
      cellsMatched++;
    }
    if (cellsScanned > 0 && cellsMatched > 0) {
      bridge.log('info', '[tableCellAlignPlugin]', { cellsScanned, cellsMatched });
    }
    return true;
  });
}

export function buildMarkdownParser(schema: Schema): MarkdownParser {
  // 启用 inline html，供 color_span 插件识别 <span style="color:...">
  const md = new MarkdownIt('commonmark', { html: true });
  md.enable(['strikethrough', 'table']);
  // 禁用块级 html 解析，避免 html_block token 进入 schema（无对应节点）
  try { md.disable(['html_block']); } catch { /* ignore */ }
  md.use(mathBlockPlugin);
  md.use(mermaidRoutePlugin);
  // colorSpanPlugin 必须先 use（提供 'color_span' anchor），随后 tableCellAlignPlugin 用
  // `before('color_span')` 把自己插到它前面，从而避免被 colorSpan 的 html_inline 兜底吞掉 div。
  md.use(colorSpanPlugin);
  md.use(tableCellAlignPlugin);
  md.use(divAlignPlugin);
  md.use(videoBlockPlugin);
  md.use(tableNormalizePlugin);

  // 完整 token-spec；运行时若 schema 中无对应节点/mark，会被剔除
  const allTokens: Record<string, any> = {
    paragraph: {
      block: 'paragraph',
      getAttrs: (tok: any) => {
        const a = typeof tok.attrGet === 'function' ? tok.attrGet('data-text-align') : null;
        return a ? { textAlign: a } : {};
      },
    },
    heading: {
      block: 'heading',
      getAttrs: (tok: any) => {
        const ret: Record<string, unknown> = { level: Number(tok.tag.slice(1)) };
        const a = typeof tok.attrGet === 'function' ? tok.attrGet('data-text-align') : null;
        if (a) ret.textAlign = a;
        return ret;
      },
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
    video_block: {
      node: 'videoBlock',
      getAttrs: (tok: any) => ({
        kind: tok.attrGet('kind') === 'iframe' ? 'iframe' : 'video',
        src: tok.attrGet('src') || '',
        title: tok.attrGet('title') || null,
        width: tok.attrGet('width') || null,
        height: tok.attrGet('height') || null,
      }),
    },
    image: {
      node: 'image',
      getAttrs: (tok: any) => ({
        src: tok.attrGet('src') || '',
        alt: (tok.children && tok.children[0] && tok.children[0].content) || tok.attrGet('alt') || null,
        title: tok.attrGet('title') || null,
      }),
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
    table: { block: 'table' },
    tr: { block: 'tableRow' },
    th: {
      block: 'tableHeader',
      getAttrs: (tok: any) => {
        const a = typeof tok.attrGet === 'function' ? tok.attrGet('data-align') : null;
        return a ? { align: a } : {};
      },
    },
    td: {
      block: 'tableCell',
      getAttrs: (tok: any) => {
        const a = typeof tok.attrGet === 'function' ? tok.attrGet('data-align') : null;
        return a ? { align: a } : {};
      },
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
