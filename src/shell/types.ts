import type { VirtualFileSystem } from '../filesystem/VirtualFileSystem';
import type { AppTheme, CommandOutput } from '../types';

export interface CommandContext {
  fs: VirtualFileSystem;
  cwd: string;
  columns: number;
  isFinal: boolean;
  isStandalone: boolean;
  signal: AbortSignal;
  pageUrl: string;
  theme: AppTheme;
  themeName: string;
  setCwd(path: string): void;
  getCommand(name: string): Command | undefined;
  commandNames(): string[];
  themeNames(): string[];
}

export type CommandCompletion = 'files' | 'directories' | 'commands' | 'themes';

export interface Command {
  name: string;
  description: string;
  usage: string;
  completion?: CommandCompletion;
  execute(args: string[], stdin: string, context: CommandContext): Promise<CommandOutput> | CommandOutput;
}

export type CompletionSuggestion = {
  value: string;
  kind: 'command' | 'directory' | 'executable' | 'file' | 'theme';
};

export type CompletionResult = {
  prefix: string;
  suffix: string;
  suggestions: CompletionSuggestion[];
};

export type ParsedWord = { value: string; allowGlob: boolean };
export type ParsedCommand = { words: ParsedWord[] };
