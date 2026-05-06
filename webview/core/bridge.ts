import { Message, MessageType } from '../../shared/index';

type MessageHandler<T = any> = (payload: T) => void;

/**
 * VSCode Webview 通信桥
 */
export class MessageBridge {
  private vscode: any;
  private listeners = new Map<MessageType, MessageHandler[]>();
  private requestHandlers = new Map<string, (response: any) => void>();
  private requestIdCounter = 0;

  constructor() {
    // @ts-ignore
    this.vscode = acquireVsCodeApi();
    this.init();
  }

  private init() {
    window.addEventListener('message', (event) => {
      const message = event.data as Message;

      // 处理响应
      if (message.id && this.requestHandlers.has(message.id)) {
        const handler = this.requestHandlers.get(message.id)!;
        handler(message.payload);
        this.requestHandlers.delete(message.id);
        return;
      }

      // 处理普通消息
      const handlers = this.listeners.get(message.type) || [];
      handlers.forEach((handler) => handler(message.payload));
    });
  }

  /**
   * 发送消息到 Extension
   */
  send<T = any>(type: MessageType, payload: T): void {
    const message: Message<T> = {
      type,
      source: 'webview',
      payload,
      timestamp: Date.now(),
    };
    this.vscode.postMessage(message);
  }

  /**
   * 发送请求并等待响应
   */
  request<TPayload = any, TResponse = any>(
    type: MessageType,
    payload: TPayload
  ): Promise<TResponse> {
    return new Promise((resolve) => {
      const id = `req_${++this.requestIdCounter}`;
      this.requestHandlers.set(id, resolve);

      const message: Message<TPayload> = {
        id,
        type,
        source: 'webview',
        payload,
        timestamp: Date.now(),
      };
      this.vscode.postMessage(message);
    });
  }

  /**
   * 监听消息
   */
  on<T = any>(type: MessageType, handler: MessageHandler<T>): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(handler);

    // 返回取消订阅函数
    return () => {
      const handlers = this.listeners.get(type);
      if (handlers) {
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      }
    };
  }

  /**
   * 移除监听器
   */
  off(type: MessageType, handler: MessageHandler): void {
    const handlers = this.listeners.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * 记录日志到 Extension
   */
  log(level: 'info' | 'warn' | 'error', message: string, data?: any): void {
    this.send(MessageType.LOG, { level, message, data });
  }

  /**
   * 报告错误到 Extension
   */
  error(message: string, error?: Error): void {
    this.send(MessageType.ERROR, {
      message,
      stack: error?.stack,
    });
  }
}

export const bridge = new MessageBridge();
