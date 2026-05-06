import { MessageType, InitPayload, DocSyncPayload, DisplayMode } from '../shared';
import { bridge } from './core/bridge';
import { DocumentModel } from './model/DocumentModel';
import { registerBuiltinCommands } from './commands/index';

class App {
  private model = new DocumentModel();
  private currentMode: DisplayMode = 'edit';
  private currentLanguage = 'zh-cn';
  private initialized = false;

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    // 注册内置命令
    registerBuiltinCommands(this.model);

    // 监听 Extension 消息
    bridge.on<InitPayload>(MessageType.INIT, (payload) => {
      this.handleInit(payload);
    });

    bridge.on<DocSyncPayload>(MessageType.DOC_SYNC, (payload) => {
      this.handleDocSync(payload);
    });

    // 监听模型变更，同步到 Extension
    this.model.onChange(() => {
      this.syncToExtension();
    });

    // 通知 Extension 准备就绪
    bridge.send(MessageType.READY, { version: '0.0.1' });

    bridge.log('info', 'Webview initialized');
  }

  private handleInit(payload: InitPayload) {
    this.currentMode = payload.mode;
    this.currentLanguage = payload.language;

    // 解析文档
    this.model.fromMarkdown(payload.content);

    // 渲染 UI
    this.render();

    bridge.log('info', 'Document initialized', {
      mode: this.currentMode,
      language: this.currentLanguage,
      blockCount: this.model.getAllBlocks().length,
    });
  }

  private handleDocSync(payload: DocSyncPayload) {
    // 外部修改，重新解析
    this.model.fromMarkdown(payload.content);
    this.render();

    bridge.log('info', 'Document synced from external source');
  }

  private syncToExtension() {
    const markdown = this.model.toMarkdown();
    bridge.send(MessageType.DOC_CHANGE, {
      edits: [
        {
          range: { startLine: 0, startChar: 0, endLine: Number.MAX_SAFE_INTEGER, endChar: 0 },
          newText: markdown,
        },
      ],
      baseVersion: 0,
    });
  }

  private render() {
    const app = document.getElementById('app');
    if (!app) return;

    // 临时简单渲染
    const blocks = this.model.getAllBlocks();
    app.innerHTML = `
      <div class="editor">
        <div class="menubar">
          <span>Mode: ${this.currentMode}</span>
          <span>Language: ${this.currentLanguage}</span>
        </div>
        <div class="content">
          ${blocks
            .map(
              (block) => `
            <div class="block" data-id="${block.id}" data-type="${block.type}">
              <span class="block-type">[${block.type}]</span>
              <span class="block-content">${this.escapeHtml(block.content)}</span>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 启动应用
const app = new App();
app.init().catch((err) => {
  bridge.error('Failed to initialize app', err);
});
