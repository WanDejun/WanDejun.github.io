import type { VirtualFileSystem } from '../filesystem/VirtualFileSystem';
import type { AppTheme, CommandOutput } from '../types';

export interface CommandContext {
  fs: VirtualFileSystem;
  cwd: string;
  columns: number;
  isFinal: boolean;
  isStandalone: boolean;
  signal: AbortSignal;
  theme: AppTheme;
  setCwd(path: string): void;
  getCommand(name: string): Command | undefined;
  commandNames(): string[];
}

export interface Command {
  name: string;
  description: string;
  usage: string;
  execute(args: string[], stdin: string, context: CommandContext): Promise<CommandOutput> | CommandOutput;
}

export type ParsedWord = { value: string; allowGlob: boolean };
export type ParsedCommand = { words: ParsedWord[] };
