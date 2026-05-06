/**
 * VS Code 风格的快捷键系统（轻量版）
 *
 * 设计要点（参照 VS Code 的 keybinding 模型）：
 *   - 命令以 ID 标识（如 "editor.indent"），与按键解耦。
 *   - 一个命令可绑定一个或多个 chord（"Ctrl+Shift+Z" / ["Ctrl+Y","Ctrl+Shift+Z"]）。
 *   - 命令可声明 `when` 条件（例如仅"光标在块开头"时才生效），不满足时事件不被消费，
 *     以便落到默认行为或下一条命令。
 *   - 用户可通过 `markdownGo.keybindings` 设置覆盖默认值；语法兼容 "Ctrl+Alt+P"。
 *
 * 解析约定：
 *   - 修饰键：Ctrl / Cmd / Shift / Alt（大小写不敏感）。
 *   - "Mod" 表示跨平台主修饰键：Mac→Cmd，其他→Ctrl。
 *   - 主键大小写不敏感，与 KeyboardEvent.key 比对（数字字符与字母用同名）。
 */

export type CommandId = string;

/** 命令运行时上下文（when 条件求值依据） */
export interface CommandContext {
  caretAtStart: boolean;
  contentEmpty: boolean;
}

export interface CommandDefinition {
  id: CommandId;
  /** 默认 key chord，可写一个或多个 */
  defaultKeys: string | string[];
  /** 可选 when 条件：返回 true 才执行 */
  when?: (ctx: CommandContext) => boolean;
}

interface ParsedChord {
  key: string; // 归一化后的主键名（小写）
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean; // Mac Cmd
}

const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function normalizeKey(name: string): string {
  const k = name.trim().toLowerCase();
  // 常见别名
  switch (k) {
    case 'esc':
      return 'escape';
    case 'del':
      return 'delete';
    case 'ins':
      return 'insert';
    case 'return':
      return 'enter';
    case 'space':
      return ' ';
    case 'plus':
      return '+';
    default:
      return k;
  }
}

function parseChord(chord: string): ParsedChord {
  const parts = chord.split('+').map((p) => p.trim()).filter(Boolean);
  let ctrl = false,
    shift = false,
    alt = false,
    meta = false;
  let key = '';
  for (const p of parts) {
    const lower = p.toLowerCase();
    if (lower === 'ctrl' || lower === 'control') ctrl = true;
    else if (lower === 'cmd' || lower === 'command' || lower === 'meta') meta = true;
    else if (lower === 'shift') shift = true;
    else if (lower === 'alt' || lower === 'option') alt = true;
    else if (lower === 'mod') {
      if (isMac) meta = true;
      else ctrl = true;
    } else key = normalizeKey(p);
  }
  return { key, ctrl, shift, alt, meta };
}

function eventMatches(chord: ParsedChord, e: KeyboardEvent): boolean {
  if (chord.shift !== e.shiftKey) return false;
  if (chord.alt !== e.altKey) return false;
  if (chord.ctrl !== e.ctrlKey) return false;
  if (chord.meta !== e.metaKey) return false;
  const evKey = normalizeKey(e.key);
  return evKey === chord.key;
}

/** 编辑器内置命令清单与默认按键 */
export const DEFAULT_COMMANDS: CommandDefinition[] = [
  { id: 'editor.undo', defaultKeys: 'Mod+Z' },
  { id: 'editor.redo', defaultKeys: ['Mod+Y', 'Mod+Shift+Z'] },
  { id: 'editor.enter', defaultKeys: 'Enter' },
  { id: 'editor.softLineBreak', defaultKeys: 'Shift+Enter' },
  {
    id: 'editor.backspaceAtStart',
    defaultKeys: 'Backspace',
    when: (ctx) => ctx.caretAtStart,
  },
  { id: 'editor.indent', defaultKeys: 'Tab' },
  { id: 'editor.outdent', defaultKeys: 'Shift+Tab' },
];

/**
 * 用户覆盖：键为 commandId，值为单个 chord 字符串或数组；
 * 设为空字符串/空数组表示**取消**该命令的绑定。
 */
export type KeybindingOverrides = Record<string, string | string[]>;

/** 已解析的快捷键表：chord → commandId（按定义顺序匹配，先到先得） */
interface ResolvedBinding {
  chord: ParsedChord;
  commandId: CommandId;
  when?: (ctx: CommandContext) => boolean;
}

export class Keybindings {
  private bindings: ResolvedBinding[] = [];

  constructor(
    commands: CommandDefinition[] = DEFAULT_COMMANDS,
    overrides: KeybindingOverrides = {}
  ) {
    for (const cmd of commands) {
      const raw = overrides[cmd.id] ?? cmd.defaultKeys;
      const list = Array.isArray(raw) ? raw : [raw];
      for (const chord of list) {
        if (!chord) continue;
        this.bindings.push({
          chord: parseChord(chord),
          commandId: cmd.id,
          when: cmd.when,
        });
      }
    }
  }

  /**
   * 在事件中查找首个匹配的命令 ID。
   * 返回 null 表示无匹配——调用方应放行事件给浏览器默认处理。
   */
  resolve(e: KeyboardEvent, ctx: CommandContext): CommandId | null {
    for (const b of this.bindings) {
      if (!eventMatches(b.chord, e)) continue;
      if (b.when && !b.when(ctx)) continue;
      return b.commandId;
    }
    return null;
  }
}
