import type { AppTheme, CommandOutput, OutputChunk } from '../types';
import type { VirtualFileSystem } from '../filesystem/VirtualFileSystem';
import { findCompletionTarget, parseCommandLine, ShellSyntaxError } from './parser';
import type { CommandContext, CompletionResult, CompletionSuggestion } from './types';
import { CommandRegistry } from './CommandRegistry';

export interface ShellResult {
  chunks: OutputChunk[];
  exitCode: number;
}

export class Shell {
  cwd = '/';

  constructor(
    readonly fs: VirtualFileSystem,
    readonly registry: CommandRegistry,
    private theme: AppTheme,
    private themeName = '',
    private readonly availableThemes: readonly string[] = [],
    private readonly pageUrl = 'http://localhost/',
  ) {}

  setTheme(name: string, nextTheme: AppTheme): void {
    this.themeName = name;
    this.theme = nextTheme;
  }

  reset(): void {
    this.cwd = '/';
  }

  async execute(input: string, signal: AbortSignal, columns = 80): Promise<ShellResult> {
    let pipeline;
    try {
      pipeline = parseCommandLine(input);
    } catch (error) {
      const message = error instanceof ShellSyntaxError ? error.message : 'invalid command';
      return { chunks: [{ type: 'text', value: `shell: ${message}\n` }], exitCode: 2 };
    }
    if (pipeline.length === 0) return { chunks: [], exitCode: 0 };

    // stdout is the pipe transport. Rich chunks are rendered only for the final command.
    let stdin = '';
    let final: CommandOutput = { stdout: '' };
    for (let index = 0; index < pipeline.length; index += 1) {
      if (signal.aborted) return { chunks: [{ type: 'text', value: '^C\n' }], exitCode: 130 };
      const parsed = pipeline[index];
      const [commandWord, ...argumentWords] = parsed.words;
      const command = this.registry.get(commandWord.value);
      if (!command) {
        return {
          chunks: [{ type: 'text', value: `${commandWord.value}: command not found\n` }],
          exitCode: 127,
        };
      }
      const args = argumentWords.flatMap((word) => word.allowGlob ? this.fs.expand(word.value, this.cwd) : [word.value]);
      const context: CommandContext = {
        fs: this.fs,
        cwd: this.cwd,
        columns,
        isFinal: index === pipeline.length - 1,
        // Rich renderers cannot safely exchange terminal-only chunks through stdout.
        isStandalone: pipeline.length === 1,
        signal,
        pageUrl: this.pageUrl,
        theme: this.theme,
        themeName: this.themeName,
        setCwd: (path) => { this.cwd = path; },
        getCommand: (name) => this.registry.get(name),
        commandNames: () => this.registry.names(),
        themeNames: () => [...this.availableThemes],
      };
      try {
        final = await command.execute(args, stdin, context);
      } catch (error) {
        if (signal.aborted) return { chunks: [{ type: 'text', value: '^C\n' }], exitCode: 130 };
        const message = error instanceof Error ? error.message : String(error);
        return { chunks: [{ type: 'text', value: `${command.name}: ${message}\n` }], exitCode: 1 };
      }
      stdin = final.stdout;
      if ((final.exitCode ?? 0) !== 0 && index < pipeline.length - 1) break;
    }

    // Plain commands do not need to know about terminal rendering; adapt stdout here.
    const chunks = final.chunks ?? (final.stdout ? [{ type: 'text' as const, value: final.stdout }] : []);
    if (final.stderr) chunks.push({ type: 'text', value: final.stderr });
    return { chunks, exitCode: final.exitCode ?? 0 };
  }

  complete(input: string, cursor = input.length): CompletionResult {
    const target = findCompletionTarget(input, cursor);
    let candidates: CompletionSuggestion[] = [];
    if (target.isCommand) {
      candidates = this.registry.names()
        .filter((name) => name.startsWith(target.fragment))
        .map((value): CompletionSuggestion => ({ value, kind: 'command' }));
    } else {
      const command = target.commandName ? this.registry.get(target.commandName) : undefined;
      switch (command?.completion) {
        case 'files':
          candidates = this.pathCompletions(target.fragment);
          break;
        case 'directories':
          candidates = this.pathCompletions(target.fragment, 'directory');
          break;
        case 'commands':
          candidates = this.commandCompletions(target.fragment);
          break;
        case 'themes':
          candidates = this.availableThemes
            .filter((name) => name.startsWith(target.fragment))
            .map((value): CompletionSuggestion => ({ value, kind: 'theme' }));
          break;
        default:
          // Commands without a completion policy intentionally produce no candidates.
          break;
      }
    }
    return { prefix: target.prefix, suffix: target.suffix, suggestions: candidates };
  }

  private pathCompletions(fragment: string, type?: 'directory'): CompletionSuggestion[] {
    const slash = fragment.lastIndexOf('/');
    const directoryPart = slash === -1 ? '.' : fragment.slice(0, slash) || '/';
    const namePart = slash === -1 ? fragment : fragment.slice(slash + 1);
    try {
      return this.fs.list(directoryPart, this.cwd)
        .filter((node) => node.name.startsWith(namePart))
        .filter((node) => !type || node.type === type)
        .map((node): CompletionSuggestion => {
          const prefix = slash === -1 ? '' : fragment.slice(0, slash + 1);
          return {
            value: `${prefix}${node.name}${node.type === 'directory' ? '/' : ''}`,
            kind: node.type === 'directory' ? 'directory' : node.executable ? 'executable' : 'file',
          };
        });
    } catch {
      return [];
    }
  }

  private commandCompletions(fragment: string): CompletionSuggestion[] {
    const namePart = fragment.startsWith('/bin/') ? fragment.slice('/bin/'.length) : fragment;
    return this.registry.names()
      .filter((name) => name.startsWith(namePart))
      .map((name): CompletionSuggestion => ({ value: `/bin/${name}`, kind: 'executable' }));
  }
}
