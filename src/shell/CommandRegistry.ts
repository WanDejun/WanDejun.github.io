import type { Command } from './types';

export class CommandRegistry {
  private readonly commands = new Map<string, Command>();

  register(command: Command): this {
    if (this.commands.has(command.name)) throw new Error(`Command '${command.name}' is already registered`);
    this.commands.set(command.name, command);
    return this;
  }

  get(name: string): Command | undefined {
    const normalized = name.startsWith('/bin/') ? name.slice('/bin/'.length) : name;
    return this.commands.get(normalized);
  }

  names(): string[] {
    return [...this.commands.keys()].sort();
  }
}
