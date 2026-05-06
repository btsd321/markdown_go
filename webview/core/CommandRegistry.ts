import { Command, CommandContext } from '../../shared/index';

/**
 * 命令注册表
 */
export class CommandRegistry {
  private commands = new Map<string, Command>();

  /**
   * 注册命令
   */
  register(command: Command): void {
    this.commands.set(command.id, command);
  }

  /**
   * 取消注册命令
   */
  unregister(id: string): void {
    this.commands.delete(id);
  }

  /**
   * 执行命令
   */
  async execute(id: string, ctx: CommandContext, args?: any): Promise<void> {
    const command = this.commands.get(id);
    if (!command) {
      throw new Error(`Command not found: ${id}`);
    }

    if (command.isEnabled && !command.isEnabled(ctx)) {
      throw new Error(`Command is disabled: ${id}`);
    }

    await command.execute(ctx, args);
  }

  /**
   * 根据分组获取命令
   */
  getByGroup(group: string): Command[] {
    return Array.from(this.commands.values()).filter((cmd) => cmd.group === group);
  }

  /**
   * 获取命令
   */
  get(id: string): Command | undefined {
    return this.commands.get(id);
  }

  /**
   * 获取所有命令
   */
  getAll(): Command[] {
    return Array.from(this.commands.values());
  }
}

export const commandRegistry = new CommandRegistry();
