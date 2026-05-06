/**
 * 图片显示路径解析：保存的 markdown 中可能是相对路径或绝对路径；webview 显示需要转为 webview URI。
 *
 * - http(s):// / data: / vscode-webview:// / vscode-cdn 等远端 → 原样
 * - file:// → 取后面的本地路径，按 webview host 重组
 * - Windows 绝对路径（`c:/...`、`C:\...`）→ 用 baseUri 的 host 拼成 `<host>/c%3A/...`
 * - POSIX 绝对路径（`/usr/...`）→ `<host>/usr/...`
 * - 其他相对路径 → baseUri + 路径（去掉前导 `./`）
 *
 * baseUri 由扩展端在 INIT 时通过 `webview.asWebviewUri(documentDir)` 计算并下发，形如
 *   `https://<host>/<encoded-doc-dir>/`
 * 故 `<host>` 即 baseUri 在第三个 `/` 之前的部分。
 */

let baseUri = '';
let baseHost = ''; // baseUri 的 scheme + host 部分（不含路径），末尾不带 `/`
let documentDir = ''; // 文档所在目录的 fs 路径（原始平台分隔符）

function parseBaseHost(uri: string): string {
  // 形如 https://abc.vscode-cdn.net/foo/bar/  → https://abc.vscode-cdn.net
  const m = /^([a-z][a-z0-9+.-]*:\/\/[^/]+)/i.exec(uri);
  return m ? m[1] : '';
}

export function setImageBaseUri(uri: string | undefined | null): void {
  baseUri = uri || '';
  baseHost = baseUri ? parseBaseHost(baseUri) : '';
}

export function setImageDocumentDir(dir: string | undefined | null): void {
  documentDir = dir || '';
}

export function getImageBaseUri(): string {
  return baseUri;
}

const REMOTE_SCHEME_RE = /^(https?|data|blob|vscode-webview|vscode-resource):/i;
const WIN_ABS_RE = /^([a-zA-Z]):[\\/](.*)$/;

/** 把本地绝对路径（POSIX 或 Windows）拼成 webview 可加载的 URL */
function buildLocalWebviewUrl(absPath: string): string {
  if (!baseHost) return absPath;
  // Windows: `c:/Users/x/y.png` → `c%3A/Users/x/y.png`
  const winMatch = WIN_ABS_RE.exec(absPath);
  let encodedPath: string;
  if (winMatch) {
    const drive = winMatch[1].toLowerCase();
    const rest = winMatch[2].replace(/\\/g, '/');
    encodedPath = `${drive}%3A/${rest.split('/').map(encodeURIComponent).join('/')}`;
  } else if (absPath.startsWith('/')) {
    encodedPath = absPath
      .slice(1)
      .split('/')
      .map(encodeURIComponent)
      .join('/');
  } else {
    return absPath;
  }
  return `${baseHost}/${encodedPath}`;
}

/** 在给定 base 目录上拼接一个可能含 `..` 的相对路径，返回规范化后的绝对 fs 路径。
 *  同时兼容 Windows（`\\`）与 POSIX（`/`）分隔符。 */
function joinAndNormalize(base: string, rel: string): string {
  if (!base) return rel;
  const isWin = /^[a-zA-Z]:[\\/]/.test(base) || base.includes('\\');
  const sep = isWin ? '\\' : '/';
  // 将 base + rel 全部转 POSIX 做规范化计算，完成后再按需转回
  const baseParts = base.replace(/\\/g, '/').replace(/\/+$/, '').split('/');
  const relParts = rel.replace(/\\/g, '/').split('/');
  for (const p of relParts) {
    if (!p || p === '.') continue;
    if (p === '..') {
      if (baseParts.length > 1) baseParts.pop();
    } else {
      baseParts.push(p);
    }
  }
  const joined = baseParts.join('/');
  return isWin ? joined.replace(/\//g, sep) : joined;
}

/** 给定 markdown 中的 src，返回 webview 可加载的显示 URI */
export function resolveImageSrc(src: string): string {
  if (!src) return src;

  // 远端 / 数据 URI → 原样
  if (REMOTE_SCHEME_RE.test(src)) return src;

  // 先 decodeURI，让后续判断与拼接拿到原始路径字符（如 `中文 空格.png`）
  let raw = src;
  try {
    raw = decodeURI(src);
  } catch {
    /* ignore malformed escape */
  }

  // file:// → 取本地路径再按本地处理
  if (/^file:\/\//i.test(raw)) {
    let p = raw.replace(/^file:\/\//i, '');
    if (/^\/[a-zA-Z]:/.test(p)) p = p.slice(1); // file:///c:/... → c:/...
    return buildLocalWebviewUrl(p) || src;
  }

  // Windows 绝对路径
  if (WIN_ABS_RE.test(raw)) {
    return buildLocalWebviewUrl(raw) || src;
  }

  // POSIX 绝对路径
  if (raw.startsWith('/')) {
    return buildLocalWebviewUrl(raw) || src;
  }

  // 其它协议（不在远端白名单里）→ 原样
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return raw;

  // 相对路径：优先在 documentDir 上规范化，生成绝对 fs 路径 → buildLocalWebviewUrl
  if (documentDir) {
    const abs = joinAndNormalize(documentDir, raw);
    const url = buildLocalWebviewUrl(abs);
    if (url) return url;
  }

  // 退路B：拼 baseUri（仅适用于同级/子级路径）
  if (!baseUri) return src;
  const clean = raw.replace(/^\.\//, '');
  return baseUri + clean.split('/').map(encodeURIComponent).join('/');
}

/** 是否为 "已经可被浏览器加载" 的绝对/外部地址（保留兼容旧 import） */
export function isAbsoluteImageSrc(src: string): boolean {
  if (!src) return false;
  if (REMOTE_SCHEME_RE.test(src)) return true;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(src)) return true;
  if (src.startsWith('//')) return true;
  return false;
}

