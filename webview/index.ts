/**
 * Webview 启动入口
 *
 * 仅负责装配：构造 model / editor / 各视图，连接 bridge 消息，
 * 在不同 DisplayMode 之间切换显示。
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
import { PlainView } from './ui/PlainView';

class App {
  private model = new DocumentModel();
  private editor!: Editor;
  private plain!: PlainView;
  private editorHost!: HTMLElement;
  private previewHost!: HTMLElement;
  private currentMode: DisplayMode = 'edit';
  private currentLanguage: LanguageCode = 'zh-cn';
  private currentMarkdown = '';
  /** plain 模式上次发出去的内容，用于识别回环 DOC_SYNC */
  private lastSentByPlain: string | null = null;
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

    // 三个视图共用一个父容器，靠 display 切换
    const viewport = document.createElement('div');
    viewport.className = 'viewport';
    editorRoot.appendChild(viewport);

    this.editorHost = document.createElement('div');
    this.editorHost.className = 'content';
    viewport.appendChild(this.editorHost);

    this.previewHost = document.createElement('div');
    this.previewHost.className = 'preview-view';
    this.previewHost.textContent = '预览模式开发中…';
    viewport.appendChild(this.previewHost);

    app.appendChild(editorRoot);

    this.renderMenubar();

    this.editor = new Editor(this.editorHost, this.model, {
      onSync: (markdown) => {
        this.currentMarkdown = markdown;
        // 编辑视图变化时同步到 plain（隐藏中也保持最新）
        this.plain?.setMarkdown(markdown);
        this.syncToExtension(markdown);
      },
      log: (msg, data) => bridge.log('info', msg, data),
    });

    this.plain = new PlainView(viewport, {
      onChange: (markdown) => {
        bridge.log('info', '[App.plain.onChange]', { len: markdown.length });
        this.currentMarkdown = markdown;
        // plain 视图变化 → 同步 model（这样切回编辑模式能看到）
        this.model.fromMarkdown(markdown);
        this.lastSentByPlain = markdown;
        this.syncToExtension(markdown);
      },
      log: (msg, data) => bridge.log('info', msg, data),
    });

    this.applyMode();
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
          bridge.log('info', `[App.modeChange] -> ${m}`);
          this.applyMode();
        },
        onLanguageChange: (l) => {
          this.currentLanguage = l;
          bridge.send(MessageType.LANG_CHANGE, { language: l });
        },
      })
    );
  }

  /** 根据 currentMode 切换视图显隐 */
  private applyMode(): void {
    const mode = this.currentMode;
    this.editorHost.style.display = mode === 'edit' ? '' : 'none';
    this.previewHost.style.display = mode === 'preview' ? '' : 'none';
    if (mode === 'plain') {
      // 切到 plain 前刷新内容
      this.plain.setMarkdown(this.currentMarkdown);
      this.plain.show();
    } else {
      this.plain.hide();
    }
  }

  private handleInit(payload: InitPayload): void {
    this.currentMode = payload.mode;
    this.currentLanguage = payload.language;
    this.currentMarkdown = payload.content;
    this.renderMenubar();
    this.editor.bootstrap(payload.content);
    this.plain.setMarkdown(payload.content);
    this.applyMode();
    bridge.log('info', 'Document initialized', {
      mode: this.currentMode,
      language: this.currentLanguage,
      blockCount: this.model.getAllBlocks().length,
    });
  }

  private handleDocSync(payload: DocSyncPayload): void {
    const normalized = payload.content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const isPlainEcho =
      this.lastSentByPlain !== null && normalized === this.lastSentByPlain;
    bridge.log('info', '[App.handleDocSync]', {
      mode: this.currentMode,
      len: payload.content.length,
      isPlainEcho,
    });
    this.currentMarkdown = payload.content;
    this.editor.setMarkdown(payload.content);
    // plain 模式下识别到自己刚发出去的内容，跳过回灌避免光标跳动
    if (this.currentMode === 'plain' && isPlainEcho) return;
    this.plain.setMarkdown(payload.content);
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
