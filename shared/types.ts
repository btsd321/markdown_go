/**
 * 消息类型枚举
 */
export enum MessageType {
  // 生命周期
  READY = 'ready',
  INIT = 'init',
  DISPOSE = 'dispose',

  // 文档同步
  DOC_SYNC = 'doc.sync',
  DOC_CHANGE = 'doc.change',
  DOC_SAVE = 'doc.save',

  // 模式与语言
  MODE_CHANGE = 'mode.change',
  LANG_CHANGE = 'lang.change',

  // 命令
  COMMAND_EXECUTE = 'command.execute',
  COMMAND_RESULT = 'command.result',

  // 图片
  IMAGE_PICK = 'image.pick',

  // 视频
  VIDEO_PICK = 'video.pick',

  // 日志与错误
  LOG = 'log',
  ERROR = 'error',
}

/**
 * 消息基础结构
 */
export interface Message<T = any> {
  id?: string;
  type: MessageType;
  source: 'extension' | 'webview';
  payload: T;
  timestamp: number;
}

/**
 * 显示模式
 */
export type DisplayMode = 'edit' | 'preview' | 'plain';

/**
 * 支持的语言代码
 */
export type LanguageCode = 'zh-cn' | 'en';

/**
 * 复制格式：markdown 源码 / 纯文本
 */
export type CopyFormat = 'markdown' | 'plain';

/**
 * 文档编辑操作（webview → extension）
 */
export interface DocumentEdit {
  range: {
    startLine: number;
    startChar: number;
    endLine: number;
    endChar: number;
  };
  newText: string;
}

/**
 * 配置快照
 */
export interface ConfigSnapshot {
  language: LanguageCode;
  defaultMode: DisplayMode;
  slashTrigger: string;
  /** 默认复制格式（Ctrl+C） */
  defaultCopyFormat: CopyFormat;
  /** 用户自定义快捷键：commandId → chord 字符串或数组（空字符串/数组表示取消绑定） */
  keybindings?: Record<string, string | string[]>;
}

// ============ 消息 Payload 类型 ============

export interface ReadyPayload {
  version: string;
}

export interface InitPayload {
  content: string;
  language: LanguageCode;
  mode: DisplayMode;
  config: ConfigSnapshot;
  /** 文档所在目录的 webview URI（带尾斜杠），用于解析相对路径图片 */
  baseUri?: string;
  /** 文档所在目录的绝对路径（供计算相对路径） */
  documentDir?: string;
}

export interface DocSyncPayload {
  content: string;
  version: number;
  source: 'user' | 'external';
}

export interface DocChangePayload {
  edits: DocumentEdit[];
  baseVersion: number;
}

export interface ModeChangePayload {
  mode: DisplayMode;
}

export interface LangChangePayload {
  language: LanguageCode;
}

export interface CommandExecutePayload {
  commandId: string;
  args?: any;
}

export interface CommandResultPayload {
  commandId: string;
  success: boolean;
  error?: string;
}

export interface LogPayload {
  level: 'info' | 'warn' | 'error';
  message: string;
  data?: any;
}

export interface ErrorPayload {
  message: string;
  stack?: string;
}

// ============ 图片 ============

export interface ImagePickRequest {
  /** 预期的接受后缀（可选） */
  extensions?: string[];
}

export interface ImagePickResponse {
  /** 用户取消 → null */
  absolutePath: string | null;
  /** 相对于文档的路径（POSIX 风格）；无法计算时 = absolutePath */
  relativePath: string | null;
  /** webview 可访问的 URI，用于立即预览 */
  webviewUri: string | null;
}

// ============ 视频 ============

export interface VideoPickRequest {
  extensions?: string[];
}

/** 视频 picker 返回结构与图片一致 */
export type VideoPickResponse = ImagePickResponse;
