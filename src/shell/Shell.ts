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
    private readonly theme: AppTheme,
  ) {}

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
        theme: this.theme,
        setCwd: (path) => { this.cwd = path; },
        getCommand: (name) => this.registry.get(name),
        commandNames: () => this.registry.names(),
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
    const candidates = target.isCommand
      ? this.registry.names()
        .filter((name) => name.startsWith(target.fragment))
        .map((value): CompletionSuggestion => ({ value, kind: 'command' }))
      : this.pathCompletions(target.fragment);
    return { prefix: target.prefix, suffix: target.suffix, suggestions: candidates };
  }

  private pathCompletions(fragment: string): CompletionSuggestion[] {
    const slash = fragment.lastIndexOf('/');
    const directoryPart = slash === -1 ? '.' : fragment.slice(0, slash) || '/';
    const namePart = slash === -1 ? fragment : fragment.slice(slash + 1);
    try {
      return this.fs.list(directoryPart, this.cwd)
        .filter((node) => node.name.startsWith(namePart))
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
}
