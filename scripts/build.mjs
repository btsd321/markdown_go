// @ts-check
import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';

const watch = process.argv.includes('--watch');
const production = process.argv.includes('--production');

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  external: ['vscode'],
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions} */
const webviewConfig = {
  entryPoints: ['webview/index.ts'],
  bundle: true,
  outfile: 'media/webview.js',
  platform: 'browser',
  target: 'es2022',
  format: 'iife',
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions} */
const webviewCssConfig = {
  entryPoints: ['webview/styles/index.css'],
  bundle: true,
  outfile: 'media/webview.css',
  loader: { '.css': 'css' },
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
};

async function run() {
  copyKatexAssets();
  if (watch) {
    const ctxs = await Promise.all([
      esbuild.context(extensionConfig),
      esbuild.context(webviewConfig),
      esbuild.context(webviewCssConfig),
    ]);
    await Promise.all(ctxs.map((c) => c.watch()));
    console.log('[watch] building...');
  } else {
    await Promise.all([
      esbuild.build(extensionConfig),
      esbuild.build(webviewConfig),
      esbuild.build(webviewCssConfig),
    ]);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * 拷贝 KaTeX CSS 与字体到 media/ 下，供 webview 加载。
 * KaTeX 的 CSS 通过相对路径 `fonts/...` 引用 woff2 字体，必须保留目录结构。
 */
function copyKatexAssets() {
  const src = path.resolve('node_modules/katex/dist');
  const dstDir = path.resolve('media/katex');
  if (!fs.existsSync(src)) {
    console.warn('[build] katex not found, skip copy');
    return;
  }
  fs.mkdirSync(dstDir, { recursive: true });
  fs.copyFileSync(path.join(src, 'katex.min.css'), path.join(dstDir, 'katex.min.css'));
  const fontsSrc = path.join(src, 'fonts');
  const fontsDst = path.join(dstDir, 'fonts');
  fs.mkdirSync(fontsDst, { recursive: true });
  for (const f of fs.readdirSync(fontsSrc)) {
    // 只拷贝 woff2，体积最小且现代浏览器/webview 都支持
    if (f.endsWith('.woff2')) {
      fs.copyFileSync(path.join(fontsSrc, f), path.join(fontsDst, f));
    }
  }
  console.log('[build] copied katex assets to media/katex/');
}
