/**
 * Webview 启动入口
 *
 * 装配：TiptapEditor + Menubar + PlainView，按 DisplayMode 切换。
 */
import {
  MessageType,
  InitPayload,
  DocSyncPayload,
  DisplayMode,
  LanguageCode,
} from '../shared';
import { bridge } from './core/bridge';
import { TiptapEditor } from './tiptap/TiptapEditor';
import { renderMenubar } from './ui/Menubar';
import { PlainView } from './ui/PlainView';
import { setLocale, onLocaleChange, t } from './i18n';
import { setImageBaseUri, setImageDocumentDir } from './runtime/imageBase';

class App {
  private editor!: TiptapEditor;
  private plain!: PlainView;
  private editorHost!: HTMLElement;
  private previewHost!: HTMLElement;
  private menubarHost!: HTMLElement;
  private currentMode: DisplayMode = 'edit';
  private currentLanguage: LanguageCode = 'en';
  private currentMarkdown = '';
  private lastSentByPlain: string | null = null;
  private initialized = false;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    this.buildLayout();

    bridge.on<InitPayload>(MessageType.INIT, (p) => this.handleInit(p));
    bridge.on<DocSyncPayload>(MessageType.DOC_SYNC, (p) => this.handleDocSync(p));

    // 语言切换 -> 顶栏 / preview 占位文案
    onLocaleChange(() => {
      this.renderMenubar();
      this.previewHost.textContent = t('plain.placeholder');
    });

    bridge.send(MessageType.READY, { version: '0.0.1' });
    bridge.log('info', 'Webview initialized (Tiptap)');
  }

  private buildLayout(): void {
    const app = document.getElementById('app');
    if (!app) throw new Error('#app not found');
    app.innerHTML = '';

    const editorRoot = document.createElement('div');
    editorRoot.className = 'editor';

    this.menubarHost = document.createElement('div');
    editorRoot.appendChild(this.menubarHost);

    const viewport = document.createElement('div');
    viewport.className = 'viewport';
    editorRoot.appendChild(viewport);

    this.editorHost = document.createElement('div');
    this.editorHost.className = 'content tiptap-host';
    viewport.appendChild(this.editorHost);

    this.previewHost = document.createElement('div');
    this.previewHost.className = 'preview-view';
    this.previewHost.textContent = '';
    viewport.appendChild(this.previewHost);

    app.appendChild(editorRoot);

    this.renderMenubar();

    this.editor = new TiptapEditor(
      this.editorHost,
      {
        onSync: (markdown) => {
          this.currentMarkdown = markdown;
          this.plain?.setMarkdown(markdown);
          this.syncToExtension(markdown);
        },
        log: (msg, data) => bridge.log('info', msg, data),
      },
      // slashTrigger 在 INIT 后会调 setSlashTrigger处理；先以默认 "/" 启动
      { slashTrigger: '/' },
    );

    this.plain = new PlainView(viewport, {
      onChange: (markdown) => {
        this.currentMarkdown = markdown;
        this.editor.setMarkdown(markdown);
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
          setLocale(l);
          this.renderMenubar();
          bridge.send(MessageType.LANG_CHANGE, { language: l });
        },
      })
    );
  }

  private applyMode(): void {
    const mode = this.currentMode;
    // edit / preview 都展示 Tiptap 编辑器；preview 模式将编辑器置为只读
    this.editorHost.style.display = mode === 'plain' ? 'none' : '';
    this.previewHost.style.display = 'none';
    this.editor.editor.setEditable(mode === 'edit');
    this.editorHost.classList.toggle('is-readonly', mode === 'preview');
    document.body.classList.toggle('mg-readonly', mode === 'preview');
    if (mode === 'plain') {
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
    setImageBaseUri(payload.baseUri);
    setImageDocumentDir(payload.documentDir);
    setLocale(this.currentLanguage);
    this.renderMenubar();
    if (payload.config?.slashTrigger) {
      this.editor.setSlashTrigger(payload.config.slashTrigger);
    }
    if (payload.config?.defaultCopyFormat) {
      this.editor.setCopyFormat(payload.config.defaultCopyFormat);
    }
    this.editor.bootstrap(payload.content);
    this.plain.setMarkdown(payload.content);
    this.applyMode();
    bridge.log('info', 'Document initialized', {
      mode: this.currentMode,
      language: this.currentLanguage,
      contentLen: payload.content.length,
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
