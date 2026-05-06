import * as vscode from 'vscode';
import * as path from 'path';
import {
  MessageType,
  InitPayload,
  DocSyncPayload,
  DocChangePayload,
  ModeChangePayload,
  LangChangePayload,
  DisplayMode,
  LanguageCode,
  CopyFormat,
  ImagePickResponse,
} from '../../shared';
import { logger } from '../log/logger';

export class MarkdownGoEditorProvider implements vscode.CustomTextEditorProvider {
  private static readonly viewType = 'markdownGo.editor';

  constructor(private readonly context: vscode.ExtensionContext) {}

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new MarkdownGoEditorProvider(context);
    const providerRegistration = vscode.window.registerCustomEditorProvider(
      MarkdownGoEditorProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    );
    return providerRegistration;
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    // 配置 Webview
    const docDir = path.dirname(document.uri.fsPath);
    const docDirUri = vscode.Uri.file(docDir);
    /** 动态 localResourceRoots：以 fsPath 为 key 去重 */
    const resourceRoots = new Map<string, vscode.Uri>();
    const ensureRoot = (uri: vscode.Uri) => {
      const key = uri.fsPath.toLowerCase();
      if (resourceRoots.has(key)) return false;
      resourceRoots.set(key, uri);
      return true;
    };
    for (const u of this.computeLocalResourceRoots(document, docDir)) ensureRoot(u);
    const applyResourceRoots = () => {
      webviewPanel.webview.options = {
        enableScripts: true,
        localResourceRoots: Array.from(resourceRoots.values()),
      };
    };
    applyResourceRoots();
    logger.info(
      `[Provider.localResourceRoots] ${Array.from(resourceRoots.values()).map((u) => u.fsPath).join(' | ')}`,
    );

    /** 扫描 markdown 中的 ![](abs) / <video src=abs> / <source src=abs> / <iframe src=abs>，
     *  把绝对路径资源的所在目录加入 localResourceRoots */
    const scanAndExpandRoots = (text: string) => {
      let changed = false;
      const candidates: string[] = [];
      // 1) ![](src)
      const reImg = /!\[[^\]]*\]\(\s*([^)\s]+)/g;
      let m: RegExpExecArray | null;
      while ((m = reImg.exec(text)) !== null) candidates.push(m[1]);
      // 2) <video src="...">  /  <source src="...">  /  <iframe src="...">
      const reTag = /<(?:video|source|iframe)\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi;
      while ((m = reTag.exec(text)) !== null) candidates.push(m[1]);
      for (const src of candidates) {
        let absPath: string | null = null;
        if (/^[a-zA-Z]:[\\/]/.test(src)) absPath = src; // Windows 绝对
        else if (src.startsWith('/')) absPath = src; // POSIX 绝对
        else if (/^file:\/\//i.test(src)) {
          try { absPath = vscode.Uri.parse(src).fsPath; } catch { /* ignore */ }
        }
        if (!absPath) continue;
        try {
          const dir = vscode.Uri.file(path.dirname(absPath));
          if (ensureRoot(dir)) {
            changed = true;
            logger.info(`[Provider.scan] add localResourceRoot ${dir.fsPath}`);
          }
        } catch { /* ignore */ }
      }
      if (changed) applyResourceRoots();
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    let documentVersion = 0;

    // 监听 Webview 消息
    const messageDisposable = webviewPanel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case MessageType.READY:
            // Webview 准备就绪，发送初始化数据
            scanAndExpandRoots(document.getText());
            await this.sendInit(webviewPanel.webview, document);
            break;

          case MessageType.DOC_CHANGE:
            // Webview 发来文档变更
            const changePayload = message.payload as DocChangePayload;
            logger.info(
              `[Provider.DOC_CHANGE] edits=${changePayload.edits.length} firstNewLen=${changePayload.edits[0]?.newText.length} preview=${JSON.stringify(
                (changePayload.edits[0]?.newText || '').slice(0, 120)
              )}`
            );
            await this.applyEdits(document, changePayload.edits);
            documentVersion++;
            break;

          case MessageType.MODE_CHANGE:
            const modePayload = message.payload as ModeChangePayload;
            logger.debug(`Mode changed to: ${modePayload.mode}`);
            break;

          case MessageType.LANG_CHANGE:
            const langPayload = message.payload as LangChangePayload;
            await vscode.workspace
              .getConfiguration('markdownGo')
              .update('language', langPayload.language, vscode.ConfigurationTarget.Global);
            break;

