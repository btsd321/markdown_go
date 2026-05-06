/**
 * Mermaid 渲染器
 *
 * 参考 vscode-markdown-mermaid 的做法：
 *   - 懒加载 mermaid，避免冷启动开销
 *   - 跟随 VS Code 主题（dark / high-contrast → dark theme，否则 default）
 *   - 渲染失败时返回错误信息（而非把页面整体抛红）
 */
import type { MermaidConfig } from 'mermaid';

let initialized = false;
let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;
let counter = 0;

function detectTheme(): 'dark' | 'default' {
  const cls = document.body.classList;
  if (cls.contains('vscode-dark') || cls.contains('vscode-high-contrast')) {
    return 'dark';
  }
  return 'default';
}

async function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => m.default);
  }
  const mermaid = await mermaidPromise;
  if (!initialized) {
    const config: MermaidConfig = {
      startOnLoad: false,
      securityLevel: 'strict',
      theme: detectTheme(),
      flowchart: { useMaxWidth: true, htmlLabels: true },
      fontFamily: 'var(--vscode-font-family)',
    };
    mermaid.initialize(config);
    initialized = true;
  }
  return mermaid;
}

/**
 * 把一段 mermaid 源码渲染为 SVG 字符串。
 * 失败时返回 { ok:false, message } 由调用方决定如何展示。
 */
export async function renderMermaid(
  code: string
): Promise<{ ok: true; svg: string } | { ok: false; message: string }> {
  const source = code.trim();
  if (!source) {
    return { ok: false, message: '(空 mermaid 块)' };
  }
  try {
    const mermaid = await loadMermaid();
    const id = `mmd-${Date.now()}-${counter++}`;
    // mermaid.render 在某些版本下要求 DOM 中存在容器；v10 已不再强制
    const { svg } = await mermaid.render(id, source);
    return { ok: true, svg };
  } catch (err: any) {
    return { ok: false, message: err?.message ?? String(err) };
  }
}

/** 主题切换后调用，下次渲染会重新 initialize。 */
export function resetMermaid(): void {
  initialized = false;
}
