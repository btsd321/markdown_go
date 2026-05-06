// @ts-check
import * as esbuild from 'esbuild';

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
