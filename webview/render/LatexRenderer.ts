/**
 * LaTeX (KaTeX) 渲染器
 *
 * 参考 mdmath / vscode-latex 的做法：
 *   - 使用 KaTeX 的 renderToString，displayMode 用于代码块
 *   - throwOnError=false：渲染错误以红色文本形式回显，不打断编辑
 *   - 由 webview 主 HTML 引入 katex.min.css（含字体）
 */
import katex from 'katex';

export interface RenderResult {
  ok: boolean;
  /** 安全的 HTML 字符串（KaTeX 自身保证转义） */
  html: string;
}

export function renderLatexBlock(source: string): RenderResult {
  const code = source.trim();
  if (!code) {
    return { ok: false, html: '<span class="katex-empty">(空公式)</span>' };
  }
  try {
    const html = katex.renderToString(code, {
      displayMode: true,
      throwOnError: false,
      output: 'html',
      strict: 'ignore',
      trust: false,
    });
    return { ok: true, html };
  } catch (err: any) {
    const msg = (err?.message ?? String(err)).replace(/[<>&]/g, (c: string) =>
      c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'
    );
    return { ok: false, html: `LaTeX 错误：${msg}` };
  }
}