          case MessageType.LOG: {
            const { level, message: logMsg, data } = message.payload;
            const suffix = data !== undefined ? ` ${JSON.stringify(data)}` : '';
            const line = `[Webview] ${logMsg}${suffix}`;
            if (level === 'warn') logger.warn(line);
            else if (level === 'error') logger.error(line);
            else logger.info(line);
            break;
          }

          case MessageType.ERROR:
            logger.error(`[Webview] ${message.payload.message}${message.payload.stack ? `\n${message.payload.stack}` : ''}`);
            break;

          case MessageType.IMAGE_PICK: {
            await handlePick(message.id, MessageType.IMAGE_PICK, {
              Images: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'],
            });
            break;
          }

          case MessageType.VIDEO_PICK: {
            await handlePick(message.id, MessageType.VIDEO_PICK, {
              Videos: ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v', 'mkv'],
            });
            break;
          }
        }
      }
    );

    /** 通用 picker 处理：返回 webviewUri / 相对路径，动态添加所在目录 */
    async function handlePick(
      reqId: string | undefined,
      replyType: MessageType,
      filters: Record<string, string[]>,
    ): Promise<void> {
      try {
        const picked = await vscode.window.showOpenDialog({
          canSelectMany: false,
          canSelectFiles: true,
          canSelectFolders: false,
          openLabel: 'Insert',
          filters,
          defaultUri: docDirUri,
        });
        const file = picked && picked[0];
        if (file) {
          const pickedDir = vscode.Uri.file(path.dirname(file.fsPath));
          if (ensureRoot(pickedDir)) {
            applyResourceRoots();
            logger.info(`[Provider.${replyType}] add localResourceRoot ${pickedDir.fsPath}`);
          }
        }
        const response: ImagePickResponse = file
          ? {
              absolutePath: file.fsPath,
              relativePath: toPosixRelative(path.dirname(document.uri.fsPath), file.fsPath),
              webviewUri: webviewPanel.webview.asWebviewUri(file).toString(),
            }
          : { absolutePath: null, relativePath: null, webviewUri: null };
        logger.info(
          `[Provider.${replyType}] file=${file?.fsPath ?? '(none)'} rel=${response.relativePath ?? ''} webviewUri=${response.webviewUri ?? ''}`,
        );
        webviewPanel.webview.postMessage({
          id: reqId,
          type: replyType,
          source: 'extension',
          payload: response,
          timestamp: Date.now(),
        });
      } catch (err: any) {
        logger.error(`[Provider.${replyType}] ${err?.message || err}`);
        webviewPanel.webview.postMessage({
          id: reqId,
          type: replyType,
          source: 'extension',
          payload: { absolutePath: null, relativePath: null, webviewUri: null },
          timestamp: Date.now(),
        });
      }
    }

    // 监听文档变更（外部编辑）
    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (e.document.uri.toString() === document.uri.toString()) {
          // 同步到 Webview
          documentVersion++;
          const text = document.getText();
          scanAndExpandRoots(text);
          logger.info(
            `[Provider.onDidChange->DOC_SYNC] len=${text.length} preview=${JSON.stringify(text.slice(0, 120))}`
          );
          const syncPayload: DocSyncPayload = {
            content: text,
            version: documentVersion,
            source: 'external',
          };
          webviewPanel.webview.postMessage({
            type: MessageType.DOC_SYNC,
            source: 'extension',
            payload: syncPayload,
            timestamp: Date.now(),
          });
        }
      }
    );

    // 监听配置变更：keybindings 等改变后重发 INIT 让 webview 立即生效
    const configSubscription = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('markdownGo')) {
        this.sendInit(webviewPanel.webview, document).catch((err) =>
          logger.error(`[Provider.sendInit on config change] ${err}`)
        );
      }
    });

    // 清理
    webviewPanel.onDidDispose(() => {
      messageDisposable.dispose();
      changeDocumentSubscription.dispose();
      configSubscription.dispose();
    });
  }

  private async sendInit(
    webview: vscode.Webview,
    document: vscode.TextDocument
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration('markdownGo');
    const language = (config.get<string>('language') || 'en') as LanguageCode;
    const defaultMode = (config.get<string>('defaultMode') || 'edit') as DisplayMode;
    const slashTrigger = config.get<string>('slashTrigger') || '/';
    const defaultCopyFormat = (config.get<string>('defaultCopyFormat') || 'markdown') as CopyFormat;
    const keybindings =
      config.get<Record<string, string | string[]>>('keybindings') || {};

    const initPayload: InitPayload = {
      content: document.getText(),
      language,
      mode: defaultMode,
      config: {
        language,
        defaultMode,
        slashTrigger,
        defaultCopyFormat,
        keybindings,
      },
      baseUri: this.computeBaseUri(webview, document),
      documentDir: this.computeDocumentDir(document),
    };

    webview.postMessage({
      type: MessageType.INIT,
      source: 'extension',
      payload: initPayload,
      timestamp: Date.now(),
    });
  }

  private async applyEdits(
    document: vscode.TextDocument,
    edits: DocChangePayload['edits']
  ): Promise<void> {
    // 如果只是一次"全文替换"且替换后的内容与当前完全一致（含行尾归一化后），
    // 则跳过，避免 applyEdit 把文档标记为 dirty（撤销后仍出现小白点）
    if (edits.length === 1) {
      const e = edits[0];
      const isFullReplace =
        e.range.startLine === 0 &&
        e.range.startChar === 0 &&
        e.range.endLine >= document.lineCount;
      if (isFullReplace) {
        const current = document.getText();
        const norm = (s: string) => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (norm(current) === norm(e.newText)) {
          logger.info('[Provider.applyEdits] skip no-op full replace');
          return;
        }
      }
    }

    const workspaceEdit = new vscode.WorkspaceEdit();
    for (const edit of edits) {
      const range = new vscode.Range(
        edit.range.startLine,
        edit.range.startChar,
        edit.range.endLine,
        edit.range.endChar
      );
      workspaceEdit.replace(document.uri, range, edit.newText);
    }
    await vscode.workspace.applyEdit(workspaceEdit);
  }

  /**
   * 计算 webview 可访问的本地资源根：
   *   - 扩展 media / assets
   *   - 当前文档目录
   *   - 当前打开的所有 workspace folders
   *   - 文档所在磁盘根（Windows 为驱动器根，POSIX 为 `/`），方便引用文档目录之外的图片
   */
  private computeLocalResourceRoots(
    _document: vscode.TextDocument,
    docDir: string,
  ): vscode.Uri[] {
    const roots: vscode.Uri[] = [
      vscode.Uri.joinPath(this.context.extensionUri, 'media'),
      vscode.Uri.joinPath(this.context.extensionUri, 'assets'),
    ];
    const seen = new Set<string>(roots.map((u) => u.toString()));
    const push = (uri: vscode.Uri) => {
      const key = uri.toString();
      if (seen.has(key)) return;
      seen.add(key);
      roots.push(uri);
    };
    try {
      push(vscode.Uri.file(docDir));
      const root = path.parse(docDir).root; // Windows: 'c:\\'  POSIX: '/'
      if (root) push(vscode.Uri.file(root));
    } catch {
      /* ignore */
    }
    if (vscode.workspace.workspaceFolders) {
      for (const wf of vscode.workspace.workspaceFolders) push(wf.uri);
    }
    return roots;
  }

  private computeBaseUri(
    webview: vscode.Webview,
    document: vscode.TextDocument,
  ): string | undefined {
    try {
      const dir = path.dirname(document.uri.fsPath);
      if (!dir) return undefined;
      const u = webview.asWebviewUri(vscode.Uri.file(dir)).toString();
      return u.endsWith('/') ? u : `${u}/`;
    } catch {
      return undefined;
    }
  }

  private computeDocumentDir(document: vscode.TextDocument): string | undefined {
    try {
      return path.dirname(document.uri.fsPath);
    } catch {
      return undefined;
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webview.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webview.css')
    );
    const katexCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'katex', 'katex.min.css')
    );

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: http: data:; media-src ${webview.cspSource} https: http: data: blob:; frame-src https: http:; font-src ${webview.cspSource};">
  <link href="${katexCssUri}" rel="stylesheet">
  <link href="${styleUri}" rel="stylesheet">
  <title>Markdown Go Editor</title>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}

/** 把 abs 转为相对 base 的 POSIX 风格路径；不在子目录则返回绝对路径 */
function toPosixRelative(baseDir: string, abs: string): string {
  try {
    let rel = path.relative(baseDir, abs);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      // 不在文档目录下 → 用绝对路径，便于显示，但用 file:/// 形式更通用
      return abs.replace(/\\/g, '/');
    }
    rel = rel.replace(/\\/g, '/');
    return rel;
  } catch {
    return abs.replace(/\\/g, '/');
  }
}
