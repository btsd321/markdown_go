/**
 * Webview 启动入口
 *
 * 仅负责装配：构造 model / editor / menubar，连接 bridge 消息。
 * 业务逻辑分散在 editor/ 和 ui/ 子模块中。
 */
import {
  MessageType,
  InitPayload,
  DocSyncPayload,
  DisplayMode,
  LanguageCode,
} from '../shared';
import { bridge } from './core/bridge';
import { DocumentModel } from './model/DocumentModel';
import { registerBuiltinCommands } from './commands/index';
import { Editor } from './editor/Editor';
import { renderMenubar } from './ui/Menubar';

class App {
  private model = new DocumentModel();
  private editor!: Editor;
  private currentMode: DisplayMode = 'edit';
  private currentLanguage: LanguageCode = 'zh-cn';
  private menubarHost!: HTMLElement;
  private initialized = false;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    registerBuiltinCommands(this.model);

    this.buildLayout();

    bridge.on<InitPayload>(MessageType.INIT, (p) => this.handleInit(p));
    bridge.on<DocSyncPayload>(MessageType.DOC_SYNC, (p) => this.handleDocSync(p));

    bridge.send(MessageType.READY, { version: '0.0.1' });
    bridge.log('info', 'Webview initialized');
  }

  private buildLayout(): void {
    const app = document.getElementById('app');
    if (!app) throw new Error('#app not found');
    app.innerHTML = '';

    const editorRoot = document.createElement('div');
    editorRoot.className = 'editor';

    this.menubarHost = document.createElement('div');
    editorRoot.appendChild(this.menubarHost);

    const content = document.createElement('div');
    content.className = 'content';
    editorRoot.appendChild(content);

    app.appendChild(editorRoot);

    this.renderMenubar();

    this.editor = new Editor(content, this.model, {
      onSync: (markdown) => this.syncToExtension(markdown),
      log: (msg, data) => bridge.log('info', msg, data),
    });
  }

  private renderMenubar(): void {
    this.menubarHost.innerHTML = '';
    this.menubarHost.appendChild(
      renderMenubar({
        mode: this.currentMode,
        language: this.currentLanguage,
        onModeChange: (m) => {
          this.currentMode = m;
          bridge.send(MessageType.MODE_CHANGE, { mode: m });
        },
        onLanguageChange: (l) => {
          this.currentLanguage = l;
          bridge.send(MessageType.LANG_CHANGE, { language: l });
        },
      })
    );
  }

  private handleInit(payload: InitPayload): void {
    this.currentMode = payload.mode;
    this.currentLanguage = payload.language;
    this.renderMenubar();
    this.editor.bootstrap(payload.content);
    bridge.log('info', 'Document initialized', {
      mode: this.currentMode,
      language: this.currentLanguage,
      blockCount: this.model.getAllBlocks().length,
    });
  }

  private handleDocSync(payload: DocSyncPayload): void {
    this.editor.setMarkdown(payload.content);
  }

  private syncToExtension(markdown: string): void {
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
}

new App().init();
