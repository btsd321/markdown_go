import * as vscode from 'vscode';
import {
  MessageType,
  InitPayload,
  DocSyncPayload,
  DocChangePayload,
  ModeChangePayload,
  LangChangePayload,
  DisplayMode,
  LanguageCode,
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
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
        vscode.Uri.joinPath(this.context.extensionUri, 'assets'),
      ],
    };

    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    let documentVersion = 0;

    // 监听 Webview 消息
    const messageDisposable = webviewPanel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case MessageType.READY:
            // Webview 准备就绪，发送初始化数据
            await this.sendInit(webviewPanel.webview, document);
            break;

          case MessageType.DOC_CHANGE:
            // Webview 发来文档变更
            const changePayload = message.payload as DocChangePayload;
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
        }
      }
    );

    // 监听文档变更（外部编辑）
    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (e.document.uri.toString() === document.uri.toString()) {
          // 同步到 Webview
          documentVersion++;
          const syncPayload: DocSyncPayload = {
            content: document.getText(),
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

    // 清理
    webviewPanel.onDidDispose(() => {
      messageDisposable.dispose();
      changeDocumentSubscription.dispose();
    });
  }

  private async sendInit(
    webview: vscode.Webview,
    document: vscode.TextDocument
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration('markdownGo');
    const language = (config.get<string>('language') || 'zh-cn') as LanguageCode;
    const defaultMode = (config.get<string>('defaultMode') || 'edit') as DisplayMode;
    const slashTrigger = config.get<string>('slashTrigger') || '/';

    const initPayload: InitPayload = {
      content: document.getText(),
      language,
      mode: defaultMode,
      config: {
        language,
        defaultMode,
        slashTrigger,
      },
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

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webview.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webview.css')
    );

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:;">
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
