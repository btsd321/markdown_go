/**
 * 键盘事件分发（命令驱动）
 *
 * 不再硬编码"哪个键做什么"，而是通过 Keybindings 把事件解析为命令 ID，
 * 再分发到 Editor 注入的命令处理器。新增/修改快捷键只需改 Keybindings 默认表
 * 或用户的 `markdownGo.keybindings` 配置，无需改这里。
 */
import { CommandContext, CommandId, Keybindings } from './Keybindings';

export type CommandHandler = (blockId: string) => void;

export interface KeyHandlerDeps {
  keybindings: Keybindings;
  /** commandId → 处理函数。未注册的命令将被忽略（事件放行） */
  handlers: Record<CommandId, CommandHandler>;
}

export function attachKeyHandler(
  el: HTMLElement,
  blockId: string,
  isCaretAtStart: () => boolean,
  isContentEmpty: () => boolean,
  deps: KeyHandlerDeps
): void {
  el.addEventListener('keydown', (e: KeyboardEvent) => {
    const ctx: CommandContext = {
      caretAtStart: isCaretAtStart(),
      contentEmpty: isContentEmpty(),
    };
    const cmdId = deps.keybindings.resolve(e, ctx);
    if (!cmdId) return; // 放行给浏览器默认行为
    const handler = deps.handlers[cmdId];
    if (!handler) return;
    e.preventDefault();
    handler(blockId);
  });
}
